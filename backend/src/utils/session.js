import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { UAParser } from 'ua-parser-js';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { sendLoginNotification } from '../services/email.js';
import { getClientIp } from './ip.js';

/**
 * Hash a refresh token with SHA-256.
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Parse User-Agent into a human-readable device label.
 */
export function parseDevice(userAgent) {
  if (!userAgent) return 'Unknown device';
  const ua = new UAParser(userAgent);
  const browser = ua.getBrowser();
  const os = ua.getOS();
  const parts = [];
  if (browser.name) parts.push(`${browser.name}${browser.major ? ' ' + browser.major : ''}`);
  if (os.name) parts.push(os.name + (os.version ? ' ' + os.version : ''));
  return parts.join(' on ') || 'Unknown device';
}

/**
 * Generate a short-lived access JWT with session ID embedded.
 */
export function generateAccessToken(user, sessionUuid, activeTenantId = null) {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: activeTenantId || user.tenant_id,
      homeTenantId: user.tenant_id,
      isSystemAdmin: !!user.is_system_admin,
      sid: sessionUuid,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Create a new session for a user. Returns { sessionUuid, accessToken, refreshToken }.
 */
export async function createSession(user, req, activeTenantId = null, { isTrustedIp = false } = {}) {
  const sessionUuid = uuidv4();
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const refreshTokenHash = hashToken(refreshToken);
  const ip = getClientIp(req) || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  const deviceLabel = parseDevice(userAgent);

  const days = isTrustedIp ? config.session.trustedRefreshExpiresInDays : config.session.refreshExpiresInDays;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  // Enforce max sessions per user — remove oldest if at limit
  const activeSessions = await db('sessions')
    .where({ user_id: user.id, is_active: true })
    .orderBy('last_activity_at', 'asc');

  if (activeSessions.length >= config.session.maxPerUser) {
    const toRevoke = activeSessions.slice(0, activeSessions.length - config.session.maxPerUser + 1);
    await db('sessions').whereIn('id', toRevoke.map(s => s.id)).update({ is_active: false });
  }

  await db('sessions').insert({
    uuid: sessionUuid,
    user_id: user.id,
    refresh_token_hash: refreshTokenHash,
    ip_address: ip,
    user_agent: userAgent.slice(0, 500),
    device_label: deviceLabel,
    is_trusted_ip: isTrustedIp,
    is_active: true,
    last_activity_at: db.fn.now(),
    expires_at: expiresAt,
  });

  const accessToken = generateAccessToken(user, sessionUuid, activeTenantId);

  // Send login notification email (fire-and-forget, never blocks login)
  sendLoginNotification(user, {
    ip,
    device: deviceLabel,
    time: new Date().toLocaleString('en-GB', { timeZone: 'Europe/Oslo' }),
  }).catch(() => {});

  return { sessionUuid, accessToken, refreshToken };
}

/**
 * Revoke a session.
 */
export async function revokeSession(sessionUuid, userId) {
  return db('sessions')
    .where({ uuid: sessionUuid, user_id: userId })
    .update({ is_active: false });
}

/**
 * Clean up expired sessions.
 */
export async function cleanExpiredSessions() {
  return db('sessions')
    .where('expires_at', '<', db.fn.now())
    .orWhere('is_active', false)
    .where('created_at', '<', db.raw("DATE_SUB(NOW(), INTERVAL 30 DAY)"))
    .del();
}
