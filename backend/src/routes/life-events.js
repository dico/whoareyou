import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// GET /api/life-events/types — list event types
router.get('/types', async (req, res, next) => {
  try {
    const types = await db('life_event_types')
      .where(function () {
        this.whereNull('tenant_id').orWhere('tenant_id', req.tenantId);
      })
      .orderBy('sort_order')
      .select('id', 'name', 'icon', 'color', 'is_system');

    res.json({ types });
  } catch (err) {
    next(err);
  }
});

// GET /api/life-events — list life events (optionally for a contact)
router.get('/', async (req, res, next) => {
  try {
    const { contact_uuid, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 200);

    let query = db('life_events')
      .join('life_event_types', 'life_events.event_type_id', 'life_event_types.id')
      .join('contacts', 'life_events.contact_id', 'contacts.id')
      .where('life_events.tenant_id', req.tenantId);

    if (contact_uuid) {
      const contact = await db('contacts')
        .where({ uuid: contact_uuid, tenant_id: req.tenantId })
        .first();
      if (contact) {
        query = query.where(function () {
          this.where('life_events.contact_id', contact.id)
            .orWhereIn('life_events.id',
              db('life_event_contacts').where('contact_id', contact.id).select('life_event_id')
            );
        });
      }
    }

    const events = await query
      .select(
        'life_events.id', 'life_events.uuid', 'life_events.event_date', 'life_events.description',
        'life_events.remind_annually',
        'life_event_types.name as event_type', 'life_event_types.icon', 'life_event_types.color',
        'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name'
      )
      .orderBy('life_events.event_date', 'desc')
      .limit(limit);

    // Get linked contacts for each event
    const eventIds = events.map(e => e.id);
    let linkedContacts = [];
    if (eventIds.length) {
      linkedContacts = await db('life_event_contacts')
        .join('contacts', 'life_event_contacts.contact_id', 'contacts.id')
        .whereIn('life_event_contacts.life_event_id', eventIds)
        .select(
          'life_event_contacts.life_event_id',
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name'
        );
    }

    const linkedByEvent = {};
    for (const lc of linkedContacts) {
      if (!linkedByEvent[lc.life_event_id]) linkedByEvent[lc.life_event_id] = [];
      linkedByEvent[lc.life_event_id].push({ uuid: lc.uuid, first_name: lc.first_name, last_name: lc.last_name });
    }

    const result = events.map(e => ({
      ...e,
      linked_contacts: linkedByEvent[e.id] || [],
    }));

    res.json({ events: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/life-events — create life event
router.post('/', async (req, res, next) => {
  try {
    const { contact_uuid, event_type_id, event_date, description, linked_contact_uuids, remind_annually } = req.body;
    if (!contact_uuid || !event_type_id || !event_date) {
      throw new AppError('contact_uuid, event_type_id, and event_date are required');
    }

    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    const uuid = uuidv4();

    await db.transaction(async (trx) => {
      const [eventId] = await trx('life_events').insert({
        uuid,
        tenant_id: req.tenantId,
        contact_id: contact.id,
        event_type_id,
        event_date,
        description: description?.trim() || null,
        remind_annually: !!remind_annually,
        created_by: req.user.id,
      });

      // Link additional contacts
      if (linked_contact_uuids?.length) {
        const contacts = await trx('contacts')
          .whereIn('uuid', linked_contact_uuids)
          .where({ tenant_id: req.tenantId })
          .select('id');

        if (contacts.length) {
          await trx('life_event_contacts').insert(
            contacts.map(c => ({ life_event_id: eventId, contact_id: c.id }))
          );
        }
      }
    });

    res.status(201).json({ uuid });
  } catch (err) {
    next(err);
  }
});

// PUT /api/life-events/:uuid — update life event
router.put('/:uuid', async (req, res, next) => {
  try {
    const event = await db('life_events')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!event) throw new AppError('Life event not found', 404);

    await db.transaction(async (trx) => {
      const updates = {};
      if (req.body.event_type_id !== undefined) updates.event_type_id = req.body.event_type_id;
      if (req.body.event_date !== undefined) updates.event_date = req.body.event_date;
      if (req.body.description !== undefined) updates.description = req.body.description?.trim() || null;
      if (req.body.remind_annually !== undefined) updates.remind_annually = !!req.body.remind_annually;

      if (Object.keys(updates).length) {
        await trx('life_events').where({ id: event.id }).update(updates);
      }

      // Update linked contacts if provided
      if (req.body.linked_contact_uuids !== undefined) {
        await trx('life_event_contacts').where({ life_event_id: event.id }).del();
        if (req.body.linked_contact_uuids.length) {
          const contacts = await trx('contacts')
            .whereIn('uuid', req.body.linked_contact_uuids)
            .where({ tenant_id: req.tenantId })
            .select('id');
          if (contacts.length) {
            await trx('life_event_contacts').insert(
              contacts.map(c => ({ life_event_id: event.id, contact_id: c.id }))
            );
          }
        }
      }
    });

    res.json({ message: 'Life event updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/life-events/:uuid
router.delete('/:uuid', async (req, res, next) => {
  try {
    const event = await db('life_events')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!event) throw new AppError('Life event not found', 404);

    await db('life_event_contacts').where({ life_event_id: event.id }).del();
    await db('life_events').where({ id: event.id }).del();
    res.json({ message: 'Life event deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
