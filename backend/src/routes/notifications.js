import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { tryCreateNotification, listPrefs, upsertPref, listOverrides, NOTIFICATION_TYPES } from '../utils/notification-prefs.js';
import { filterSensitivePosts } from '../utils/sensitive.js';
import { sendDigestsForTenant } from '../services/notification-email.js';
import { getVapidKeys, sendPushToUser } from '../services/notification-push.js';
import { generateNotificationsForTenant } from '../services/notification-generate.js';

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

// POST /api/notifications/generate — generate reminder notifications (also runs server-side via cron)
router.post('/generate', async (req, res, next) => {
  try {
    const generated = await generateNotificationsForTenant(req.tenantId);
    res.json({ message: `Generated ${generated} notifications` });
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
