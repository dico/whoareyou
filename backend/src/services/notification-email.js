import path from 'path';
import fs from 'fs/promises';
import { db } from '../db.js';
import { sendEmail } from './email.js';
import { config } from '../config/index.js';
import { NOTIFICATION_TYPES } from '../utils/notification-prefs.js';

const DIGEST_THROTTLE_MINUTES = 60;

const TYPE_ICONS_TEXT = {
  birthday: '🎂',
  anniversary: '💝',
  reminder: '🔔',
  memory: '🕰️',
  family_post: '✉️',
  family_comment: '💬',
};

const TYPE_LABELS_NB = {
  birthday: 'Bursdag',
  anniversary: 'Merkedag',
  reminder: 'Påminnelse',
  memory: 'Minner',
  family_post: 'Nytt innlegg',
  family_comment: 'Ny kommentar',
};

/**
 * Send a digest email of all unsent, email-flagged notifications for a user.
 *
 * Throttle: if the user received ANY digest within the last
 * DIGEST_THROTTLE_MINUTES, skip — the caller will retry later (on next
 * /generate, next comment hook, etc.). This gives hourly bundling without
 * requiring a cron.
 *
 * Returns the number of notifications included in the sent digest, or 0 if
 * nothing was sent (no eligible items, throttled, SMTP off, or user has no
 * email).
 */
export async function sendDigestFor(userId, tenantId) {
  // Safety net: verify the recipient is an active member of this tenant.
  // We only ever email confirmed household members — never contacts, never
  // portal guests, never users outside their own tenant. The recipient
  // address is always looked up via `users.email` below; this check
  // additionally guarantees the user is a current, active tenant member.
  const member = await db('users')
    .join('tenant_members', function () {
      this.on('users.id', 'tenant_members.user_id')
        .andOn('tenant_members.tenant_id', '=', db.raw('?', [tenantId]));
    })
    .where('users.id', userId)
    .where('users.is_active', true)
    .whereNotNull('users.email')
    .select('users.id')
    .first();
  if (!member) return 0;

  // Throttle: most recent email per user.
  const latest = await db('notifications')
    .where({ user_id: userId, tenant_id: tenantId })
    .whereNotNull('email_sent_at')
    .max('email_sent_at as last')
    .first();
  if (latest?.last) {
    const ageMs = Date.now() - new Date(latest.last).getTime();
    if (ageMs < DIGEST_THROTTLE_MINUTES * 60 * 1000) return 0;
  }

  // Unsent email-flagged notifications: join with prefs to pick only the
  // types the user actually wants by email.
  const candidates = await db('notifications')
    .leftJoin('user_notification_prefs', function () {
      this.on('notifications.user_id', 'user_notification_prefs.user_id')
        .andOn('notifications.tenant_id', 'user_notification_prefs.tenant_id')
        .andOn('notifications.type', 'user_notification_prefs.type');
    })
    .where('notifications.user_id', userId)
    .where('notifications.tenant_id', tenantId)
    .whereNull('notifications.email_sent_at')
    .where(function () {
      // A row in prefs with deliver_email=true, OR no pref row at all (no
      // default row means defaults apply, and the email default is false).
      this.where('user_notification_prefs.deliver_email', true);
    })
    .select(
      'notifications.id', 'notifications.type', 'notifications.title',
      'notifications.body', 'notifications.link', 'notifications.created_at',
    )
    .orderBy('notifications.created_at', 'asc');

  if (!candidates.length) return 0;

  const user = await db('users').where({ id: userId }).select('id', 'email', 'first_name', 'language').first();
  if (!user?.email) return 0;

  const lang = user.language || 'nb';

  // If the digest contains a memory notification, expand it into the actual
  // posts (thumbnail, date, body preview) so the reader gets more than a count.
  const memoryNotifications = candidates.filter(c => c.type === 'memory');
  const memoryPosts = memoryNotifications.length
    ? await fetchMemoryPostsForDigest(userId, tenantId)
    : [];

  const attachments = await collectInlineAttachments(candidates, memoryPosts);
  const { subject, text, html } = renderDigest(user, candidates, lang, attachments, memoryPosts);

  try {
    const ok = await sendEmail({
      to: user.email, subject, text, html,
      attachments: attachments.length ? attachments.map(a => ({
        filename: a.filename, path: a.fsPath, cid: a.cid,
      })) : undefined,
    });
    if (!ok) return 0;
  } catch (err) {
    console.error('Digest email failed:', err.message);
    return 0;
  }

  await db('notifications')
    .whereIn('id', candidates.map(c => c.id))
    .update({ email_sent_at: db.fn.now() });

  return candidates.length;
}

/**
 * Trigger digest for every active user in a tenant. Fire-and-forget from
 * callers. Each call is individually throttled — this is safe to call often.
 */
