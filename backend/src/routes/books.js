import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { processImage } from '../services/image.js';
import { config } from '../config/index.js';
import { filterSensitivePosts } from '../utils/sensitive.js';

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

// Compute the chronologically-ordered list of post UUIDs that match a book's
// filters (contact set + date range + visibility). Used both at creation
// time (to seed the snapshot) and on regenerate.
async function computePostUuids(tenantId, contactIds, dateFrom, dateTo, visibilityFilter) {
  if (!contactIds.length) return [];
  const allowedVisibilities = visibilityFilter === 'shared'
    ? ['shared']
    : ['shared', 'family'];

  const subjectIds = await db('posts')
    .where({ tenant_id: tenantId })
    .whereNull('deleted_at')
    .whereIn('contact_id', contactIds)
    .whereIn('visibility', allowedVisibilities)
    .modify((q) => {
      if (dateFrom) q.where('post_date', '>=', dateFrom);
      if (dateTo) q.where('post_date', '<=', dateTo);
    })
    .pluck('id');

  const taggedIds = await db('post_contacts')
    .join('posts', 'post_contacts.post_id', 'posts.id')
    .where('posts.tenant_id', tenantId)
    .whereNull('posts.deleted_at')
    .whereIn('post_contacts.contact_id', contactIds)
    .whereIn('posts.visibility', allowedVisibilities)
    .modify((q) => {
      if (dateFrom) q.where('posts.post_date', '>=', dateFrom);
      if (dateTo) q.where('posts.post_date', '<=', dateTo);
    })
    .pluck('posts.id');

  const allIds = [...new Set([...subjectIds, ...taggedIds])];
  if (!allIds.length) return [];

  const rows = await db('posts')
    .whereIn('id', allIds)
    .orderBy('post_date', 'asc')
    .orderBy('id', 'asc')
    .select('uuid');
  return rows.map(r => r.uuid);
}

