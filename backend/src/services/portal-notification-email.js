import path from 'path';
import fs from 'fs/promises';
import { db } from '../db.js';
import { sendEmail } from './email.js';
import { config } from '../config/index.js';

const DIGEST_THROTTLE_HOURS = 6;

/**
 * Send a digest email to a single portal guest if:
 *   - notifications_enabled = true (admin has approved)
 *   - guest has an email set
 *   - more than DIGEST_THROTTLE_HOURS since last digest
 *   - there is actually new activity since the last digest
 *
 * Returns the number of items included in the digest, or 0 if nothing sent.
 *
 * Portal guest emails are kept completely separate from the tenant-user
 * digest flow. The recipient is always `portal_guests.email`, and content is
 * filtered to contacts the guest has access to via `portal_guest_contacts`.
 */
export async function sendPortalGuestDigest(guestId) {
  const guest = await db('portal_guests')
    .where({ id: guestId, is_active: true, notifications_enabled: true })
    .whereNotNull('email')
    .first();
  if (!guest) return 0;

  const now = Date.now();
  const lastEmailTs = guest.last_notification_email_at
    ? new Date(guest.last_notification_email_at).getTime()
    : 0;
  if (lastEmailTs && now - lastEmailTs < DIGEST_THROTTLE_HOURS * 60 * 60 * 1000) {
    return 0;
  }

  // "Since" cutoff — if we've never emailed, look back one throttle window so
  // we don't flood a newly-enabled guest with everything in the database.
  const since = new Date(lastEmailTs || (now - DIGEST_THROTTLE_HOURS * 60 * 60 * 1000));

  const contactRows = await db('portal_guest_contacts')
    .where({ portal_guest_id: guest.id })
    .select('contact_id');
  const contactIds = contactRows.map(r => r.contact_id);
  if (!contactIds.length) return 0;

  // Shared tenant sensitive-mode gate lives on the user side; for portal
  // guests we always hide sensitive content.
  const accessiblePostsQuery = (q) => q
    .where('posts.tenant_id', guest.tenant_id)
    .whereNull('posts.deleted_at')
    .where('posts.is_sensitive', false)
    .where('posts.visibility', 'shared')
    .whereNotExists(
      db('contacts as sc')
        .whereRaw('sc.id = posts.contact_id')
        .where('sc.is_sensitive', true)
    )
    .where(function () {
      this.whereIn('posts.contact_id', contactIds)
        .orWhereExists(
          db('post_contacts')
            .whereRaw('post_contacts.post_id = posts.id')
            .whereIn('post_contacts.contact_id', contactIds)
        );
    });

  let posts = [];
  if (guest.notify_new_post) {
    posts = await db('posts')
      .leftJoin('contacts', 'posts.contact_id', 'contacts.id')
      .where(accessiblePostsQuery)
      .where('posts.created_at', '>', since)
      .select(
        'posts.id', 'posts.uuid', 'posts.body', 'posts.created_at',
        'contacts.first_name', 'contacts.last_name'
      )
      .orderBy('posts.created_at', 'desc')
      .limit(20);

    if (posts.length) {
      const postIds = posts.map(p => p.id);
      const media = await db('post_media')
        .whereIn('post_id', postIds)
        .where('file_type', 'like', 'image/%')
        .select('post_id', 'thumbnail_path')
        .orderBy('sort_order');
      const thumbByPost = new Map();
      for (const m of media) if (!thumbByPost.has(m.post_id)) thumbByPost.set(m.post_id, m.thumbnail_path);
      for (const p of posts) p.thumbnail_path = thumbByPost.get(p.id) || null;
    }
  }

  let comments = [];
  if (guest.notify_new_comment) {
    comments = await db('post_comments')
      .join('posts', 'post_comments.post_id', 'posts.id')
      .leftJoin('users', 'post_comments.user_id', 'users.id')
      .leftJoin('portal_guests as pg', 'post_comments.portal_guest_id', 'pg.id')
      .where(accessiblePostsQuery)
      .where('post_comments.created_at', '>', since)
      // Don't tell the guest about their own comments
      .where(function () {
        this.whereNull('post_comments.portal_guest_id').orWhereNot('post_comments.portal_guest_id', guest.id);
      })
      .select(
        'post_comments.body', 'post_comments.created_at', 'posts.uuid as post_uuid',
        'users.first_name as user_first', 'pg.display_name as guest_name'
      )
      .orderBy('post_comments.created_at', 'desc')
      .limit(20);
  }

  if (!posts.length && !comments.length) return 0;

  const attachments = await collectInlineAttachments(posts);
  const { subject, text, html } = renderPortalDigest(guest, posts, comments, attachments);

  try {
    const ok = await sendEmail({
      to: guest.email, subject, text, html,
      attachments: attachments.length ? attachments.map(a => ({
        filename: a.filename, path: a.fsPath, cid: a.cid,
      })) : undefined,
    });
    if (!ok) return 0;
  } catch (err) {
    console.error('Portal digest email failed:', err.message);
    return 0;
  }

  await db('portal_guests').where({ id: guest.id }).update({
    last_notification_email_at: db.fn.now(),
  });

  return posts.length + comments.length;
}

/**
 * Trigger digest for every eligible portal guest in a tenant. Fire-and-forget
 * from callers. Each guest is individually throttled — safe to call often.
 */
