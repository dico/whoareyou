import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { portalAuthenticate } from '../middleware/portal-auth.js';
import { getSetting } from '../utils/settings.js';

const router = Router();

// ── Auth (no middleware — public endpoints) ──

// POST /api/portal/auth/login — portal guest login
router.post('/auth/login', async (req, res, next) => {
  try {
    const globalEnabled = await getSetting('portal_enabled', 'true');
    if (globalEnabled !== 'true') throw new AppError('Portal is disabled', 403);

    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email and password required', 400);

    const guest = await db('portal_guests')
      .where({ email: email.trim().toLowerCase(), is_active: true })
      .first();

    if (!guest) throw new AppError('Invalid credentials', 401);

    const tenant = await db('tenants').where({ id: guest.tenant_id }).first();
    if (!tenant?.portal_enabled) throw new AppError('Portal is disabled', 403);

    const valid = await bcrypt.compare(password, guest.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    const session = await createPortalSession(guest, req);
    await db('portal_guests').where({ id: guest.id }).update({ last_login_at: db.fn.now() });

    res.json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      guest: { uuid: guest.uuid, display_name: guest.display_name },
    });
  } catch (err) { next(err); }
});

// POST /api/portal/auth/link — validate share link and create session
router.post('/auth/link', async (req, res, next) => {
  try {
    const globalEnabled = await getSetting('portal_enabled', 'true');
    if (globalEnabled !== 'true') throw new AppError('Portal is disabled', 403);

    const { token } = req.body;
    if (!token) throw new AppError('Token required', 400);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const link = await db('portal_share_links')
      .where({ token_hash: tokenHash, is_active: true })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', db.fn.now());
      })
      .first();

    if (!link) throw new AppError('Invalid or expired link', 401);

    const tenant = await db('tenants').where({ id: link.tenant_id }).first();
    if (!tenant?.portal_enabled) throw new AppError('Portal is disabled', 403);

    // Update last used
    await db('portal_share_links').where({ id: link.id }).update({ last_used_at: db.fn.now() });

    let guest;
    if (link.portal_guest_id) {
      guest = await db('portal_guests').where({ id: link.portal_guest_id, is_active: true }).first();
      if (!guest) throw new AppError('Guest account inactive', 401);
    } else {
      // Create or find ephemeral guest for this link
      guest = await db('portal_guests').where({ tenant_id: link.tenant_id, display_name: `Link: ${link.label || link.uuid}` }).first();
      if (!guest) {
        const [guestId] = await db('portal_guests').insert({
          uuid: uuidv4(),
          tenant_id: link.tenant_id,
          display_name: link.label || 'Guest',
          is_active: true,
          created_by: link.created_by,
        });
        guest = await db('portal_guests').where({ id: guestId }).first();

        // Set contacts from link
        const contactIds = typeof link.contact_ids === 'string' ? JSON.parse(link.contact_ids) : link.contact_ids;
        if (contactIds?.length) {
          await db('portal_guest_contacts').insert(
            contactIds.map(cid => ({ portal_guest_id: guest.id, contact_id: cid }))
          );
        }
      }
    }

    const session = await createPortalSession(guest, req);
    await db('portal_guests').where({ id: guest.id }).update({ last_login_at: db.fn.now() });

    res.json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      guest: { uuid: guest.uuid, display_name: guest.display_name },
    });
  } catch (err) { next(err); }
});

// POST /api/portal/auth/refresh — refresh portal session
router.post('/auth/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required', 400);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await db('portal_sessions')
      .where({ refresh_token_hash: tokenHash, is_active: true })
      .where('expires_at', '>', db.fn.now())
      .first();

    if (!session) throw new AppError('Invalid or expired session', 401);

    const guest = await db('portal_guests').where({ id: session.portal_guest_id, is_active: true }).first();
    if (!guest) throw new AppError('Guest inactive', 401);

    await db('portal_sessions').where({ id: session.id }).update({ last_activity_at: db.fn.now() });

    const accessToken = jwt.sign(
      { portalGuestId: guest.id, tenantId: guest.tenant_id, type: 'portal', sid: session.uuid },
      config.jwt.secret,
      { expiresIn: '15m' }
    );

    res.json({ token: accessToken });
  } catch (err) { next(err); }
});

