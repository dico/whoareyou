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
    const type = await db('relationship_types').where({ id: relationship_type_id }).where(function () {
      this.whereNull('tenant_id').orWhere('tenant_id', req.tenantId);
    }).first();
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

// GET /api/relationships/suggestions — infer missing relationships from existing data
router.get('/suggestions', async (req, res, next) => {
  try {
    // Load all relationships + contacts in tenant
    const allRels = await db('relationships')
      .join('relationship_types', 'relationships.relationship_type_id', 'relationship_types.id')
      .where('relationships.tenant_id', req.tenantId)
      .select('relationships.contact_id', 'relationships.related_contact_id', 'relationship_types.name as type', 'relationship_types.id as type_id');

    const contacts = await db('contacts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .select('id', 'uuid', 'first_name', 'last_name',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`));

    const contactMap = new Map(contacts.map(c => [c.id, c]));

    // Build adjacency: id → [{otherId, type}]
    const adj = new Map();
    for (const r of allRels) {
      if (!adj.has(r.contact_id)) adj.set(r.contact_id, []);
      if (!adj.has(r.related_contact_id)) adj.set(r.related_contact_id, []);
      adj.get(r.contact_id).push({ otherId: r.related_contact_id, type: r.type });
      adj.get(r.related_contact_id).push({ otherId: r.contact_id, type: r.type === 'parent' ? 'child' : r.type === 'child' ? 'parent' : r.type });
    }

    // Build existing relationship set for dedup
    const existingSet = new Set();
    for (const r of allRels) {
      existingSet.add(`${Math.min(r.contact_id, r.related_contact_id)}-${Math.max(r.contact_id, r.related_contact_id)}`);
    }

    const suggestions = [];
    const suggestionSet = new Set();

    function addSuggestion(id1, id2, suggestedType, reason) {
      const key = `${Math.min(id1, id2)}-${Math.max(id1, id2)}`;
      if (existingSet.has(key) || suggestionSet.has(key)) return;
      const c1 = contactMap.get(id1);
      const c2 = contactMap.get(id2);
      if (!c1 || !c2) return;
      suggestionSet.add(key);
      suggestions.push({
        contact1: { uuid: c1.uuid, first_name: c1.first_name, last_name: c1.last_name, avatar: c1.avatar || null },
        contact2: { uuid: c2.uuid, first_name: c2.first_name, last_name: c2.last_name, avatar: c2.avatar || null },
        suggested_type: suggestedType,
        reason,
      });
    }

    // Get type IDs for creating relationships
    const typesByName = {};
    const allTypes = await db('relationship_types').select('id', 'name');
    for (const t of allTypes) typesByName[t.name] = t.id;

    for (const [personId, rels] of adj) {
      const parents = rels.filter(r => r.type === 'parent').map(r => r.otherId);
      const children = rels.filter(r => r.type === 'child').map(r => r.otherId);
      const partners = rels.filter(r => ['spouse', 'partner', 'boyfriend_girlfriend', 'cohabitant'].includes(r.type)).map(r => r.otherId);

      // Rule 1: Children of same parent → siblings
      if (children.length >= 2) {
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            addSuggestion(children[i], children[j], 'sibling', 'siblings');
          }
        }
      }

      // Rule 2: Parents of parent → grandparent to children
      if (parents.length > 0 && children.length > 0) {
        // This person's parents are grandparents to this person's children
        // But we need: this person's parents' parents → grandparents of THIS person
      }

      // Rule 3: Partner + children → partner is also parent of children
      for (const partnerId of partners) {
        for (const childId of children) {
          // Check if partner already has parent relationship with child
          const partnerRels = adj.get(partnerId) || [];
          const alreadyParent = partnerRels.some(r => r.otherId === childId && (r.type === 'child' || r.type === 'parent'));
          if (!alreadyParent) {
            addSuggestion(partnerId, childId, 'parent', 'partner_children');
          }
        }
      }

      // Rule 4: Parent's parent → grandparent
      for (const parentId of parents) {
        const parentRels = adj.get(parentId) || [];
        const grandparents = parentRels.filter(r => r.type === 'parent').map(r => r.otherId);
        for (const gpId of grandparents) {
          addSuggestion(gpId, personId, 'grandparent', 'grandparent');
        }
      }

      // Rule 5: Parent's sibling → uncle/aunt
      for (const parentId of parents) {
        const parentRels = adj.get(parentId) || [];
        const parentSiblings = parentRels.filter(r => r.type === 'sibling').map(r => r.otherId);
        for (const uncleId of parentSiblings) {
          addSuggestion(uncleId, personId, 'uncle_aunt', 'uncle_aunt');
        }
      }
    }

    // Add type_id to suggestions
    const result = suggestions.map(s => ({
      ...s,
      type_id: typesByName[s.suggested_type] || null,
    }));

    res.json({ suggestions: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/relationships/tree/:contactUuid — get relationship tree for visualization
router.get('/tree/:contactUuid', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.contactUuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    // Query params: depth (1-6, default 3), categories (comma-separated, default 'family')
    const maxDepth = Math.min(Math.max(parseInt(req.query.depth) || 3, 1), 6);
    const categories = (req.query.categories || 'family').split(',').map(c => c.trim()).filter(Boolean);

    // Get all relationships in the tenant filtered by category
    let relsQuery = db('relationships')
      .join('relationship_types', 'relationships.relationship_type_id', 'relationship_types.id')
      .where({ 'relationships.tenant_id': req.tenantId })
      .select(
        'relationships.contact_id', 'relationships.related_contact_id',
        'relationship_types.name as type', 'relationship_types.inverse_name',
        'relationship_types.category'
      );

    if (!categories.includes('all')) {
      relsQuery = relsQuery.whereIn('relationship_types.category', categories);
    }

    const allRels = await relsQuery;

    // BFS from the contact to find connected members (configurable depth)
    // Partners are included at same depth but don't expand further from partner's family
    const partnerTypes = new Set(['spouse', 'partner', 'boyfriend_girlfriend', 'cohabitant']);
    const visited = new Set();
    const nodes = new Map();
    const edges = [];
    const queue = [{ id: contact.id, depth: 0, isPartner: false }];
    visited.add(contact.id);

    while (queue.length) {
      const { id: currentId, depth, isPartner } = queue.shift();
      if (depth > maxDepth) continue;

      for (const rel of allRels) {
        let otherId, relType;
        if (rel.contact_id === currentId) {
          otherId = rel.related_contact_id;
          relType = rel.type;
        } else if (rel.related_contact_id === currentId) {
          otherId = rel.contact_id;
          relType = rel.inverse_name;
        } else continue;

        edges.push({ from: currentId, to: otherId, type: relType });

        if (!visited.has(otherId)) {
          visited.add(otherId);
          const isPartnerEdge = partnerTypes.has(relType);
          if (isPartnerEdge) {
            // Partner: include at same depth, but mark as partner (won't expand their parents/siblings)
            queue.push({ id: otherId, depth, isPartner: true });
          } else if (!isPartner) {
            // Non-partner: expand normally (but nodes reached via partner don't expand further)
            queue.push({ id: otherId, depth: depth + 1, isPartner: false });
          }
          // If isPartner and non-partner edge: this is partner's family — skip (don't queue)
        }
      }
    }

    // Fetch contact details for all visited nodes
    if (visited.size) {
      const contacts = await db('contacts')
        .whereIn('id', [...visited])
        .whereNull('deleted_at')
        .select(
          'id', 'uuid', 'first_name', 'last_name', 'birth_year', 'deceased_date',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        );

      for (const c of contacts) {
        nodes.set(c.id, {
          id: c.id, uuid: c.uuid,
          first_name: c.first_name, last_name: c.last_name,
          birth_year: c.birth_year, deceased_date: c.deceased_date, avatar: c.avatar,
          is_root: c.id === contact.id,
        });
      }
    }

    // Deduplicate edges (A→B and B→A are the same relationship)
    const uniqueEdges = [];
    const edgeSet = new Set();
    for (const e of edges) {
      const key = [Math.min(e.from, e.to), Math.max(e.from, e.to)].join('-');
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        uniqueEdges.push(e);
      }
    }

    res.json({
      rootId: contact.id,
      nodes: [...nodes.values()],
      edges: uniqueEdges,
    });
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

    // Swap direction: contact_id ↔ related_contact_id
    if (req.body.swap) {
      updates.contact_id = rel.related_contact_id;
      updates.related_contact_id = rel.contact_id;
    }

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
