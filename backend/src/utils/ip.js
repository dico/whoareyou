import { config } from '../config/index.js';
import { db } from '../db.js';

/**
 * Check if an IP address is trusted for a specific user's tenant.
 * Reads from tenant's trusted_ip_ranges column, falls back to env var.
 */
export async function isTrustedIp(ip, userId) {
  // Get tenant's trusted ranges
  let tenantRanges = '';
  if (userId) {
    const user = await db('users')
      .join('tenants', 'users.tenant_id', 'tenants.id')
      .where('users.id', userId)
      .select('tenants.trusted_ip_ranges')
      .first();
    tenantRanges = user?.trusted_ip_ranges || '';
  }

  // Also check system-wide env var as fallback
  const envRanges = config.trustedIpRanges || '';
  const combined = [tenantRanges, envRanges].filter(Boolean).join(',');

  if (!combined) return false;

  return ipInRanges(ip, combined);
}

/**
 * Check if any trusted IP config exists for this user's tenant.
 */
export async function hasTrustedIpConfig(userId) {
  if (config.trustedIpRanges) return true;

  if (userId) {
    const user = await db('users')
      .join('tenants', 'users.tenant_id', 'tenants.id')
      .where('users.id', userId)
      .select('tenants.trusted_ip_ranges')
      .first();
    return !!(user?.trusted_ip_ranges);
  }

  return false;
}

export function ipInRanges(ip, rangesStr) {
  const ranges = rangesStr.split(',').map(r => r.trim()).filter(Boolean);
  if (!ranges.length) return false;

  // Normalize IPv6-mapped IPv4
  const normalizedIp = ip?.replace(/^::ffff:/, '') || '';

  for (const range of ranges) {
    if (range.includes('/')) {
      if (ipInCidr(normalizedIp, range)) return true;
    } else {
      if (normalizedIp === range) return true;
    }
  }

  return false;
}

function ipInCidr(ip, cidr) {
  const [rangeIp, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  return (ipToInt(ip) & mask) === (ipToInt(rangeIp) & mask);
}

function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return parts.reduce((sum, octet) => (sum << 8) + parseInt(octet), 0) >>> 0;
}
