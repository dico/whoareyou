import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { isApiToken, hashApiToken, checkApiTokenAccess } from '../utils/api-token-policy.js';
import { logAuditFromReq } from '../utils/audit.js';
import { getClientIp } from '../utils/ip.js';

/**
 * API tokens (way_…) for AI agents and scripts. Acts as the creating user,
 * limited by utils/api-token-policy.js. Sensitive content is always hidden.
 * Every request is written to audit_log as api_token.read / api_token.write.
 */
async function authenticateApiToken(req, res, next, raw) {
  try {
    const row = await db('api_tokens')
      .where({ token_hash: hashApiToken(raw) })
      .first();
    if (!row || row.revoked_at || new Date(row.expires_at) <= new Date()) {
      return next(new AppError('Invalid or expired API token', 401));
    }

    const user = await db('users').where({ id: row.user_id, is_active: true }).first();
    if (!user) return next(new AppError('User not found or inactive', 401));

    // Token is bound to the tenant it was created in
    if (row.tenant_id !== user.tenant_id) {
      const membership = await db('tenant_members')
        .where({ user_id: user.id, tenant_id: row.tenant_id }).first();
      if (!membership) return next(new AppError('Tenant membership revoked', 403));
    }

    const denied = checkApiTokenAccess(req.method, req.originalUrl, row.scope);
    if (denied) {
      logAuditFromReq(req, {
        tenantId: row.tenant_id, userId: user.id,
        action: 'api_token.denied', entityType: 'api_token', entityId: row.id,
        details: { token: row.name, method: req.method, path: req.originalUrl.split('?')[0], reason: denied },
      });
      return next(new AppError(denied, 403));
    }

    req.user = {
      id: user.id,
      uuid: user.uuid,
      homeTenantId: user.tenant_id,
      tenantId: row.tenant_id,
      email: user.email,
      role: user.role,
      isSystemAdmin: false,
      sessionId: null,
    };
    req.showSensitive = false;
    req.apiToken = { id: row.id, name: row.name, scope: row.scope };

    const ip = getClientIp(req);
    db('api_tokens').where({ id: row.id })
      .update({ last_used_at: db.fn.now(), last_used_ip: ip, request_count: db.raw('request_count + 1') })
      .catch(err => console.error('[api-token] usage update failed:', err.message));

    res.on('finish', () => {
      const isRead = req.method === 'GET' || req.method === 'HEAD';
      logAuditFromReq(req, {
        tenantId: row.tenant_id, userId: user.id,
        action: isRead ? 'api_token.read' : 'api_token.write',
        entityType: 'api_token', entityId: row.id,
        details: { token: row.name, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode },
      });
    });

    next();
  } catch (err) {
    next(err);
  }
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  if (isApiToken(header.slice(7))) {
    return authenticateApiToken(req, res, next, header.slice(7));
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret);

    const user = await db('users')
      .where({ id: payload.userId, is_active: true })
      .first();

    if (!user) {
      return next(new AppError('User not found or inactive', 401));
    }

    const activeTenantId = payload.tenantId || user.tenant_id;

    // Verify user is a member of the active tenant
    if (activeTenantId !== user.tenant_id) {
      const membership = await db('tenant_members')
        .where({ user_id: user.id, tenant_id: activeTenantId })
        .first();
      if (!membership) {
        return next(new AppError('Tenant membership revoked', 403));
      }
    }

    // Read sensitive-mode state from the session row. The toggle lives on
    // the session, not the user, so each device has its own state. A NULL
    // or past timestamp means sensitive content is hidden (the default).
    let showSensitive = false;
    if (payload.sid) {
      const session = await db('sessions')
        .where({ uuid: payload.sid })
        .select('show_sensitive_until')
        .first();
      if (session?.show_sensitive_until) {
        showSensitive = new Date(session.show_sensitive_until) > new Date();
      }
    }

    req.user = {
      id: user.id,
      uuid: user.uuid,
      homeTenantId: user.tenant_id,
      tenantId: activeTenantId,
      email: user.email,
      role: user.role,
      isSystemAdmin: !!user.is_system_admin,
      sessionId: payload.sid || null,
    };
    req.showSensitive = showSensitive;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    next(new AppError('Invalid token', 401));
  }
}

// Middleware: require system admin
export function requireSystemAdmin(req, res, next) {
  if (!req.user.isSystemAdmin) {
    return next(new AppError('System admin access required', 403));
  }
  next();
}
