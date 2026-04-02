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
      if (id1 === id2) return;
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
      // But only if child doesn't already have 2 parents
      for (const partnerId of partners) {
        for (const childId of children) {
          const partnerRels = adj.get(partnerId) || [];
          const alreadyParent = partnerRels.some(r => r.otherId === childId && (r.type === 'child' || r.type === 'parent'));
          if (alreadyParent) continue;

          // Count how many parents the child already has
          const childRels = adj.get(childId) || [];
          const existingParents = childRels.filter(r => r.type === 'parent').length;
          if (existingParents >= 2) continue;

          addSuggestion(partnerId, childId, 'parent', 'partner_children');
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

      // Rule 6: Sibling's children → nephew/niece (I am uncle/aunt to them)
      const siblings = rels.filter(r => r.type === 'sibling').map(r => r.otherId);
      for (const sibId of siblings) {
        const sibRels = adj.get(sibId) || [];
        const niblings = sibRels.filter(r => r.type === 'child').map(r => r.otherId);
        for (const nibId of niblings) {
          addSuggestion(personId, nibId, 'uncle_aunt', 'nephew_niece');
        }
      }

      // Rule 7: Parent's sibling's children → cousin
      for (const parentId of parents) {
        const parentRels = adj.get(parentId) || [];
        const parentSiblings = parentRels.filter(r => r.type === 'sibling').map(r => r.otherId);
        for (const uncleId of parentSiblings) {
          const uncleRels = adj.get(uncleId) || [];
          const cousins = uncleRels.filter(r => r.type === 'child').map(r => r.otherId);
          for (const cousinId of cousins) {
            if (cousinId !== personId) {
              addSuggestion(personId, cousinId, 'cousin', 'cousin');
            }
          }
        }
      }

      // Rule 8: Partner's parents → in-law (sviger)
      for (const partnerId of partners) {
        const partnerRels = adj.get(partnerId) || [];
        const inLaws = partnerRels.filter(r => r.type === 'parent').map(r => r.otherId);
        for (const inLawId of inLaws) {
          addSuggestion(inLawId, personId, 'in-law', 'in_law');
        }
      }

      // Rule 9: Grandparent's partner (if grandparent exists but partner not linked)
      for (const parentId of parents) {
        const parentRels = adj.get(parentId) || [];
        const grandparents = parentRels.filter(r => r.type === 'parent').map(r => r.otherId);
        for (const gpId of grandparents) {
          const gpRels = adj.get(gpId) || [];
          const gpPartners = gpRels.filter(r => ['spouse', 'partner', 'cohabitant'].includes(r.type)).map(r => r.otherId);
          for (const gpPartnerId of gpPartners) {
            addSuggestion(gpPartnerId, personId, 'grandparent', 'grandparent_partner');
          }
        }
      }
    }

    // Add type_id to suggestions
    // Filter out dismissed suggestions
    const dismissed = await db('dismissed_suggestions')
      .where({ tenant_id: req.tenantId })
      .select('contact1_id', 'contact2_id', 'suggested_type');
    const dismissedSet = new Set(dismissed.map(d =>
      `${Math.min(d.contact1_id, d.contact2_id)}-${Math.max(d.contact1_id, d.contact2_id)}-${d.suggested_type}`
    ));

    const filtered = suggestions.filter(s => {
      const c1 = contactMap.get(s.contact1.uuid)?.id || 0;
      const c2 = contactMap.get(s.contact2.uuid)?.id || 0;
      // contactMap uses uuid as key? No, it uses id. Let me look up ids from uuids.
      return true; // We'll filter by uuid below
    });

    // Build id lookup from suggestions
    const result = suggestions
      .filter(s => {
        const id1 = contacts.find(c => c.uuid === s.contact1.uuid)?.id;
        const id2 = contacts.find(c => c.uuid === s.contact2.uuid)?.id;
        if (!id1 || !id2) return true;
        const key = `${Math.min(id1, id2)}-${Math.max(id1, id2)}-${s.suggested_type}`;
        return !dismissedSet.has(key);
      })
      .map(s => ({
        ...s,
        type_id: typesByName[s.suggested_type] || null,
      }));

    res.json({ suggestions: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/relationships/suggestions/dismiss — dismiss a suggestion
router.post('/suggestions/dismiss', async (req, res, next) => {
  try {
    const { contact1_uuid, contact2_uuid, suggested_type } = req.body;
    if (!contact1_uuid || !contact2_uuid || !suggested_type) {
      throw new AppError('contact1_uuid, contact2_uuid, and suggested_type required', 400);
    }
    const c1 = await db('contacts').where({ uuid: contact1_uuid, tenant_id: req.tenantId }).first();
    const c2 = await db('contacts').where({ uuid: contact2_uuid, tenant_id: req.tenantId }).first();
    if (!c1 || !c2) throw new AppError('Contact not found', 404);

    await db('dismissed_suggestions').insert({
      tenant_id: req.tenantId,
      contact1_id: Math.min(c1.id, c2.id),
      contact2_id: Math.max(c1.id, c2.id),
      suggested_type,
      dismissed_by: req.user.id,
    }).catch(() => {}); // ignore duplicate

    res.json({ message: 'Suggestion dismissed' });
  } catch (err) { next(err); }
});

// POST /api/relationships/suggestions/restore — undismiss a suggestion
router.post('/suggestions/restore', async (req, res, next) => {
  try {
    const { contact1_uuid, contact2_uuid, suggested_type } = req.body;
    const c1 = await db('contacts').where({ uuid: contact1_uuid, tenant_id: req.tenantId }).first();
    const c2 = await db('contacts').where({ uuid: contact2_uuid, tenant_id: req.tenantId }).first();
    if (!c1 || !c2) throw new AppError('Contact not found', 404);

    await db('dismissed_suggestions')
      .where({ tenant_id: req.tenantId, contact1_id: Math.min(c1.id, c2.id), contact2_id: Math.max(c1.id, c2.id), suggested_type })
      .del();

    res.json({ message: 'Suggestion restored' });
  } catch (err) { next(err); }
});

// GET /api/relationships/suggestions/dismissed — list dismissed suggestions
router.get('/suggestions/dismissed', async (req, res, next) => {
  try {
    const dismissed = await db('dismissed_suggestions')
      .where({ 'dismissed_suggestions.tenant_id': req.tenantId })
      .join('contacts as c1', 'dismissed_suggestions.contact1_id', 'c1.id')
      .join('contacts as c2', 'dismissed_suggestions.contact2_id', 'c2.id')
      .select(
        'c1.uuid as contact1_uuid', 'c1.first_name as contact1_first', 'c1.last_name as contact1_last',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = c1.id AND cp.is_primary = true LIMIT 1) as contact1_avatar`),
        'c2.uuid as contact2_uuid', 'c2.first_name as contact2_first', 'c2.last_name as contact2_last',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = c2.id AND cp.is_primary = true LIMIT 1) as contact2_avatar`),
        'dismissed_suggestions.suggested_type', 'dismissed_suggestions.created_at'
      )
      .orderBy('dismissed_suggestions.created_at', 'desc');

    res.json({ dismissed });
  } catch (err) { next(err); }
});

// GET /api/relationships/family-tree/:contactUuid — generation-based family tree
router.get('/family-tree/:contactUuid', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.contactUuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    const maxGen = Math.min(Math.max(parseInt(req.query.generations) || 3, 1), 6);

    // Get all family relationships (parent/child/spouse/sibling only)
    const familyTypes = await db('relationship_types')
      .whereIn('name', ['parent', 'spouse', 'sibling', 'partner', 'cohabitant', 'boyfriend_girlfriend', 'stepparent'])
      .select('id', 'name', 'inverse_name');
    const typeMap = new Map(familyTypes.map(t => [t.id, t]));
    const typeIds = familyTypes.map(t => t.id);

    const allRels = await db('relationships')
      .where({ tenant_id: req.tenantId })
      .whereIn('relationship_type_id', typeIds)
      .select('contact_id', 'related_contact_id', 'relationship_type_id');

    // Build adjacency with typed edges
    const adj = new Map();
    const addEdge = (from, to, type) => {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from).push({ otherId: to, type });
    };
    for (const r of allRels) {
      const t = typeMap.get(r.relationship_type_id);
      if (!t) continue;
      addEdge(r.contact_id, r.related_contact_id, t.name);
      addEdge(r.related_contact_id, r.contact_id, t.inverse_name);
    }

    const partnerTypes = new Set(['spouse', 'partner', 'boyfriend_girlfriend', 'cohabitant']);
    const parentType = new Set(['parent', 'stepparent']);
    const childType = new Set(['child', 'stepchild']);

    // Assign generations using BFS from root (generation 0)
    // Parents = gen-1, children = gen+1, partners = same gen, siblings = same gen
    const generations = new Map(); // id → generation number
    const visited = new Set();
    const queue = [{ id: contact.id, gen: 0, via: 'root' }];
    generations.set(contact.id, 0);
    visited.add(contact.id);

    // Two-pass BFS: ancestors up, then descendants down from root
    // This prevents cross-traversal (going up then back down into uncle/cousin branches)

    // In adjacency: edge.type is what I AM to the other person
    // "parent" means I am parent of other → other is my child → gen + 1
    // "child" means I am child of other → other is my parent → gen - 1

    // Pass 1: Go UP from root — find my parents (where I am "child" of them)
    const upQueue = [{ id: contact.id, gen: 0 }];
    while (upQueue.length) {
      const { id: cid, gen } = upQueue.shift();
      for (const edge of (adj.get(cid) || [])) {
        if (visited.has(edge.otherId)) continue;
        // I am child of other → other is my parent → gen - 1
        if (childType.has(edge.type)) {
          const nextGen = gen - 1;
          if (Math.abs(nextGen) > maxGen) continue;
          visited.add(edge.otherId);
          generations.set(edge.otherId, nextGen);
          upQueue.push({ id: edge.otherId, gen: nextGen });
        }
      }
    }

    // Pass 2: Go DOWN from root — find my children (where I am "parent" of them)
    const downQueue = [{ id: contact.id, gen: 0 }];
    const downVisited = new Set([contact.id]);
    while (downQueue.length) {
      const { id: cid, gen } = downQueue.shift();
      for (const edge of (adj.get(cid) || [])) {
        if (downVisited.has(edge.otherId)) continue;
        // I am parent of other → other is my child → gen + 1
        if (parentType.has(edge.type)) {
          const nextGen = gen + 1;
          if (nextGen > maxGen) continue;
          downVisited.add(edge.otherId);
          if (!visited.has(edge.otherId)) {
            visited.add(edge.otherId);
            generations.set(edge.otherId, nextGen);
          }
          downQueue.push({ id: edge.otherId, gen: nextGen });
        }
      }
    }

    // Pass 3: Add siblings of root (same generation)
    for (const edge of (adj.get(contact.id) || [])) {
      if (edge.type === 'sibling' && !visited.has(edge.otherId)) {
        visited.add(edge.otherId);
        generations.set(edge.otherId, 0);
      }
    }

    // Pass 4: Add partners of all reachable nodes (same generation, no further traversal)
    const reachableIds = [...visited];
    for (const rid of reachableIds) {
      for (const edge of (adj.get(rid) || [])) {
        if (partnerTypes.has(edge.type) && !visited.has(edge.otherId)) {
          visited.add(edge.otherId);
          generations.set(edge.otherId, generations.get(rid));
        }
      }
    }

    // Fetch contact details
    const contactIds = [...generations.keys()];
    const contacts = contactIds.length ? await db('contacts')
      .whereIn('id', contactIds)
      .whereNull('deleted_at')
      .select('id', 'uuid', 'first_name', 'last_name', 'birth_year', 'deceased_date',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
      ) : [];

    const nodes = contacts.map(c => ({
      id: c.id, uuid: c.uuid, first_name: c.first_name, last_name: c.last_name,
      birth_year: c.birth_year, deceased_date: c.deceased_date, avatar: c.avatar,
      generation: generations.get(c.id),
      is_root: c.id === contact.id,
    }));

    // Build edges between nodes in the tree
    const nodeIds = new Set(contactIds);
    const edges = [];
    const edgeSet = new Set();
    for (const r of allRels) {
      if (!nodeIds.has(r.contact_id) || !nodeIds.has(r.related_contact_id)) continue;
      const t = typeMap.get(r.relationship_type_id);
      if (!t) continue;
      const key = `${Math.min(r.contact_id, r.related_contact_id)}-${Math.max(r.contact_id, r.related_contact_id)}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: r.contact_id, to: r.related_contact_id, type: t.name });
    }

    // Find missing parents (nodes that should have 2 parents but don't)
    const placeholders = [];
    let placeholderId = -100;
    for (const node of nodes) {
      const nodeRels = adj.get(node.id) || [];
      const parentCount = nodeRels.filter(e => parentType.has(e.type) && nodeIds.has(e.otherId)).length;
      const hasPartner = nodeRels.some(e => partnerTypes.has(e.type) && nodeIds.has(e.otherId));

      // If this node has exactly 1 parent and that parent has no partner in the tree, add placeholder
      if (parentCount === 1 && node.generation < 0) {
        const parentId = nodeRels.find(e => parentType.has(e.type) && nodeIds.has(e.otherId))?.otherId;
        if (parentId) {
          const parentRels = adj.get(parentId) || [];
          const parentHasPartner = parentRels.some(e => partnerTypes.has(e.type) && nodeIds.has(e.otherId));
          if (!parentHasPartner) {
            const pid = placeholderId--;
            placeholders.push({
              id: pid, uuid: null, first_name: '?', last_name: '',
              generation: generations.get(parentId),
              is_placeholder: true,
            });
            edges.push({ from: parentId, to: pid, type: 'spouse' });
          }
        }
      }
    }

    res.json({
      rootId: contact.id,
      nodes: [...nodes, ...placeholders],
      edges,
    });
  } catch (err) { next(err); }
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