// ── Protected endpoints (require portalAuthenticate) ──

// GET /api/portal/me
router.get('/me', portalAuthenticate, async (req, res, next) => {
  try {
    const guest = await db('portal_guests').where({ id: req.portal.guestId }).first();
    res.json({ guest: { uuid: guest.uuid, display_name: guest.display_name } });
  } catch (err) { next(err); }
});

// GET /api/portal/contacts — contacts this guest can see
router.get('/contacts', portalAuthenticate, async (req, res, next) => {
  try {
    const contacts = await db('contacts')
      .whereIn('id', req.portal.contactIds)
      .whereNull('deleted_at')
      .select('uuid', 'first_name', 'last_name')
      .orderBy('first_name');

    // Get avatars
    for (const c of contacts) {
      const photo = await db('contact_photos')
        .join('contacts as ct', 'contact_photos.contact_id', 'ct.id')
        .where({ 'ct.uuid': c.uuid, 'contact_photos.is_primary': true })
        .select('contact_photos.thumbnail_path')
        .first();
      c.avatar = photo?.thumbnail_path || null;
    }

    res.json({ contacts });
  } catch (err) { next(err); }
});

// GET /api/portal/contacts/:uuid/timeline — timeline for a contact
router.get('/contacts/:uuid/timeline', portalAuthenticate, async (req, res, next) => {
  try {
    const contact = await db('contacts').where({ uuid: req.params.uuid }).whereNull('deleted_at').first();
    if (!contact || !req.portal.contactIds.includes(contact.id)) {
      throw new AppError('Contact not found', 404);
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;

    const posts = await db('posts')
      .where('posts.tenant_id', req.portal.tenantId)
      .whereNull('posts.deleted_at')
      .where('posts.visibility', 'shared') // Portal ONLY sees shared posts
      .where(function () {
        this.where('posts.contact_id', contact.id)
          .orWhereIn('posts.id', db('post_contacts').where('contact_id', contact.id).select('post_id'));
      })
      .select('posts.*')
      .orderBy('posts.post_date', 'desc')
      .limit(limit)
      .offset(offset);

    // Enrich with media, contacts, reactions, comments
    for (const post of posts) {
      post.media = await db('post_media').where({ post_id: post.id })
        .select('file_path', 'thumbnail_path', 'file_type', 'file_size')
        .orderBy('sort_order');

      post.contacts = await db('post_contacts')
        .join('contacts', 'post_contacts.contact_id', 'contacts.id')
        .where('post_contacts.post_id', post.id)
        .select('contacts.uuid', 'contacts.first_name', 'contacts.last_name');

      const [reactions] = await db('post_reactions').where({ post_id: post.id }).count('id as count');
      post.reaction_count = reactions.count;

      const myReaction = await db('post_reactions')
        .where({ post_id: post.id, portal_guest_id: req.portal.guestId })
        .first();
      post.reacted = !!myReaction;

      const [comments] = await db('post_comments').where({ post_id: post.id }).count('id as count');
      post.comment_count = comments.count;

      // About contact
      if (post.contact_id) {
        const about = await db('contacts').where({ id: post.contact_id }).select('uuid', 'first_name', 'last_name').first();
        if (about) {
          const photo = await db('contact_photos').where({ contact_id: about.id || post.contact_id, is_primary: true }).select('thumbnail_path').first();
          post.about = { ...about, avatar: photo?.thumbnail_path || null };
        }
      }
    }

    res.json({
      posts: posts.map(p => ({
        uuid: p.uuid, body: p.body, post_date: p.post_date,
        about: p.about || null, contacts: p.contacts, media: p.media,
        reaction_count: p.reaction_count, reacted: p.reacted,
        comment_count: p.comment_count,
      })),
      hasMore: posts.length === limit,
    });
  } catch (err) { next(err); }
});

// GET /api/portal/posts/:uuid/comments
router.get('/posts/:uuid/comments', portalAuthenticate, async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, visibility: 'shared' })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    // Verify post is about a contact this guest can see
    const isAbout = post.contact_id && req.portal.contactIds.includes(post.contact_id);
    const isTagged = await db('post_contacts')
      .where('post_id', post.id)
      .whereIn('contact_id', req.portal.contactIds)
      .first();
    if (!isAbout && !isTagged) throw new AppError('Post not found', 404);

    const comments = await db('post_comments')
      .where({ post_id: post.id })
      .leftJoin('users', 'post_comments.user_id', 'users.id')
      .leftJoin('portal_guests', 'post_comments.portal_guest_id', 'portal_guests.id')
      .select(
        'post_comments.id', 'post_comments.body', 'post_comments.created_at',
        'users.first_name as user_first', 'users.last_name as user_last',
        'portal_guests.display_name as guest_name',
        'post_comments.portal_guest_id'
      )
      .orderBy('post_comments.created_at', 'asc');

    res.json({
      comments: comments.map(c => ({
        id: c.id, body: c.body, created_at: c.created_at,
        author: c.guest_name || `${c.user_first || ''} ${c.user_last || ''}`.trim(),
        is_own: c.portal_guest_id === req.portal.guestId,
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/portal/posts/:uuid/comments
router.post('/posts/:uuid/comments', portalAuthenticate, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) throw new AppError('Comment body required', 400);

    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, visibility: 'shared' })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    // Verify access
    const isAbout = post.contact_id && req.portal.contactIds.includes(post.contact_id);
    const isTagged = await db('post_contacts').where('post_id', post.id).whereIn('contact_id', req.portal.contactIds).first();
    if (!isAbout && !isTagged) throw new AppError('Post not found', 404);

    await db('post_comments').insert({
      post_id: post.id,
      user_id: null,
      portal_guest_id: req.portal.guestId,
      body: body.trim(),
    });

    res.status(201).json({ message: 'Comment added' });
  } catch (err) { next(err); }
});

