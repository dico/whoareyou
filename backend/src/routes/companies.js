import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import { db } from '../db.js';
import { loadGroupTree, descendantIds, ancestorPath, wouldCreateCycle } from '../utils/group-tree.js';
import { AppError } from '../utils/errors.js';
import { processImage } from '../services/image.js';
import { config } from '../config/index.js';
import { filterVisibleContacts } from '../utils/visibility.js';
import { filterSensitiveContacts } from '../utils/sensitive.js';

const router = Router();

const logoUpload = multer({
  dest: path.join(config.uploads?.dir || path.join(process.cwd(), '..', 'uploads'), 'temp'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.mimetype)) cb(null, true);
    else cb(new AppError('Only images are allowed', 400));
  },
});

// GET /api/companies/brreg/:orgNumber — lookup in Brønnøysundregistrene
router.get('/brreg/:orgNumber', async (req, res, next) => {
  try {
    const orgNr = req.params.orgNumber.replace(/\s/g, '');
    if (!/^\d{9}$/.test(orgNr)) throw new AppError('Invalid org number (must be 9 digits)', 400);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgNr}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) throw new AppError('Organization not found', 404);
      throw new AppError('Brreg lookup failed', 502);
    }

    const data = await response.json();
    const addr = data.forretningsadresse || data.postadresse || {};
    const address = [addr.adresse?.[0], `${addr.postnummer || ''} ${addr.poststed || ''}`.trim(), addr.kommune]
      .filter(Boolean).join(', ');

    res.json({
      name: data.navn,
      org_number: data.organisasjonsnummer?.toString(),
      industry: data.naeringskode1?.beskrivelse || null,
      address,
      website: data.hjemmeside || null,
      employees: data.antallAnsatte || null,
      founded: data.stiftelsesdato || null,
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Brreg lookup failed', 502));
  }
});

const VALID_TYPES = ['company', 'school', 'club', 'team', 'association', 'class', 'other'];

