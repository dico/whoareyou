import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

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
        const age = contact.birth_year ? today.getFullYear() - contact.birth_year : null;
        for (const user of users) {
          // Check if already notified today
          const existing = await db('notifications')
            .where({
              user_id: user.id,
              tenant_id: req.tenantId,
              type: 'birthday',
            })
            .where('created_at', '>=', todayStr)
            .whereRaw("body LIKE ?", [`%${contact.uuid}%`])
            .first();

          if (!existing) {
            await db('notifications').insert({
              tenant_id: req.tenantId,
              user_id: user.id,
              type: 'birthday',
              title: `${contact.first_name} ${contact.last_name || ''}`.trim(),
              body: `${contact.uuid}`,
              link: `/contacts/${contact.uuid}`,
              is_read: false,
            });
            generated++;
          }
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
          .where({
            user_id: user.id,
            tenant_id: req.tenantId,
            type: 'reminder',
          })
          .where('created_at', '>=', todayStr)
          .whereRaw("title = ?", [reminderTitle])
          .first();

        if (!existing) {
          await db('notifications').insert({
            tenant_id: req.tenantId,
            user_id: user.id,
            type: 'reminder',
            title: reminderTitle,
            body: rem.contact_uuid || '',
            link: rem.contact_uuid ? `/contacts/${rem.contact_uuid}` : '/',
            is_read: false,
          });
          generated++;
        }
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
        'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name'
      );

    for (const ann of anniversaries) {
      const years = today.getFullYear() - new Date(ann.event_date).getFullYear();
      for (const user of users) {
        const existing = await db('notifications')
          .where({ user_id: user.id, tenant_id: req.tenantId, type: 'anniversary' })
          .where('created_at', '>=', todayStr)
          .whereRaw('body LIKE ?', [`%${ann.contact_uuid}%`])
          .first();

        if (!existing) {
          await db('notifications').insert({
            tenant_id: req.tenantId,
            user_id: user.id,
            type: 'anniversary',
            title: `${ann.first_name} ${ann.last_name || ''}`.trim(),
            body: `${ann.contact_uuid}|${ann.event_type}|${years}`,
            link: `/contacts/${ann.contact_uuid}`,
            is_read: false,
          });
          generated++;
        }
      }
    }

    res.json({ message: `Generated ${generated} notifications` });
  } catch (err) {
    next(err);
  }
});

export default router;
