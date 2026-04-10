import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { processImage } from '../services/image.js';
import { portalAuthenticate } from '../middleware/portal-auth.js';
import { getSetting } from '../utils/settings.js';
import { getClientIp } from '../utils/ip.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const portalUpload = multer({
  dest: path.join(config.uploads?.dir || path.join(process.cwd(), '..', 'uploads'), 'temp'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if ([...IMAGE_TYPES, ...VIDEO_TYPES].includes(file.mimetype)) cb(null, true);
    else cb(new AppError('Only images and videos are allowed', 400));
  },
});

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
      // Create ephemeral guest for this standalone link (linked back to the link for cleanup)
      const [guestId] = await db('portal_guests').insert({
        uuid: uuidv4(),
        tenant_id: link.tenant_id,
        display_name: link.label || 'Guest',
        is_active: true,
        created_by: link.created_by,
      });
      guest = await db('portal_guests').where({ id: guestId }).first();

      // Link the share link to this guest for traceability
      await db('portal_share_links').where({ id: link.id }).update({ portal_guest_id: guest.id });

      // Set contacts from link
      const contactIds = typeof link.contact_ids === 'string' ? JSON.parse(link.contact_ids) : link.contact_ids;
      if (contactIds?.length) {
        await db('portal_guest_contacts').insert(
          contactIds.map(cid => ({ portal_guest_id: guest.id, contact_id: cid }))
        );
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
    // Portal NEVER sees sensitive contacts — they're hidden unconditionally,
    // there's no toggle for portal guests.
    const contacts = await db('contacts')
      .whereIn('id', req.portal.contactIds)
      .whereNull('deleted_at')
      .where('is_sensitive', false)
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

// GET /api/portal/contacts/:uuid/gallery — all images for a contact
router.get('/contacts/:uuid/gallery', portalAuthenticate, async (req, res, next) => {
  try {
    const contact = await db('contacts').where({ uuid: req.params.uuid }).whereNull('deleted_at').first();
    if (!contact || !req.portal.contactIds.includes(contact.id) || contact.is_sensitive) {
      throw new AppError('Contact not found', 404);
    }

    const postIds = await db('posts')
      .where('posts.tenant_id', req.portal.tenantId)
      .whereNull('posts.deleted_at')
      .where('posts.visibility', 'shared')
      .where('posts.is_sensitive', false)
      .where(function () {
        this.where('posts.contact_id', contact.id)
          .orWhereIn('posts.id', db('post_contacts').where('contact_id', contact.id).select('post_id'));
      })
      .whereNotExists(
        db('post_contacts')
          .join('contacts as sc', 'post_contacts.contact_id', 'sc.id')
          .whereRaw('post_contacts.post_id = posts.id')
          .where('sc.is_sensitive', true),
      )
      .select('posts.id');

    const images = await db('post_media')
      .whereIn('post_id', postIds.map(p => p.id))
      .where('file_type', 'like', 'image/%')
      .join('posts', 'post_media.post_id', 'posts.id')
      .select('post_media.file_path', 'post_media.thumbnail_path', 'posts.post_date')
      .orderBy('posts.post_date', 'desc')
      .orderBy('post_media.sort_order');

    res.json({ images });
  } catch (err) { next(err); }
});

// GET /api/portal/contacts/:uuid/timeline — timeline for a contact
router.get('/contacts/:uuid/timeline', portalAuthenticate, async (req, res, next) => {
  try {
    const contact = await db('contacts').where({ uuid: req.params.uuid }).whereNull('deleted_at').first();
    if (!contact || !req.portal.contactIds.includes(contact.id) || contact.is_sensitive) {
      throw new AppError('Contact not found', 404);
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;

    const posts = await db('posts')
      .where('posts.tenant_id', req.portal.tenantId)
      .whereNull('posts.deleted_at')
      .where('posts.visibility', 'shared') // Portal ONLY sees shared posts
      .where('posts.is_sensitive', false) // and never sensitive ones
      .where(function () {
        this.where('posts.contact_id', contact.id)
          .orWhereIn('posts.id', db('post_contacts').where('contact_id', contact.id).select('post_id'));
      })
      .whereNotExists(
        db('post_contacts')
          .join('contacts as sc', 'post_contacts.contact_id', 'sc.id')
          .whereRaw('post_contacts.post_id = posts.id')
          .where('sc.is_sensitive', true),
      )
      .select('posts.*')
      .orderBy('posts.post_date', 'desc')
      .limit(limit)
      .offset(offset);

    // Enrich with media, contacts, reactions, comments
    for (const post of posts) {
      post.media = await db('post_media').where({ post_id: post.id })
        .select('file_path', 'thumbnail_path', 'file_type', 'file_size')
        .orderBy('sort_order');

      // Only return tagged contacts the guest has access to
      post.contacts = await db('post_contacts')
        .join('contacts', 'post_contacts.contact_id', 'contacts.id')
        .where('post_contacts.post_id', post.id)
        .whereIn('post_contacts.contact_id', req.portal.contactIds)
        .select('contacts.uuid', 'contacts.first_name', 'contacts.last_name');

      const postReactions = await db('post_reactions')
        .where({ post_id: post.id })
        .leftJoin('users', 'post_reactions.user_id', 'users.id')
        .leftJoin('contacts as rc', 'post_reactions.contact_id', 'rc.id')
        .leftJoin('portal_guests', 'post_reactions.portal_guest_id', 'portal_guests.id')
        .select('post_reactions.portal_guest_id',
          'rc.first_name as contact_first', 'rc.last_name as contact_last',
          'users.first_name as user_first', 'users.last_name as user_last',
          'portal_guests.display_name as guest_name');
      post.reaction_count = postReactions.length;
      post.reacted = postReactions.some(r => r.portal_guest_id === req.portal.guestId);
      post.reaction_names = postReactions.map(r => {
        return r.contact_first || r.guest_name || r.user_first;
      }).filter(Boolean);

      const [comments] = await db('post_comments').where({ post_id: post.id }).count('id as count');
      post.comment_count = comments.count;

      // About contact — only include if guest has access
      if (post.contact_id && req.portal.contactIds.includes(post.contact_id)) {
        const about = await db('contacts').where({ id: post.contact_id }).select('uuid', 'first_name', 'last_name').first();
        if (about) {
          const photo = await db('contact_photos').where({ contact_id: post.contact_id, is_primary: true }).select('thumbnail_path').first();
          post.about = { ...about, avatar: photo?.thumbnail_path || null };
        }
      }
    }

    // Resolve post authors: portal guests or users
    const guestIds = [...new Set(posts.map(p => p.portal_guest_id).filter(Boolean))];
    const userIds = [...new Set(posts.map(p => p.created_by).filter(Boolean))];
    const authorMap = new Map(); // id -> { name, avatar }
    if (guestIds.length) {
      const guests = await db('portal_guests').whereIn('portal_guests.id', guestIds)
        .leftJoin('contacts as gc', 'portal_guests.linked_contact_id', 'gc.id')
        .select('portal_guests.id', 'portal_guests.display_name',
          'gc.first_name as contact_first', 'gc.last_name as contact_last', 'gc.id as contact_id');
      // Get avatars for guest-linked contacts
      const guestContactIds = guests.map(g => g.contact_id).filter(Boolean);
      const guestAvatarMap = new Map();
      if (guestContactIds.length) {
        const photos = await db('contact_photos').whereIn('contact_id', [...new Set(guestContactIds)]).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
        for (const p of photos) guestAvatarMap.set(p.contact_id, p.thumbnail_path);
      }
      for (const g of guests) {
        const name = g.contact_first ? `${g.display_name} ${g.contact_first}` : g.display_name;
        authorMap.set(`guest_${g.id}`, { name, avatar: guestAvatarMap.get(g.contact_id) || null });
      }
    }
    if (userIds.length) {
      const users = await db('users').whereIn('users.id', userIds)
        .leftJoin('contacts as uc', 'users.linked_contact_id', 'uc.id')
        .select('users.id', 'users.first_name', 'users.linked_contact_id',
          'uc.first_name as contact_first', 'uc.last_name as contact_last');
      const userContactIds = users.map(u => u.linked_contact_id).filter(Boolean);
      const userAvatarMap = new Map();
      if (userContactIds.length) {
        const photos = await db('contact_photos').whereIn('contact_id', [...new Set(userContactIds)]).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
        for (const p of photos) userAvatarMap.set(p.contact_id, p.thumbnail_path);
      }
      for (const u of users) {
        authorMap.set(`user_${u.id}`, { name: u.contact_first || u.first_name, avatar: userAvatarMap.get(u.linked_contact_id) || null });
      }
    }

    res.json({
      posts: posts.map(p => {
        const authorKey = p.portal_guest_id ? `guest_${p.portal_guest_id}` : p.created_by ? `user_${p.created_by}` : null;
        const author = authorKey ? authorMap.get(authorKey) : null;
        return {
          uuid: p.uuid, body: p.body, post_date: p.post_date,
          about: p.about || null, contacts: p.contacts, media: p.media,
          reaction_count: p.reaction_count, reacted: p.reacted,
          reaction_names: p.reaction_names || [],
          comment_count: p.comment_count,
          author: author || null,
          is_own: p.portal_guest_id === req.portal.guestId,
        };
      }),
      hasMore: posts.length === limit,
    });
  } catch (err) { next(err); }
});

// POST /api/portal/posts — create a post as portal guest
router.post('/posts', portalAuthenticate, async (req, res, next) => {
  try {
    const { body, contact_uuid } = req.body;
    if (!body?.trim() && !req.body.has_media) throw new AppError('Post body is required', 400);

    // Verify guest has access to this contact
    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.portal.tenantId })
      .first();
    if (!contact || !req.portal.contactIds.includes(contact.id)) {
      throw new AppError('Contact not found', 404);
    }

    const uuid = uuidv4();
    const guest = await db('portal_guests').where({ id: req.portal.guestId }).first();

    const [postId] = await db('posts').insert({
      uuid,
      tenant_id: req.portal.tenantId,
      created_by: null,
      body: (body || '').trim(),
      post_date: new Date(),
      contact_id: contact.id,
      visibility: 'shared',
      portal_guest_id: req.portal.guestId,
    });

    res.status(201).json({ post: { uuid, id: postId } });
  } catch (err) { next(err); }
});

