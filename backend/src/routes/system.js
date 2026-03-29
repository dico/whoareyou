import { Router } from 'express';
import crypto from 'crypto';
import { AppError } from '../utils/errors.js';
import { getSetting, setSetting } from '../utils/settings.js';
import { getSmtpConfig, verifySmtp, sendEmail } from '../services/email.js';

const router = Router();

// Public endpoint — before auth middleware
router.get('/registration-status', async (req, res) => {
  try {
    res.json({
      enabled: (await getSetting('registration_enabled', 'true')) === 'true',
      password_reset: (await getSetting('password_reset_enabled', 'false')) === 'true',
    });
  } catch {
    res.json({ enabled: true, password_reset: false });
  }
});

// All remaining routes require system admin
router.use((req, res, next) => {
  if (!req.user.isSystemAdmin) {
    return next(new AppError('System admin access required', 403));
  }
  next();
});

// GET /api/system/smtp — get SMTP configuration (password masked)
router.get('/smtp', async (req, res, next) => {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg) {
      return res.json({ configured: false });
    }

    res.json({
      configured: true,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user,
      pass: cfg.pass ? '••••••••' : '',
      from: cfg.from,
      login_notify: (await getSetting('email_login_notify', 'true')) === 'true',
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/system/smtp — save SMTP configuration
router.put('/smtp', async (req, res, next) => {
  try {
    const { host, port, secure, user, pass, from, login_notify } = req.body;

    if (!host) {
      // Clear SMTP config
      for (const key of ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from']) {
        await setSetting(key, '');
      }
      return res.json({ configured: false, message: 'SMTP configuration cleared' });
    }

    await setSetting('smtp_host', host.trim());
    await setSetting('smtp_port', String(port || 587));
    await setSetting('smtp_secure', secure ? 'true' : 'false');
    await setSetting('smtp_user', (user || '').trim());
    // Only update password if it's not the masked placeholder
    if (pass && pass !== '••••••••') {
      await setSetting('smtp_pass', pass);
    }
    await setSetting('smtp_from', (from || '').trim());

    if (login_notify !== undefined) {
      await setSetting('email_login_notify', login_notify ? 'true' : 'false');
    }

    res.json({ configured: true, message: 'SMTP configuration saved' });
  } catch (err) {
    next(err);
  }
});

// POST /api/system/smtp/test — test SMTP connection and send test email
router.post('/smtp/test', async (req, res, next) => {
  try {
    const verify = await verifySmtp();
    if (!verify.ok) {
      return res.json({ ok: false, error: verify.error });
    }

    // Send test email to current user
    const user = await (await import('../db.js')).db('users').where({ id: req.user.id }).first();
    const sent = await sendEmail({
      to: user.email,
      subject: 'WhoareYou — SMTP test',
      text: 'This is a test email from WhoareYou. If you received this, SMTP is configured correctly.',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1C1C1E">SMTP test</h2>
          <p>This is a test email from WhoareYou.</p>
          <p style="color:#34C759">If you received this, SMTP is configured correctly.</p>
        </div>
      `,
    });

    res.json({ ok: sent, message: sent ? `Test email sent to ${user.email}` : 'SMTP not configured' });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── System settings ──

// GET /api/system/settings — get system settings
router.get('/settings', async (req, res, next) => {
  try {
    res.json({
      registration_enabled: (await getSetting('registration_enabled', 'true')) === 'true',
      password_reset_enabled: (await getSetting('password_reset_enabled', 'false')) === 'true',
      portal_enabled: (await getSetting('portal_enabled', 'true')) === 'true',
    });
  } catch (err) { next(err); }
});

// PUT /api/system/settings — update system settings
router.put('/settings', async (req, res, next) => {
  try {
    if (req.body.registration_enabled !== undefined) {
      await setSetting('registration_enabled', req.body.registration_enabled ? 'true' : 'false');
    }
    if (req.body.password_reset_enabled !== undefined) {
      await setSetting('password_reset_enabled', req.body.password_reset_enabled ? 'true' : 'false');
    }
    if (req.body.portal_enabled !== undefined) {
      await setSetting('portal_enabled', req.body.portal_enabled ? 'true' : 'false');
    }
    res.json({ message: 'Settings updated' });
  } catch (err) { next(err); }
});

// ── Tenant management ──

// POST /api/system/tenants — create a new tenant with admin user
router.post('/tenants', async (req, res, next) => {
  try {
    const { tenant_name, admin_first_name, admin_last_name, admin_email, admin_password } = req.body;
    if (!tenant_name?.trim()) throw new AppError('Tenant name is required', 400);
    if (!admin_first_name?.trim()) throw new AppError('Admin first name is required', 400);

    const { v4: uuidv4 } = await import('uuid');
    const bcrypt = await import('bcrypt');
    const { validateEmail, validatePassword } = await import('../utils/validation.js');

    const tenantUuid = uuidv4();
    const userUuid = uuidv4();

    let email = null;
    let passwordHash = null;
    if (admin_email?.trim()) {
      email = validateEmail(admin_email);
      const existing = await (await import('../db.js')).db('users').where({ email }).first();
      if (existing) throw new AppError('Email already in use', 409);
      const password = admin_password || crypto.randomBytes(8).toString('base64url');
      validatePassword(password);
      passwordHash = await bcrypt.hash(password, 12);
    }

    const { db } = await import('../db.js');

    const result = await db.transaction(async (trx) => {
      const [tenantId] = await trx('tenants').insert({
        uuid: tenantUuid,
        name: tenant_name.trim(),
      });

      const [userId] = await trx('users').insert({
        uuid: userUuid,
        tenant_id: tenantId,
        email,
        password_hash: passwordHash,
        first_name: admin_first_name.trim(),
        last_name: admin_last_name?.trim() || null,
        role: 'admin',
        is_active: !!email,
        language: 'nb',
      });

      return { tenantId, tenantUuid, userId, userUuid };
    });

    res.status(201).json({
      tenant: { uuid: tenantUuid, name: tenant_name.trim() },
      admin: { uuid: userUuid, email },
    });
  } catch (err) { next(err); }
});

// GET /api/system/tenants/:uuid/members — list members in a tenant
router.get('/tenants/:uuid/members', async (req, res, next) => {
  try {
    const { db } = await import('../db.js');
    const tenant = await db('tenants').where({ uuid: req.params.uuid }).first();
    if (!tenant) throw new AppError('Tenant not found', 404);

    const members = await db('users')
      .where({ tenant_id: tenant.id })
      .select('uuid', 'first_name', 'last_name', 'email', 'role', 'is_active')
      .orderBy('role', 'desc')
      .orderBy('first_name');

    res.json({ members });
  } catch (err) { next(err); }
});

// POST /api/system/tenants/:uuid/reset-password — reset password for a specific user
router.post('/tenants/:uuid/reset-password', async (req, res, next) => {
  try {
    const { db } = await import('../db.js');
    const bcrypt = await import('bcrypt');
    const { validatePassword } = await import('../utils/validation.js');

    const tenant = await db('tenants').where({ uuid: req.params.uuid }).first();
    if (!tenant) throw new AppError('Tenant not found', 404);

    const { user_uuid, new_password } = req.body;
    if (!new_password) throw new AppError('New password is required', 400);
    validatePassword(new_password);

    // Find target user(s)
    let targets;
    if (user_uuid) {
      const user = await db('users').where({ uuid: user_uuid, tenant_id: tenant.id }).first();
      if (!user) throw new AppError('User not found', 404);
      targets = [user];
    } else {
      // Fallback: all admins
      targets = await db('users').where({ tenant_id: tenant.id, role: 'admin', is_active: true }).select('id', 'email', 'first_name');
      if (!targets.length) throw new AppError('No active admin found', 404);
    }

    const passwordHash = await bcrypt.hash(new_password, 12);

    await db('users').whereIn('id', targets.map(t => t.id)).update({ password_hash: passwordHash });
    await db('sessions').whereIn('user_id', targets.map(t => t.id)).update({ is_active: false });

    // Notify via email
    const { sendEmail: send } = await import('../services/email.js');
    for (const admin of admins) {
      if (admin.email) {
        send({
          to: admin.email,
          subject: 'WhoareYou — Your password has been reset',
          text: `Hi ${admin.first_name},\n\nYour password has been reset by the system administrator.\n\nPlease log in with your new password and change it in your profile.`,
          html: `<p>Hi ${admin.first_name},</p><p>Your password has been reset by the system administrator.</p><p>Please log in with your new password and change it in your profile.</p>`,
        }).catch(() => {});
      }
    }

    res.json({ message: `Password reset for ${admins.length} admin(s)`, admins: admins.map(a => a.email || a.first_name) });
  } catch (err) { next(err); }
});

// POST /api/system/tenants/:uuid/delete — delete a tenant and all its data
router.post('/tenants/:uuid/delete', async (req, res, next) => {
  try {
    const { db } = await import('../db.js');
    const bcrypt = await import('bcrypt');

    // Require admin password
    if (!req.body.admin_password) throw new AppError('Password required', 400);
    const admin = await db('users').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(req.body.admin_password, admin.password_hash);
    if (!valid) throw new AppError('Invalid password', 401);

    const tenant = await db('tenants').where({ uuid: req.params.uuid }).first();
    if (!tenant) throw new AppError('Tenant not found', 404);

    // Cannot delete your own tenant
    if (tenant.id === req.user.tenantId) {
      throw new AppError('Cannot delete your own tenant', 400);
    }

    // Delete all tenant data (cascade handles most, but explicit for safety)
    await db.transaction(async (trx) => {
      await trx('sessions').whereIn('user_id', trx('users').where({ tenant_id: tenant.id }).select('id')).del();
      await trx('users').where({ tenant_id: tenant.id }).del();
      await trx('tenants').where({ id: tenant.id }).del();
    });

    // Clean up uploads directory
    const fs = await import('fs/promises');
    const path = await import('path');
    const { config } = await import('../config/index.js');
    const tenantUploads = path.join(config.uploads.dir, 'contacts');
    // Files will be orphaned but not a security risk — can be cleaned manually

    res.json({ message: 'Tenant deleted' });
  } catch (err) { next(err); }
});

// ── IP Security Settings ──

// GET /api/system/ip-security — get IP security config
router.get('/ip-security', async (req, res, next) => {
  try {
    if (!req.user.isSystemAdmin) throw new AppError('System admin required', 403);
    res.json({
      ipgeo_api_key: await getSetting('ipgeo_api_key', ''),
      login_country_whitelist: await getSetting('login_country_whitelist', ''),
      login_ip_whitelist: await getSetting('login_ip_whitelist', ''),
      client_ip: (req.ip || req.headers['x-forwarded-for'] || '').replace(/^::ffff:/, ''),
    });
  } catch (err) { next(err); }
});

// PUT /api/system/ip-security — update IP security config
router.put('/ip-security', async (req, res, next) => {
  try {
    if (!req.user.isSystemAdmin) throw new AppError('System admin required', 403);

    if (req.body.ipgeo_api_key !== undefined) await setSetting('ipgeo_api_key', req.body.ipgeo_api_key.trim());
    if (req.body.login_country_whitelist !== undefined) await setSetting('login_country_whitelist', req.body.login_country_whitelist.trim().toUpperCase());
    if (req.body.login_ip_whitelist !== undefined) await setSetting('login_ip_whitelist', req.body.login_ip_whitelist.trim());

    res.json({ message: 'IP security settings updated' });
  } catch (err) { next(err); }
});

// POST /api/system/ip-security/test — test geolocation lookup
router.post('/ip-security/test', async (req, res, next) => {
  try {
    if (!req.user.isSystemAdmin) throw new AppError('System admin required', 403);

    const apiKey = req.body.api_key || await getSetting('ipgeo_api_key');
    if (!apiKey) throw new AppError('No API key configured', 400);

    // Use provided IP, or fall back to client IP, or use 8.8.8.8 for local IPs
    let ip = req.body.ip || (req.ip || req.headers['x-forwarded-for'] || '').replace(/^::ffff:/, '');
    const isLocal = !ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');

    if (isLocal && !req.body.ip) {
      // Can't test local IP — use a known external IP to verify the API key works
      ip = '8.8.8.8';
    }

    const { lookupIp } = await import('../services/geolocation.js');
    const result = await lookupIp(ip, apiKey);

    if (!result) throw new AppError('Lookup failed — check your API key', 400);
    res.json({ ...result, is_local_network: isLocal, tested_ip: ip });
  } catch (err) { next(err); }
});

export default router;
