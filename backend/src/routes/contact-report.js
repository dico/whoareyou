import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { loadGroupTree, descendantIds } from '../utils/group-tree.js';
import { filterSensitiveContacts } from '../utils/sensitive.js';
import { filterVisibleContacts } from '../utils/visibility.js';

// Contact overview ("Kontaktoversikt"): a filtered set of contacts plus the
// columns the user asked for, for a table/print/CSV view.
//
// The client never sends SQL — it sends a list of typed filters and columns,
// and each type maps to one small, named query piece below. Unknown types are
// rejected. Every contact that ends up in the response, including people
// pulled in through a relationship column (e.g. a student's parents), passes
// the same visibility + sensitive filters as the contact list.

const router = Router();

const MAX_ROWS = 2000;
const MAX_FILTERS = 20;
const MAX_COLUMNS = 20;

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Visible, non-deleted contacts as `alias` (for joins on related people). */
function visibleContact(req, alias) {
  return (q) => q
    .where(`${alias}.tenant_id`, req.tenantId)
    .whereNull(`${alias}.deleted_at`)
    .modify(filterVisibleContacts(req, alias))
    .modify(filterSensitiveContacts(req, alias));
}

/**
 * Subquery: ids of contacts that have a (current) relationship where the
 * OTHER person is `role` to them — e.g. role 'parent' = "has a parent".
 * Follows the storage convention in docs/relationships.md: forward rows read
 * `type.name`, inverse rows read `type.inverse_name`.
 */
function contactsWithRole(req, role) {
  return function () {
    this.select('r.contact_id as id')
      .from('relationships as r')
      .join('relationship_types as rt', 'r.relationship_type_id', 'rt.id')
      .join('contacts as o', 'r.related_contact_id', 'o.id')
      .where('r.tenant_id', req.tenantId)
      .whereNull('r.end_date')
      .where('rt.name', role)
      .modify(visibleContact(req, 'o'))
      .union(function () {
        this.select('r2.related_contact_id as id')
          .from('relationships as r2')
          .join('relationship_types as rt2', 'r2.relationship_type_id', 'rt2.id')
          .join('contacts as o2', 'r2.contact_id', 'o2.id')
          .where('r2.tenant_id', req.tenantId)
          .whereNull('r2.end_date')
          .where('rt2.inverse_name', role)
          .modify(visibleContact(req, 'o2'));
      });
  };
}

/** Subquery: ids of contacts that have the given field (builtin or field type name). */
function contactsWithField(req, field) {
  switch (field) {
    case 'birthday':
      return db('contacts').where('tenant_id', req.tenantId)
        .whereNotNull('birth_day').whereNotNull('birth_month').select('id');
    case 'birth_year':
      return db('contacts').where('tenant_id', req.tenantId).whereNotNull('birth_year').select('id');
    case 'address':
      return db('contact_addresses').where('tenant_id', req.tenantId)
        .whereNull('moved_out_at').select('contact_id');
    case 'photo':
      return db('contact_photos').where('tenant_id', req.tenantId).select('contact_id');
    case 'group':
      return db('contact_companies').where('tenant_id', req.tenantId)
        .whereNull('end_date').select('contact_id');
    case 'label':
      return db('contact_labels')
        .join('labels', 'contact_labels.label_id', 'labels.id')
        .where('labels.tenant_id', req.tenantId).select('contact_labels.contact_id');
    default:
      return db('contact_fields')
        .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
        .where('contact_fields.tenant_id', req.tenantId)
        .where('contact_field_types.name', field)
        .whereRaw("TRIM(contact_fields.value) <> ''")
        .select('contact_fields.contact_id');
  }
}

