import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// GET /api/companies — list all companies
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;

    let query = db('companies')
      .where('companies.tenant_id', req.tenantId);

    if (search) {
      const like = `%${search}%`;
      query = query.where(function () {
        this.where('companies.name', 'like', like)
          .orWhere('companies.industry', 'like', like);
      });
    }

    const companies = await query
      .select(
        'companies.id', 'companies.uuid', 'companies.name', 'companies.industry',
        'companies.website', 'companies.phone', 'companies.email',
        db.raw('(SELECT COUNT(*) FROM contact_companies cc WHERE cc.company_id = companies.id AND cc.end_date IS NULL) as employee_count')
      )
      .orderBy('companies.name');

    res.json({ companies });
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:uuid — company detail with employees
router.get('/:uuid', async (req, res, next) => {
  try {
    const company = await db('companies')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!company) throw new AppError('Company not found', 404);

    const [currentEmployees, previousEmployees] = await Promise.all([
      db('contact_companies')
        .join('contacts', 'contact_companies.contact_id', 'contacts.id')
        .where({ 'contact_companies.company_id': company.id, 'contact_companies.tenant_id': req.tenantId })
        .whereNull('contacts.deleted_at')
        .whereNull('contact_companies.end_date')
        .select(
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
          'contact_companies.id as link_id', 'contact_companies.title', 'contact_companies.start_date',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        .orderBy('contacts.first_name'),

      db('contact_companies')
        .join('contacts', 'contact_companies.contact_id', 'contacts.id')
        .where({ 'contact_companies.company_id': company.id, 'contact_companies.tenant_id': req.tenantId })
        .whereNull('contacts.deleted_at')
        .whereNotNull('contact_companies.end_date')
        .select(
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
          'contact_companies.id as link_id', 'contact_companies.title',
          'contact_companies.start_date', 'contact_companies.end_date',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        .orderBy('contact_companies.end_date', 'desc'),
    ]);

    res.json({
      company: {
        uuid: company.uuid,
        name: company.name,
        industry: company.industry,
        website: company.website,
        phone: company.phone,
        email: company.email,
        notes: company.notes,
      },
      currentEmployees,
      previousEmployees,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/companies — create company
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new AppError('name is required');

    const uuid = uuidv4();
    const [id] = await db('companies').insert({
      uuid,
      tenant_id: req.tenantId,
      name: name.trim(),
      industry: req.body.industry?.trim() || null,
      website: req.body.website?.trim() || null,
      phone: req.body.phone?.trim() || null,
      email: req.body.email?.trim() || null,
      notes: req.body.notes?.trim() || null,
    });

    res.status(201).json({ company: { id, uuid, name: name.trim() } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/companies/:uuid — update company
router.put('/:uuid', async (req, res, next) => {
  try {
    const company = await db('companies')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!company) throw new AppError('Company not found', 404);

    const updates = {};
    for (const field of ['name', 'industry', 'website', 'phone', 'email', 'notes']) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]?.trim() || null;
    }

    if (Object.keys(updates).length) {
      await db('companies').where({ id: company.id }).update(updates);
    }

    res.json({ message: 'Company updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/companies/:uuid
router.delete('/:uuid', async (req, res, next) => {
  try {
    const company = await db('companies')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!company) throw new AppError('Company not found', 404);

    await db('contact_companies').where({ company_id: company.id }).del();
    await db('companies').where({ id: company.id }).del();
    res.json({ message: 'Company deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/companies/:uuid/employees — link contact to company
router.post('/:uuid/employees', async (req, res, next) => {
  try {
    const { contact_uuid, title, start_date } = req.body;
    if (!contact_uuid) throw new AppError('contact_uuid is required');

    const company = await db('companies')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!company) throw new AppError('Company not found', 404);

    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    await db('contact_companies').insert({
      contact_id: contact.id,
      company_id: company.id,
      tenant_id: req.tenantId,
      title: title?.trim() || null,
      start_date: start_date || null,
    });

    res.status(201).json({ message: 'Employee added' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/companies/employees/:linkId — update employment
router.put('/employees/:linkId', async (req, res, next) => {
  try {
    const link = await db('contact_companies')
      .where({ id: req.params.linkId, tenant_id: req.tenantId })
      .first();
    if (!link) throw new AppError('Link not found', 404);

    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title?.trim() || null;
    if (req.body.start_date !== undefined) updates.start_date = req.body.start_date || null;
    if (req.body.end_date !== undefined) updates.end_date = req.body.end_date || null;

    if (Object.keys(updates).length) {
      await db('contact_companies').where({ id: link.id }).update(updates);
    }

    res.json({ message: 'Employment updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/companies/employees/:linkId
router.delete('/employees/:linkId', async (req, res, next) => {
  try {
    const deleted = await db('contact_companies')
      .where({ id: req.params.linkId, tenant_id: req.tenantId })
      .del();
    if (!deleted) throw new AppError('Link not found', 404);
    res.json({ message: 'Employee removed' });
  } catch (err) {
    next(err);
  }
});

export default router;
