import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { logAuditFromReq } from '../utils/audit.js';
import {
  generateApiToken, hashApiToken,
  API_TOKEN_SCOPES, API_TOKEN_LIFETIMES, API_TOKEN_PREFIX,
} from '../utils/api-token-policy.js';

/**
 * Manage API tokens for AI agents / scripts. Admin only, and only from a
 * normal login session — an API token can never reach these routes (the
 * policy in utils/api-token-policy.js doesn't list them).
 */
const router = Router();

router.use((req, res, next) => {
  if (req.apiToken) return next(new AppError('Not available to API tokens', 403));
  if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
    return next(new AppError('Admin access required', 403));
  }
  next();
});

function serialize(row) {
  const now = new Date();
  let status = 'active';
  if (row.revoked_at) status = 'revoked';
  else if (new Date(row.expires_at) <= now) status = 'expired';
  return {
    uuid: row.uuid,
    name: row.name,
    scope: row.scope,
    token_prefix: row.token_prefix,
    status,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    last_used_ip: row.last_used_ip,
    request_count: row.request_count,
    created_at: row.created_at,
  };
}

// GET /api/api-tokens — the user's tokens in this tenant (newest first)
router.get('/', async (req, res, next) => {
  try {
    const rows = await db('api_tokens')
      .where({ tenant_id: req.tenantId, user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({ tokens: rows.map(serialize), lifetimes: API_TOKEN_LIFETIMES, scopes: API_TOKEN_SCOPES });
  } catch (err) { next(err); }
});

// POST /api/api-tokens { name, scope, hours } → { token (shown once), ...meta }
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 100);
    const scope = req.body?.scope;
    const hours = Number(req.body?.hours);
    if (!name) throw new AppError('Name is required', 400);
    if (!API_TOKEN_SCOPES.includes(scope)) throw new AppError('Invalid scope', 400);
    if (!API_TOKEN_LIFETIMES.includes(hours)) throw new AppError('Invalid lifetime', 400);

    const token = generateApiToken();
    const row = {
      uuid: uuidv4(),
      tenant_id: req.tenantId,
      user_id: req.user.id,
      name,
      token_hash: hashApiToken(token),
      token_prefix: token.slice(0, API_TOKEN_PREFIX.length + 6),
      scope,
      expires_at: new Date(Date.now() + hours * 3600 * 1000),
    };
    const [id] = await db('api_tokens').insert(row);

    logAuditFromReq(req, {
      tenantId: req.tenantId, userId: req.user.id,
      action: 'api_token.create', entityType: 'api_token', entityId: id,
      details: { name, scope, hours },
    });

    const saved = await db('api_tokens').where({ id }).first();
    res.status(201).json({ ...serialize(saved), token });
  } catch (err) { next(err); }
});

// POST /api/api-tokens/:uuid/revoke
router.post('/:uuid/revoke', async (req, res, next) => {
  try {
    const row = await db('api_tokens')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!row) throw new AppError('Token not found', 404);
    if (!row.revoked_at) {
      await db('api_tokens').where({ id: row.id }).update({ revoked_at: db.fn.now() });
      logAuditFromReq(req, {
        tenantId: req.tenantId, userId: req.user.id,
        action: 'api_token.revoke', entityType: 'api_token', entityId: row.id,
        details: { name: row.name },
      });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/api-tokens/:uuid/activity — what the token did (from audit_log)
router.get('/:uuid/activity', async (req, res, next) => {
  try {
    const row = await db('api_tokens')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId, user_id: req.user.id })
      .first();
    if (!row) throw new AppError('Token not found', 404);
    const entries = await db('audit_log')
      .where({ tenant_id: req.tenantId, entity_type: 'api_token', entity_id: row.id })
      .orderBy('created_at', 'desc')
      .limit(500)
      .select('action', 'details', 'ip_address', 'created_at');
    res.json({
      activity: entries.map(e => ({
        ...e,
        details: typeof e.details === 'string' ? JSON.parse(e.details) : e.details,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
