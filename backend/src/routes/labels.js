import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// GET /api/labels — list all labels for tenant (optionally filter by category)
router.get('/', async (req, res, next) => {
  try {
    let query = db('labels').where({ tenant_id: req.tenantId });

    if (req.query.category) {
      query = query.where('category', req.query.category);
    }

    const labels = await query
      .select(
        'labels.id', 'labels.name', 'labels.color', 'labels.category',
        db.raw('(SELECT COUNT(*) FROM contact_labels WHERE contact_labels.label_id = labels.id) as contact_count')
      )
      .orderBy('labels.name');

    res.json({ labels });
  } catch (err) {
    next(err);
  }
});

// POST /api/labels — create label
router.post('/', async (req, res, next) => {
  try {
    const { name, color, category } = req.body;
    if (!name) throw new AppError('name is required');

    // Check unique per tenant
    const existing = await db('labels')
      .where({ tenant_id: req.tenantId, name: name.trim() })
      .first();
    if (existing) throw new AppError('Label already exists', 409);

    const [id] = await db('labels').insert({
      tenant_id: req.tenantId,
      category: category === 'interest' ? 'interest' : 'group',
      name: name.trim(),
      color: color || '#007AFF',
    });

    const label = await db('labels').where({ id }).first();
    res.status(201).json({ label });
  } catch (err) {
    next(err);
  }
});

// PUT /api/labels/:id — update label
router.put('/:id', async (req, res, next) => {
  try {
    const label = await db('labels')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();
    if (!label) throw new AppError('Label not found', 404);

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.color !== undefined) updates.color = req.body.color;

    if (Object.keys(updates).length) {
      await db('labels').where({ id: label.id }).update(updates);
    }

    const updated = await db('labels').where({ id: label.id }).first();
    res.json({ label: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/labels/:id — delete label
router.delete('/:id', async (req, res, next) => {
  try {
    const label = await db('labels')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();
    if (!label) throw new AppError('Label not found', 404);

    // Remove associations first
    await db('contact_labels').where({ label_id: label.id }).del();
    await db('labels').where({ id: label.id }).del();

    res.json({ message: 'Label deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/labels/:id/contacts — list contacts with this label
router.get('/:id/contacts', async (req, res, next) => {
  try {
    const label = await db('labels')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();
    if (!label) throw new AppError('Label not found', 404);

    const contacts = await db('contact_labels')
      .join('contacts', 'contact_labels.contact_id', 'contacts.id')
      .where({ 'contact_labels.label_id': label.id })
      .whereNull('contacts.deleted_at')
      .select(
        'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
      )
      .orderBy('contacts.first_name');

    res.json({ label, contacts });
  } catch (err) {
    next(err);
  }
});

// POST /api/labels/:id/contacts/batch — assign label to multiple contacts
router.post('/:id/contacts/batch', async (req, res, next) => {
  try {
    const { contact_uuids } = req.body;
    if (!contact_uuids?.length) throw new AppError('contact_uuids is required');

    const label = await db('labels')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();
    if (!label) throw new AppError('Label not found', 404);

    const contacts = await db('contacts')
      .whereIn('uuid', contact_uuids)
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .select('id');

    let added = 0;
    for (const contact of contacts) {
      const existing = await db('contact_labels')
        .where({ contact_id: contact.id, label_id: label.id })
        .first();
      if (!existing) {
        await db('contact_labels').insert({ contact_id: contact.id, label_id: label.id });
        added++;
      }
    }

    res.json({ message: `${added} contacts added`, added });
  } catch (err) {
    next(err);
  }
});

// POST /api/labels/:id/contacts/batch-remove — remove label from multiple contacts
router.post('/:id/contacts/batch-remove', async (req, res, next) => {
  try {
    const { contact_uuids } = req.body;
    if (!contact_uuids?.length) throw new AppError('contact_uuids is required');

    const contacts = await db('contacts')
      .whereIn('uuid', contact_uuids)
      .where({ tenant_id: req.tenantId })
      .select('id');

    const contactIds = contacts.map(c => c.id);
    const removed = await db('contact_labels')
      .where({ label_id: req.params.id })
      .whereIn('contact_id', contactIds)
      .del();

    res.json({ message: `${removed} contacts removed`, removed });
  } catch (err) {
    next(err);
  }
});

// POST /api/labels/:id/contacts — assign label to contact
router.post('/:id/contacts', async (req, res, next) => {
  try {
    const { contact_uuid } = req.body;
    if (!contact_uuid) throw new AppError('contact_uuid is required');

    const label = await db('labels')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();
    if (!label) throw new AppError('Label not found', 404);

    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    // Check if already assigned
    const existing = await db('contact_labels')
      .where({ contact_id: contact.id, label_id: label.id })
      .first();
    if (existing) throw new AppError('Label already assigned', 409);

    await db('contact_labels').insert({
      contact_id: contact.id,
      label_id: label.id,
    });

    res.status(201).json({ message: 'Label assigned' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/labels/:id/contacts/:contactUuid — remove label from contact
router.delete('/:id/contacts/:contactUuid', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.contactUuid, tenant_id: req.tenantId })
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    await db('contact_labels')
      .where({ contact_id: contact.id, label_id: req.params.id })
      .del();

    res.json({ message: 'Label removed' });
  } catch (err) {
    next(err);
  }
});

export default router;