// PUT /api/portal/posts/:uuid — edit own post
router.put('/posts/:uuid', portalAuthenticate, async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, portal_guest_id: req.portal.guestId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found or not yours', 404);

    const updates = {};
    if (req.body.body !== undefined) updates.body = req.body.body.trim();
    if (req.body.post_date !== undefined) updates.post_date = new Date(req.body.post_date);
    if (Object.keys(updates).length) {
      await db('posts').where({ id: post.id }).update(updates);
    }
    res.json({ message: 'Post updated' });
  } catch (err) { next(err); }
});

// DELETE /api/portal/posts/:uuid — delete own post
router.delete('/posts/:uuid', portalAuthenticate, async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, portal_guest_id: req.portal.guestId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found or not yours', 404);

    await db('posts').where({ id: post.id }).update({ deleted_at: db.fn.now() });
    res.json({ message: 'Post deleted' });
  } catch (err) { next(err); }
});

// POST /api/portal/posts/:uuid/media — upload media to a portal post
router.post('/posts/:uuid/media', portalAuthenticate, portalUpload.array('media', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) throw new AppError('No files uploaded', 400);

    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, portal_guest_id: req.portal.guestId })
      .first();
    if (!post) throw new AppError('Post not found', 404);

    const uploadsDir = config.uploads?.dir || path.join(process.cwd(), '..', 'uploads');
    const [{ maxSort }] = await db('post_media').where({ post_id: post.id }).max('sort_order as maxSort');

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const timestamp = Date.now();
      let filePath, thumbnailPath, fileType;

      if (IMAGE_TYPES.includes(file.mimetype)) {
        const processed = await processImage(file.path, `posts/${post.uuid}`, `media_${timestamp}_${i}`);
        filePath = processed.filePath;
        thumbnailPath = processed.thumbnailPath;
        fileType = 'image/webp';
      } else {
        const ext = path.extname(file.originalname) || '.mp4';
        const outDir = path.join(uploadsDir, 'posts', post.uuid);
        await fs.mkdir(outDir, { recursive: true });
        const destName = `video_${timestamp}_${i}${ext}`;
        await fs.rename(file.path, path.join(outDir, destName));
        filePath = `/uploads/posts/${post.uuid}/${destName}`;
        thumbnailPath = null;
        fileType = file.mimetype;
      }

      await db('post_media').insert({
        post_id: post.id,
        tenant_id: req.portal.tenantId,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        file_type: fileType,
        file_size: file.size,
        original_name: file.originalname || null,
        sort_order: (maxSort || 0) + i + 1,
      });
    }

    res.json({ message: 'Media uploaded' });
  } catch (err) { next(err); }
});

