import nodemailer from 'nodemailer';
import { getSetting } from '../utils/settings.js';

let transporter = null;
let transporterConfigHash = null;

/**
 * Get SMTP config from system_settings.
 * Returns null if not configured.
 */
export async function getSmtpConfig() {
  const host = await getSetting('smtp_host');
  if (!host) return null;

  return {
    host,
    port: parseInt(await getSetting('smtp_port', '587'), 10),
    secure: (await getSetting('smtp_secure', 'false')) === 'true',
    user: await getSetting('smtp_user', ''),
    pass: await getSetting('smtp_pass', ''),
    from: await getSetting('smtp_from', ''),
  };
}

/**
 * Get or create a nodemailer transporter based on current SMTP settings.
 * Recreates if config has changed.
 */
async function getTransporter() {
  const cfg = await getSmtpConfig();
  if (!cfg) return null;

  const hash = JSON.stringify(cfg);
  if (transporter && transporterConfigHash === hash) return transporter;

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });

  transporterConfigHash = hash;
  return transporter;
}

/**
 * Send an email. Returns true on success, false if SMTP is not configured.
 * Throws on transport errors.
 */
export async function sendEmail({ to, subject, text, html }) {
  const t = await getTransporter();
  if (!t) return false;

  const cfg = await getSmtpConfig();
  await t.sendMail({
    from: cfg.from || `WhoareYou <noreply@${cfg.host}>`,
    to,
    subject,
    text,
    html,
  });

  return true;
}

/**
 * Verify SMTP connection. Returns { ok: true } or { ok: false, error: string }.
 */
export async function verifySmtp() {
  const t = await getTransporter();
  if (!t) return { ok: false, error: 'SMTP not configured' };

  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Send a "new login" notification email.
 */
export async function sendLoginNotification(user, { ip, device, time }) {
  const enabled = await getSetting('email_login_notify', 'true');
  if (enabled !== 'true') return false;

  const subject = 'New login to WhoareYou';
  const text = [
    `Hi ${user.first_name},`,
    '',
    'A new login was detected on your WhoareYou account.',
    '',
    `Device: ${device}`,
    `IP address: ${ip}`,
    `Time: ${time}`,
    '',
    'If this was you, no action is needed.',
    'If you did not log in, change your password immediately and revoke the session in Settings > Security.',
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#1C1C1E">New login detected</h2>
      <p>Hi ${escapeHtml(user.first_name)},</p>
      <p>A new login was detected on your WhoareYou account.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#8E8E93">Device</td><td style="padding:4px 0">${escapeHtml(device)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#8E8E93">IP address</td><td style="padding:4px 0">${escapeHtml(ip)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#8E8E93">Time</td><td style="padding:4px 0">${escapeHtml(time)}</td></tr>
      </table>
      <p>If this was you, no action is needed.</p>
      <p style="color:#FF3B30">If you did not log in, change your password immediately and revoke the session in Settings &gt; Security.</p>
    </div>
  `;

  try {
    return await sendEmail({ to: user.email, subject, text, html });
  } catch (err) {
    console.error('Failed to send login notification email:', err.message);
    return false;
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
