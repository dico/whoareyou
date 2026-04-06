import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { processImage } from '../services/image.js';
import { config } from '../config/index.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const coverUpload = multer({
  dest: path.join(config.uploads.dir, 'temp'),
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new AppError('Only JPEG, PNG, WebP and GIF images are allowed', 400));
  },
});

const router = Router();

// Default layout options applied when client omits fields
const DEFAULT_LAYOUT = {
  language: 'nb',
  includeComments: true,
  includeReactions: true,
  chapterGrouping: 'year', // 'year' | 'none'
  pageSize: 'square-200', // square-200 | a4
};

function parseLayout(raw) {
  if (!raw) return { ...DEFAULT_LAYOUT };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...DEFAULT_LAYOUT, ...parsed };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

function parseContactUuids(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

function serializeBook(row) {
  return {
    uuid: row.uuid,
    title: row.title,
    subtitle: row.subtitle,
    contact_uuids: parseContactUuids(row.contact_uuids),
    date_from: row.date_from,
    date_to: row.date_to,
    visibility_filter: row.visibility_filter,
    layout_options: parseLayout(row.layout_options),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Resolve contact UUIDs to internal IDs within the current tenant.
// Returns { ids, contacts } — ids only contains contacts that belong to the tenant.
async function resolveContacts(tenantId, contactUuids) {
  if (!contactUuids.length) return { ids: [], contacts: [] };
  const rows = await db('contacts')
    .where({ tenant_id: tenantId })
    .whereNull('deleted_at')
    .whereIn('uuid', contactUuids)
    .select('id', 'uuid', 'first_name', 'last_name', 'nickname', 'birth_day', 'birth_month', 'birth_year');
  return { ids: rows.map(r => r.id), contacts: rows };
}

// ── GET /api/books — list the current user's books ──
router.get('/', async (req, res, next) => {
  try {
    const rows = await db('book_jobs')
      .where({ tenant_id: req.tenantId, user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(100);
    res.json({ books: rows.map(serializeBook) });
  } catch (err) { next(err); }
});

// ── POST /api/books — create a new book ──
router.post('/', async (req, res, next) => {
  try {
    const { title, subtitle, contact_uuids, date_from, date_to, visibility_filter, layout_options } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new AppError('title is required', 400);
    }
    if (!Array.isArray(contact_uuids) || contact_uuids.length === 0) {
      throw new AppError('contact_uuids must be a non-empty array', 400);
    }

    // Validate tenant ownership of every contact
    const { ids } = await resolveContacts(req.tenantId, contact_uuids);
    if (ids.length !== contact_uuids.length) {
      throw new AppError('One or more contacts not found in this tenant', 404);
    }

    const visibility = visibility_filter === 'shared' ? 'shared' : 'shared_family';
    const layout = parseLayout(layout_options);

    const uuid = uuidv4();
    await db('book_jobs').insert({
      uuid,
      tenant_id: req.tenantId,
      user_id: req.user.id,
      title: title.trim().slice(0, 255),
      subtitle: (subtitle || '').toString().slice(0, 255) || null,
      contact_uuids: JSON.stringify(contact_uuids),
      date_from: date_from || null,
      date_to: date_to || null,
      visibility_filter: visibility,
      layout_options: JSON.stringify(layout),
      status: 'ready',
    });

    const row = await db('book_jobs').where({ uuid, tenant_id: req.tenantId }).first();
    res.status(201).json({ book: serializeBook(row) });
  } catch (err) { next(err); }
});

// ── GET /api/books/:uuid — fetch a book job (metadata only) ──
router.get('/:uuid', async (req, res, next) => {
  try {
    const row = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!row) throw new AppError('Book not found', 404);
    res.json({ book: serializeBook(row) });
  } catch (err) { next(err); }
});

// ── PATCH /api/books/:uuid — update metadata (title, subtitle, layout_options) ──
router.patch('/:uuid', async (req, res, next) => {
  try {
    const row = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!row) throw new AppError('Book not found', 404);

    const updates = {};
    if (typeof req.body.title === 'string' && req.body.title.trim()) {
      updates.title = req.body.title.trim().slice(0, 255);
    }
    if (req.body.subtitle !== undefined) {
      updates.subtitle = req.body.subtitle ? String(req.body.subtitle).slice(0, 255) : null;
    }
    if (req.body.layout_options !== undefined) {
      const merged = { ...parseLayout(row.layout_options), ...(req.body.layout_options || {}) };
      updates.layout_options = JSON.stringify(merged);
    }
    if (Object.keys(updates).length) {
      updates.updated_at = db.fn.now();
      await db('book_jobs').where({ id: row.id }).update(updates);
    }

    const fresh = await db('book_jobs').where({ id: row.id }).first();
    res.json({ book: serializeBook(fresh) });
  } catch (err) { next(err); }
});

// ── DELETE /api/books/:uuid ──
router.delete('/:uuid', async (req, res, next) => {
  try {
    const deleted = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .delete();
    if (!deleted) throw new AppError('Book not found', 404);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /api/books/:uuid/data — full rendered content for the preview ──
//
// Returns the book's posts in chronological order with media, comments, and
// reactions. Visibility is enforced server-side: private posts from other
// users are never included. `shared` filter restricts to shared-only.
router.get('/:uuid/data', async (req, res, next) => {
  try {
    const book = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!book) throw new AppError('Book not found', 404);

    const contactUuids = parseContactUuids(book.contact_uuids);
    const { ids: contactIds, contacts } = await resolveContacts(req.tenantId, contactUuids);
    if (!contactIds.length) {
      return res.json({ book: serializeBook(book), contacts: [], posts: [] });
    }

    // Allowed visibilities: always include shared; include family when filter allows.
    // Never include private posts from other users; include own private posts is
    // intentionally skipped — a photo book should only use shared content.
    const allowedVisibilities = book.visibility_filter === 'shared'
      ? ['shared']
      : ['shared', 'family'];

    // Collect post IDs where the book's contacts are either the subject or tagged.
    const subjectPostIds = await db('posts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .whereIn('contact_id', contactIds)
      .whereIn('visibility', allowedVisibilities)
      .modify((q) => {
        if (book.date_from) q.where('post_date', '>=', book.date_from);
        if (book.date_to) q.where('post_date', '<=', book.date_to);
      })
      .pluck('id');

    const taggedPostIds = await db('post_contacts')
      .join('posts', 'post_contacts.post_id', 'posts.id')
      .where('posts.tenant_id', req.tenantId)
      .whereNull('posts.deleted_at')
      .whereIn('post_contacts.contact_id', contactIds)
      .whereIn('posts.visibility', allowedVisibilities)
      .modify((q) => {
        if (book.date_from) q.where('posts.post_date', '>=', book.date_from);
        if (book.date_to) q.where('posts.post_date', '<=', book.date_to);
      })
      .pluck('posts.id');

    const postIdSet = new Set([...subjectPostIds, ...taggedPostIds]);
    const postIds = [...postIdSet];

    if (!postIds.length) {
      return res.json({ book: serializeBook(book), contacts: contacts.map(stripContact), posts: [] });
    }

    const posts = await db('posts')
      .whereIn('id', postIds)
      .orderBy('post_date', 'asc')
      .orderBy('id', 'asc')
      .select('id', 'uuid', 'body', 'post_date', 'contact_id', 'created_at');

    const media = await db('post_media')
      .whereIn('post_id', postIds)
      .orderBy('id', 'asc')
      .select('post_id', 'file_path', 'thumbnail_path', 'file_type', 'original_name', 'taken_at');

    const layout = parseLayout(book.layout_options);

    let comments = [];
    if (layout.includeComments) {
      comments = await db('post_comments')
        .leftJoin('contacts', 'post_comments.contact_id', 'contacts.id')
        .whereIn('post_comments.post_id', postIds)
        .orderBy('post_comments.created_at', 'asc')
        .select(
          'post_comments.post_id',
          'post_comments.body',
          'post_comments.created_at',
          'contacts.first_name as author_first',
          'contacts.last_name as author_last',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp
            WHERE cp.contact_id = contacts.id AND cp.is_primary = true
            LIMIT 1) as author_avatar`),
        );
    }

    let reactions = [];
    if (layout.includeReactions) {
      reactions = await db('post_reactions')
        .leftJoin('contacts', 'post_reactions.contact_id', 'contacts.id')
        .whereIn('post_reactions.post_id', postIds)
        .select(
          'post_reactions.post_id',
          'post_reactions.emoji',
          'contacts.first_name as author_first',
        );
    }

    const mediaByPost = new Map();
    for (const m of media) {
      if (!mediaByPost.has(m.post_id)) mediaByPost.set(m.post_id, []);
      mediaByPost.get(m.post_id).push({
        file_path: m.file_path,
        thumbnail_path: m.thumbnail_path,
        file_type: m.file_type,
        original_name: m.original_name,
        taken_at: m.taken_at,
      });
    }
    const commentsByPost = new Map();
    for (const c of comments) {
      if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
      commentsByPost.get(c.post_id).push({
        body: c.body,
        created_at: c.created_at,
        author_name: [c.author_first, c.author_last].filter(Boolean).join(' ') || null,
        author_avatar: c.author_avatar || null,
      });
    }
    const reactionsByPost = new Map();
    for (const r of reactions) {
      if (!reactionsByPost.has(r.post_id)) reactionsByPost.set(r.post_id, []);
      reactionsByPost.get(r.post_id).push({ emoji: r.emoji, author_name: r.author_first || null });
    }

    const contactById = new Map(contacts.map(c => [c.id, c]));

    const postsOut = posts.map(p => {
      const c = contactById.get(p.contact_id);
      return {
        uuid: p.uuid,
        body: p.body,
        post_date: p.post_date,
        contact: c ? { uuid: c.uuid, first_name: c.first_name, last_name: c.last_name } : null,
        media: mediaByPost.get(p.id) || [],
        comments: commentsByPost.get(p.id) || [],
        reactions: reactionsByPost.get(p.id) || [],
      };
    });

    res.json({
      book: serializeBook(book),
      contacts: contacts.map(stripContact),
      posts: postsOut,
    });
  } catch (err) { next(err); }
});

function stripContact(c) {
  return {
    uuid: c.uuid,
    first_name: c.first_name,
    last_name: c.last_name,
    nickname: c.nickname,
    birth_day: c.birth_day,
    birth_month: c.birth_month,
    birth_year: c.birth_year,
  };
}

// ── POST /api/books/preview — estimate post + page count ──
//
// Returns the number of matching posts and a rough page estimate without
// creating a book. Used by the create wizard to show "≈ N pages" before
// the user commits.
router.post('/preview', async (req, res, next) => {
  try {
    const { contact_uuids, date_from, date_to, visibility_filter } = req.body || {};
    if (!Array.isArray(contact_uuids) || contact_uuids.length === 0) {
      return res.json({ postCount: 0, estimatedPages: 0 });
    }
    const { ids: contactIds } = await resolveContacts(req.tenantId, contact_uuids);
    if (!contactIds.length) {
      return res.json({ postCount: 0, estimatedPages: 0 });
    }
    const allowedVisibilities = visibility_filter === 'shared'
      ? ['shared'] : ['shared', 'family'];

    const subjectPosts = await db('posts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .whereIn('contact_id', contactIds)
      .whereIn('visibility', allowedVisibilities)
      .modify((q) => {
        if (date_from) q.where('post_date', '>=', date_from);
        if (date_to) q.where('post_date', '<=', date_to);
      })
      .select('id');

    const taggedPosts = await db('post_contacts')
      .join('posts', 'post_contacts.post_id', 'posts.id')
      .where('posts.tenant_id', req.tenantId)
      .whereNull('posts.deleted_at')
      .whereIn('post_contacts.contact_id', contactIds)
      .whereIn('posts.visibility', allowedVisibilities)
      .modify((q) => {
        if (date_from) q.where('posts.post_date', '>=', date_from);
        if (date_to) q.where('posts.post_date', '<=', date_to);
      })
      .select('posts.id');

    const postIdSet = new Set([...subjectPosts.map(p => p.id), ...taggedPosts.map(p => p.id)]);
    const postIds = [...postIdSet];
    const postCount = postIds.length;

    if (!postCount) {
      return res.json({ postCount: 0, estimatedPages: 2 }); // cover + back
    }

    // Score each post to estimate full vs small. Same formula as the
    // frontend autoWeightForPost: full when score >= 8, else small.
    // Score = likes×3 + comments×4 + bodyLen/20 + mediaCount×2.
    const counts = await db('posts')
      .whereIn('id', postIds)
      .select('id', 'body')
      .select(db.raw('(SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = posts.id) as likes'))
      .select(db.raw('(SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = posts.id) as comments'))
      .select(db.raw("(SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = posts.id AND pm.file_type LIKE 'image/%') as media"));

    let fullCount = 0;
    let smallCount = 0;
    for (const p of counts) {
      const bodyLen = (p.body || '').length;
      const score = Number(p.likes) * 3 + Number(p.comments) * 4 + bodyLen / 20 + Number(p.media) * 2;
      if (score >= 8) fullCount += 1;
      else smallCount += 1;
    }

    // Pages = cover + full posts + ceil(small/4 batches) + back. Adds a
    // chapter divider per year as a rough estimate when grouping is on.
    // We don't know the user's grouping choice yet so this is a baseline.
    const batchPages = Math.ceil(smallCount / 4);
    const estimatedPages = 2 + fullCount + batchPages;

    res.json({ postCount, estimatedPages });
  } catch (err) { next(err); }
});

// ── POST /api/books/:uuid/cover — upload custom cover image ──
//
// Stores the cover under /uploads/books/{bookUuid}/cover_*.webp and
// updates layout_options.theme.coverImage to point at the new file.
// Replacing the cover deletes the previous file.
router.post('/:uuid/cover', coverUpload.single('cover'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const book = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!book) throw new AppError('Book not found', 404);

    const timestamp = Date.now();
    const { filePath } = await processImage(
      req.file.path,
      `books/${book.uuid}`,
      `cover_${timestamp}`,
    );

    // Remove previous cover file, if any
    const layout = parseLayout(book.layout_options);
    const prev = layout.theme?.coverImage;
    if (prev && typeof prev === 'string' && prev.startsWith(`/uploads/books/${book.uuid}/`)) {
      try {
        const rel = prev.replace(/^\/uploads\//, '');
        await fs.unlink(path.join(config.uploads.dir, rel));
      } catch {}
    }

    const merged = { ...layout, theme: { ...(layout.theme || {}), coverImage: filePath } };
    await db('book_jobs').where({ id: book.id }).update({
      layout_options: JSON.stringify(merged),
      updated_at: db.fn.now(),
    });

    res.json({ coverImage: filePath });
  } catch (err) { next(err); }
});

// ── DELETE /api/books/:uuid/cover — remove custom cover image ──
router.delete('/:uuid/cover', async (req, res, next) => {
  try {
    const book = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!book) throw new AppError('Book not found', 404);

    const layout = parseLayout(book.layout_options);
    const prev = layout.theme?.coverImage;
    if (prev && typeof prev === 'string' && prev.startsWith(`/uploads/books/${book.uuid}/`)) {
      try {
        const rel = prev.replace(/^\/uploads\//, '');
        await fs.unlink(path.join(config.uploads.dir, rel));
      } catch {}
    }

    const merged = { ...layout, theme: { ...(layout.theme || {}), coverImage: null } };
    await db('book_jobs').where({ id: book.id }).update({
      layout_options: JSON.stringify(merged),
      updated_at: db.fn.now(),
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