// GET /api/portal/posts/:uuid/comments
router.get('/posts/:uuid/comments', portalAuthenticate, async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, visibility: 'shared', is_sensitive: false })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    // Verify post is about a contact this guest can see, and that contact
    // (and any tagged contacts) aren't sensitive.
    const isAbout = post.contact_id && req.portal.contactIds.includes(post.contact_id);
    const isTagged = await db('post_contacts')
      .where('post_id', post.id)
      .whereIn('contact_id', req.portal.contactIds)
      .first();
    if (!isAbout && !isTagged) throw new AppError('Post not found', 404);
    const sensitiveTag = await db('post_contacts')
      .join('contacts', 'post_contacts.contact_id', 'contacts.id')
      .where('post_contacts.post_id', post.id)
      .where('contacts.is_sensitive', true)
      .first();
    if (sensitiveTag) throw new AppError('Post not found', 404);
    if (post.contact_id) {
      const subj = await db('contacts').where({ id: post.contact_id }).select('is_sensitive').first();
      if (subj?.is_sensitive) throw new AppError('Post not found', 404);
    }

    const comments = await db('post_comments')
      .where({ post_id: post.id })
      .leftJoin('users', 'post_comments.user_id', 'users.id')
      .leftJoin('contacts as cc', 'post_comments.contact_id', 'cc.id')
      .leftJoin('portal_guests', 'post_comments.portal_guest_id', 'portal_guests.id')
      .select(
        'post_comments.id', 'post_comments.body', 'post_comments.created_at',
        'post_comments.contact_id',
        'users.first_name as user_first', 'users.linked_contact_id',
        'cc.first_name as contact_first', 'cc.id as contact_id_resolved',
        'portal_guests.display_name as guest_name',
        'portal_guests.linked_contact_id as guest_linked_contact_id',
        'post_comments.portal_guest_id'
      )
      .orderBy('post_comments.created_at', 'asc');

    // Get avatars for comment authors
    const avatarContactIds = comments.map(c => c.contact_id_resolved || c.linked_contact_id || c.guest_linked_contact_id).filter(Boolean);
    const avatarMap = new Map();
    if (avatarContactIds.length) {
      const photos = await db('contact_photos').whereIn('contact_id', [...new Set(avatarContactIds)]).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
      for (const p of photos) avatarMap.set(p.contact_id, p.thumbnail_path);
    }

    res.json({
      comments: comments.map(c => {
        const avatarContactId = c.contact_id_resolved || c.linked_contact_id || c.guest_linked_contact_id;
        return {
          id: c.id, body: c.body, created_at: c.created_at,
          author: c.guest_name || c.contact_first || c.user_first || '?',
          avatar: avatarMap.get(avatarContactId) || null,
          is_own: c.portal_guest_id === req.portal.guestId,
        };
      }),
    });
  } catch (err) { next(err); }
});