// POST /api/portal/posts/:uuid/reactions
router.post('/posts/:uuid/reactions', portalAuthenticate, async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, visibility: 'shared' })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    const isAbout = post.contact_id && req.portal.contactIds.includes(post.contact_id);
    const isTagged = await db('post_contacts').where('post_id', post.id).whereIn('contact_id', req.portal.contactIds).first();
    if (!isAbout && !isTagged) throw new AppError('Post not found', 404);

    const existing = await db('post_reactions')
      .where({ post_id: post.id, portal_guest_id: req.portal.guestId })
      .first();

    if (existing) {
      await db('post_reactions').where({ id: existing.id }).del();
      res.json({ reacted: false });
    } else {
      await db('post_reactions').insert({
        post_id: post.id,
        user_id: null,
        portal_guest_id: req.portal.guestId,
        emoji: '❤️',
      });
      res.json({ reacted: true });
    }
  } catch (err) { next(err); }
});

// ── Helper ──

async function createPortalSession(guest, req) {
  const { UAParser } = await import('ua-parser-js');
  const sessionUuid = uuidv4();
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const ua = new UAParser(req.headers['user-agent'] || '');
  const browser = ua.getBrowser();
  const os = ua.getOS();
  const deviceLabel = [browser.name, os.name].filter(Boolean).join(' on ') || 'Unknown';

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365); // 1 year for portal

  await db('portal_sessions').insert({
    uuid: sessionUuid,
    portal_guest_id: guest.id,
    refresh_token_hash: refreshTokenHash,
    ip_address: ip,
    user_agent: (req.headers['user-agent'] || '').slice(0, 500),
    device_label: deviceLabel,
    is_active: true,
    expires_at: expiresAt,
  });

  const accessToken = jwt.sign(
    { portalGuestId: guest.id, tenantId: guest.tenant_id, type: 'portal', sid: sessionUuid },
    config.jwt.secret,
    { expiresIn: '15m' }
  );

  return { sessionUuid, accessToken, refreshToken };
}

export default router;
