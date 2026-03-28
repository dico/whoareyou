import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { validateRequired } from '../utils/validation.js';

const router = Router();

// GET /api/posts — global timeline
router.get('/', async (req, res, next) => {
  try {
    const { contact, page, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 20, 100);
    const offset = ((parseInt(page) || 1) - 1) * limit;

    let query = db('posts')
      .where('posts.tenant_id', req.tenantId)
      .whereNull('posts.deleted_at')
      .where(function () {
        this.where('posts.visibility', 'shared')
          .orWhere('posts.created_by', req.user.id);
      });

    // Filter by tagged contact OR profile post for contact
    if (contact) {
      const contactRow = await db('contacts').where({ uuid: contact, tenant_id: req.tenantId }).first();
      if (contactRow) {
        query = query.where(function () {
          this.where('posts.contact_id', contactRow.id)
            .orWhereIn('posts.id',
              db('post_contacts').where('contact_id', contactRow.id).select('post_id')
            );
        });
      }
    }

    const [{ count }] = await query.clone().countDistinct('posts.id as count');

    const posts = await query.clone()
      .select(
        'posts.id', 'posts.uuid', 'posts.body', 'posts.post_date',
        'posts.contact_id', 'posts.created_at', 'posts.updated_at',
        'posts.visibility'
      )
      .groupBy('posts.id')
      .orderBy('posts.post_date', 'desc')
      .limit(limit)
      .offset(offset);

    // Collect contact_ids for profile posts
    const profileContactIds = posts.map((p) => p.contact_id).filter(Boolean);

    // Fetch tagged contacts, media, and profile contacts
    const postIds = posts.map((p) => p.id);

    const [taggedContacts, media, profileContacts] = postIds.length ? await Promise.all([
      db('post_contacts')
        .join('contacts', 'post_contacts.contact_id', 'contacts.id')
        .whereIn('post_contacts.post_id', postIds)
        .select(
          'post_contacts.post_id',
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name'
        )
        .select(db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)),
      db('post_media')
        .whereIn('post_id', postIds)
        .select('post_id', 'file_path', 'thumbnail_path', 'file_type', 'original_name', 'file_size')
        .orderBy('sort_order'),
      profileContactIds.length
        ? db('contacts')
            .whereIn('contacts.id', profileContactIds)
            .select(
              'contacts.id', 'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
              db.raw(`(
                SELECT cp.thumbnail_path FROM contact_photos cp
                WHERE cp.contact_id = contacts.id AND cp.is_primary = true
                LIMIT 1
              ) as avatar`)
            )
            .then((rows) => {
              const map = new Map();
              for (const r of rows) map.set(r.id, r);
              return map;
            })
        : Promise.resolve(new Map()),
    ]) : [[], [], new Map()];

    // Group by post
    const contactsByPost = {};
    for (const tc of taggedContacts) {
      if (!contactsByPost[tc.post_id]) contactsByPost[tc.post_id] = [];
      contactsByPost[tc.post_id].push({
        uuid: tc.uuid,
        first_name: tc.first_name,
        last_name: tc.last_name,
        avatar: tc.avatar || null,
      });
    }

    const mediaByPost = {};
    for (const m of media) {
      if (!mediaByPost[m.post_id]) mediaByPost[m.post_id] = [];
      mediaByPost[m.post_id].push({
        file_path: m.file_path,
        thumbnail_path: m.thumbnail_path,
        file_type: m.file_type,
        original_name: m.original_name,
        file_size: m.file_size,
      });
    }

    const result = posts.map((p) => {
      const profileContact = p.contact_id ? profileContacts.get(p.contact_id) : null;
      return {
        uuid: p.uuid,
        body: p.body,
        post_date: p.post_date,
        visibility: p.visibility,
        created_at: p.created_at,
        // Profile post: about this contact
        about: profileContact ? {
          uuid: profileContact.uuid,
          first_name: profileContact.first_name,
          last_name: profileContact.last_name,
          avatar: profileContact.avatar || null,
        } : null,
        // Tagged contacts (for activity posts)
        contacts: contactsByPost[p.id] || [],
        media: mediaByPost[p.id] || [],
      };
    });

    // Fetch life events for this contact (if filtering by contact)
    let lifeEvents = [];
    const contactForEvents = contact ? await db('contacts').where({ uuid: contact, tenant_id: req.tenantId }).first() : null;
    if (contactForEvents) {
      const events = await db('life_events')
        .join('life_event_types', 'life_events.event_type_id', 'life_event_types.id')
        .join('contacts', 'life_events.contact_id', 'contacts.id')
        .where('life_events.tenant_id', req.tenantId)
        .where(function () {
          this.where('life_events.contact_id', contactForEvents.id)
            .orWhereIn('life_events.id',
              db('life_event_contacts').where('contact_id', contactForEvents.id).select('life_event_id')
            );
        })
        .select(
          'life_events.uuid', 'life_events.event_date', 'life_events.description',
          'life_event_types.name as event_type', 'life_event_types.icon', 'life_event_types.color',
          'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name'
        )
        .orderBy('life_events.event_date', 'desc');

      // Fetch linked contacts for life events
      const eventRows = await db('life_events')
        .whereIn('uuid', events.map(e => e.uuid))
        .select('id', 'uuid');
      const uuidToId = new Map(eventRows.map(r => [r.uuid, r.id]));
      const idToUuid = new Map(eventRows.map(r => [r.id, r.uuid]));

      const linkedByUuid = {};
      const allIds = [...uuidToId.values()];
      if (allIds.length) {
        const linked = await db('life_event_contacts')
          .join('contacts', 'life_event_contacts.contact_id', 'contacts.id')
          .whereIn('life_event_contacts.life_event_id', allIds)
          .select(
            'life_event_contacts.life_event_id',
            'contacts.uuid', 'contacts.first_name', 'contacts.last_name'
          )
          .select(db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`));

        for (const lc of linked) {
          const eventUuid = idToUuid.get(lc.life_event_id);
          if (!linkedByUuid[eventUuid]) linkedByUuid[eventUuid] = [];
          linkedByUuid[eventUuid].push({
            uuid: lc.uuid, first_name: lc.first_name, last_name: lc.last_name, avatar: lc.avatar || null,
          });
        }
      }

      lifeEvents = events.map(e => ({
        type: 'life_event',
        uuid: e.uuid,
        event_type: e.event_type,
        icon: e.icon,
        color: e.color,
        post_date: e.event_date,
        description: e.description,
        contact_uuid: e.contact_uuid,
        first_name: e.first_name,
        last_name: e.last_name,
        linked_contacts: linkedByUuid[e.uuid] || [],
      }));
    }

    // Merge posts and life events, sorted by date
    const merged = [...result.map(p => ({ ...p, type: 'post' })), ...lifeEvents]
      .sort((a, b) => new Date(b.post_date) - new Date(a.post_date));

    res.json({
      posts: merged,
      pagination: {
        total: count,
        page: Math.floor(offset / limit) + 1,
        limit,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts — create post
router.post('/', async (req, res, next) => {
  try {
    validateRequired(['body'], req.body);

    const uuid = uuidv4();
    const { body, post_date, contact_uuids, about_contact_uuid, visibility } = req.body;

    // Resolve "about" contact (profile post)
    let aboutContactId = null;
    if (about_contact_uuid) {
      const aboutContact = await db('contacts')
        .where({ uuid: about_contact_uuid, tenant_id: req.tenantId })
        .whereNull('deleted_at')
        .first();
      if (aboutContact) aboutContactId = aboutContact.id;
    }

    const post = await db.transaction(async (trx) => {
      const [postId] = await trx('posts').insert({
        uuid,
        tenant_id: req.tenantId,
        created_by: req.user.id,
        body: body.trim(),
        post_date: post_date || new Date(),
        contact_id: aboutContactId,
        visibility: visibility === 'private' ? 'private' : 'shared',
      });

      // Tag contacts (for activity posts, or additional tags on profile posts)
      if (contact_uuids?.length) {
        const contacts = await trx('contacts')
          .whereIn('uuid', contact_uuids)
          .where({ tenant_id: req.tenantId })
          .whereNull('deleted_at')
          .select('id');

        if (contacts.length) {
          await trx('post_contacts').insert(
            contacts.map((c) => ({ post_id: postId, contact_id: c.id }))
          );

          // Update last_contacted_at for tagged contacts
          await trx('contacts')
            .whereIn('id', contacts.map((c) => c.id))
            .update({ last_contacted_at: trx.fn.now() });
        }
      }

      return { id: postId, uuid };
    });

    const created = await getPostWithDetails(post.id, req.tenantId);
    res.status(201).json({ post: created });
  } catch (err) {
    next(err);
  }
});

// PUT /api/posts/:uuid — update post
router.put('/:uuid', async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.where('visibility', 'shared').orWhere('created_by', req.user.id);
      })
      .first();

    if (!post) {
      throw new AppError('Post not found', 404);
    }

    await db.transaction(async (trx) => {
      const updates = {};
      if (req.body.body !== undefined) updates.body = req.body.body.trim();
      if (req.body.post_date !== undefined) updates.post_date = req.body.post_date;
      if (req.body.visibility !== undefined) updates.visibility = req.body.visibility === 'private' ? 'private' : 'shared';

      // Change "about" contact (profile post)
      if (req.body.about_contact_uuid !== undefined) {
        if (req.body.about_contact_uuid === null) {
          updates.contact_id = null;
        } else {
          const aboutContact = await trx('contacts')
            .where({ uuid: req.body.about_contact_uuid, tenant_id: req.tenantId })
            .whereNull('deleted_at')
            .first();
          if (aboutContact) updates.contact_id = aboutContact.id;
        }
      }

      if (Object.keys(updates).length) {
        await trx('posts').where({ id: post.id }).update(updates);
      }

      // Update tagged contacts
      if (req.body.contact_uuids !== undefined) {
        await trx('post_contacts').where({ post_id: post.id }).del();

        if (req.body.contact_uuids.length) {
          const contacts = await trx('contacts')
            .whereIn('uuid', req.body.contact_uuids)
            .where({ tenant_id: req.tenantId })
            .whereNull('deleted_at')
            .select('id');

          if (contacts.length) {
            await trx('post_contacts').insert(
              contacts.map((c) => ({ post_id: post.id, contact_id: c.id }))
            );
          }
        }
      }
    });

    const updated = await getPostWithDetails(post.id, req.tenantId);
    res.json({ post: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:uuid — soft delete
router.delete('/:uuid', async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.where('visibility', 'shared').orWhere('created_by', req.user.id);
      })
      .first();

    if (!post) {
      throw new AppError('Post not found', 404);
    }

    await db('posts').where({ id: post.id }).update({ deleted_at: db.fn.now() });
    res.json({ message: 'Post deleted' });
  } catch (err) {
    next(err);
  }
});

// Helper: fetch a single post with contacts and media
async function getPostWithDetails(postId, tenantId) {
  const post = await db('posts').where({ id: postId, tenant_id: tenantId }).first();

  const [contacts, media] = await Promise.all([
    db('post_contacts')
      .join('contacts', 'post_contacts.contact_id', 'contacts.id')
      .where('post_contacts.post_id', postId)
      .select('contacts.uuid', 'contacts.first_name', 'contacts.last_name'),
    db('post_media')
      .where('post_id', postId)
      .select('file_path', 'thumbnail_path', 'file_type', 'original_name', 'file_size')
      .orderBy('sort_order'),
  ]);

  // Get "about" contact
  let about = null;
  if (post.contact_id) {
    about = await db('contacts')
      .where({ id: post.contact_id, tenant_id: tenantId })
      .select('uuid', 'first_name', 'last_name')
      .first();
  }

  return {
    uuid: post.uuid,
    body: post.body,
    post_date: post.post_date,
    visibility: post.visibility,
    created_at: post.created_at,
    about,
    contacts,
    media,
  };
}

export default router;
