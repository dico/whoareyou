import { isAccessAllowed, getClientIp } from '../utils/ip.js';
import { logAudit } from '../utils/audit.js';

/**
 * Global access control — rejects requests whose origin is not permitted
 * by the system-wide IP whitelist or country whitelist. Applied to every
 * API and upload route so signage tokens, portal guests, and authenticated
 * users all honor the same admin-configured policy.
 *
 * Intentionally placed BEFORE authentication so blocked origins never
 * exchange credentials. Health/info endpoints are registered earlier in
 * the chain and are therefore exempt (monitoring must keep working).
 */
export async function accessControl(req, res, next) {
  try {
    const ip = getClientIp(req);
    const result = await isAccessAllowed(ip);
    if (!result.allowed) {
      // Log the rejection so we can see probing patterns. Fire-and-forget.
      // No tenant/user context yet — this runs before authentication.
      logAudit({
        action: 'access.blocked',
        details: { reason: result.reason, path: req.path, method: req.method },
        ip,
        userAgent: req.headers?.['user-agent'],
      });
      return res.status(403).json({
        error: 'Access denied',
        reason: result.reason,
      });
    }
    next();
  } catch (err) {
    // Defensive: if the access check itself blows up, refuse rather than
    // silently letting everyone through. This path shouldn't normally hit.
    return res.status(503).json({ error: 'Access check failed' });
  }
}
