import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { tryCreateNotification, listPrefs, upsertPref, listOverrides, NOTIFICATION_TYPES } from '../utils/notification-prefs.js';
import { filterSensitivePosts } from '../utils/sensitive.js';
import { sendDigestsForTenant } from '../services/notification-email.js';
import { getVapidKeys, sendPushToUser } from '../services/notification-push.js';

const router = Router();

// GET /api/notifications — list notifications for current user
router.get('/', async (req, res, next) => {
  try {
    const { unread_only, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 20, 100);

    let query = db('notifications')
      .where({ user_id: req.user.id, tenant_id: req.tenantId });

    if (unread_only === 'true') {
      query = query.where('is_read', false);
    }

    const notifications = await query
      .select('id', 'type', 'title', 'body', 'link', 'is_read', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(limit);

    // Unread count
    const [{ count }] = await db('notifications')
      .where({ user_id: req.user.id, tenant_id: req.tenantId, is_read: false })
      .count('id as count');

    res.json({ notifications, unread_count: count });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/mark-read — mark notifications as read
router.post('/mark-read', async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (ids?.length) {
      await db('notifications')
        .whereIn('id', ids)
        .where({ user_id: req.user.id })
        .update({ is_read: true, read_at: db.fn.now() });
    } else {
      // Mark all as read
      await db('notifications')
        .where({ user_id: req.user.id, tenant_id: req.tenantId, is_read: false })
        .update({ is_read: true, read_at: db.fn.now() });
    }

    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/generate — generate reminder notifications (called on login or periodically)
router.post('/generate', async (req, res, next) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    // Get all users in tenant
    const users = await db('users')
      .where({ tenant_id: req.tenantId, is_active: true })
      .select('id');

    // 1. Birthday reminders from contacts with birth_day + birth_month
    const contacts = await db('contacts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .whereNotNull('birth_day')
      .whereNotNull('birth_month')
      .select('id', 'uuid', 'first_name', 'last_name', 'birth_day', 'birth_month', 'birth_year');

    let generated = 0;

    for (const contact of contacts) {
      if ((contact.birth_month - 1) === todayMonth && contact.birth_day === todayDay) {
        for (const user of users) {
          const existing = await db('notifications')
            .where({ user_id: user.id, tenant_id: req.tenantId, type: 'birthday' })
            .where('created_at', '>=', todayStr)
            .whereRaw('body LIKE ?', [`%${contact.uuid}%`])
            .first();
          if (existing) continue;
          const id = await tryCreateNotification(user.id, req.tenantId, 'birthday', {
            title: `${contact.first_name} ${contact.last_name || ''}`.trim(),
            body: `${contact.uuid}`,
            link: `/contacts/${contact.uuid}`,
          }, { contactId: contact.id });
          if (id) generated++;
        }
      }
    }

    // 2. Custom reminders due today
    const dueReminders = await db('reminders')
      .where({ 'reminders.tenant_id': req.tenantId, 'reminders.is_completed': false })
      .where(function () {
        this.where(function () {
          // Non-recurring: exact date match
          this.where('is_recurring', false).where('reminder_date', todayStr);
        }).orWhere(function () {
          // Recurring: month+day match
          this.where('is_recurring', true)
            .whereRaw('MONTH(reminder_date) = ?', [todayMonth + 1])
            .whereRaw('DAY(reminder_date) = ?', [todayDay]);
        });
      })
      .leftJoin('contacts', 'reminders.contact_id', 'contacts.id')
      .select('reminders.*', 'contacts.uuid as contact_uuid');

    for (const rem of dueReminders) {
      const reminderTitle = `${rem.title}`;
      for (const user of users) {
        const existing = await db('notifications')
          .where({ user_id: user.id, tenant_id: req.tenantId, type: 'reminder' })
          .where('created_at', '>=', todayStr)
          .whereRaw('title = ?', [reminderTitle])
          .first();
        if (existing) continue;
        const id = await tryCreateNotification(user.id, req.tenantId, 'reminder', {
          title: reminderTitle,
          body: rem.contact_uuid || '',
          link: rem.contact_uuid ? `/contacts/${rem.contact_uuid}` : '/',
        }, { contactId: rem.contact_id || null });
        if (id) generated++;
      }
    }

    // 3. Life event anniversaries (remind_annually = true, month+day match)
    const anniversaries = await db('life_events')
      .join('life_event_types', 'life_events.event_type_id', 'life_event_types.id')
      .join('contacts', 'life_events.contact_id', 'contacts.id')
      .where({ 'life_events.tenant_id': req.tenantId, 'life_events.remind_annually': true })
      .whereRaw('MONTH(life_events.event_date) = ?', [todayMonth + 1])
      .whereRaw('DAY(life_events.event_date) = ?', [todayDay])
      .whereNull('contacts.deleted_at')
      .select(
        'life_events.id', 'life_events.event_date',
        'life_event_types.name as event_type',
        'contacts.id as contact_id', 'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name'
      );

    for (const ann of anniversaries) {
      const years = today.getFullYear() - new Date(ann.event_date).getFullYear();
      for (const user of users) {
        const existing = await db('notifications')
          .where({ user_id: user.id, tenant_id: req.tenantId, type: 'anniversary' })
          .where('created_at', '>=', todayStr)
          .whereRaw('body LIKE ?', [`%${ann.contact_uuid}%`])
          .first();
        if (existing) continue;
        const id = await tryCreateNotification(user.id, req.tenantId, 'anniversary', {
          title: `${ann.first_name} ${ann.last_name || ''}`.trim(),
          body: `${ann.contact_uuid}|${ann.event_type}|${years}`,
          link: `/contacts/${ann.contact_uuid}`,
        }, { contactId: ann.contact_id });
        if (id) generated++;
      }
    }

    // 4. Memory notifications — posts from the same MM-DD in previous years.
    //    One notification per user per day. Picks the post with the most
    //    engagement (reactions+comments) to show the best thumbnail.
    // Exclude sensitive posts and sensitive-contact posts from the memory
    // pick, since the notification thumbnail is shown regardless of the
    // viewer's sensitive-mode state. Safer to show a non-sensitive memory.
    const memoryPosts = await db('posts')
      .where('posts.tenant_id', req.tenantId)
      .whereNull('posts.deleted_at')
      .whereIn('posts.visibility', ['shared', 'family'])
      .where('posts.is_sensitive', false)
      .whereRaw('MONTH(posts.post_date) = ?', [todayMonth + 1])
      .whereRaw('DAY(posts.post_date) = ?', [todayDay])
      .whereRaw('YEAR(posts.post_date) < ?', [today.getFullYear()])
      .whereNotExists(
        db('contacts')
          .whereRaw('contacts.id = posts.contact_id')
          .where('contacts.is_sensitive', true)
      )
      .whereNotExists(
        db('post_contacts')
          .join('contacts', 'post_contacts.contact_id', 'contacts.id')
          .whereRaw('post_contacts.post_id = posts.id')
          .where('contacts.is_sensitive', true)
      )
      .select('posts.id', 'posts.uuid', 'posts.post_date', 'posts.body')
      .orderBy('posts.post_date', 'asc');

    // Only fire a memory notification when at least one post hits a
    // milestone anniversary. Otherwise the user would get pinged every year
    // about the same post, which is noise. The /memories page still shows
    // every post regardless — the filter only gates the notification.
    const MEMORY_MILESTONES = new Set([1, 5, 10, 15, 20, 25, 30, 40, 50]);
    const milestonePosts = memoryPosts.filter(p => {
      const years = today.getFullYear() - new Date(p.post_date).getFullYear();
      return MEMORY_MILESTONES.has(years);
    });

    if (milestonePosts.length) {
      const postIds = milestonePosts.map(p => p.id);
      const media = await db('post_media')
        .whereIn('post_id', postIds)
        .where('file_type', 'like', 'image/%')
        .select('post_id', 'thumbnail_path')
        .orderBy('sort_order');
      const thumbByPost = new Map();
      for (const m of media) if (!thumbByPost.has(m.post_id)) thumbByPost.set(m.post_id, m.thumbnail_path);

      const pickedPost = milestonePosts.find(p => thumbByPost.has(p.id)) || milestonePosts[0];
      const pickedThumb = thumbByPost.get(pickedPost.id) || '';
      const years = today.getFullYear() - new Date(pickedPost.post_date).getFullYear();
      const totalCount = milestonePosts.length;

      for (const user of users) {
        const existing = await db('notifications')
          .where({ user_id: user.id, tenant_id: req.tenantId, type: 'memory' })
          .where('created_at', '>=', todayStr)
          .first();
        if (existing) continue;
        const id = await tryCreateNotification(user.id, req.tenantId, 'memory', {
          title: String(years),
          body: `${totalCount}|${pickedThumb}|${pickedPost.uuid}`,
          link: '/memories',
        });
        if (id) generated++;
      }
    }

    res.json({ message: `Generated ${generated} notifications` });

    // Kick off hourly-throttled email digest for every tenant user (safe to
    // call on every /generate — per-user throttle is enforced inside).
    sendDigestsForTenant(req.tenantId).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ── Preferences & overrides ──

// GET /api/notifications/prefs — list per-type preferences for current user
router.get('/prefs', async (req, res, next) => {
  try {
    const prefs = await listPrefs(req.user.id, req.tenantId);
    const meta = Object.fromEntries(Object.entries(NOTIFICATION_TYPES).map(([t, d]) => [t, d.scopes]));
    res.json({ prefs, meta });
  } catch (err) { next(err); }
});

// PUT /api/notifications/prefs/:type — upsert one preference
router.put('/prefs/:type', async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!NOTIFICATION_TYPES[type]) throw new AppError('Unknown notification type', 400);
    const { scope, deliver_app, deliver_email } = req.body;
    const updated = await upsertPref(req.user.id, req.tenantId, type, { scope, deliver_app, deliver_email });
    res.json({ pref: updated });
  } catch (err) { next(err); }
});

// GET /api/notifications/overrides — list per-contact overrides for current user
router.get('/overrides', async (req, res, next) => {
  try {
    const overrides = await listOverrides(req.user.id, req.tenantId);
    res.json({ overrides });
  } catch (err) { next(err); }
});

// POST /api/notifications/overrides — add or update an override
router.post('/overrides', async (req, res, next) => {
  try {
    const { contact_uuid, type, mode } = req.body;
    if (!NOTIFICATION_TYPES[type]) throw new AppError('Unknown notification type', 400);
    if (!['always', 'never'].includes(mode)) throw new AppError('Invalid mode', 400);
    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at').first();
    if (!contact) throw new AppError('Contact not found', 404);

    const existing = await db('user_notification_overrides')
      .where({ user_id: req.user.id, tenant_id: req.tenantId, contact_id: contact.id, type })
      .first();
    if (existing) {
      await db('user_notification_overrides').where({ id: existing.id }).update({ mode, updated_at: db.fn.now() });
      return res.json({ id: existing.id });
    }
    const [id] = await db('user_notification_overrides').insert({
      user_id: req.user.id, tenant_id: req.tenantId, contact_id: contact.id, type, mode,
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// ── Web Push subscriptions ──

// GET /api/notifications/push/vapid-key — public key for browser to subscribe
router.get('/push/vapid-key', async (req, res, next) => {
  try {
    const { publicKey } = await getVapidKeys();
    res.json({ publicKey });
  } catch (err) { next(err); }
});

// POST /api/notifications/push/subscribe — register a browser subscription
router.post('/push/subscribe', async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new AppError('Invalid subscription payload', 400);
    }
    const ua = (req.headers['user-agent'] || '').slice(0, 255);
    // Upsert on (user_id, endpoint)
    const existing = await db('push_subscriptions')
      .where({ user_id: req.user.id, tenant_id: req.tenantId, endpoint })
      .first();
    if (existing) {
      await db('push_subscriptions').where({ id: existing.id }).update({
        p256dh: keys.p256dh, auth: keys.auth, user_agent: ua, last_used_at: db.fn.now(),
      });
      return res.json({ id: existing.id });
    }
    const [id] = await db('push_subscriptions').insert({
      user_id: req.user.id,
      tenant_id: req.tenantId,
      endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: ua,
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// POST /api/notifications/push/unsubscribe — remove a browser subscription
router.post('/push/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) throw new AppError('Endpoint required', 400);
    await db('push_subscriptions')
      .where({ user_id: req.user.id, tenant_id: req.tenantId, endpoint })
      .del();
    res.json({ message: 'Unsubscribed' });
  } catch (err) { next(err); }
});

// POST /api/notifications/push/test — send a test push to the current user
router.post('/push/test', async (req, res, next) => {
  try {
    const sent = await sendPushToUser(req.user.id, req.tenantId, {
      title: '🔔 WhoareYou',
      body: 'Testvarsel — push fungerer!',
      icon: '/img/icon-192.png',
      url: '/settings/notifications',
      tag: 'test-push',
    });
    res.json({ sent });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/overrides/:id — remove an override
router.delete('/overrides/:id', async (req, res, next) => {
  try {
    const deleted = await db('user_notification_overrides')
      .where({ id: req.params.id, user_id: req.user.id, tenant_id: req.tenantId })
      .del();
    if (!deleted) throw new AppError('Override not found', 404);
    res.json({ message: 'Override removed' });
  } catch (err) { next(err); }
});

export default router;
