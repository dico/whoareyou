import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// GET /api/reminders — list reminders (upcoming, optionally for a contact)
router.get('/', async (req, res, next) => {
  try {
    const { contact_uuid, include_past } = req.query;

    let query = db('reminders')
      .where('reminders.tenant_id', req.tenantId)
      .leftJoin('contacts', 'reminders.contact_id', 'contacts.id');

    if (contact_uuid) {
      const contact = await db('contacts')
        .where({ uuid: contact_uuid, tenant_id: req.tenantId })
        .first();
      if (contact) query = query.where('reminders.contact_id', contact.id);
    }

    if (!include_past) {
      query = query.where(function () {
        this.where('reminders.is_recurring', true)
          .orWhere('reminders.reminder_date', '>=', db.raw('CURDATE()'));
      });
    }

    const reminders = await query
      .select(
        'reminders.id', 'reminders.title', 'reminders.reminder_date',
        'reminders.is_recurring', 'reminders.is_birthday', 'reminders.is_completed',
        'reminders.created_at',
        'contacts.uuid as contact_uuid', 'contacts.first_name as contact_first_name',
        'contacts.last_name as contact_last_name'
      )
      .orderBy('reminders.reminder_date');

    // For recurring reminders, calculate next occurrence
    const today = new Date();
    const result = reminders.map(r => {
      let nextDate = r.reminder_date;
      if (r.is_recurring && r.reminder_date) {
        const d = new Date(r.reminder_date);
        const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        nextDate = next.toISOString().split('T')[0];
      }
      return { ...r, next_date: nextDate };
    }).sort((a, b) => new Date(a.next_date) - new Date(b.next_date));

    res.json({ reminders: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/reminders — create reminder
router.post('/', async (req, res, next) => {
  try {
    const { title, reminder_date, is_recurring, contact_uuid } = req.body;
    if (!title || !reminder_date) {
      throw new AppError('title and reminder_date are required');
    }

    let contactId = null;
    if (contact_uuid) {
      const contact = await db('contacts')
        .where({ uuid: contact_uuid, tenant_id: req.tenantId })
        .whereNull('deleted_at')
        .first();
      if (contact) contactId = contact.id;
    }

    const [id] = await db('reminders').insert({
      tenant_id: req.tenantId,
      contact_id: contactId,
      created_by: req.user.id,
      title: title.trim(),
      reminder_date,
      is_recurring: !!is_recurring,
      is_birthday: false,
    });

    const reminder = await db('reminders').where({ id }).first();
    res.status(201).json({ reminder });
  } catch (err) {
    next(err);
  }
});

// PUT /api/reminders/:id — update reminder
router.put('/:id', async (req, res, next) => {
  try {
    const reminder = await db('reminders')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();
    if (!reminder) throw new AppError('Reminder not found', 404);

    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title.trim();
    if (req.body.reminder_date !== undefined) updates.reminder_date = req.body.reminder_date;
    if (req.body.is_recurring !== undefined) updates.is_recurring = !!req.body.is_recurring;
    if (req.body.is_completed !== undefined) updates.is_completed = !!req.body.is_completed;

    if (Object.keys(updates).length) {
      await db('reminders').where({ id: reminder.id }).update(updates);
    }

    res.json({ message: 'Reminder updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db('reminders')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .del();
    if (!deleted) throw new AppError('Reminder not found', 404);
    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
