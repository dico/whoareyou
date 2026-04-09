import { config } from '../config/index.js';
import { db } from '../db.js';
import { getSetting } from './settings.js';
import { getCountryForIp } from '../services/geolocation.js';

/**
 * Resolve the real client IP from a request. Express's `req.ip` is
 * authoritative as long as `trust proxy` is configured to walk the entire
 * internal proxy chain (see backend/src/index.js). Strip the IPv6-mapped
 * IPv4 prefix so downstream code works with bare dotted-quad strings.
 */
export function getClientIp(req) {
  return (req?.ip || '').replace(/^::ffff:/, '');
}

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

/**
 * Check if an IP is allowed to attempt login at all.
 * Checks system-wide login IP whitelist and country whitelist.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function isLoginAllowed(ip) {
  const normalizedIp = ip?.replace(/^::ffff:/, '') || '';

  // 1. Check login IP whitelist (if configured)
  const loginIpWhitelist = await getSetting('login_ip_whitelist', '');
  if (loginIpWhitelist.trim()) {
    // If whitelist is configured, IP must be in it
    if (!ipInRanges(normalizedIp, loginIpWhitelist)) {
      return { allowed: false, reason: 'ip_blocked' };
    }
    // IP is whitelisted — skip country check
    return { allowed: true };
  }

  // 2. Check country whitelist (if configured + API key present)
  const countryWhitelist = await getSetting('login_country_whitelist', '');
  if (countryWhitelist.trim()) {
    const country = await getCountryForIp(normalizedIp);
    if (country === 'LOCAL') return { allowed: true };
    if (country) {
      const allowed = countryWhitelist.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
      if (!allowed.includes(country.toUpperCase())) {
        return { allowed: false, reason: 'country_blocked' };
      }
    }
    // If geolocation failed (no API key or network error), allow through
  }

  return { allowed: true };
}
