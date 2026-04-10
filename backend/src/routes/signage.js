import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function serializeScreen(row, includeToken) {
  const out = {
    uuid: row.uuid,
    name: row.name,
    is_active: !!row.is_active,
    contact_uuids: parseJson(row.contact_uuids, []),
    visibility_filter: row.visibility_filter,
    days_back: row.days_back,
    display_mode: row.display_mode,
    slide_interval: row.slide_interval,
    show_body: !!row.show_body,
    show_contact_name: !!row.show_contact_name,
    show_reactions: !!row.show_reactions,
    show_comments: !!row.show_comments,
    show_date: !!row.show_date,
    max_posts: row.max_posts,
    shuffle: !!row.shuffle,
    include_sensitive: !!row.include_sensitive,
    feed_layout: row.feed_layout,
    multi_image: row.multi_image,
    image_fit: row.image_fit || 'contain',
    last_accessed_at: row.last_accessed_at,
    created_at: row.created_at,
  };
  if (includeToken) out.token = includeToken;
  return out;
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

// ── Admin endpoints (require auth) ──

// GET /api/signage — list screens for this tenant
router.get('/', async (req, res, next) => {
  try {
    const rows = await db('signage_screens')
      .where({ tenant_id: req.tenantId })
      .orderBy('created_at', 'desc');
    res.json({ screens: rows.map(r => serializeScreen(r)) });
  } catch (err) { next(err); }
});

// POST /api/signage — create new screen
router.post('/', async (req, res, next) => {
  try {
    const { name, contact_uuids } = req.body || {};
    if (!name?.trim()) throw new AppError('Name is required', 400);
    if (!Array.isArray(contact_uuids) || !contact_uuids.length) {
      throw new AppError('At least one contact is required', 400);
    }

    // Validate contacts belong to tenant
    const validContacts = await db('contacts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .whereIn('uuid', contact_uuids)
      .pluck('uuid');
    if (validContacts.length !== contact_uuids.length) {
      throw new AppError('One or more contacts not found', 404);
    }

    const uuid = uuidv4();
    const token = crypto.randomBytes(48).toString('base64url');
    const token_hash = hashToken(token);

    const config = {
      visibility_filter: req.body.visibility_filter === 'shared_family' ? 'shared_family' : 'shared',
      days_back: Number.isFinite(req.body.days_back) ? Math.max(0, req.body.days_back) || null : null,
      display_mode: req.body.display_mode === 'feed' ? 'feed' : 'slideshow',
      slide_interval: Math.min(Math.max(parseInt(req.body.slide_interval) || 15, 5), 120),
      show_body: !!req.body.show_body,
      show_contact_name: req.body.show_contact_name !== false,
      show_reactions: !!req.body.show_reactions,
      show_comments: !!req.body.show_comments,
      show_date: req.body.show_date !== false,
      max_posts: Math.min(Math.max(parseInt(req.body.max_posts) || 3, 1), 6),
      shuffle: !!req.body.shuffle,
      include_sensitive: !!req.body.include_sensitive,
      feed_layout: req.body.feed_layout === 'vertical' ? 'vertical' : 'horizontal',
      multi_image: ['collage', 'first', 'rotate'].includes(req.body.multi_image) ? req.body.multi_image : 'collage',
      image_fit: req.body.image_fit === 'cover' ? 'cover' : 'contain',
    };

    await db('signage_screens').insert({
      uuid,
      tenant_id: req.tenantId,
      name: name.trim().slice(0, 255),
      token_hash,
      contact_uuids: JSON.stringify(contact_uuids),
      ...config,
    });

    const row = await db('signage_screens').where({ uuid }).first();
    res.status(201).json({ screen: serializeScreen(row, token) });
  } catch (err) { next(err); }
});

// PATCH /api/signage/:uuid — update screen config
router.patch('/:uuid', async (req, res, next) => {
  try {
    const row = await db('signage_screens')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!row) throw new AppError('Screen not found', 404);

    const updates = {};
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      updates.name = req.body.name.trim().slice(0, 255);
    }
    if (Array.isArray(req.body.contact_uuids) && req.body.contact_uuids.length) {
      const valid = await db('contacts')
        .where({ tenant_id: req.tenantId })
        .whereNull('deleted_at')
        .whereIn('uuid', req.body.contact_uuids)
        .pluck('uuid');
      if (valid.length !== req.body.contact_uuids.length) {
        throw new AppError('One or more contacts not found', 404);
      }
      updates.contact_uuids = JSON.stringify(req.body.contact_uuids);
    }
    if (req.body.is_active !== undefined) updates.is_active = !!req.body.is_active;
    if (req.body.visibility_filter !== undefined) {
      updates.visibility_filter = req.body.visibility_filter === 'shared_family' ? 'shared_family' : 'shared';
    }
    if (req.body.days_back !== undefined) {
      updates.days_back = Number.isFinite(req.body.days_back) ? Math.max(0, req.body.days_back) || null : null;
    }
    if (req.body.display_mode !== undefined) {
      updates.display_mode = req.body.display_mode === 'feed' ? 'feed' : 'slideshow';
    }
    if (req.body.slide_interval !== undefined) {
      updates.slide_interval = Math.min(Math.max(parseInt(req.body.slide_interval) || 15, 5), 120);
    }
    const boolFields = ['show_body', 'show_contact_name', 'show_reactions', 'show_comments', 'show_date', 'shuffle', 'include_sensitive'];
    for (const f of boolFields) {
      if (req.body[f] !== undefined) updates[f] = !!req.body[f];
    }
    if (req.body.max_posts !== undefined) {
      updates.max_posts = Math.min(Math.max(parseInt(req.body.max_posts) || 3, 1), 6);
    }
    if (req.body.feed_layout !== undefined) {
      updates.feed_layout = req.body.feed_layout === 'vertical' ? 'vertical' : 'horizontal';
    }
    if (req.body.multi_image !== undefined) {
      updates.multi_image = ['collage', 'first', 'rotate'].includes(req.body.multi_image) ? req.body.multi_image : 'collage';
    }
    if (req.body.image_fit !== undefined) {
      updates.image_fit = req.body.image_fit === 'cover' ? 'cover' : 'contain';
    }

    if (Object.keys(updates).length) {
      updates.updated_at = db.fn.now();
      await db('signage_screens').where({ id: row.id }).update(updates);
    }

    const fresh = await db('signage_screens').where({ id: row.id }).first();
    res.json({ screen: serializeScreen(fresh) });
  } catch (err) { next(err); }
});

