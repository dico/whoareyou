import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

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

export default router;
