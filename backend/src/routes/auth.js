import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { validateEmail, validateRequired, validatePassword } from '../utils/validation.js';
import { authenticate } from '../middleware/auth.js';
import { createSession, hashToken, generateAccessToken, revokeSession } from '../utils/session.js';
import { isTrustedIp, hasTrustedIpConfig } from '../utils/ip.js';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const router = Router();
const SALT_ROUNDS = 12;

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

    const { accessToken, refreshToken, sessionUuid } = await createSession(user, req);

    res.status(201).json({
      token: accessToken,
      refreshToken,
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

    // Check if 2FA is required
    const clientIp = (req.ip || req.headers['x-forwarded-for'] || '').replace(/^::ffff:/, '');
    const trusted = await isTrustedIp(clientIp, user.id);
    const hasIpConfig = await hasTrustedIpConfig(user.id);

    if (user.totp_enabled && !trusted) {
      // 2FA required — return a short-lived challenge token instead of full session
      const challengeToken = jwt.sign(
        { userId: user.id, purpose: '2fa' },
        config.jwt.secret,
        { expiresIn: '5m' }
      );
      return res.json({ requires_2fa: true, challengeToken });
    }

    if (!user.totp_enabled && !trusted && hasIpConfig) {
      // External login without 2FA set up — require setup
      const challengeToken = jwt.sign(
        { userId: user.id, purpose: '2fa_setup_required' },
        config.jwt.secret,
        { expiresIn: '10m' }
      );
      return res.json({ requires_2fa_setup: true, challengeToken });
    }

    // Update last login
    await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });

    const { accessToken, refreshToken, sessionUuid } = await createSession(user, req, null, { isTrustedIp: trusted });

    res.json({
      token: accessToken,
      refreshToken,
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

// POST /api/auth/refresh — exchange refresh token for new access token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    const tokenHash = hashToken(refreshToken);
    const session = await db('sessions')
      .where({ refresh_token_hash: tokenHash, is_active: true })
      .where('expires_at', '>', db.fn.now())
      .first();

    if (!session) {
      throw new AppError('Invalid or expired session', 401);
    }

    const user = await db('users').where({ id: session.user_id, is_active: true }).first();
    if (!user) {
      throw new AppError('User not found or inactive', 401);
    }

    // If session was created from trusted IP, verify IP is still trusted
    if (session.is_trusted_ip) {
      const clientIp = (req.ip || req.headers['x-forwarded-for'] || '').replace(/^::ffff:/, '');
      const stillTrusted = await isTrustedIp(clientIp, user.id);
      if (!stillTrusted) {
        // IP changed to untrusted — revoke session, require re-login
        await db('sessions').where({ id: session.id }).update({ is_active: false });
        throw new AppError('Session restricted to trusted network', 401);
      }
    }

    // Update last activity
    await db('sessions').where({ id: session.id }).update({ last_activity_at: db.fn.now() });

    // Generate new access token (keep same session)
    const accessToken = generateAccessToken(user, session.uuid);

    res.json({ token: accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — revoke current session
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Revoke by refresh token
      const tokenHash = hashToken(refreshToken);
      await db('sessions').where({ refresh_token_hash: tokenHash }).update({ is_active: false });
    }

    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// ── Two-Factor Authentication (TOTP) ──

// POST /api/auth/2fa/verify — verify TOTP code during login (completes 2FA challenge)
router.post('/2fa/verify', async (req, res, next) => {
  try {
    const { challengeToken, code } = req.body;
    if (!challengeToken || !code) throw new AppError('Challenge token and code required', 400);

    let payload;
    try {
      payload = jwt.verify(challengeToken, config.jwt.secret);
    } catch {
      throw new AppError('Invalid or expired challenge', 401);
    }

    if (payload.purpose !== '2fa') throw new AppError('Invalid challenge type', 400);

    const user = await db('users').where({ id: payload.userId, is_active: true }).first();
    if (!user || !user.totp_enabled || !user.totp_secret) {
      throw new AppError('2FA not configured', 400);
    }

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totp_secret), digits: 6, period: 30 });
    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      // Try backup codes
      let backupCodes = [];
      try { backupCodes = JSON.parse(user.totp_backup_codes || '[]'); } catch {}
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const idx = backupCodes.indexOf(codeHash);
      if (idx === -1) throw new AppError('Invalid code', 401);

      // Remove used backup code
      backupCodes.splice(idx, 1);
      await db('users').where({ id: user.id }).update({ totp_backup_codes: JSON.stringify(backupCodes) });
    }

    await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });
    const { accessToken, refreshToken } = await createSession(user, req);

    res.json({
      token: accessToken,
      refreshToken,
      user: {
        uuid: user.uuid, email: user.email, first_name: user.first_name,
        last_name: user.last_name, role: user.role, is_system_admin: !!user.is_system_admin,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/setup — generate TOTP secret and QR code
router.post('/2fa/setup', authenticate, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    if (user.totp_enabled) throw new AppError('2FA is already enabled', 400);

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'WhoareYou',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    // Store secret (not yet enabled — user must verify first)
    await db('users').where({ id: user.id }).update({ totp_secret: secret.base32 });

    const uri = totp.toString();
    const qrCodeUrl = await QRCode.toDataURL(uri);

    res.json({ secret: secret.base32, qrCode: qrCodeUrl, uri });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/enable — verify code and enable 2FA
router.post('/2fa/enable', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) throw new AppError('Code required', 400);

    const user = await db('users').where({ id: req.user.id }).first();
    if (!user.totp_secret) throw new AppError('Run setup first', 400);
    if (user.totp_enabled) throw new AppError('2FA is already enabled', 400);

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totp_secret), digits: 6, period: 30 });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) throw new AppError('Invalid code', 400);

    // Generate backup codes
    const backupCodes = [];
    const backupCodesPlain = [];
    for (let i = 0; i < 8; i++) {
      const plain = crypto.randomBytes(4).toString('hex');
      backupCodesPlain.push(plain);
      backupCodes.push(crypto.createHash('sha256').update(plain).digest('hex'));
    }

    await db('users').where({ id: user.id }).update({
      totp_enabled: true,
      totp_backup_codes: JSON.stringify(backupCodes),
    });

    res.json({ enabled: true, backupCodes: backupCodesPlain });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/disable — disable 2FA (requires password)