// POST /api/portal/posts/:uuid/comments
router.post('/posts/:uuid/comments', portalAuthenticate, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) throw new AppError('Comment body required', 400);

    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.portal.tenantId, visibility: 'shared', is_sensitive: false })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    // Verify access — and that neither subject nor any tagged contact is sensitive
    const isAbout = post.contact_id && req.portal.contactIds.includes(post.contact_id);
    const isTagged = await db('post_contacts').where('post_id', post.id).whereIn('contact_id', req.portal.contactIds).first();
    if (!isAbout && !isTagged) throw new AppError('Post not found', 404);
    if (post.contact_id) {
      const subj = await db('contacts').where({ id: post.contact_id }).select('is_sensitive').first();
      if (subj?.is_sensitive) throw new AppError('Post not found', 404);
    }
    const sensitiveTag = await db('post_contacts')
      .join('contacts', 'post_contacts.contact_id', 'contacts.id')
      .where('post_contacts.post_id', post.id)
      .where('contacts.is_sensitive', true)
      .first();
    if (sensitiveTag) throw new AppError('Post not found', 404);

    // Resolve contact_id from portal guest's linked contact
    const guest = await db('portal_guests').where({ id: req.portal.guestId }).first();
    const contactId = guest?.linked_contact_id || null;

    await db('post_comments').insert({
      post_id: post.id,
      tenant_id: req.portal.tenantId,
      user_id: null,
      portal_guest_id: req.portal.guestId,
      contact_id: contactId,
      body: body.trim(),
    });

    res.status(201).json({ message: 'Comment added' });
  } catch (err) { next(err); }
});