/** Apply one filter to the contacts query. Throws on an invalid filter. */
async function applyFilter(req, query, f) {
  const negate = f.mode === 'missing' || f.mode === 'not';
  switch (f.type) {
    case 'name': {
      const terms = str(f.value).split(/\s+/).filter(Boolean);
      for (const term of terms) {
        const like = `%${term}%`;
        query.where(function () {
          this.where('contacts.first_name', 'like', like)
            .orWhere('contacts.last_name', 'like', like)
            .orWhere('contacts.nickname', 'like', like);
        });
      }
      return;
    }
    case 'last_name': {
      const v = str(f.value);
      if (!v) return;
      if (f.match === 'exact') query.where('contacts.last_name', v);
      else query.where('contacts.last_name', 'like', `%${v}%`);
      return;
    }
    case 'favorite':
      query.where('contacts.is_favorite', !negate);
      return;
    case 'group': {
      const group = await db('companies').where({ uuid: str(f.uuid, 64), tenant_id: req.tenantId }).first();
      if (!group) throw new AppError('Group not found', 400);
      const ids = f.subgroups === false
        ? [group.id]
        : descendantIds(await loadGroupTree(req.tenantId), group.id);
      const members = db('contact_companies').where('tenant_id', req.tenantId).whereIn('company_id', ids);
      if (f.former !== true) members.whereNull('end_date');
      query[negate ? 'whereNotIn' : 'whereIn']('contacts.id', members.select('contact_id'));
      return;
    }
    case 'label': {
      const label = await db('labels').where({ id: parseInt(f.id) || 0, tenant_id: req.tenantId }).first();
      if (!label) throw new AppError('Label not found', 400);
      const members = db('contact_labels').where('label_id', label.id).select('contact_id');
      query[negate ? 'whereNotIn' : 'whereIn']('contacts.id', members);
      return;
    }
    case 'birth_year': {
      const from = parseInt(f.from);
      const to = parseInt(f.to);
      if (from) query.where('contacts.birth_year', '>=', from);
      if (to) query.where('contacts.birth_year', '<=', to);
      return;
    }
    case 'birth_month': {
      const m = parseInt(f.value);
      if (m >= 1 && m <= 12) query.where('contacts.birth_month', m);
      return;
    }
    case 'relation': {
      const role = str(f.role, 50);
      if (!role) throw new AppError('Relation role is required', 400);
      query[negate ? 'whereNotIn' : 'whereIn']('contacts.id', contactsWithRole(req, role));
      return;
    }
    case 'field': {
      const field = str(f.field, 100);
      if (!field) throw new AppError('Field is required', 400);
      query[negate ? 'whereNotIn' : 'whereIn']('contacts.id', contactsWithField(req, field));
      return;
    }
    case 'city': {
      const v = str(f.value);
      if (!v) return;
      query.whereIn('contacts.id', db('contact_addresses')
        .join('addresses', 'contact_addresses.address_id', 'addresses.id')
        .where('contact_addresses.tenant_id', req.tenantId)
        .whereNull('contact_addresses.moved_out_at')
        .where(function () {
          this.where('addresses.city', 'like', `%${v}%`).orWhere('addresses.postal_code', v);
        })
        .select('contact_addresses.contact_id'));
      return;
    }
    case 'deceased':
      if (negate) query.whereNull('contacts.deceased_date');
      else query.whereNotNull('contacts.deceased_date');
      return;
    default:
      throw new AppError(`Unknown filter type: ${f.type}`, 400);
  }
}

// ── Column loaders: each returns Map<contactId, value> ──

async function loadFields(req, contactIds, fieldNames) {
  const out = new Map();
  if (!contactIds.length || !fieldNames.length) return out;
  const rows = await db('contact_fields')
    .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
    .where('contact_fields.tenant_id', req.tenantId)
    .whereIn('contact_fields.contact_id', contactIds)
    .whereIn('contact_field_types.name', fieldNames)
    .whereRaw("TRIM(contact_fields.value) <> ''")
    .orderBy('contact_fields.sort_order')
    .select('contact_fields.contact_id', 'contact_fields.value', 'contact_fields.label',
      'contact_field_types.name as type', 'contact_field_types.protocol');
  for (const r of rows) {
    if (!out.has(r.contact_id)) out.set(r.contact_id, {});
    const byType = out.get(r.contact_id);
    (byType[r.type] ||= []).push({ value: r.value, label: r.label || null, protocol: r.protocol || null });
  }
  return out;
}

