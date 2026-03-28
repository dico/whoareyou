import { Router } from 'express';
import { AppError } from '../utils/errors.js';
import { getSetting, setSetting } from '../utils/settings.js';
import { getSmtpConfig, verifySmtp, sendEmail } from '../services/email.js';

const router = Router();

// All routes require system admin
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

export default router;
