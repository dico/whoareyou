import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { validateRequired } from '../utils/validation.js';

const router = Router();

// GET /api/contacts — list contacts
router.get('/', async (req, res, next) => {
  try {
    const { search, label, favorite, sort, order, page, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 200);
    const offset = ((parseInt(page) || 1) - 1) * limit;

    let query = db('contacts')
      .where('contacts.tenant_id', req.tenantId)
      .whereNull('contacts.deleted_at')
      .where(function () {
        this.where('contacts.visibility', 'shared')
          .orWhere('contacts.created_by', req.user.id);
      });

    // Search
    if (search) {
      const terms = search.trim().split(/\s+/).filter(Boolean);
      // Each term must match somewhere (AND logic across words)
      for (const term of terms) {
        const like = `%${term}%`;
        query = query.where(function () {
          this.where('contacts.first_name', 'like', like)
            .orWhere('contacts.last_name', 'like', like)
            .orWhere('contacts.nickname', 'like', like)
            .orWhere('contacts.how_we_met', 'like', like)
            .orWhere('contacts.notes', 'like', like);
        });
      }
      // Score: exact first_name start ranks highest
      const firstTerm = terms[0];
      query = query.orderByRaw(`
        CASE
          WHEN contacts.first_name LIKE ? THEN 0
          WHEN contacts.first_name LIKE ? THEN 1
          WHEN contacts.last_name LIKE ? THEN 2
          ELSE 3
        END ASC
      `, [`${firstTerm}%`, `%${firstTerm}%`, `${firstTerm}%`]);
    }

    // Filter by favorite
    if (favorite === 'true') {
      query = query.where('contacts.is_favorite', true);
    }

    // Filter by label
    if (label) {
      query = query
        .join('contact_labels', 'contacts.id', 'contact_labels.contact_id')
        .join('labels', 'contact_labels.label_id', 'labels.id')
        .where('labels.name', label);
    }

    // Count total
    const [{ count }] = await query.clone().count('contacts.id as count');

    // Sort
    const sortField = {
      name: 'contacts.last_name',
      first_name: 'contacts.first_name',
      last_contacted: 'contacts.last_contacted_at',
      last_viewed: 'contacts.last_viewed_at',
      created: 'contacts.created_at',
    }[sort] || 'contacts.first_name';
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    const contacts = await query
      .select(
        'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
        'contacts.nickname', 'contacts.birth_day', 'contacts.birth_month', 'contacts.birth_year',
        'contacts.deceased_date', 'contacts.is_favorite',
        'contacts.last_contacted_at', 'contacts.last_viewed_at', 'contacts.created_at',
        'contacts.visibility'
      )
      .select(db.raw(`(
        SELECT cp.thumbnail_path FROM contact_photos cp
        WHERE cp.contact_id = contacts.id AND cp.is_primary = true
        LIMIT 1
      ) as avatar`))
      .orderBy(sortField, sortOrder)
      .limit(limit)
      .offset(offset);

    res.json({
      contacts,
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

// GET /api/contacts/:uuid — get single contact with all details
router.get('/:uuid', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
      })
      .first();

    if (!contact) {
      throw new AppError('Contact not found', 404);
    }

    // Update last viewed timestamp
    db('contacts').where({ id: contact.id }).update({ last_viewed_at: db.fn.now() }).catch(() => {});

    // Fetch related data in parallel
    const [photos, fields, labels, relationships, addresses] = await Promise.all([
      db('contact_photos')
        .where({ contact_id: contact.id, tenant_id: req.tenantId })
        .orderBy('sort_order'),

      db('contact_fields')
        .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
        .where({ 'contact_fields.contact_id': contact.id, 'contact_fields.tenant_id': req.tenantId })
        .select(
          'contact_fields.id', 'contact_fields.value', 'contact_fields.label',
          'contact_field_types.name as type', 'contact_field_types.icon', 'contact_field_types.protocol'
        )
        .orderBy('contact_fields.sort_order'),

      db('labels')
        .join('contact_labels', 'labels.id', 'contact_labels.label_id')
        .where('contact_labels.contact_id', contact.id)
        .select('labels.id', 'labels.name', 'labels.color', 'labels.category'),

      db('relationships')
        .join('contacts as related', 'relationships.related_contact_id', 'related.id')
        .join('relationship_types', 'relationships.relationship_type_id', 'relationship_types.id')
        .where({ 'relationships.contact_id': contact.id, 'relationships.tenant_id': req.tenantId })
        .select(
          'relationships.id as relationship_id',
          'related.uuid', 'related.first_name', 'related.last_name',
          'relationship_types.name as relationship', 'relationship_types.id as relationship_type_id',
          'relationship_types.category',
          'relationships.notes', 'relationships.start_date', 'relationships.end_date',
          db.raw('0 as is_inverse'),
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = related.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        // Also get inverse relationships (where this contact is the "related" one)
        .unionAll(function () {
          this.from('relationships')
            .join('contacts as origin', 'relationships.contact_id', 'origin.id')
            .join('relationship_types', 'relationships.relationship_type_id', 'relationship_types.id')
            .where({ 'relationships.related_contact_id': contact.id, 'relationships.tenant_id': req.tenantId })
            .select(
              'relationships.id as relationship_id',
              'origin.uuid', 'origin.first_name', 'origin.last_name',
              'relationship_types.inverse_name as relationship', 'relationship_types.id as relationship_type_id',
              'relationship_types.category',
              'relationships.notes', 'relationships.start_date', 'relationships.end_date',
              db.raw('1 as is_inverse'),
              db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = origin.id AND cp.is_primary = true LIMIT 1) as avatar`)
            );
        }),

      db('contact_addresses')
        .join('addresses', 'contact_addresses.address_id', 'addresses.id')
        .where({ 'contact_addresses.contact_id': contact.id, 'contact_addresses.tenant_id': req.tenantId })
        .select(
          'addresses.id as address_id',
          'addresses.street', 'addresses.street2', 'addresses.postal_code',
          'addresses.city', 'addresses.country', 'addresses.latitude', 'addresses.longitude',
          'contact_addresses.label', 'contact_addresses.is_primary',
          'contact_addresses.moved_in_at', 'contact_addresses.moved_out_at'
        )
        .orderByRaw('contact_addresses.moved_out_at IS NOT NULL, contact_addresses.moved_in_at DESC'),
    ]);

    // Fetch household: other contacts at the same current addresses
    const currentAddressIds = addresses
      .filter(a => !a.moved_out_at && a.address_id)
      .map(a => a.address_id);

    let household = [];
    if (currentAddressIds.length) {
      household = await db('contact_addresses')
        .join('contacts', 'contact_addresses.contact_id', 'contacts.id')
        .join('addresses', 'contact_addresses.address_id', 'addresses.id')
        .whereIn('contact_addresses.address_id', currentAddressIds)
        .where('contact_addresses.tenant_id', req.tenantId)
        .where('contacts.id', '!=', contact.id)
        .whereNull('contacts.deleted_at')
        .whereNull('contact_addresses.moved_out_at')
        .select(
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
          'addresses.id as address_id', 'addresses.street', 'contact_addresses.label',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        .groupBy('contacts.id', 'addresses.id', 'addresses.street', 'contact_addresses.label');
    }

    res.json({
      contact: {
        uuid: contact.uuid,
        first_name: contact.first_name,
        last_name: contact.last_name,
        nickname: contact.nickname,
        birth_day: contact.birth_day,
        birth_month: contact.birth_month,
        birth_year: contact.birth_year,
        deceased_date: contact.deceased_date,
        how_we_met: contact.how_we_met,
        notes: contact.notes,
        is_favorite: !!contact.is_favorite,
        visibility: contact.visibility,
        last_contacted_at: contact.last_contacted_at,
        created_at: contact.created_at,
        photos,
        fields,
        labels,
        relationships,
        addresses,
        household,
        companies: await db('contact_companies')
          .join('companies', 'contact_companies.company_id', 'companies.id')
          .where({ 'contact_companies.contact_id': contact.id, 'contact_companies.tenant_id': req.tenantId })
          .select(
            'contact_companies.id as link_id', 'contact_companies.title', 'contact_companies.start_date', 'contact_companies.end_date',
            'companies.uuid as company_uuid', 'companies.name as company_name', 'companies.logo_path as company_logo'
          )
          .orderByRaw('contact_companies.end_date IS NOT NULL, contact_companies.start_date DESC'),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/contacts — create contact
router.post('/', async (req, res, next) => {
  try {
    validateRequired(['first_name'], req.body);

    const uuid = uuidv4();
    const [id] = await db('contacts').insert({
      uuid,
      tenant_id: req.tenantId,
      created_by: req.user.id,
      first_name: req.body.first_name.trim(),
      last_name: req.body.last_name?.trim() || null,
      nickname: req.body.nickname?.trim() || null,
      birth_day: req.body.birth_day || null,
      birth_month: req.body.birth_month || null,
      birth_year: req.body.birth_year || null,
      how_we_met: req.body.how_we_met?.trim() || null,
      notes: req.body.notes?.trim() || null,
      is_favorite: !!req.body.is_favorite,
      visibility: ['shared', 'family', 'private'].includes(req.body.visibility) ? req.body.visibility : 'shared',
    });

    // Add labels if provided (validate they belong to this tenant)
    if (req.body.labels?.length) {
      const validLabels = await db('labels')
        .whereIn('id', req.body.labels)
        .where({ tenant_id: req.tenantId })
        .select('id');
      const validIds = validLabels.map(l => l.id);
      if (validIds.length) {
        await db('contact_labels').insert(validIds.map(labelId => ({ contact_id: id, label_id: labelId })));
      }
    }

    const contact = await db('contacts').where({ id }).first();

    res.status(201).json({
      contact: {
        uuid: contact.uuid,
        first_name: contact.first_name,
        last_name: contact.last_name,
        nickname: contact.nickname,
        birth_day: contact.birth_day,
        birth_month: contact.birth_month,
        birth_year: contact.birth_year,
        is_favorite: !!contact.is_favorite,
        visibility: contact.visibility,
        created_at: contact.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/contacts/:uuid — update contact
router.put('/:uuid', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
      })
      .first();

    if (!contact) {
      throw new AppError('Contact not found', 404);
    }

    const updates = {};
    const allowed = ['first_name', 'last_name', 'nickname', 'birth_day', 'birth_month', 'birth_year', 'how_we_met', 'notes', 'is_favorite', 'visibility', 'deceased_date'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    }

    if (Object.keys(updates).length) {
      await db('contacts').where({ id: contact.id }).update(updates);
    }

    // Update labels if provided (validate they belong to this tenant)
    if (req.body.labels !== undefined) {
      await db('contact_labels').where({ contact_id: contact.id }).del();
      if (req.body.labels.length) {
        const validLabels = await db('labels')
          .whereIn('id', req.body.labels)
          .where({ tenant_id: req.tenantId })
          .select('id');
        const validIds = validLabels.map(l => l.id);
        if (validIds.length) {
          await db('contact_labels').insert(
            validIds.map((labelId) => ({ contact_id: contact.id, label_id: labelId }))
          );
        }
      }
    }

    const updated = await db('contacts').where({ id: contact.id }).first();

    res.json({
      contact: {
        uuid: updated.uuid,
        first_name: updated.first_name,
        last_name: updated.last_name,
        nickname: updated.nickname,
        birth_day: updated.birth_day,
        birth_month: updated.birth_month,
        birth_year: updated.birth_year,
        how_we_met: updated.how_we_met,
        notes: updated.notes,
        is_favorite: !!updated.is_favorite,
        visibility: updated.visibility,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:uuid — soft delete
router.delete('/:uuid', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
      })
      .first();

    if (!contact) {
      throw new AppError('Contact not found', 404);
    }

    // Prevent deleting contacts linked to user accounts
    const linkedMember = await db('tenant_members')
      .where({ linked_contact_id: contact.id, tenant_id: req.tenantId })
      .join('users', 'tenant_members.user_id', 'users.id')
      .select('users.first_name')
      .first();
    if (linkedMember) {
      throw new AppError(`Cannot delete — linked to user ${linkedMember.first_name}`, 400);
    }

    await db('contacts').where({ id: contact.id }).update({ deleted_at: db.fn.now() });

    res.json({ message: 'Contact deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/contacts/search/global — search across contacts, posts, and fields
router.get('/search/global', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ contacts: [], posts: [], companies: [] });
    }

    const like = `%${q}%`;

    // Search contacts (name, nickname, notes, how_we_met)
    const contacts = await db('contacts')
      .where('contacts.tenant_id', req.tenantId)
      .whereNull('contacts.deleted_at')
      .where(function () {
        this.whereIn('contacts.visibility', ['shared', 'family']).orWhere('contacts.created_by', req.user.id);
      })
      .where(function () {
        // Multi-word search: each term must match somewhere
        const terms = q.trim().split(/\s+/).filter(Boolean);
        for (const term of terms) {
          const tLike = `%${term}%`;
          this.where(function () {
            this.where('contacts.first_name', 'like', tLike)
              .orWhere('contacts.last_name', 'like', tLike)
              .orWhere('contacts.nickname', 'like', tLike);
          });
        }
      })
      .select(
        'contacts.uuid', 'contacts.first_name', 'contacts.last_name', 'contacts.nickname',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
      )
      .orderByRaw(`CASE WHEN contacts.first_name LIKE ? THEN 0 WHEN contacts.first_name LIKE ? THEN 1 ELSE 2 END ASC`, [`${q.split(/\s+/)[0]}%`, `%${q.split(/\s+/)[0]}%`])
      .limit(10);

    // Search posts
    const posts = await db('posts')
      .where('posts.tenant_id', req.tenantId)
      .whereNull('posts.deleted_at')
      .where(function () {
        this.whereIn('posts.visibility', ['shared', 'family']).orWhere('posts.created_by', req.user.id);
      })
      .where('posts.body', 'like', like)
      .select('posts.uuid', 'posts.body', 'posts.post_date', 'posts.contact_id')
      .orderBy('posts.post_date', 'desc')
      .limit(5);

    // Get about-contact for posts
    const postContactIds = posts.map(p => p.contact_id).filter(Boolean);
    let postContacts = new Map();
    if (postContactIds.length) {
      const pcs = await db('contacts').whereIn('id', postContactIds).select('id', 'uuid', 'first_name', 'last_name');
      for (const pc of pcs) postContacts.set(pc.id, pc);
    }

    const postResults = posts.map(p => {
      const about = p.contact_id ? postContacts.get(p.contact_id) : null;
      return {
        uuid: p.uuid,
        body: p.body.length > 120 ? p.body.substring(0, 120) + '...' : p.body,
        post_date: p.post_date,
        about: about ? { uuid: about.uuid, first_name: about.first_name, last_name: about.last_name } : null,
      };
    });

    // Search companies
    const companies = await db('companies')
      .where('companies.tenant_id', req.tenantId)
      .where(function () {
        this.where('companies.name', 'like', like)
          .orWhere('companies.industry', 'like', like);
      })
      .select('companies.uuid', 'companies.name', 'companies.industry')
      .limit(5);

    res.json({ contacts, posts: postResults, companies });
  } catch (err) {
    next(err);
  }
});

// GET /api/contacts/upcoming-birthdays — next 30 days of birthdays
router.get('/upcoming-birthdays/list', async (req, res, next) => {
  try {
    // Need at least day+month to calculate upcoming birthdays
    const contacts = await db('contacts')
      .where('contacts.tenant_id', req.tenantId)
      .whereNull('contacts.deleted_at')
      .whereNotNull('contacts.birth_day')
      .whereNotNull('contacts.birth_month')
      .where(function () {
        this.whereIn('contacts.visibility', ['shared', 'family']).orWhere('contacts.created_by', req.user.id);
      })
      .select(
        'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
        'contacts.birth_day', 'contacts.birth_month', 'contacts.birth_year',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
      );

    const today = new Date();
    const upcoming = contacts
      .map(c => {
        const nextBirthday = new Date(today.getFullYear(), c.birth_month - 1, c.birth_day);
        if (nextBirthday < today) nextBirthday.setFullYear(today.getFullYear() + 1);
        const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
        const turningAge = c.birth_year ? nextBirthday.getFullYear() - c.birth_year : null;
        return { ...c, days_until: daysUntil, turning_age: turningAge };
      })
      .filter(c => c.days_until <= 30)
      .sort((a, b) => a.days_until - b.days_until);

    res.json({ contacts: upcoming });
  } catch (err) {
    next(err);
  }
});

// GET /api/contacts/field-types — list available field types
router.get('/field-types/list', async (req, res, next) => {
  try {
    const types = await db('contact_field_types')
      .where(function () {
        this.whereNull('tenant_id').orWhere('tenant_id', req.tenantId);
      })
      .orderBy('sort_order')
      .select('id', 'name', 'icon', 'protocol', 'is_system');

    res.json({ types });
  } catch (err) {
    next(err);
  }
});

// POST /api/contacts/:uuid/fields — add contact field
router.post('/:uuid/fields', async (req, res, next) => {
  try {
    validateRequired(['field_type_id', 'value'], req.body);

    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
      })
      .first();

    if (!contact) {
      throw new AppError('Contact not found', 404);
    }

    // Verify field type exists
    const fieldType = await db('contact_field_types')
      .where({ id: req.body.field_type_id })
      .where(function () {
        this.whereNull('tenant_id').orWhere('tenant_id', req.tenantId);
      })
      .first();

    if (!fieldType) {
      throw new AppError('Invalid field type', 400);
    }

    // Get max sort_order for this contact
    const [{ maxSort }] = await db('contact_fields')
      .where({ contact_id: contact.id })
      .max('sort_order as maxSort');

    const [id] = await db('contact_fields').insert({
      contact_id: contact.id,
      tenant_id: req.tenantId,
      field_type_id: req.body.field_type_id,
      value: req.body.value.trim(),
      label: req.body.label?.trim() || null,
      sort_order: (maxSort || 0) + 1,
    });

    const field = await db('contact_fields')
      .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
      .where('contact_fields.id', id)
      .select(
        'contact_fields.id', 'contact_fields.value', 'contact_fields.label',
        'contact_field_types.name as type', 'contact_field_types.icon', 'contact_field_types.protocol'
      )
      .first();

    res.status(201).json({ field });
  } catch (err) {
    next(err);
  }
});

// PUT /api/contacts/:uuid/fields/:fieldId — update contact field
router.put('/:uuid/fields/:fieldId', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
      })
      .first();

    if (!contact) {
      throw new AppError('Contact not found', 404);
    }

    const field = await db('contact_fields')
      .where({ id: req.params.fieldId, contact_id: contact.id, tenant_id: req.tenantId })
      .first();

    if (!field) {
      throw new AppError('Field not found', 404);
    }

    const updates = {};
    if (req.body.value !== undefined) updates.value = req.body.value.trim();
    if (req.body.label !== undefined) updates.label = req.body.label?.trim() || null;
    if (req.body.field_type_id !== undefined) updates.field_type_id = req.body.field_type_id;

    if (Object.keys(updates).length) {
      await db('contact_fields').where({ id: field.id }).update(updates);
    }

    const updated = await db('contact_fields')
      .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
      .where('contact_fields.id', field.id)
      .select(
        'contact_fields.id', 'contact_fields.value', 'contact_fields.label',
        'contact_field_types.name as type', 'contact_field_types.icon', 'contact_field_types.protocol'
      )
      .first();

    res.json({ field: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:uuid/fields/:fieldId — delete contact field
router.delete('/:uuid/fields/:fieldId', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .where(function () {
        this.whereIn('visibility', ['shared', 'family']).orWhere('created_by', req.user.id);
      })
      .first();

    if (!contact) {
      throw new AppError('Contact not found', 404);
    }

    const deleted = await db('contact_fields')
      .where({ id: req.params.fieldId, contact_id: contact.id, tenant_id: req.tenantId })
      .del();

    if (!deleted) {
      throw new AppError('Field not found', 404);
    }

    res.json({ message: 'Field deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/contacts/tools/duplicates — find potential duplicate contacts
router.get('/tools/duplicates', async (req, res, next) => {
  try {
    const contacts = await db('contacts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .select('id', 'uuid', 'first_name', 'last_name', 'birth_year', 'birth_month', 'birth_day',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`));

    // Get contact fields (email, phone) for matching
    const fields = await db('contact_fields')
      .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
      .whereIn('contact_fields.contact_id', contacts.map(c => c.id))
      .whereIn('contact_field_types.name', ['email', 'phone'])
      .select('contact_fields.contact_id', 'contact_field_types.name as type', 'contact_fields.value');

    const fieldsByContact = new Map();
    for (const f of fields) {
      if (!fieldsByContact.has(f.contact_id)) fieldsByContact.set(f.contact_id, []);
      fieldsByContact.get(f.contact_id).push(f);
    }

    // Compare all pairs
    const duplicates = [];
    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizePhone = (s) => (s || '').replace(/[\s\-().+]/g, '');

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const a = contacts[i], b = contacts[j];
        let score = 0;
        const reasons = [];

        const aFirst = normalize(a.first_name), bFirst = normalize(b.first_name);
        const aLast = normalize(a.last_name), bLast = normalize(b.last_name);

        // Exact name match
        if (aFirst === bFirst && aLast === bLast && aFirst) {
          score += 80;
          reasons.push('exact_name');
        }
        // First name match + similar last name
        else if (aFirst === bFirst && aFirst.length > 1) {
          score += 30;
          reasons.push('first_name');
          // Last name similarity
          if (aLast && bLast && (aLast.includes(bLast) || bLast.includes(aLast))) {
            score += 30;
            reasons.push('similar_last_name');
          } else if (aLast === bLast) {
            score += 40;
            reasons.push('last_name');
          }
        }
        // Last name match only
        else if (aLast === bLast && aLast && aLast.length > 2) {
          // Check if first names are similar (one contains the other, e.g. "Jon" vs "Jonathan")
          if (aFirst && bFirst && (aFirst.includes(bFirst) || bFirst.includes(aFirst))) {
            score += 50;
            reasons.push('similar_first_name');
          }
        }

        if (score < 30) continue;

        // Birthday match bonus
        if (a.birth_year && a.birth_year === b.birth_year) {
          score += 10;
          reasons.push('birth_year');
        }
        if (a.birth_month && a.birth_month === b.birth_month && a.birth_day && a.birth_day === b.birth_day) {
          score += 15;
          reasons.push('birthday');
        }

        // Email/phone match bonus
        const aFields = fieldsByContact.get(a.id) || [];
        const bFields = fieldsByContact.get(b.id) || [];
        for (const af of aFields) {
          for (const bf of bFields) {
            if (af.type === 'email' && bf.type === 'email' && normalize(af.value) === normalize(bf.value)) {
              score += 30;
              reasons.push('email');
            }
            if (af.type === 'phone' && bf.type === 'phone' && normalizePhone(af.value) === normalizePhone(bf.value)) {
              score += 25;
              reasons.push('phone');
            }
          }
        }

        if (score >= 50) {
          duplicates.push({
            contact1: { uuid: a.uuid, first_name: a.first_name, last_name: a.last_name, avatar: a.avatar, birth_year: a.birth_year },
            contact2: { uuid: b.uuid, first_name: b.first_name, last_name: b.last_name, avatar: b.avatar, birth_year: b.birth_year },
            score: Math.min(score, 100),
            reasons,
          });
        }
      }
    }

    // Sort by score descending
    duplicates.sort((a, b) => b.score - a.score);
    res.json({ duplicates });
  } catch (err) { next(err); }
});

// POST /api/contacts/tools/merge — merge two contacts into one
router.post('/tools/merge', async (req, res, next) => {
  try {
    const { keep_uuid, merge_uuid } = req.body;
    if (!keep_uuid || !merge_uuid) throw new AppError('keep_uuid and merge_uuid required', 400);

    const keep = await db('contacts').where({ uuid: keep_uuid, tenant_id: req.tenantId }).whereNull('deleted_at').first();
    const merge = await db('contacts').where({ uuid: merge_uuid, tenant_id: req.tenantId }).whereNull('deleted_at').first();
    if (!keep || !merge) throw new AppError('Contact not found', 404);

    await db.transaction(async (trx) => {
      // Move posts from merge → keep
      await trx('posts').where({ contact_id: merge.id, tenant_id: req.tenantId }).update({ contact_id: keep.id });
      await trx('post_contacts').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});

      // Move relationships (avoid duplicates)
      const mergeRels = await trx('relationships').where({ contact_id: merge.id, tenant_id: req.tenantId });
      for (const r of mergeRels) {
        const exists = await trx('relationships').where({ contact_id: keep.id, related_contact_id: r.related_contact_id, relationship_type_id: r.relationship_type_id }).first();
        if (!exists) await trx('relationships').where({ id: r.id }).update({ contact_id: keep.id }).catch(() => {});
        else await trx('relationships').where({ id: r.id }).del();
      }
      const mergeInvRels = await trx('relationships').where({ related_contact_id: merge.id, tenant_id: req.tenantId });
      for (const r of mergeInvRels) {
        const exists = await trx('relationships').where({ related_contact_id: keep.id, contact_id: r.contact_id, relationship_type_id: r.relationship_type_id }).first();
        if (!exists) await trx('relationships').where({ id: r.id }).update({ related_contact_id: keep.id }).catch(() => {});
        else await trx('relationships').where({ id: r.id }).del();
      }

      // Move fields (avoid duplicates by type+value)
      const mergeFields = await trx('contact_fields').where({ contact_id: merge.id });
      const keepFields = await trx('contact_fields').where({ contact_id: keep.id });
      for (const f of mergeFields) {
        const exists = keepFields.find(kf => kf.field_type_id === f.field_type_id && kf.value === f.value);
        if (!exists) await trx('contact_fields').where({ id: f.id }).update({ contact_id: keep.id }).catch(() => {});
        else await trx('contact_fields').where({ id: f.id }).del();
      }

      // Move addresses, photos, companies, labels, life events, reactions, comments
      await trx('contact_addresses').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});
      await trx('contact_photos').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});
      await trx('contact_companies').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});
      await trx('contact_labels').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});
      await trx('life_events').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});
      await trx('life_event_contacts').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});
      await trx('post_reactions').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});
      await trx('post_comments').where({ contact_id: merge.id }).update({ contact_id: keep.id }).catch(() => {});

      // Fill in missing fields on keep from merge
      const updates = {};
      if (!keep.last_name && merge.last_name) updates.last_name = merge.last_name;
      if (!keep.nickname && merge.nickname) updates.nickname = merge.nickname;
      if (!keep.birth_year && merge.birth_year) updates.birth_year = merge.birth_year;
      if (!keep.birth_month && merge.birth_month) updates.birth_month = merge.birth_month;
      if (!keep.birth_day && merge.birth_day) updates.birth_day = merge.birth_day;
      if (!keep.how_we_met && merge.how_we_met) updates.how_we_met = merge.how_we_met;
      if (!keep.notes && merge.notes) updates.notes = merge.notes;
      if (!keep.deceased_date && merge.deceased_date) updates.deceased_date = merge.deceased_date;
      if (Object.keys(updates).length) await trx('contacts').where({ id: keep.id }).update(updates);

      // Soft-delete the merged contact
      await trx('contacts').where({ id: merge.id }).update({ deleted_at: trx.fn.now() });
    });

    res.json({ message: 'Contacts merged', kept: keep_uuid });
  } catch (err) { next(err); }
});

export default router;