async function loadAddresses(req, contactIds) {
  const out = new Map();
  if (!contactIds.length) return out;
  const rows = await db('contact_addresses')
    .join('addresses', 'contact_addresses.address_id', 'addresses.id')
    .where('contact_addresses.tenant_id', req.tenantId)
    .whereIn('contact_addresses.contact_id', contactIds)
    .whereNull('contact_addresses.moved_out_at')
    .orderBy('contact_addresses.is_primary', 'desc')
    .select('contact_addresses.contact_id', 'addresses.street', 'addresses.postal_code', 'addresses.city');
  for (const r of rows) {
    if (out.has(r.contact_id)) continue; // primary (or first) current address
    out.set(r.contact_id, { street: r.street || '', postal_code: r.postal_code || '', city: r.city || '' });
  }
  return out;
}

async function loadGroups(req, contactIds) {
  const out = new Map();
  if (!contactIds.length) return out;
  const rows = await db('contact_companies')
    .join('companies', 'contact_companies.company_id', 'companies.id')
    .where('companies.tenant_id', req.tenantId)
    .whereIn('contact_companies.contact_id', contactIds)
    .whereNull('contact_companies.end_date')
    .orderBy('companies.name')
    .select('contact_companies.contact_id', 'companies.uuid', 'companies.name');
  for (const r of rows) {
    if (!out.has(r.contact_id)) out.set(r.contact_id, []);
    const list = out.get(r.contact_id);
    if (!list.some(g => g.uuid === r.uuid)) list.push({ uuid: r.uuid, name: r.name });
  }
  return out;
}

async function loadLabels(req, contactIds) {
  const out = new Map();
  if (!contactIds.length) return out;
  const rows = await db('contact_labels')
    .join('labels', 'contact_labels.label_id', 'labels.id')
    .where('labels.tenant_id', req.tenantId)
    .whereIn('contact_labels.contact_id', contactIds)
    .orderBy('labels.name')
    .select('contact_labels.contact_id', 'labels.name', 'labels.color');
  for (const r of rows) {
    if (!out.has(r.contact_id)) out.set(r.contact_id, []);
    out.get(r.contact_id).push({ name: r.name, color: r.color });
  }
  return out;
}

/**
 * People who are `role` to each contact (current relationships only), with
 * the requested fields of those people. Map<contactId, Map<role, person[]>>.
 */
async function loadRelations(req, contactIds, relColumns) {
  const out = new Map();
  const roles = [...new Set(relColumns.map(c => c.role))];
  if (!contactIds.length || !roles.length) return out;

  const base = (q) => q.where('r.tenant_id', req.tenantId).whereNull('r.end_date');
  const [forward, inverse] = await Promise.all([
    db('relationships as r')
      .join('relationship_types as rt', 'r.relationship_type_id', 'rt.id')
      .modify(base)
      .whereIn('r.contact_id', contactIds).whereIn('rt.name', roles)
      .select('r.contact_id as owner', 'r.related_contact_id as other', 'rt.name as role'),
    db('relationships as r')
      .join('relationship_types as rt', 'r.relationship_type_id', 'rt.id')
      .modify(base)
      .whereIn('r.related_contact_id', contactIds).whereIn('rt.inverse_name', roles)
      .select('r.related_contact_id as owner', 'r.contact_id as other', 'rt.inverse_name as role'),
  ]);
  const links = [...forward, ...inverse];
  const otherIds = [...new Set(links.map(l => l.other))];
  if (!otherIds.length) return out;

  // Only people this user may see — same rules as the main list.
  const people = await db('contacts')
    .modify(visibleContact(req, 'contacts'))
    .whereIn('contacts.id', otherIds)
    .select('contacts.id', 'contacts.uuid', 'contacts.first_name', 'contacts.last_name', 'contacts.deceased_date');
  const personById = new Map(people.map(p => [p.id, p]));

  const fieldNames = [...new Set(relColumns.flatMap(c => c.fields))];
  const fieldsById = await loadFields(req, people.map(p => p.id), fieldNames);

  for (const l of links) {
    const p = personById.get(l.other);
    if (!p || l.other === l.owner) continue;
    if (!out.has(l.owner)) out.set(l.owner, new Map());
    const byRole = out.get(l.owner);
    if (!byRole.has(l.role)) byRole.set(l.role, []);
    const list = byRole.get(l.role);
    if (list.some(x => x.uuid === p.uuid)) continue;
    list.push({
      uuid: p.uuid,
      first_name: p.first_name,
      last_name: p.last_name,
      deceased: !!p.deceased_date,
      fields: fieldsById.get(p.id) || {},
    });
  }
  return out;
}

