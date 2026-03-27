import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// GET /api/relationships/types — list available relationship types
router.get('/types', async (req, res, next) => {
  try {
    const types = await db('relationship_types')
      .where(function () {
        this.whereNull('tenant_id').orWhere('tenant_id', req.tenantId);
      })
      .select('id', 'name', 'inverse_name', 'category')
      .orderBy('category')
      .orderBy('name');

    res.json({ types });
  } catch (err) {
    next(err);
  }
});

// POST /api/relationships — create relationship between two contacts
router.post('/', async (req, res, next) => {
  try {
    const { contact_uuid, related_contact_uuid, relationship_type_id, notes, start_date, end_date } = req.body;

    if (!contact_uuid || !related_contact_uuid || !relationship_type_id) {
      throw new AppError('contact_uuid, related_contact_uuid, and relationship_type_id are required');
    }

    const [contact, related] = await Promise.all([
      db('contacts').where({ uuid: contact_uuid, tenant_id: req.tenantId }).whereNull('deleted_at').first(),
      db('contacts').where({ uuid: related_contact_uuid, tenant_id: req.tenantId }).whereNull('deleted_at').first(),
    ]);

    if (!contact || !related) throw new AppError('Contact not found', 404);
    if (contact.id === related.id) throw new AppError('Cannot create relationship with self');

    // Check type exists
    const type = await db('relationship_types').where({ id: relationship_type_id }).first();
    if (!type) throw new AppError('Invalid relationship type', 400);

    // Check for existing relationship
    const existing = await db('relationships')
      .where({ tenant_id: req.tenantId, contact_id: contact.id, related_contact_id: related.id })
      .first();
    if (existing) throw new AppError('Relationship already exists', 409);

    await db('relationships').insert({
      tenant_id: req.tenantId,
      contact_id: contact.id,
      related_contact_id: related.id,
      relationship_type_id,
      notes: notes || null,
      start_date: start_date || null,
      end_date: end_date || null,
    });

    res.status(201).json({ message: 'Relationship created' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/relationships/:id — update relationship
router.put('/:id', async (req, res, next) => {
  try {
    const rel = await db('relationships')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();

    if (!rel) throw new AppError('Relationship not found', 404);

    const updates = {};
    if (req.body.relationship_type_id !== undefined) updates.relationship_type_id = req.body.relationship_type_id;
    if (req.body.notes !== undefined) updates.notes = req.body.notes || null;
    if (req.body.start_date !== undefined) updates.start_date = req.body.start_date || null;
    if (req.body.end_date !== undefined) updates.end_date = req.body.end_date || null;

    if (Object.keys(updates).length) {
      await db('relationships').where({ id: rel.id }).update(updates);
    }

    res.json({ message: 'Relationship updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/relationships/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const rel = await db('relationships')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();

    if (!rel) throw new AppError('Relationship not found', 404);

    await db('relationships').where({ id: rel.id }).del();
    res.json({ message: 'Relationship deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