// DELETE /api/signage/:uuid
router.delete('/:uuid', async (req, res, next) => {
  try {
    const deleted = await db('signage_screens')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .delete();
    if (!deleted) throw new AppError('Screen not found', 404);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/signage/:uuid/regenerate-token — issue a new token
router.post('/:uuid/regenerate-token', async (req, res, next) => {
  try {
    const row = await db('signage_screens')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!row) throw new AppError('Screen not found', 404);
    const token = crypto.randomBytes(48).toString('base64url');
    await db('signage_screens').where({ id: row.id }).update({
      token_hash: hashToken(token),
      updated_at: db.fn.now(),
    });
    res.json({ token });
  } catch (err) { next(err); }
});

// ── Public endpoint (token-based, no auth) ──

// GET /api/signage/feed/:token — returns posts for the signage display
router.get('/feed/:token', async (req, res, next) => {
  try {
    const token_hash = hashToken(req.params.token);
    const screen = await db('signage_screens')
      .where({ token_hash, is_active: true })
      .first();
    if (!screen) {
      return res.status(404).json({ error: 'Screen not found or inactive' });
    }

    // Update last_accessed_at (fire-and-forget)
    db('signage_screens').where({ id: screen.id })
      .update({ last_accessed_at: db.fn.now() }).catch(() => {});

    const contactUuids = parseJson(screen.contact_uuids, []);
    if (!contactUuids.length) {
      return res.json({ config: screenConfig(screen), posts: [] });
    }

    // Resolve contacts
    const contacts = await db('contacts')
      .where({ tenant_id: screen.tenant_id })
      .whereNull('deleted_at')
      .whereIn('uuid', contactUuids)
      .modify((q) => { if (!screen.include_sensitive) q.where('is_sensitive', false); })
      .select('id', 'uuid', 'first_name', 'last_name',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp
          WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`));
    const contactIds = contacts.map(c => c.id);
    if (!contactIds.length) {
      return res.json({ config: screenConfig(screen), posts: [] });
    }
    const contactMap = new Map(contacts.map(c => [c.id, c]));

    // Build query
    const allowedVisibilities = screen.visibility_filter === 'shared'
      ? ['shared']
      : ['shared', 'family'];

    let query = db('posts')
      .where('posts.tenant_id', screen.tenant_id)
      .whereNull('posts.deleted_at')
      .whereIn('posts.visibility', allowedVisibilities)
      .where(function () {
        this.whereIn('posts.contact_id', contactIds)
          .orWhereIn('posts.id',
            db('post_contacts').whereIn('contact_id', contactIds).select('post_id'));
      });

    // Sensitive filter
    if (!screen.include_sensitive) {
      query = query.where('posts.is_sensitive', false);
      // Exclude posts where any tagged contact is sensitive
      query = query.whereNotExists(
        db('post_contacts')
          .join('contacts as sc', 'post_contacts.contact_id', 'sc.id')
          .whereRaw('post_contacts.post_id = posts.id')
          .where('sc.tenant_id', screen.tenant_id)
          .where('sc.is_sensitive', true),
      );
    }

    // Date range
    if (screen.days_back) {
      const since = new Date();
      since.setDate(since.getDate() - screen.days_back);
      query = query.where('posts.post_date', '>=', since.toISOString().split('T')[0]);
    }

    // For slideshow: only posts with images
    if (screen.display_mode === 'slideshow') {
      query = query.whereExists(
        db('post_media')
          .whereRaw('post_media.post_id = posts.id')
          .where('post_media.file_type', 'like', 'image/%'),
      );
    }

    // Order + limit
    const orderCol = screen.shuffle ? db.raw('RAND()') : 'posts.post_date';
    const orderDir = screen.shuffle ? undefined : 'desc';
    // For feed, fetch max_posts; for slideshow, fetch a larger batch that
    // the client can rotate through.
    const limit = screen.display_mode === 'feed'
      ? screen.max_posts
      : Math.min(200, screen.days_back ? 200 : 100);

    const posts = await query.clone()
      .select('posts.id', 'posts.body', 'posts.post_date', 'posts.contact_id')
      .orderBy(orderCol, orderDir)
      .limit(limit);

    if (!posts.length) {
      return res.json({ config: screenConfig(screen), posts: [] });
    }

    const postIds = posts.map(p => p.id);

    // Media
    const media = await db('post_media')
      .whereIn('post_id', postIds)
      .where('file_type', 'like', 'image/%')
      .orderBy('sort_order')
      .select('post_id', 'file_path', 'thumbnail_path');
    const mediaByPost = new Map();
    for (const m of media) {
      if (!mediaByPost.has(m.post_id)) mediaByPost.set(m.post_id, []);
      mediaByPost.get(m.post_id).push({
        file_path: m.file_path,
        thumbnail_path: m.thumbnail_path,
      });
    }

    // Tagged contacts (for de-duplication and names)
    const tags = await db('post_contacts')
      .join('contacts', 'post_contacts.contact_id', 'contacts.id')
      .whereIn('post_contacts.post_id', postIds)
      .whereIn('post_contacts.contact_id', contactIds)
      .select('post_contacts.post_id', 'contacts.first_name', 'contacts.last_name');
    const tagsByPost = new Map();
    for (const t of tags) {
      if (!tagsByPost.has(t.post_id)) tagsByPost.set(t.post_id, []);
      tagsByPost.get(t.post_id).push({ first_name: t.first_name, last_name: t.last_name });
    }

    // Reactions count
    let reactionsByPost = new Map();
    if (screen.show_reactions) {
      const reactions = await db('post_reactions')
        .whereIn('post_id', postIds)
        .groupBy('post_id')
        .select('post_id', db.raw('count(*) as count'));
      for (const r of reactions) reactionsByPost.set(r.post_id, Number(r.count));
    }

    // Comments (last 3)
    let commentsByPost = new Map();
    if (screen.show_comments) {
      const comments = await db('post_comments')
        .leftJoin('contacts as cc', 'post_comments.contact_id', 'cc.id')
        .whereIn('post_comments.post_id', postIds)
        .orderBy('post_comments.created_at', 'desc')
        .select('post_comments.post_id', 'post_comments.body',
          'cc.first_name as author_first');
      // Group and take last 3 per post
      for (const c of comments) {
        if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
        const list = commentsByPost.get(c.post_id);
        if (list.length < 3) list.push({ body: c.body, author: c.author_first || '' });
      }
    }

    // De-duplicate: a post may match both via contact_id and via
    // post_contacts tag. The query already handles this because the OR
    // clause may return the same post_id once. But a post that is ABOUT
    // contact A and TAGGED with contact B (both in the screen's set)
    // should only appear once. The SQL already handles this naturally
    // since we query posts.id and each row is unique.

    const result = posts.map(p => {
      const aboutContact = p.contact_id ? contactMap.get(p.contact_id) : null;
      const tagged = tagsByPost.get(p.id) || [];
      // Collect all names associated with this post
      const names = [];
      if (aboutContact) names.push(aboutContact.first_name);
      for (const t of tagged) {
        if (!names.includes(t.first_name)) names.push(t.first_name);
      }

      return {
        body: screen.show_body ? p.body : null,
        post_date: screen.show_date ? p.post_date : null,
        contact_names: screen.show_contact_name ? names : null,
        images: mediaByPost.get(p.id) || [],
        reactions: screen.show_reactions ? (reactionsByPost.get(p.id) || 0) : null,
        comments: screen.show_comments ? (commentsByPost.get(p.id) || []) : null,
      };
    });

    // Cache header: private so shared CDN edge nodes don't cache family
    // data. Signage clients poll every N seconds themselves.
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ config: screenConfig(screen), posts: result });
  } catch (err) { next(err); }
});

function screenConfig(screen) {
  return {
    display_mode: screen.display_mode,
    slide_interval: screen.slide_interval,
    show_body: !!screen.show_body,
    show_contact_name: !!screen.show_contact_name,
    show_reactions: !!screen.show_reactions,
    show_comments: !!screen.show_comments,
    show_date: !!screen.show_date,
    max_posts: screen.max_posts,
    feed_layout: screen.feed_layout,
    multi_image: screen.multi_image,
    image_fit: screen.image_fit || 'contain',
  };
}

// GET /api/signage/media/:token?path=posts/uuid/file.webp — serve an image
// file for a signage screen. Uses a query param for the file path because
// Express 5 doesn't support catch-all wildcard params after named params.
import path from 'path';
import { config } from '../config/index.js';
import { createReadStream, existsSync } from 'fs';

router.get('/media/:token', async (req, res, next) => {
  try {
    const token_hash = hashToken(req.params.token);
    const screen = await db('signage_screens')
      .where({ token_hash, is_active: true })
      .first();
    if (!screen) return res.status(404).json({ error: 'Not found' });

    const relPath = req.query.path;
    if (!relPath || typeof relPath !== 'string' || relPath.includes('..')
      || relPath.startsWith('/') || relPath.startsWith('\\')
      || relPath.includes('\0')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const uploadsDir = path.resolve(config.uploads?.dir || '/app/uploads');
    const absPath = path.join(uploadsDir, relPath);
    // Ensure resolved path is strictly inside uploadsDir (trailing sep
    // prevents /app/uploads-secret/ matching /app/uploads).
    if (!absPath.startsWith(uploadsDir + path.sep) || !existsSync(absPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const ext = path.extname(absPath).toLowerCase();
    const mimeTypes = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };
    const mime = mimeTypes[ext] || 'application/octet-stream';

    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=3600');
    createReadStream(absPath).pipe(res);
  } catch (err) { next(err); }
});

export default router;