// DELETE /api/portal/posts/:uuid/comments/:id
router.delete('/posts/:uuid/comments/:commentId', portalAuthenticate, async (req, res, next) => {
  try {
    const comment = await db('post_comments')
      .where({ id: req.params.commentId, portal_guest_id: req.portal.guestId, tenant_id: req.portal.tenantId })
      .first();
    if (!comment) throw new AppError('Comment not found', 404);

    await db('post_comments').where({ id: comment.id }).del();
    res.json({ message: 'Comment deleted' });
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
    } else {
      const guest = await db('portal_guests').where({ id: req.portal.guestId }).first();
      await db('post_reactions').insert({
        post_id: post.id,
        user_id: null,
        portal_guest_id: req.portal.guestId,
        contact_id: guest?.linked_contact_id || null,
        tenant_id: req.portal.tenantId,
        emoji: '❤️',
      });
    }

    // Return updated reaction info
    const allReactions = await db('post_reactions')
      .where({ post_id: post.id })
      .leftJoin('users', 'post_reactions.user_id', 'users.id')
      .leftJoin('contacts as rc', 'post_reactions.contact_id', 'rc.id')
      .leftJoin('portal_guests', 'post_reactions.portal_guest_id', 'portal_guests.id')
      .select('rc.first_name as contact_first', 'rc.last_name as contact_last',
        'users.first_name as user_first', 'users.last_name as user_last',
        'portal_guests.display_name as guest_name');
    const names = allReactions.map(r => {
      return (r.contact_first ? `${r.contact_first} ${r.contact_last || ''}`.trim() : null)
        || r.guest_name
        || (r.user_first ? `${r.user_first} ${r.user_last || ''}`.trim() : null);
    }).filter(Boolean);
    res.json({
      reacted: !existing,
      reaction_count: allReactions.length,
      reaction_names: names,
    });
  } catch (err) { next(err); }
});

// ── Helper ──

async function createPortalSession(guest, req) {
  const { UAParser } = await import('ua-parser-js');
  const sessionUuid = uuidv4();
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const ip = getClientIp(req) || 'unknown';
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