router.post('/2fa/disable', authenticate, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) throw new AppError('Password required', 400);

    const user = await db('users').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Invalid password', 401);

    await db('users').where({ id: user.id }).update({
      totp_enabled: false,
      totp_secret: null,
      totp_backup_codes: null,
    });

    res.json({ disabled: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/2fa/status — check if current user has 2FA enabled
router.get('/2fa/status', authenticate, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).select('totp_enabled').first();
    res.json({ enabled: !!user.totp_enabled });
  } catch (err) {
    next(err);
  }
});

// ── Passkeys (WebAuthn) ──

// Temporary challenge store (in-memory, keyed by user ID or session)
const challengeStore = new Map();

// POST /api/auth/passkey/register-options — start passkey registration
router.post('/passkey/register-options', authenticate, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    const existingPasskeys = await db('passkeys').where({ user_id: user.id });

    const options = await generateRegistrationOptions({
      rpName: config.webauthn.rpName,
      rpID: config.webauthn.rpID,
      userID: new TextEncoder().encode(user.uuid),
      userName: user.email,
      userDisplayName: `${user.first_name} ${user.last_name || ''}`.trim(),
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map(pk => ({
        id: pk.credential_id,
        transports: JSON.parse(pk.transports || '[]'),
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challengeStore.set(`reg_${req.user.id}`, { challenge: options.challenge, expires: Date.now() + 5 * 60 * 1000 });

    res.json(options);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/passkey/register — verify and store passkey
router.post('/passkey/register', authenticate, async (req, res, next) => {
  try {
    const stored = challengeStore.get(`reg_${req.user.id}`);
    if (!stored || Date.now() > stored.expires) throw new AppError('Challenge expired', 400);

    const verification = await verifyRegistrationResponse({
      response: req.body.credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: config.webauthn.origin,
      expectedRPID: config.webauthn.rpID,
    });

    challengeStore.delete(`reg_${req.user.id}`);

    if (!verification.verified || !verification.registrationInfo) {
      throw new AppError('Verification failed', 400);
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    await db('passkeys').insert({
      user_id: req.user.id,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: JSON.stringify(credential.transports || []),
      device_name: req.body.deviceName || credentialDeviceType || 'Passkey',
    });

    res.json({ registered: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/passkeys — list user's passkeys
router.get('/passkeys', authenticate, async (req, res, next) => {
  try {
    const passkeys = await db('passkeys')
      .where({ user_id: req.user.id })
      .select('id', 'device_name', 'last_used_at', 'created_at')
      .orderBy('created_at', 'desc');

    res.json({ passkeys });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/passkeys/:id — remove a passkey
router.delete('/passkeys/:id', authenticate, async (req, res, next) => {
  try {
    const deleted = await db('passkeys')
      .where({ id: req.params.id, user_id: req.user.id })
      .del();

    if (!deleted) throw new AppError('Passkey not found', 404);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/passkey/login-options — start passkey authentication (no auth required)
router.post('/passkey/login-options', async (req, res, next) => {
  try {
    // If email provided, get user's passkeys for allowCredentials
    let allowCredentials;
    if (req.body.email) {
      const user = await db('users').where({ email: req.body.email.toLowerCase().trim(), is_active: true }).first();
      if (user) {
        const passkeys = await db('passkeys').where({ user_id: user.id });
        allowCredentials = passkeys.map(pk => ({
          id: pk.credential_id,
          transports: JSON.parse(pk.transports || '[]'),
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: config.webauthn.rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

    challengeStore.set(`auth_${options.challenge}`, { challenge: options.challenge, expires: Date.now() + 5 * 60 * 1000 });

    res.json(options);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/passkey/login — verify passkey and create session
router.post('/passkey/login', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) throw new AppError('Credential required', 400);

    // Find passkey by credential ID
    const passkey = await db('passkeys').where({ credential_id: credential.id }).first();
    if (!passkey) throw new AppError('Passkey not found', 401);

    const user = await db('users').where({ id: passkey.user_id, is_active: true }).first();
    if (!user) throw new AppError('User not found or inactive', 401);

    // Find the challenge
    const stored = challengeStore.get(`auth_${req.body.challenge}`);
    if (!stored || Date.now() > stored.expires) throw new AppError('Challenge expired', 400);

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: config.webauthn.origin,
      expectedRPID: config.webauthn.rpID,
      credential: {
        id: passkey.credential_id,
        publicKey: Buffer.from(passkey.public_key, 'base64url'),
        counter: passkey.counter,
        transports: JSON.parse(passkey.transports || '[]'),
      },
    });

    challengeStore.delete(`auth_${req.body.challenge}`);

    if (!verification.verified) throw new AppError('Verification failed', 401);

    // Update counter and last used
    await db('passkeys').where({ id: passkey.id }).update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: db.fn.now(),
    });

    await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });

    // Passkey login bypasses 2FA (passkey IS the second factor)
    const { accessToken, refreshToken } = await createSession(user, req);

    res.json({
      token: accessToken,
      refreshToken,
      user: {
        uuid: user.uuid, email: user.email, first_name: user.first_name,
        last_name: user.last_name, role: user.role, is_system_admin: !!user.is_system_admin,
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

// PUT /api/auth/profile — update user profile
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.first_name !== undefined) updates.first_name = req.body.first_name.trim();
    if (req.body.last_name !== undefined) updates.last_name = req.body.last_name.trim();
    if (req.body.email !== undefined) {
      const email = validateEmail(req.body.email);
      const existing = await db('users').where({ email }).whereNot({ id: req.user.id }).first();
      if (existing) throw new AppError('Email already in use', 409);
      updates.email = email;
    }

    if (Object.keys(updates).length) {
      await db('users').where({ id: req.user.id }).update(updates);
    }

    const user = await db('users')
      .join('tenants', 'users.tenant_id', 'tenants.id')
      .where('users.id', req.user.id)
      .select('users.uuid', 'users.email', 'users.first_name', 'users.last_name',
        'users.role', 'users.is_system_admin', 'users.language',
        'tenants.name as tenant_name', 'tenants.uuid as tenant_uuid')
      .first();

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password — change password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    validateRequired(['current_password', 'new_password'], req.body);
    validatePassword(req.body.new_password);

    const user = await db('users').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(req.body.current_password, user.password_hash);
    if (!valid) {
      throw new AppError('Current password is incorrect', 401);
    }

    const passwordHash = await bcrypt.hash(req.body.new_password, SALT_ROUNDS);
    await db('users').where({ id: req.user.id }).update({ password_hash: passwordHash });

    // Revoke all other sessions on password change
    if (req.user.sessionId) {
      await db('sessions')
        .where({ user_id: req.user.id, is_active: true })
        .whereNot({ uuid: req.user.sessionId })
        .update({ is_active: false });
    }

    res.json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/language — update user language
router.patch('/language', authenticate, async (req, res, next) => {
  try {
    const { language } = req.body;
    const allowedLanguages = ['en', 'nb'];
    if (!language || !allowedLanguages.includes(language)) {
      throw new AppError('Invalid language. Allowed: ' + allowedLanguages.join(', '));
    }

    await db('users').where({ id: req.user.id }).update({ language });
    res.json({ language });
  } catch (err) {
    next(err);
  }
});

// ── Session management ──

// GET /api/auth/sessions — list active sessions
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const sessions = await db('sessions')
      .where({ user_id: req.user.id, is_active: true })
      .where('expires_at', '>', db.fn.now())
      .select('uuid', 'device_label', 'ip_address', 'last_activity_at', 'created_at')
      .orderBy('last_activity_at', 'desc');

    // Mark current session
    const currentSid = req.user.sessionId;
    const result = sessions.map(s => ({
      ...s,
      is_current: s.uuid === currentSid,
    }));

    res.json({ sessions: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/sessions/:uuid — revoke a specific session
router.delete('/sessions/:uuid', authenticate, async (req, res, next) => {
  try {
    if (req.params.uuid === req.user.sessionId) {
      throw new AppError('Cannot revoke current session — use logout instead', 400);
    }

    const revoked = await revokeSession(req.params.uuid, req.user.id);
    if (!revoked) throw new AppError('Session not found', 404);

    res.json({ message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/sessions — revoke all sessions except current
router.delete('/sessions', authenticate, async (req, res, next) => {
  try {
    await db('sessions')
      .where({ user_id: req.user.id, is_active: true })
      .whereNot({ uuid: req.user.sessionId })
      .update({ is_active: false });

    res.json({ message: 'All other sessions revoked' });
  } catch (err) {
    next(err);
  }
});

// ── Tenant management ──

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
    const accessToken = generateAccessToken(user, req.user.sessionId, tenant.id);

    res.json({
      token: accessToken,
      tenant: {
        uuid: tenant.uuid,
        name: tenant.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Tenant security settings ──

// GET /api/auth/tenant/security — get tenant security settings
router.get('/tenant/security', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
      throw new AppError('Admin access required', 403);
    }

    const tenant = await db('tenants').where({ id: req.user.tenantId }).select('trusted_ip_ranges').first();

    res.json({
      trusted_ip_ranges: tenant?.trusted_ip_ranges || '',
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/tenant/security — update tenant security settings
router.put('/tenant/security', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
      throw new AppError('Admin access required', 403);
    }

    const { trusted_ip_ranges } = req.body;

    await db('tenants').where({ id: req.user.tenantId }).update({
      trusted_ip_ranges: trusted_ip_ranges || null,
    });

    res.json({ message: 'Security settings updated', trusted_ip_ranges: trusted_ip_ranges || '' });
  } catch (err) {
    next(err);
  }
});

// ── Tenant member management ──

// GET /api/auth/members — list members in current tenant
router.get('/members', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
      throw new AppError('Admin access required', 403);
    }

    const members = await db('users')
      .where({ 'users.tenant_id': req.user.tenantId })
      .leftJoin('contacts', 'users.linked_contact_id', 'contacts.id')
      .select(
        'users.uuid', 'users.email', 'users.first_name', 'users.last_name',
        'users.role', 'users.is_active', 'users.is_system_admin',
        'users.last_login_at', 'users.created_at',
        'contacts.uuid as linked_contact_uuid',
        'contacts.first_name as linked_contact_first_name',
        'contacts.last_name as linked_contact_last_name'
      )
      .orderBy('users.first_name');

    res.json({ members });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/invite — invite new member to tenant
router.post('/invite', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
      throw new AppError('Admin access required', 403);
    }

    validateRequired(['email', 'password', 'first_name', 'last_name'], req.body);
    const email = validateEmail(req.body.email);
    validatePassword(req.body.password);

    const existing = await db('users').where({ email }).first();
    if (existing) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const userUuid = uuidv4();

    const [userId] = await db('users').insert({
      uuid: userUuid,
      tenant_id: req.user.tenantId,
      email,
      password_hash: passwordHash,
      first_name: req.body.first_name.trim(),
      last_name: req.body.last_name.trim(),
      role: req.body.role === 'admin' ? 'admin' : 'member',
      language: req.body.language || 'en',
    });

    const user = await db('users').where({ id: userId }).first();

    res.status(201).json({
      member: {
        uuid: user.uuid,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/members/:uuid — update member (role, active, linked contact)
router.put('/members/:uuid', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
      throw new AppError('Admin access required', 403);
    }

    const member = await db('users')
      .where({ uuid: req.params.uuid, tenant_id: req.user.tenantId })
      .first();
    if (!member) throw new AppError('Member not found', 404);

    // Don't allow deactivating yourself
    if (member.id === req.user.id && req.body.is_active === false) {
      throw new AppError('Cannot deactivate yourself', 400);
    }

    const updates = {};
    if (req.body.role !== undefined) updates.role = req.body.role === 'admin' ? 'admin' : 'member';
    if (req.body.is_active !== undefined) updates.is_active = !!req.body.is_active;

    // Link to contact
    if (req.body.linked_contact_uuid !== undefined) {
      if (req.body.linked_contact_uuid === null) {
        updates.linked_contact_id = null;
      } else {
        const contact = await db('contacts')
          .where({ uuid: req.body.linked_contact_uuid, tenant_id: req.user.tenantId })
          .whereNull('deleted_at')
          .first();
        if (contact) updates.linked_contact_id = contact.id;
      }
    }

    if (Object.keys(updates).length) {
      await db('users').where({ id: member.id }).update(updates);
    }

    res.json({ message: 'Member updated' });
  } catch (err) {
    next(err);
  }
});

export default router;
