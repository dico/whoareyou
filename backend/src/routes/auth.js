import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { validateEmail, validateRequired, validatePassword } from '../utils/validation.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 12;

function generateToken(user, activeTenantId = null) {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: activeTenantId || user.tenant_id,
      homeTenantId: user.tenant_id,
      isSystemAdmin: !!user.is_system_admin,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

// POST /api/auth/register
// Creates a new tenant + admin user (first user in a household)
router.post('/register', async (req, res, next) => {
  try {
    validateRequired(['email', 'password', 'first_name', 'last_name'], req.body);
    const email = validateEmail(req.body.email);
    validatePassword(req.body.password);

    const { password, first_name, last_name, tenant_name } = req.body;

    // Check if email already exists
    const existing = await db('users').where({ email }).first();
    if (existing) {
      throw new AppError('Email already registered', 409);
    }

    // First user ever becomes system admin
    const userCount = await db('users').count('id as count').first();
    const isFirstUser = userCount.count === 0;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const tenantUuid = uuidv4();
    const userUuid = uuidv4();

    // Create tenant + user in a transaction
    const user = await db.transaction(async (trx) => {
      const [tenantId] = await trx('tenants').insert({
        uuid: tenantUuid,
        name: tenant_name || `${first_name}'s Family`,
      });

      const [userId] = await trx('users').insert({
        uuid: userUuid,
        tenant_id: tenantId,
        email,
        password_hash: passwordHash,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        role: 'admin',
        language: req.body.language || 'en',
        is_system_admin: isFirstUser,
      });

      return {
        id: userId, tenant_id: tenantId, uuid: userUuid, email, first_name, last_name,
        role: 'admin', is_system_admin: isFirstUser,
      };
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        uuid: user.uuid,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_system_admin: user.is_system_admin,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    validateRequired(['email', 'password'], req.body);
    const email = validateEmail(req.body.email);

    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const valid = await bcrypt.compare(req.body.password, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });

    const token = generateToken(user);

    res.json({
      token,
      user: {
        uuid: user.uuid,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_system_admin: !!user.is_system_admin,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db('users')
      .join('tenants', 'users.tenant_id', 'tenants.id')
      .where('users.id', req.user.id)
      .select(
        'users.uuid',
        'users.email',
        'users.first_name',
        'users.last_name',
        'users.role',
        'users.is_system_admin',
        'users.language',
        'tenants.name as tenant_name',
        'tenants.uuid as tenant_uuid'
      )
      .first();

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/language — update user language
router.patch('/language', authenticate, async (req, res, next) => {
  try {
    const { language } = req.body;
    if (!language) throw new AppError('language is required');

    await db('users').where({ id: req.user.id }).update({ language });
    res.json({ language });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh — get a new token
router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    const token = generateToken(user);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/tenants — list tenants (system admin only)
router.get('/tenants', authenticate, async (req, res, next) => {
  try {
    if (!req.user.isSystemAdmin) {
      throw new AppError('System admin access required', 403);
    }

    const tenants = await db('tenants')
      .select('tenants.uuid', 'tenants.name', 'tenants.created_at')
      .select(db.raw('(SELECT COUNT(*) FROM users WHERE users.tenant_id = tenants.id) as user_count'))
      .select(db.raw('(SELECT COUNT(*) FROM contacts WHERE contacts.tenant_id = tenants.id AND contacts.deleted_at IS NULL) as contact_count'))
      .orderBy('tenants.name');

    res.json({ tenants });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/switch-tenant — switch active tenant (system admin only)
router.post('/switch-tenant', authenticate, async (req, res, next) => {
  try {
    if (!req.user.isSystemAdmin) {
      throw new AppError('System admin access required', 403);
    }

    const { tenant_uuid } = req.body;
    if (!tenant_uuid) {
      throw new AppError('tenant_uuid is required');
    }

    const tenant = await db('tenants').where({ uuid: tenant_uuid }).first();
    if (!tenant) {
      throw new AppError('Tenant not found', 404);
    }

    const user = await db('users').where({ id: req.user.id }).first();
    const token = generateToken(user, tenant.id);

    res.json({
      token,
      tenant: {
        uuid: tenant.uuid,
        name: tenant.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
