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
        this.whereIn('posts.visibility', ['shared', 'family'])
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
        'posts.visibility', 'posts.portal_guest_id', 'posts.created_by'
      )
      .groupBy('posts.id')
      .orderBy('posts.post_date', 'desc')
      .limit(limit)
      .offset(offset);

    // Collect contact_ids for profile posts
    const profileContactIds = posts.map((p) => p.contact_id).filter(Boolean);

    // Fetch tagged contacts, media, and profile contacts
    const postIds = posts.map((p) => p.id);

    const [taggedContacts, media, profileContacts, commentCounts, reactions, linkPreviews] = postIds.length ? await Promise.all([
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
      db('post_comments')
        .whereIn('post_id', postIds)
        .groupBy('post_id')
        .select('post_id', db.raw('count(*) as count')),
      db('post_reactions')
        .whereIn('post_reactions.post_id', postIds)
        .leftJoin('users', 'post_reactions.user_id', 'users.id')
        .leftJoin('contacts as rc', 'post_reactions.contact_id', 'rc.id')
        .leftJoin('portal_guests', 'post_reactions.portal_guest_id', 'portal_guests.id')
        .select('post_reactions.post_id', 'post_reactions.emoji',
          'post_reactions.user_id', 'post_reactions.contact_id',
          'users.first_name as user_first', 'users.last_name as user_last',
          'users.linked_contact_id as user_linked_contact_id',
          'rc.first_name as contact_first', 'rc.last_name as contact_last',
          'rc.uuid as contact_uuid',
          'portal_guests.display_name as guest_name'),
      db('post_link_previews')
        .whereIn('post_id', postIds)
        .select('post_id', 'url', 'title', 'description', 'image_url', 'site_name'),
    ]) : [[], [], new Map(), [], [], []];

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

    const linkPreviewByPost = {};
    for (const lp of linkPreviews) {
      if (!linkPreviewByPost[lp.post_id]) {
        linkPreviewByPost[lp.post_id] = { url: lp.url, title: lp.title, description: lp.description, image_url: lp.image_url, site_name: lp.site_name };
      }
    }

    // Resolve post authors (portal guests and users)
    const guestIds = [...new Set(posts.map(p => p.portal_guest_id).filter(Boolean))];
    const authorUserIds = [...new Set(posts.map(p => p.created_by).filter(Boolean))];
    const postAuthorMap = new Map(); // key -> { name, contact_uuid, avatar }

    if (guestIds.length) {
      const guests = await db('portal_guests').whereIn('portal_guests.id', guestIds)
        .leftJoin('contacts as gc', 'portal_guests.linked_contact_id', 'gc.id')
        .select('portal_guests.id', 'portal_guests.display_name', 'portal_guests.linked_contact_id',
          'gc.uuid as contact_uuid', 'gc.first_name as contact_first', 'gc.last_name as contact_last');
      const guestContactIds = guests.map(g => g.linked_contact_id).filter(Boolean);
      const guestAvatars = new Map();
      if (guestContactIds.length) {
        const photos = await db('contact_photos').whereIn('contact_id', [...new Set(guestContactIds)]).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
        for (const p of photos) guestAvatars.set(p.contact_id, p.thumbnail_path);
      }
      for (const g of guests) {
        const name = g.contact_first ? `${g.contact_first} ${g.contact_last || ''}`.trim() : g.display_name;
        postAuthorMap.set(`guest_${g.id}`, { name, contact_uuid: g.contact_uuid, avatar: guestAvatars.get(g.linked_contact_id) || null });
      }
    }
    if (authorUserIds.length) {
      const users = await db('users').whereIn('users.id', authorUserIds)
        .leftJoin('contacts as uc', 'users.linked_contact_id', 'uc.id')
        .select('users.id', 'users.first_name', 'users.linked_contact_id',
          'uc.uuid as contact_uuid', 'uc.first_name as contact_first', 'uc.last_name as contact_last');
      const userContactIds = users.map(u => u.linked_contact_id).filter(Boolean);
      const userAvatars = new Map();
      if (userContactIds.length) {
        const photos = await db('contact_photos').whereIn('contact_id', [...new Set(userContactIds)]).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
        for (const p of photos) userAvatars.set(p.contact_id, p.thumbnail_path);
      }
      for (const u of users) {
        const name = u.contact_first ? `${u.contact_first} ${u.contact_last || ''}`.trim() : u.first_name;
        postAuthorMap.set(`user_${u.id}`, { name, contact_uuid: u.contact_uuid, avatar: userAvatars.get(u.linked_contact_id) || null });
      }
    }

    const commentCountByPost = {};
    for (const c of commentCounts) commentCountByPost[c.post_id] = c.count;

    // Get user's linked contact for matching contact-based reactions
    const currentUser = await db('users').where({ id: req.user.id }).select('linked_contact_id').first();
    const userLinkedContactId = currentUser?.linked_contact_id;

    // Resolve linked contacts for users who reacted (UUID + name + avatar)
    const userLinkedIds = reactions.map(r => r.user_linked_contact_id).filter(Boolean);
    const linkedContactMap = new Map();
    if (userLinkedIds.length) {
      const contacts = await db('contacts').whereIn('id', [...new Set(userLinkedIds)]).select('id', 'uuid', 'first_name', 'last_name');
      for (const c of contacts) linkedContactMap.set(c.id, c);
    }

    // Get avatars for all reaction contacts
    const allReactionContactIds = reactions.map(r => r.contact_id || r.user_linked_contact_id).filter(Boolean);
    const reactionAvatarMap = new Map();
    if (allReactionContactIds.length) {
      const photos = await db('contact_photos').whereIn('contact_id', [...new Set(allReactionContactIds)]).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
      for (const p of photos) reactionAvatarMap.set(p.contact_id, p.thumbnail_path);
    }

    const reactionsByPost = {};
    for (const r of reactions) {
      if (!reactionsByPost[r.post_id]) reactionsByPost[r.post_id] = { count: 0, reacted: false, names: [], people: [] };
      reactionsByPost[r.post_id].count++;
      if (r.user_id === req.user.id || (userLinkedContactId && r.contact_id === userLinkedContactId)) {
        reactionsByPost[r.post_id].reacted = true;
      }
      const linked = linkedContactMap.get(r.user_linked_contact_id);
      const firstName = r.contact_first || r.guest_name || linked?.first_name || r.user_first;
      const fullName = r.contact_first
        ? `${r.contact_first} ${r.contact_last || ''}`.trim()
        : linked ? `${linked.first_name} ${linked.last_name || ''}`.trim()
        : r.guest_name || `${r.user_first || ''} ${r.user_last || ''}`.trim();
      const contactUuid = r.contact_uuid || linked?.uuid || null;
      const avatarContactId = r.contact_id || r.user_linked_contact_id;
      const avatar = reactionAvatarMap.get(avatarContactId) || null;
      if (firstName) {
        reactionsByPost[r.post_id].names.push(firstName);
        reactionsByPost[r.post_id].people.push({ name: fullName, contact_uuid: contactUuid, avatar });
      }
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
        link_preview: linkPreviewByPost[p.id] || null,
        comment_count: commentCountByPost[p.id] || 0,
        reaction_count: reactionsByPost[p.id]?.count || 0,
        reaction_names: reactionsByPost[p.id]?.names || [],
        reaction_people: reactionsByPost[p.id]?.people || [],
        reacted: reactionsByPost[p.id]?.reacted || false,
        posted_by: (() => {
          const key = p.portal_guest_id ? `guest_${p.portal_guest_id}` : p.created_by ? `user_${p.created_by}` : null;
          return key ? postAuthorMap.get(key) || null : null;
        })(),
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

// GET /api/posts/gallery — all images for a contact (for photo gallery)
router.get('/gallery', async (req, res, next) => {
  try {
    const { contact } = req.query;
    if (!contact) throw new AppError('Contact UUID required', 400);

    const contactRow = await db('contacts').where({ uuid: contact, tenant_id: req.tenantId }).first();
    if (!contactRow) throw new AppError('Contact not found', 404);

    // Get all post IDs for this contact (about + tagged)
    const postIds = await db('posts')
      .where('posts.tenant_id', req.tenantId)
      .whereNull('posts.deleted_at')
      .where(function () {
        this.where('posts.visibility', 'shared').orWhere('posts.created_by', req.user.id);
      })
      .where(function () {
        this.where('posts.contact_id', contactRow.id)
          .orWhereIn('posts.id', db('post_contacts').where('contact_id', contactRow.id).select('post_id'));
      })
      .select('posts.id');

    // Get all images from those posts
    const media = await db('post_media')
      .whereIn('post_id', postIds.map(p => p.id))
      .where('file_type', 'like', 'image/%')
      .join('posts', 'post_media.post_id', 'posts.id')
      .select(
        'post_media.file_path', 'post_media.thumbnail_path',
        'posts.uuid as post_uuid', 'posts.body as post_body', 'posts.post_date',
      )
      .select(db.raw('(SELECT COUNT(*) FROM post_reactions WHERE post_reactions.post_id = posts.id) as reaction_count'))
      .select(db.raw('(SELECT COUNT(*) FROM post_comments WHERE post_comments.post_id = posts.id) as comment_count'))
      .orderBy('posts.post_date', 'desc')
      .orderBy('post_media.sort_order');

    res.json({ images: media });
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/link-preview — scrape URL metadata
router.get('/link-preview', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) throw new AppError('URL is required', 400);

    // SSRF protection: only allow public http(s) URLs
    let urlObj;
    try { urlObj = new URL(url); } catch { throw new AppError('Invalid URL', 400); }
    if (!['http:', 'https:'].includes(urlObj.protocol)) throw new AppError('Invalid URL scheme', 400);
    const hostname = urlObj.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '169.254.169.254', 'metadata.google.internal'];
    if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')
      || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) {
      throw new AppError('URL not allowed', 400);
    }

    const result = { url, title: '', description: '', image_url: '', site_name: '' };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      clearTimeout(timeout);
      const html = await response.text();

      // Bot-blocked detection
      const blocked = /security checkpoint|access denied|captcha|just a moment|cloudflare|verify you are human/i;
      if (blocked.test(html.slice(0, 2000))) {
        return res.json(result);
      }

      const meta = (prop) =>
        html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1]
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i'))?.[1];
      const metaName = (name) =>
        html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1];

      result.title = (meta('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
      result.description = (meta('og:description') || metaName('description') || '').replace(/\s+/g, ' ').trim();
      result.site_name = (meta('og:site_name') || new URL(url).hostname.replace(/^www\./, '')) || '';
      const ogImage = meta('og:image');
      if (ogImage && !/apple-touch-icon|favicon|logo/i.test(ogImage)) {
        result.image_url = ogImage.startsWith('/') ? new URL(ogImage, url).href : ogImage;
      }
    } catch { /* scrape failed — return empty */ }

    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/posts — create post
router.post('/', async (req, res, next) => {
  try {
    // Body is optional if media will be uploaded after
    if (!req.body.body?.trim() && !req.body.has_media) req.body.body = '';

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
        visibility: ['shared', 'family', 'private'].includes(visibility) ? visibility : 'shared',
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

      // Save link preview if provided
      if (req.body.link_preview?.url) {
        const lp = req.body.link_preview;
        await trx('post_link_previews').insert({
          post_id: postId,
          url: lp.url.slice(0, 2048),
          title: (lp.title || '').slice(0, 500),
          description: (lp.description || '').slice(0, 2000),
          image_url: (lp.image_url || '').slice(0, 2048),
          site_name: (lp.site_name || '').slice(0, 200),
        });
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
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
      })
      .first();

    if (!post) {
      throw new AppError('Post not found', 404);
    }

    await db.transaction(async (trx) => {
      const updates = {};
      if (req.body.body !== undefined) updates.body = req.body.body.trim();
      if (req.body.post_date !== undefined) {
        const d = new Date(req.body.post_date);
        if (isNaN(d.getTime())) throw new AppError('Invalid post_date', 400);
        updates.post_date = d;
      }
      if (req.body.visibility !== undefined) updates.visibility = ['shared', 'family', 'private'].includes(req.body.visibility) ? req.body.visibility : 'shared';

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

      // Update or create link preview
      if (req.body.link_preview !== undefined) {
        await trx('post_link_previews').where({ post_id: post.id }).del();
        if (req.body.link_preview?.url) {
          const lp = req.body.link_preview;
          await trx('post_link_previews').insert({
            post_id: post.id,
            url: lp.url.slice(0, 2048),
            title: (lp.title || '').slice(0, 500),
            description: (lp.description || '').slice(0, 2000),
            image_url: (lp.image_url || '').slice(0, 2048),
            site_name: (lp.site_name || '').slice(0, 200),
          });
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
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
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

  const [contacts, media, linkPreview] = await Promise.all([
    db('post_contacts')
      .join('contacts', 'post_contacts.contact_id', 'contacts.id')
      .where('post_contacts.post_id', postId)
      .select('contacts.uuid', 'contacts.first_name', 'contacts.last_name'),
    db('post_media')
      .where('post_id', postId)
      .select('file_path', 'thumbnail_path', 'file_type', 'original_name', 'file_size')
      .orderBy('sort_order'),
    db('post_link_previews').where({ post_id: postId }).first(),
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
    link_preview: linkPreview ? { url: linkPreview.url, title: linkPreview.title, description: linkPreview.description, image_url: linkPreview.image_url, site_name: linkPreview.site_name } : null,
  };
}

// ── Comments ──

// GET /api/posts/:uuid/comments
router.get('/:uuid/comments', async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    const comments = await db('post_comments')
      .leftJoin('users', 'post_comments.user_id', 'users.id')
      .leftJoin('contacts as cc', 'post_comments.contact_id', 'cc.id')
      .leftJoin('portal_guests', 'post_comments.portal_guest_id', 'portal_guests.id')
      .where({ 'post_comments.post_id': post.id })
      .select(
        'post_comments.id', 'post_comments.body', 'post_comments.created_at',
        'post_comments.user_id', 'post_comments.contact_id', 'post_comments.portal_guest_id',
        'users.uuid as user_uuid', 'users.first_name', 'users.last_name',
        'users.linked_contact_id',
        'cc.first_name as contact_first', 'cc.last_name as contact_last',
        'cc.id as contact_id_resolved', 'cc.uuid as contact_uuid',
        'portal_guests.display_name as guest_name', 'portal_guests.linked_contact_id as guest_linked_contact_id'
      )
      .orderBy('post_comments.created_at', 'asc');

    // Get avatars — from linked contacts (users), direct contacts, or portal guest linked contacts
    const contactIdsForAvatar = comments.map(c => c.contact_id_resolved || c.linked_contact_id || c.guest_linked_contact_id).filter(Boolean);
    const linkedIds = [...new Set(contactIdsForAvatar)];
    const avatarMap = new Map();
    if (linkedIds.length) {
      const photos = await db('contact_photos').whereIn('contact_id', linkedIds).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
      for (const p of photos) avatarMap.set(p.contact_id, p.thumbnail_path);
    }

    // Also get contact info for portal guests and users with linked_contact_id
    const linkedContactIds = comments.map(c => c.guest_linked_contact_id || c.linked_contact_id).filter(Boolean);
    const linkedContactMap = new Map();
    if (linkedContactIds.length) {
      const contacts = await db('contacts').whereIn('id', [...new Set(linkedContactIds)]).select('id', 'uuid', 'first_name', 'last_name');
      for (const c of contacts) linkedContactMap.set(c.id, c);
    }

    res.json({
      comments: comments.map(c => {
        // Prioritize: direct contact > guest/user linked contact > portal guest display name > user
        const linkedContact = linkedContactMap.get(c.guest_linked_contact_id) || linkedContactMap.get(c.linked_contact_id);
        const avatarContactId = c.contact_id_resolved || c.linked_contact_id || c.guest_linked_contact_id;
        const firstName = c.contact_first || linkedContact?.first_name || c.first_name || c.guest_name || '?';
        const contactUuid = c.contact_uuid || linkedContact?.uuid || null;
        return {
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          user: {
            first_name: firstName,
            avatar: avatarMap.get(avatarContactId) || null,
          },
          contact_uuid: contactUuid,
          is_own: c.user_id === req.user.id,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:uuid/comments
router.post('/:uuid/comments', async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    if (!req.body.body?.trim()) throw new AppError('Comment body is required', 400);

    // Resolve contact_id from user's linked contact
    const user = await db('users').where({ id: req.user.id }).first();
    const contactId = user?.linked_contact_id || null;

    const [id] = await db('post_comments').insert({
      post_id: post.id,
      user_id: req.user.id,
      contact_id: contactId,
      tenant_id: req.tenantId,
      body: req.body.body.trim(),
    });

    const comment = await db('post_comments')
      .join('users', 'post_comments.user_id', 'users.id')
      .where('post_comments.id', id)
      .select(
        'post_comments.id', 'post_comments.body', 'post_comments.created_at',
        'users.first_name', 'users.linked_contact_id'
      )
      .first();

    // Resolve contact UUID for linking
    let commentContactUuid = null;
    if (contactId) {
      const c = await db('contacts').where({ id: contactId }).select('uuid').first();
      commentContactUuid = c?.uuid || null;
    } else if (comment.linked_contact_id) {
      const c = await db('contacts').where({ id: comment.linked_contact_id }).select('uuid').first();
      commentContactUuid = c?.uuid || null;
    }

    // Get avatar
    const avatarId = contactId || comment.linked_contact_id;
    let avatar = null;
    if (avatarId) {
      const photo = await db('contact_photos').where({ contact_id: avatarId, is_primary: true }).select('thumbnail_path').first();
      avatar = photo?.thumbnail_path || null;
    }

    res.status(201).json({
      comment: {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        user: { first_name: comment.first_name, avatar },
        contact_uuid: commentContactUuid,
        is_own: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:uuid/comments/:id
router.delete('/:uuid/comments/:commentId', async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    const deleted = await db('post_comments')
      .where({ id: req.params.commentId, post_id: post.id, user_id: req.user.id })
      .del();
    if (!deleted) throw new AppError('Comment not found', 404);

    res.json({ message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
});

// ── Reactions ──

// POST /api/posts/:uuid/reactions — toggle reaction
router.post('/:uuid/reactions', async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    const emoji = req.body.emoji || '❤️';
    const user = await db('users').where({ id: req.user.id }).first();
    const contactId = user?.linked_contact_id || null;

    // Match by user_id OR by contact_id (for MG-imported reactions)
    const existing = await db('post_reactions')
      .where({ post_id: post.id, emoji })
      .where(function () {
        this.where({ user_id: req.user.id });
        if (contactId) this.orWhere({ contact_id: contactId });
      })
      .first();

    if (existing) {
      await db('post_reactions').where({ id: existing.id }).del();
    } else {
      await db('post_reactions').insert({
        post_id: post.id,
        user_id: req.user.id,
        contact_id: contactId,
        tenant_id: req.tenantId,
        emoji,
      });
    }

    // Return updated reaction info
    const allReactions = await db('post_reactions')
      .where({ post_id: post.id })
      .leftJoin('users', 'post_reactions.user_id', 'users.id')
      .leftJoin('contacts as rc', 'post_reactions.contact_id', 'rc.id')
      .leftJoin('portal_guests', 'post_reactions.portal_guest_id', 'portal_guests.id')
      .select('rc.first_name as contact_first', 'rc.last_name as contact_last',
        'rc.uuid as contact_uuid', 'post_reactions.contact_id',
        'users.first_name as user_first', 'users.last_name as user_last',
        'users.linked_contact_id as user_linked_contact_id',
        'portal_guests.display_name as guest_name');
    // Resolve linked contacts for users
    const toggleLinkedIds = allReactions.map(r => r.user_linked_contact_id).filter(Boolean);
    const toggleLinkedMap = new Map();
    if (toggleLinkedIds.length) {
      const lc = await db('contacts').whereIn('id', [...new Set(toggleLinkedIds)]).select('id', 'uuid', 'first_name', 'last_name');
      for (const c of lc) toggleLinkedMap.set(c.id, c);
    }
    // Get avatars
    const toggleAvatarIds = allReactions.map(r => r.contact_id || r.user_linked_contact_id).filter(Boolean);
    const toggleAvatarMap = new Map();
    if (toggleAvatarIds.length) {
      const photos = await db('contact_photos').whereIn('contact_id', [...new Set(toggleAvatarIds)]).where({ is_primary: true }).select('contact_id', 'thumbnail_path');
      for (const p of photos) toggleAvatarMap.set(p.contact_id, p.thumbnail_path);
    }
    const names = [];
    const people = [];
    for (const r of allReactions) {
      const linked = toggleLinkedMap.get(r.user_linked_contact_id);
      const firstName = r.contact_first || r.guest_name || linked?.first_name || r.user_first;
      const fullName = r.contact_first
        ? `${r.contact_first} ${r.contact_last || ''}`.trim()
        : linked ? `${linked.first_name} ${linked.last_name || ''}`.trim()
        : r.guest_name || `${r.user_first || ''} ${r.user_last || ''}`.trim();
      const cuuid = r.contact_uuid || linked?.uuid || null;
      const avatarId = r.contact_id || r.user_linked_contact_id;
      const avatar = toggleAvatarMap.get(avatarId) || null;
      if (firstName) {
        names.push(firstName);
        people.push({ name: fullName, contact_uuid: cuuid, avatar });
      }
    }
    res.json({
      action: existing ? 'removed' : 'added',
      emoji,
      reaction_count: allReactions.length,
      reaction_names: names,
      reaction_people: people,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