export async function sendDigestsForTenant(tenantId) {
  const users = await db('users')
    .join('tenant_members', function () {
      this.on('users.id', 'tenant_members.user_id')
        .andOn('tenant_members.tenant_id', '=', db.raw('?', [tenantId]));
    })
    .where('users.is_active', true)
    .whereNotNull('users.email')
    .select('users.id');
  for (const u of users) {
    await sendDigestFor(u.id, tenantId).catch(() => {});
  }
}

/**
 * Turn a web path like `/uploads/posts/uuid/media_0_thumb.webp` into a
 * filesystem attachment descriptor, or null if the file can't be found or
 * the path escapes the uploads dir.
 */
async function thumbToAttachment(thumbPath, cid) {
  if (!thumbPath) return null;
  const rel = thumbPath.replace(/^\/uploads\//, '');
  const fsPath = path.join(config.uploads.dir, rel);
  if (!fsPath.startsWith(config.uploads.dir + path.sep)) return null;
  try {
    await fs.access(fsPath);
  } catch {
    return null;
  }
  return { cid, fsPath, filename: path.basename(fsPath) };
}

/**
 * Collect inline attachments for the digest:
 *  - family_post thumbnails (one per notification)
 *  - every memory post thumbnail (one per post, so the email lists them all)
 */
async function collectInlineAttachments(notifications, memoryPosts) {
  const out = [];
  for (const n of notifications) {
    if (n.type !== 'family_post') continue;
    const parts = (n.body || '').split('|');
    const a = await thumbToAttachment(parts[1], `notif-${n.id}@whoareyou`);
    if (a) out.push({ notificationId: n.id, ...a });
  }
  for (const p of memoryPosts) {
    if (!p.thumbnail_path) continue;
    const a = await thumbToAttachment(p.thumbnail_path, `memory-${p.uuid}@whoareyou`);
    if (a) out.push({ memoryPostUuid: p.uuid, ...a });
  }
  return out;
}

/**
 * Fetch today's memory posts for a user — same filter as
 * `GET /api/posts/memories` plus extra defensive filters on sensitive
 * content. Returns the oldest few so the email has real substance.
 */
async function fetchMemoryPostsForDigest(userId, tenantId, limit = 10) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  const posts = await db('posts')
    .leftJoin('contacts', 'posts.contact_id', 'contacts.id')
    .where('posts.tenant_id', tenantId)
    .whereNull('posts.deleted_at')
    .where('posts.is_sensitive', false)
    .where(function () {
      this.whereIn('posts.visibility', ['shared', 'family'])
        .orWhere('posts.created_by', userId);
    })
    .whereRaw('MONTH(posts.post_date) = ?', [month])
    .whereRaw('DAY(posts.post_date) = ?', [day])
    .whereRaw('YEAR(posts.post_date) < ?', [year])
    .whereNotExists(
      db('contacts as sc')
        .whereRaw('sc.id = posts.contact_id')
        .where('sc.is_sensitive', true)
    )
    .whereNotExists(
      db('post_contacts')
        .join('contacts as tc', 'post_contacts.contact_id', 'tc.id')
        .whereRaw('post_contacts.post_id = posts.id')
        .where('tc.is_sensitive', true)
    )
    .select(
      'posts.id', 'posts.uuid', 'posts.post_date', 'posts.body',
      'contacts.first_name', 'contacts.last_name',
    )
    .orderBy('posts.post_date', 'asc')
    .limit(limit);
  if (!posts.length) return [];

  const postIds = posts.map(p => p.id);
  const media = await db('post_media')
    .whereIn('post_id', postIds)
    .where('file_type', 'like', 'image/%')
    .select('post_id', 'thumbnail_path')
    .orderBy('sort_order');
  const thumbByPost = new Map();
  for (const m of media) if (!thumbByPost.has(m.post_id)) thumbByPost.set(m.post_id, m.thumbnail_path);

  return posts.map(p => ({
    ...p,
    thumbnail_path: thumbByPost.get(p.id) || null,
    years_ago: year - new Date(p.post_date).getFullYear(),
  }));
}