// GET /api/companies — list all companies/groups
router.get('/', async (req, res, next) => {
  try {
    const { search, type, top_level } = req.query;

    let query = db('companies')
      .where('companies.tenant_id', req.tenantId);

    // Browsing (no search/type filter) shows only top-level groups; subgroups
    // are reached by drilling down. Search always covers every level.
    if (top_level === '1') query = query.whereNull('companies.parent_id');

    if (search) {
      const like = `%${search}%`;
      query = query.where(function () {
        this.where('companies.name', 'like', like)
          .orWhere('companies.industry', 'like', like);
      });
    }

    if (type && VALID_TYPES.includes(type)) {
      query = query.where('companies.type', type);
    }

    const companies = await query
      .select(
        'companies.id', 'companies.uuid', 'companies.name', 'companies.industry',
        'companies.website', 'companies.phone', 'companies.email', 'companies.logo_path',
        'companies.type', 'companies.description', 'companies.parent_id',
        'companies.latitude', 'companies.longitude',
        db.raw('(SELECT COUNT(*) FROM contact_companies cc WHERE cc.company_id = companies.id AND cc.end_date IS NULL) as employee_count'),
        db.raw('(SELECT p.name FROM companies p WHERE p.id = companies.parent_id) as parent_name'),
        db.raw('(SELECT p.uuid FROM companies p WHERE p.id = companies.parent_id) as parent_uuid')
      )
      .orderBy('companies.name');

    // Hierarchy info: subgroup count, members incl. subgroups, and the path
    // ("Åsly skole › 9. trinn") so search hits show where they belong.
    const tree = await loadGroupTree(req.tenantId);
    const links = await db('contact_companies')
      .where({ tenant_id: req.tenantId }).whereNull('end_date')
      .select('company_id', 'contact_id');
    const contactsByGroup = new Map();
    for (const l of links) {
      if (!contactsByGroup.has(l.company_id)) contactsByGroup.set(l.company_id, new Set());
      contactsByGroup.get(l.company_id).add(l.contact_id);
    }
    for (const c of companies) {
      c.subgroup_count = (tree.childrenOf.get(c.id) || []).length;
      if (c.subgroup_count) {
        const all = new Set();
        for (const id of descendantIds(tree, c.id)) for (const cid of contactsByGroup.get(id) || []) all.add(cid);
        c.total_member_count = all.size;
      } else {
        c.total_member_count = Number(c.employee_count) || 0;
      }
      c.path = ancestorPath(tree, c.id).map(a => a.name);
    }

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

    // Members are returned for the group and all its subgroups, each row
    // tagged with the group it belongs to; the page toggles between "all"
    // and "direct only" without another request.
    const tree = await loadGroupTree(req.tenantId);
    const subtreeIds = descendantIds(tree, company.id);

    const [currentEmployees, previousEmployees] = await Promise.all([
      db('contact_companies')
        .join('contacts', 'contact_companies.contact_id', 'contacts.id')
        .join('companies as grp', 'contact_companies.company_id', 'grp.id')
        .whereIn('contact_companies.company_id', subtreeIds)
        .where('contact_companies.tenant_id', req.tenantId)
        .whereNull('contacts.deleted_at')
        .modify(filterVisibleContacts(req))
        .modify(filterSensitiveContacts(req))
        .whereNull('contact_companies.end_date')
        .select(
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name', 'contacts.birth_year',
          'contacts.birth_month', 'contacts.birth_day', 'contacts.deceased_date',
          'grp.uuid as group_uuid', 'grp.name as group_name',
          'contact_companies.id as link_id', 'contact_companies.title', 'contact_companies.start_date',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        .orderBy('contacts.first_name'),

      db('contact_companies')
        .join('contacts', 'contact_companies.contact_id', 'contacts.id')
        .join('companies as grp', 'contact_companies.company_id', 'grp.id')
        .whereIn('contact_companies.company_id', subtreeIds)
        .where('contact_companies.tenant_id', req.tenantId)
        .whereNull('contacts.deleted_at')
        .modify(filterVisibleContacts(req))
        .modify(filterSensitiveContacts(req))
        .whereNotNull('contact_companies.end_date')
        .select(
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name', 'contacts.birth_year',
          'contacts.birth_month', 'contacts.birth_day', 'contacts.deceased_date',
          'grp.uuid as group_uuid', 'grp.name as group_name',
          'contact_companies.id as link_id', 'contact_companies.title',
          'contact_companies.start_date', 'contact_companies.end_date',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        .orderBy('contact_companies.end_date', 'desc'),
    ]);

    // Breadcrumb (root → direct parent)
    const ancestors = ancestorPath(tree, company.id);
    const parent = ancestors[ancestors.length - 1] || null;

    // Direct subgroups with member counts incl. their own subgroups
    const children = await db('companies')
      .where({ parent_id: company.id, tenant_id: req.tenantId })
      .select('id', 'uuid', 'name', 'type', 'logo_path')
      .orderBy('name');
    if (children.length) {
      const links = await db('contact_companies')
        .whereIn('company_id', subtreeIds).whereNull('end_date')
        .select('company_id', 'contact_id');
      for (const child of children) {
        const ids = new Set(descendantIds(tree, child.id));
        child.member_count = new Set(links.filter(l => ids.has(l.company_id)).map(l => l.contact_id)).size;
        child.subgroup_count = (tree.childrenOf.get(child.id) || []).length;
        delete child.id;
      }
    }

    // Fetch photos
    const photos = await db('company_photos')
      .where({ company_id: company.id, tenant_id: req.tenantId })
      .select('id', 'file_path', 'thumbnail_path', 'is_primary', 'caption', 'taken_at', 'sort_order')
      .orderBy('sort_order')
      .orderBy('created_at', 'desc');

    res.json({
      company: {
        uuid: company.uuid,
        name: company.name,
        type: company.type,
        description: company.description,
        industry: company.industry,
        website: company.website,
        phone: company.phone,
        email: company.email,
        notes: company.notes,
        org_number: company.org_number,
        logo_path: company.logo_path,
        address: company.address,
        latitude: company.latitude,
        longitude: company.longitude,
        parent,
        ancestors,
        children,
      },
      photos,
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

    const type = req.body.type && VALID_TYPES.includes(req.body.type) ? req.body.type : 'company';

    // Resolve parent_uuid to parent_id
    let parent_id = null;
    if (req.body.parent_uuid) {
      const parent = await db('companies').where({ uuid: req.body.parent_uuid, tenant_id: req.tenantId }).first();
      if (!parent) throw new AppError('Parent group not found', 404);
      parent_id = parent.id;
    }

    const uuid = uuidv4();
    const [id] = await db('companies').insert({
      uuid,
      tenant_id: req.tenantId,
      name: name.trim(),
      type,
      description: req.body.description?.trim() || null,
      parent_id,
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
    for (const field of ['name', 'industry', 'website', 'phone', 'email', 'notes', 'org_number', 'address', 'description']) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]?.trim() || null;
    }
    if (req.body.type !== undefined && VALID_TYPES.includes(req.body.type)) {
      updates.type = req.body.type;
    }
    if (req.body.latitude !== undefined) updates.latitude = req.body.latitude || null;
    if (req.body.longitude !== undefined) updates.longitude = req.body.longitude || null;

    // Resolve parent_uuid
    if (req.body.parent_uuid !== undefined) {
      if (req.body.parent_uuid) {
        const parent = await db('companies').where({ uuid: req.body.parent_uuid, tenant_id: req.tenantId }).first();
        if (!parent) throw new AppError('Parent group not found', 404);
        // A group can't sit under itself or under one of its own subgroups
        if (wouldCreateCycle(await loadGroupTree(req.tenantId), company.id, parent.id)) {
          throw new AppError('A group cannot be placed under itself or one of its subgroups', 400);
        }
        updates.parent_id = parent.id;
      } else {
        updates.parent_id = null;
      }
    }

    if (Object.keys(updates).length) {
      await db('companies').where({ id: company.id }).update(updates);
    }

    res.json({ message: 'Company updated' });
  } catch (err) {
    next(err);
  }
});

// POST /api/companies/:uuid/logo — upload company logo
router.post('/:uuid/logo', logoUpload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const company = await db('companies')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!company) throw new AppError('Company not found', 404);

    const processed = await processImage(
      req.file.path, `companies/${company.uuid}`, `logo_${Date.now()}`
    );

    await db('companies').where({ id: company.id }).update({ logo_path: processed.filePath });
    res.json({ logo_path: processed.filePath });
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

    // Subgroups move up one level instead of being orphaned at the top
    await db('companies').where({ parent_id: company.id, tenant_id: req.tenantId })
      .update({ parent_id: company.parent_id || null });
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

    // Prevent duplicate membership
    const existing = await db('contact_companies')
      .where({ contact_id: contact.id, company_id: company.id })
      .whereNull('end_date')
      .first();
    if (existing) throw new AppError('Already a member', 409);

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

// --- Company/group photos ---

// GET /api/companies/:uuid/photos
router.get('/:uuid/photos', async (req, res, next) => {
  try {
    const company = await db('companies').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!company) throw new AppError('Company not found', 404);

    const photos = await db('company_photos')
      .where({ company_id: company.id, tenant_id: req.tenantId })
      .select('id', 'file_path', 'thumbnail_path', 'is_primary', 'caption', 'taken_at', 'sort_order')
      .orderBy('sort_order')
      .orderBy('created_at', 'desc');

    res.json({ photos });
  } catch (err) { next(err); }
});

// POST /api/companies/:uuid/photos — upload photo
router.post('/:uuid/photos', logoUpload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const company = await db('companies').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!company) throw new AppError('Company not found', 404);

    const processed = await processImage(
      req.file.path, `companies/${company.uuid}`, `photo_${Date.now()}`
    );

    const [id] = await db('company_photos').insert({
      company_id: company.id,
      tenant_id: req.tenantId,
      file_path: processed.filePath,
      thumbnail_path: processed.thumbnailPath,
      is_primary: false,
      caption: req.body.caption?.trim() || null,
      taken_at: req.body.taken_at || null,
    });

    res.status(201).json({ id, file_path: processed.filePath, thumbnail_path: processed.thumbnailPath });
  } catch (err) { next(err); }
});

