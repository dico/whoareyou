import { getSetting } from '../utils/settings.js';
import { db } from '../db.js';

const CACHE_TTL_DAYS = 30;

function isLocalIp(ip) {
  return !ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
}

/**
 * Look up country code for an IP address using ipgeolocation.io.
 * Results are cached in database for 30 days.
 * Returns null if not configured or lookup fails.
 */
export async function getCountryForIp(ip) {
  const normalizedIp = ip?.replace(/^::ffff:/, '') || '';
  if (isLocalIp(normalizedIp)) return 'LOCAL';

  const apiKey = await getSetting('ipgeo_api_key');
  if (!apiKey) return null;

  // Check DB cache
  try {
    const cached = await db('ip_geo_cache').where({ ip: normalizedIp }).first();
    if (cached) {
      const age = Date.now() - new Date(cached.created_at).getTime();
      if (age < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return cached.country_code;
      // Expired — delete and re-fetch
      await db('ip_geo_cache').where({ ip: normalizedIp }).del();
    }
  } catch {}

  return (await fetchAndCache(normalizedIp, apiKey))?.country_code || null;
}

/**
 * Full lookup — returns all fields. Used by test endpoint.
 */
export async function lookupIp(ip, apiKey) {
  const normalizedIp = ip?.replace(/^::ffff:/, '') || '';
  if (isLocalIp(normalizedIp)) return { country_code: 'LOCAL', country_name: 'Local network', ip: normalizedIp };

  // Check DB cache first
  try {
    const cached = await db('ip_geo_cache').where({ ip: normalizedIp }).first();
    if (cached) {
      return { ip: normalizedIp, country_code: cached.country_code, country_name: cached.country_name, city: cached.city, isp: cached.isp, cached: true };
    }
  } catch {}

  const result = await fetchAndCache(normalizedIp, apiKey);
  return result ? { ...result, cached: false } : null;
}

async function fetchAndCache(ip, apiKey) {
  try {
    const res = await fetch(`https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${ip}`);
    const data = await res.json();
    if (!data.country_code2) return null;

    const record = {
      ip,
      country_code: data.country_code2,
      country_name: data.country_name || null,
      city: data.city || null,
      isp: data.isp || null,
      raw_data: JSON.stringify(data),
    };

    await db('ip_geo_cache').insert(record).catch(() => {});
    return record;
  } catch {
    return null;
  }
}