function renderDigest(user, notifications, lang, attachments = [], memoryPosts = []) {
  const cidByNotificationId = new Map(attachments.filter(a => a.notificationId).map(a => [a.notificationId, a.cid]));
  const cidByMemoryPost = new Map(attachments.filter(a => a.memoryPostUuid).map(a => [a.memoryPostUuid, a.cid]));
  const isNb = lang.startsWith('nb') || lang.startsWith('no');
  const greeting = isNb ? `Hei ${user.first_name},` : `Hi ${user.first_name},`;
  const intro = isNb
    ? `Her er varslene du ikke har lest ennå${notifications.length > 1 ? ` (${notifications.length} stk)` : ''}.`
    : `Here are your unread notifications${notifications.length > 1 ? ` (${notifications.length})` : ''}.`;
  const footer = isNb
    ? 'Du får denne e-posten fordi du har slått på e-postvarsling for minst én type. Du kan skru det av under Varsler i profilen.'
    : 'You are receiving this because you have enabled email notifications for at least one type. Turn it off in Notifications from your profile.';

  // Group by type to make the digest scannable
  const grouped = new Map();
  for (const n of notifications) {
    if (!grouped.has(n.type)) grouped.set(n.type, []);
    grouped.get(n.type).push(n);
  }

  const typeLabel = (t) => TYPE_LABELS_NB[t] || t;

  const textParts = [greeting, '', intro, ''];
  for (const [type, rows] of grouped) {
    const count = type === 'memory' ? (memoryPosts.length || rows.length) : rows.length;
    textParts.push(`${TYPE_ICONS_TEXT[type] || '•'} ${typeLabel(type)} (${count})`);
    if (type === 'memory' && memoryPosts.length) {
      for (const p of memoryPosts) {
        const name = p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : '';
        const preview = (p.body || '').slice(0, 80);
        textParts.push(`  - ${p.years_ago} år siden${name ? ` (${name})` : ''}${preview ? ` — ${preview}` : ''}`);
      }
    } else {
      for (const r of rows) {
        textParts.push(`  - ${renderTextLine(r)}`);
      }
    }
    textParts.push('');
  }
  textParts.push(footer);

  const htmlGroups = [...grouped.entries()].map(([type, rows]) => {
    const count = type === 'memory' ? (memoryPosts.length || rows.length) : rows.length;
    const header = `<tr><td style="padding:16px 0 4px 0;font-weight:600;color:#1C1C1E;border-bottom:1px solid #E5E5EA">
      ${TYPE_ICONS_TEXT[type] || ''} ${escapeHtml(typeLabel(type))} <span style="color:#8E8E93;font-weight:400">(${count})</span>
    </td></tr>`;
    if (type === 'memory' && memoryPosts.length) {
      return header + memoryPosts.map(p => {
        const cid = cidByMemoryPost.get(p.uuid);
        const name = p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : '';
        const preview = (p.body || '').slice(0, 120);
        const heading = `<strong>${p.years_ago} år siden</strong>${name ? ` — ${escapeHtml(name)}` : ''}`;
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
      }).join('');
    }
    return header + rows.map(r => `<tr><td style="padding:6px 0;color:#1C1C1E">${renderHtmlLine(r, cidByNotificationId)}</td></tr>`).join('');
  }).join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1C1C1E">
      <h2 style="margin:0 0 8px 0">${escapeHtml(isNb ? 'Varsler fra WhoareYou' : 'Notifications from WhoareYou')}</h2>
      <p style="color:#3C3C43">${escapeHtml(greeting)}</p>
      <p style="color:#3C3C43">${escapeHtml(intro)}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">${htmlGroups}</table>
      <p style="color:#8E8E93;font-size:12px;margin-top:24px">${escapeHtml(footer)}</p>
    </div>
  `;

  return {
    subject: isNb
      ? `${notifications.length} nye varsler fra WhoareYou`
      : `${notifications.length} new notifications from WhoareYou`,
    text: textParts.join('\n'),
    html,
  };
}

function renderTextLine(n) {
  if (n.type === 'birthday') return `${n.title} har bursdag i dag`;
  if (n.type === 'anniversary') {
    const parts = (n.body || '').split('|');
    return `${n.title} — ${parts[1] || ''} (${parts[2] || ''} år)`;
  }
  if (n.type === 'memory') {
    const parts = (n.body || '').split('|');
    const count = parseInt(parts[0], 10) || 1;
    const years = parseInt(n.title, 10) || 1;
    return count === 1
      ? `1 minne fra ${years} år siden`
      : `${count} minner fra i dag — det eldste fra ${years} år siden`;
  }
  if (n.type === 'family_post') {
    const parts = (n.body || '').split('|');
    const preview = parts[2] || '';
    return preview ? `${n.title}: ${preview}` : `${n.title} la ut et innlegg`;
  }
  if (n.type === 'family_comment') {
    const parts = (n.body || '').split('|');
    return `${n.title} kommenterte: ${parts[1] || ''}`;
  }
  if (n.type === 'reminder') return n.title;
  return n.title;
}

function renderHtmlLine(n, cidMap) {
  const cid = cidMap?.get(n.id);
  if (cid && (n.type === 'memory' || n.type === 'family_post')) {
    return `
      <table style="border-collapse:collapse"><tr>
        <td style="padding-right:10px;vertical-align:top">
          <img src="cid:${cid}" alt="" width="60" height="60" style="display:block;border-radius:6px;object-fit:cover">
        </td>
        <td style="vertical-align:middle">${escapeHtml(renderTextLine(n))}</td>
      </tr></table>
    `;
  }
  return escapeHtml(renderTextLine(n));
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
