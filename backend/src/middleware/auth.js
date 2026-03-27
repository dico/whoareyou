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

    req.user = {
      id: user.id,
      uuid: user.uuid,
      homeTenantId: user.tenant_id,
      // Active tenant: from token (system admin may have switched), fallback to home
      tenantId: payload.tenantId || user.tenant_id,
      email: user.email,
      role: user.role,
      isSystemAdmin: !!user.is_system_admin,
    };

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
