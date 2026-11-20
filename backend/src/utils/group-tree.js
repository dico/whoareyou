import { db } from '../db.js';

// Group hierarchy helpers (companies.parent_id). Trees are small (a family's
// schools/clubs/classes), so we load the whole tenant's tree in one query and
// walk it in memory instead of recursive SQL.

export async function loadGroupTree(tenantId) {
  const rows = await db('companies').where({ tenant_id: tenantId }).select('id', 'uuid', 'name', 'parent_id');
  const byId = new Map(rows.map(r => [r.id, r]));
  const childrenOf = new Map();
  for (const r of rows) {
    if (!r.parent_id || !byId.has(r.parent_id)) continue;
    if (!childrenOf.has(r.parent_id)) childrenOf.set(r.parent_id, []);
    childrenOf.get(r.parent_id).push(r.id);
  }
  return { byId, childrenOf };
}

/** The group itself plus every group below it. */
export function descendantIds(tree, id) {
  const out = [];
  const stack = [id];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue; // guards against legacy cycles
    seen.add(cur);
    out.push(cur);
    stack.push(...(tree.childrenOf.get(cur) || []));
  }
  return out;
}

/** Ancestors from the root down to the direct parent: [{ uuid, name }]. */
export function ancestorPath(tree, id) {
  const path = [];
  const seen = new Set([id]);
  let cur = tree.byId.get(id);
  while (cur?.parent_id && !seen.has(cur.parent_id)) {
    seen.add(cur.parent_id);
    cur = tree.byId.get(cur.parent_id);
    if (!cur) break;
    path.unshift({ uuid: cur.uuid, name: cur.name });
  }
  return path;
}

/** True if making `parentId` the parent of `id` would create a loop. */
export function wouldCreateCycle(tree, id, parentId) {
  return descendantIds(tree, id).includes(parentId);
}