// PUT /api/companies/photos/:photoId/primary — set primary photo
router.put('/photos/:photoId/primary', async (req, res, next) => {
  try {
    const photo = await db('company_photos')
      .where({ id: req.params.photoId, tenant_id: req.tenantId })
      .first();
    if (!photo) throw new AppError('Photo not found', 404);

    await db('company_photos').where({ company_id: photo.company_id }).update({ is_primary: false });
    await db('company_photos').where({ id: photo.id }).update({ is_primary: true });

    res.json({ message: 'Primary photo set' });
  } catch (err) { next(err); }
});

// DELETE /api/companies/photos/:photoId
router.delete('/photos/:photoId', async (req, res, next) => {
  try {
    const photo = await db('company_photos')
      .where({ id: req.params.photoId, tenant_id: req.tenantId })
      .first();
    if (!photo) throw new AppError('Photo not found', 404);

    await db('company_photos').where({ id: photo.id }).del();
    res.json({ message: 'Photo deleted' });
  } catch (err) { next(err); }
});

// --- Label to group import ---

// POST /api/companies/import-from-label — convert label to group
router.post('/import-from-label', async (req, res, next) => {
  try {
    const { label_id, type, delete_label } = req.body;
    if (!label_id) throw new AppError('label_id is required', 400);

    const label = await db('labels').where({ id: label_id, tenant_id: req.tenantId }).first();
    if (!label) throw new AppError('Label not found', 404);

    const groupType = type && VALID_TYPES.includes(type) ? type : 'other';

    // Create the group
    const uuid = uuidv4();
    const [companyId] = await db('companies').insert({
      uuid,
      tenant_id: req.tenantId,
      name: label.name,
      type: groupType,
    });

    // Link all contacts from the label as members
    const contacts = await db('contact_labels')
      .where({ label_id: label.id })
      .select('contact_id');

    if (contacts.length) {
      await db('contact_companies').insert(
        contacts.map(c => ({
          contact_id: c.contact_id,
          company_id: companyId,
          tenant_id: req.tenantId,
        }))
      );
    }

    // Optionally delete the label
    if (delete_label) {
      await db('contact_labels').where({ label_id: label.id }).del();
      await db('labels').where({ id: label.id }).del();
    }

    res.status(201).json({ uuid, name: label.name, member_count: contacts.length });
  } catch (err) { next(err); }
});

export default router;