/** Validate + normalize the column list. */
function parseColumns(columns) {
  if (!Array.isArray(columns)) return [];
  const out = [];
  for (const c of columns.slice(0, MAX_COLUMNS)) {
    if (!c || typeof c !== 'object') continue;
    switch (c.type) {
      case 'birthday': case 'address': case 'groups': case 'labels':
        out.push({ type: c.type });
        break;
      case 'field': {
        const field = str(c.field, 100);
        if (field) out.push({ type: 'field', field });
        break;
      }
      case 'relation': {
        const role = str(c.role, 50);
        const fields = Array.isArray(c.fields) ? c.fields.map(f => str(f, 100)).filter(Boolean).slice(0, 5) : [];
        if (role) out.push({ type: 'relation', role, fields });
        break;
      }
      default:
        throw new AppError(`Unknown column type: ${c.type}`, 400);
    }
  }
  return out;
}

// POST /api/reports/contacts — { filters: [...], columns: [...] }
router.post('/contacts', async (req, res, next) => {
  try {
    const filters = Array.isArray(req.body?.filters) ? req.body.filters.slice(0, MAX_FILTERS) : [];
    const columns = parseColumns(req.body?.columns);

    const query = db('contacts')
      .where('contacts.tenant_id', req.tenantId)
      .whereNull('contacts.deleted_at')
      .modify(filterVisibleContacts(req))
      .modify(filterSensitiveContacts(req));

    for (const f of filters) {
      if (!f || typeof f !== 'object') continue;
      await applyFilter(req, query, f);
    }

    const [{ count }] = await query.clone().count('contacts.id as count');
    const contacts = await query
      .select(
        'contacts.id', 'contacts.uuid', 'contacts.first_name', 'contacts.last_name', 'contacts.nickname',
        'contacts.birth_day', 'contacts.birth_month', 'contacts.birth_year', 'contacts.deceased_date',
        'contacts.is_favorite',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp
                 WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
      )
      .orderBy('contacts.first_name').orderBy('contacts.last_name')
      .limit(MAX_ROWS);

    const ids = contacts.map(c => c.id);
    const fieldNames = columns.filter(c => c.type === 'field').map(c => c.field);
    const relColumns = columns.filter(c => c.type === 'relation');
    const has = (type) => columns.some(c => c.type === type);

    const [fields, addresses, groups, labels, relations] = await Promise.all([
      loadFields(req, ids, fieldNames),
      has('address') ? loadAddresses(req, ids) : new Map(),
      has('groups') ? loadGroups(req, ids) : new Map(),
      has('labels') ? loadLabels(req, ids) : new Map(),
      loadRelations(req, ids, relColumns),
    ]);

    const rows = contacts.map((c) => {
      const row = {
        uuid: c.uuid,
        first_name: c.first_name,
        last_name: c.last_name,
        nickname: c.nickname,
        birth_day: c.birth_day,
        birth_month: c.birth_month,
        birth_year: c.birth_year,
        deceased_date: c.deceased_date,
        is_favorite: !!c.is_favorite,
        avatar: c.avatar,
        fields: fields.get(c.id) || {},
      };
      if (has('address')) row.address = addresses.get(c.id) || null;
      if (has('groups')) row.groups = groups.get(c.id) || [];
      if (has('labels')) row.labels = labels.get(c.id) || [];
      if (relColumns.length) {
        const byRole = relations.get(c.id);
        row.relations = Object.fromEntries(relColumns.map(rc => [rc.role, byRole?.get(rc.role) || []]));
      }
      return row;
    });

    res.json({ total: Number(count), truncated: Number(count) > rows.length, rows });
  } catch (err) {
    next(err);
  }
});

export default router;
