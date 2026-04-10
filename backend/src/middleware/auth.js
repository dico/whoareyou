import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
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