export async function sendPortalDigestsForTenant(tenantId) {
  const guests = await db('portal_guests')
    .where({ tenant_id: tenantId, is_active: true, notifications_enabled: true })
    .whereNotNull('email')
    .select('id');
  for (const g of guests) {
    await sendPortalGuestDigest(g.id).catch(() => {});
  }
}

async function collectInlineAttachments(posts) {
  const out = [];
  for (const p of posts) {
    if (!p.thumbnail_path) continue;
    const rel = p.thumbnail_path.replace(/^\/uploads\//, '');
    const fsPath = path.join(config.uploads.dir, rel);
    if (!fsPath.startsWith(config.uploads.dir + path.sep)) continue;
    try {
      await fs.access(fsPath);
    } catch { continue; }
    out.push({
      postUuid: p.uuid,
      cid: `portal-post-${p.uuid}@whoareyou`,
      fsPath,
      filename: path.basename(fsPath),
    });
  }
  return out;
}

function renderPortalDigest(guest, posts, comments, attachments) {
  const cidByPost = new Map(attachments.map(a => [a.postUuid, a.cid]));
  const appUrl = process.env.CORS_ORIGIN || `http://${process.env.VIRTUAL_HOST || 'localhost'}`;
  const portalUrl = `${appUrl}/portal`;

  const greeting = `Hei ${guest.display_name},`;
  const intro = posts.length && comments.length
    ? `Nytt siden sist: ${posts.length} innlegg og ${comments.length} kommentarer.`
    : posts.length
      ? (posts.length === 1 ? 'Det er lagt ut ett nytt innlegg siden sist.' : `Det er lagt ut ${posts.length} nye innlegg siden sist.`)
      : (comments.length === 1 ? 'Det er skrevet én ny kommentar siden sist.' : `Det er skrevet ${comments.length} nye kommentarer siden sist.`);
  const footer = 'Du får denne e-posten fordi du har fått tilgang til familieportalen. Du kan skru av varsler ved å logge inn og klikke på bjellen oppe til høyre.';

  // Text
  const textParts = [greeting, '', intro, ''];
  if (posts.length) {
    textParts.push('✉️ Nye innlegg');
    for (const p of posts) {
      const name = p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : '';
      const preview = (p.body || '').slice(0, 80);
      textParts.push(`  - ${name ? name + ': ' : ''}${preview || '(uten tekst)'}`);
    }
    textParts.push('');
  }
  if (comments.length) {
    textParts.push('💬 Nye kommentarer');
    for (const c of comments) {
      const who = c.user_first || c.guest_name || 'Noen';
      const preview = (c.body || '').slice(0, 80);
      textParts.push(`  - ${who}: ${preview}`);
    }
    textParts.push('');
  }
  textParts.push(`Logg inn: ${portalUrl}`, '', footer);

  // HTML
  const postsHtml = posts.length ? `
    <tr><td style="padding:16px 0 4px 0;font-weight:600;color:#1C1C1E;border-bottom:1px solid #E5E5EA">
      ✉️ Nye innlegg <span style="color:#8E8E93;font-weight:400">(${posts.length})</span>
    </td></tr>
    ${posts.map(p => {
      const cid = cidByPost.get(p.uuid);
      const name = p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : '';
      const preview = (p.body || '').slice(0, 120);
      const heading = name ? `<strong>${escapeHtml(name)}</strong>` : '';
      const body = preview ? `<div style="color:#3C3C43;margin-top:2px">${escapeHtml(preview)}</div>` : '';
      if (cid) {
        return `<tr><td style="padding:8px 0">
          <table style="border-collapse:collapse"><tr>
            <td style="padding-right:10px;vertical-align:top">
              <img src="cid:${cid}" alt="" width="60" height="60" style="display:block;border-radius:6px;object-fit:cover">
            </td>
            <td style="vertical-align:middle">${heading}${body}</td>
          </tr></table>
        </td></tr>`;
      }
      return `<tr><td style="padding:8px 0;color:#1C1C1E">${heading}${body}</td></tr>`;
    }).join('')}
  ` : '';

  const commentsHtml = comments.length ? `
    <tr><td style="padding:16px 0 4px 0;font-weight:600;color:#1C1C1E;border-bottom:1px solid #E5E5EA">
      💬 Nye kommentarer <span style="color:#8E8E93;font-weight:400">(${comments.length})</span>
    </td></tr>
    ${comments.map(c => {
      const who = c.user_first || c.guest_name || 'Noen';
      const preview = (c.body || '').slice(0, 120);
      return `<tr><td style="padding:6px 0;color:#1C1C1E"><strong>${escapeHtml(who)}</strong>: ${escapeHtml(preview)}</td></tr>`;
    }).join('')}
  ` : '';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E">
      <h2 style="margin:0 0 8px 0">Nytt fra familieportalen</h2>
      <p style="color:#3C3C43">${escapeHtml(greeting)}</p>
      <p style="color:#3C3C43">${escapeHtml(intro)}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">${postsHtml}${commentsHtml}</table>
      <p style="margin:20px 0"><a href="${portalUrl}" style="background:#0A84FF;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Åpne familieportalen</a></p>
      <p style="color:#8E8E93;font-size:12px;margin-top:24px">${escapeHtml(footer)}</p>
    </div>
  `;

  const total = posts.length + comments.length;
  return {
    subject: total === 1
      ? `Nytt i familieportalen`
      : `${total} nye oppdateringer i familieportalen`,
    text: textParts.join('\n'),
    html,
  };
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
