import { db } from '../db.js';
import { getClientIp } from './ip.js';

/**
 * Write one row to audit_log. Fire-and-forget — audit failure must never
 * break the primary action the user is performing, but it should still be
 * visible in stderr so we can diagnose silent loss of audit data.
 *
 * Typical actions (keep this list in sync — use it as the authoritative
 * vocabulary so queries can filter reliably):
 *
 *   login.success          — user completed authentication (any method)
 *   login.fail             — credentials rejected (email/password, 2FA, passkey)
 *   login.blocked          — IP or country whitelist blocked the request
 *   access.blocked         — accessControl middleware rejected a non-login request
 *   session.revoke         — admin or user killed a session
 *   tenant.switch          — user switched active tenant
 *   member.invite          — admin invited a new tenant member
 *   member.update          — admin changed another member's role / flags
 *   member.remove          — admin removed a member from the tenant
 *   password.reset.request — forgot-password email requested
 *   password.reset.apply   — password reset token redeemed
 *   password.change        — user changed their own password
 *   export.start           — full/data export started
 *   twofa.enable / twofa.disable — 2FA state change
 *   passkey.register / passkey.remove — passkey state change
 *
 * Pre-auth events (blocked IPs, failed logins) may have null tenant_id and
 * null user_id — migration 081 made both nullable for this reason.
 */
export async function logAudit(entry) {
  try {
    await db('audit_log').insert({
      tenant_id: entry.tenantId ?? null,
      user_id: entry.userId ?? null,
      portal_guest_id: entry.portalGuestId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      ip_address: entry.ip ?? null,
      user_agent: entry.userAgent ? String(entry.userAgent).slice(0, 255) : null,
    });
  } catch (err) {
    // Never throw from audit logging — the caller's action must proceed.
    // But do write to stderr so silent audit-log breakage is detectable.
    console.error('[audit]', entry.action, 'failed to log:', err.message);
  }
}

/**
 * Convenience for route handlers — pulls ip + user-agent from the request.
 */
export function logAuditFromReq(req, entry) {
  return logAudit({
    ...entry,
    ip: entry.ip ?? getClientIp(req),
    userAgent: entry.userAgent ?? req.headers?.['user-agent'],
  });
}