// Normalize a snapshot value from layout_options. Returns null if absent or
// malformed. The snapshot freezes which posts are part of the book so that
// new timeline activity does not silently change a finished book.
function readSnapshot(layout) {
  const snap = layout && layout.snapshot;
  if (!snap || typeof snap !== 'object') return null;
  if (!Array.isArray(snap.postUuids)) return null;
  return {
    generatedAt: snap.generatedAt || null,
    postUuids: snap.postUuids.filter(u => typeof u === 'string'),
  };
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

    // Seed the snapshot at creation time so the book has a frozen post list
    // from the very first preview. Subsequent timeline activity won't show
    // up until the user explicitly regenerates.
    const snapshotUuids = await computePostUuids(
      req.tenantId, ids, date_from || null, date_to || null, visibility,
    );
    layout.snapshot = {
      generatedAt: new Date().toISOString(),
      postUuids: snapshotUuids,
    };

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
// Returns the book's posts ordered by the snapshot (or chronologically if
// no snapshot exists yet — legacy fallback). Visibility is enforced
// server-side: private posts from other users are never included.
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

    const allowedVisibilities = book.visibility_filter === 'shared'
      ? ['shared']
      : ['shared', 'family'];

    // Resolve post UUIDs: prefer the saved snapshot, otherwise compute from
    // current state (legacy books or freshly created without snapshot).
    const layout = parseLayout(book.layout_options);
    const snapshot = readSnapshot(layout);
    let snapshotUuids = snapshot ? snapshot.postUuids : null;
    if (!snapshotUuids) {
      snapshotUuids = await computePostUuids(
        req.tenantId, contactIds, book.date_from, book.date_to, book.visibility_filter,
      );
    }

    if (!snapshotUuids.length) {
      return res.json({ book: serializeBook(book), contacts: contacts.map(stripContact), posts: [] });
    }

    // Resolve UUIDs → ids, applying tenant + visibility filters as a defence
    // in depth (a snapshot uuid that no longer matches the filter is dropped).
    // Also strip sensitive posts when sensitive mode is off — book preview
    // should respect the same hide rules as the timeline.
    const postRows = await db('posts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .whereIn('uuid', snapshotUuids)
      .whereIn('visibility', allowedVisibilities)
      .modify(filterSensitivePosts(req))
      .select('id', 'uuid', 'body', 'post_date', 'contact_id', 'created_at');

    if (!postRows.length) {
      return res.json({ book: serializeBook(book), contacts: contacts.map(stripContact), posts: [] });
    }

    const postIds = postRows.map(p => p.id);

    // Re-order to match snapshot order (snapshot is the source of truth for
    // ordering — survives post_date edits after snapshot was taken).
    const orderIndex = new Map(snapshotUuids.map((u, i) => [u, i]));
    const posts = postRows.slice().sort((a, b) => {
      const ai = orderIndex.has(a.uuid) ? orderIndex.get(a.uuid) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.uuid) ? orderIndex.get(b.uuid) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const media = await db('post_media')
      .whereIn('post_id', postIds)
      .orderBy('id', 'asc')
      .select('post_id', 'file_path', 'thumbnail_path', 'file_type', 'original_name', 'taken_at');

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

// Score formula and threshold — MUST match the frontend (book-preview.js
// scorePost / autoWeightForPost). Default is "small" (shared page); only
// posts with real engagement or substantial body get a full page.
const FULL_PAGE_THRESHOLD = 18;
function scorePostRow(p) {
  const bodyLen = (p.body || '').length;
  return Number(p.likes) * 4 + Number(p.comments) * 6 + bodyLen / 40;
}

// Estimate page count from a set of post IDs. Used by both /preview and
// /regenerate so they always agree.
async function estimatePageCount(postIds) {
  if (!postIds.length) return 2; // cover + back
  const counts = await db('posts')
    .whereIn('id', postIds)
    .select('id', 'body')
    .select(db.raw('(SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = posts.id) as likes'))
    .select(db.raw('(SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = posts.id) as comments'));
  let fullCount = 0;
  let smallCount = 0;
  for (const p of counts) {
    if (scorePostRow(p) >= FULL_PAGE_THRESHOLD) fullCount += 1;
    else smallCount += 1;
  }
  // Adjacent 1-post batches are promoted back to full pages on the
  // frontend, but the average book has long enough small-runs that this
  // approximation (ceil(small/4)) is close enough.
  return 2 + fullCount + Math.ceil(smallCount / 4);
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
    const uuids = await computePostUuids(
      req.tenantId, contactIds, date_from || null, date_to || null, visibility_filter,
    );
    if (!uuids.length) return res.json({ postCount: 0, estimatedPages: 2 });

    const ids = await db('posts').whereIn('uuid', uuids).pluck('id');
    const estimatedPages = await estimatePageCount(ids);
    res.json({ postCount: uuids.length, estimatedPages });
  } catch (err) { next(err); }
});

// ── POST /api/books/:uuid/regenerate — re-snapshot the book ──
//
// Re-runs the post query and replaces the saved snapshot with the fresh
// list. Returns a diff so the frontend can show the user what changed
// (e.g. "3 new posts added, 1 removed"). Per-post overrides are preserved
// as long as the post UUID still exists in the new snapshot.
router.post('/:uuid/regenerate', async (req, res, next) => {
  try {
    const book = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!book) throw new AppError('Book not found', 404);

    const contactUuids = parseContactUuids(book.contact_uuids);
    const { ids: contactIds } = await resolveContacts(req.tenantId, contactUuids);
    const freshUuids = await computePostUuids(
      req.tenantId, contactIds, book.date_from, book.date_to, book.visibility_filter,
    );

    const layout = parseLayout(book.layout_options);
    const prev = readSnapshot(layout);
    const prevSet = new Set(prev ? prev.postUuids : []);
    const freshSet = new Set(freshUuids);

    const added = freshUuids.filter(u => !prevSet.has(u));
    const removed = prev ? prev.postUuids.filter(u => !freshSet.has(u)) : [];

    // Drop overrides that reference posts no longer in the snapshot. This
    // prevents the override blob from growing unbounded over many
    // regenerations and avoids dangling references.
    const overrides = layout.overrides || {};
    const isLive = (uuid) => freshSet.has(uuid);
    if (overrides.postWeight) {
      overrides.postWeight = Object.fromEntries(
        Object.entries(overrides.postWeight).filter(([u]) => isLive(u)),
      );
    }
    if (overrides.templates) {
      overrides.templates = Object.fromEntries(
        Object.entries(overrides.templates).filter(([u]) => isLive(u)),
      );
    }
    if (overrides.customText) {
      overrides.customText = Object.fromEntries(
        Object.entries(overrides.customText).filter(([u]) => isLive(u)),
      );
    }
    if (overrides.hideComments) {
      overrides.hideComments = Object.fromEntries(
        Object.entries(overrides.hideComments).filter(([u]) => isLive(u)),
      );
    }

    const merged = {
      ...layout,
      overrides,
      snapshot: {
        generatedAt: new Date().toISOString(),
        postUuids: freshUuids,
      },
    };

    await db('book_jobs')
      .where({ id: book.id })
      .update({ layout_options: JSON.stringify(merged), updated_at: db.fn.now() });

    res.json({
      added: added.length,
      removed: removed.length,
      total: freshUuids.length,
      generatedAt: merged.snapshot.generatedAt,
    });
  } catch (err) { next(err); }
});

// ── GET /api/books/:uuid/regenerate-preview — what would change? ──
//
// Returns the diff that a regenerate would produce, without committing.
// Used by the frontend to show "3 new posts available" before the user
// decides to regenerate.
router.get('/:uuid/regenerate-preview', async (req, res, next) => {
  try {
    const book = await db('book_jobs')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!book) throw new AppError('Book not found', 404);

    const contactUuids = parseContactUuids(book.contact_uuids);
    const { ids: contactIds } = await resolveContacts(req.tenantId, contactUuids);
    const freshUuids = await computePostUuids(
      req.tenantId, contactIds, book.date_from, book.date_to, book.visibility_filter,
    );

    const layout = parseLayout(book.layout_options);
    const prev = readSnapshot(layout);
    const prevSet = new Set(prev ? prev.postUuids : []);
    const freshSet = new Set(freshUuids);

    const added = freshUuids.filter(u => !prevSet.has(u)).length;
    const removed = prev ? prev.postUuids.filter(u => !freshSet.has(u)).length : 0;

    res.json({
      added,
      removed,
      total: freshUuids.length,
      currentTotal: prev ? prev.postUuids.length : null,
      generatedAt: prev ? prev.generatedAt : null,
    });
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
