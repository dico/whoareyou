import { getSetting } from '../utils/settings.js';

const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Look up country code for an IP address using ipgeolocation.io.
 * Returns null if not configured or lookup fails.
 * Results are cached for 24 hours.
 */
export async function getCountryForIp(ip) {
  const apiKey = await getSetting('ipgeo_api_key');
  if (!apiKey) return null;

  const normalizedIp = ip?.replace(/^::ffff:/, '') || '';
  if (!normalizedIp || normalizedIp === '127.0.0.1' || normalizedIp.startsWith('192.168.') || normalizedIp.startsWith('10.')) {
    return 'LOCAL';
  }

  const cached = cache.get(normalizedIp);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.country;

  try {
    const res = await fetch(`https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${normalizedIp}&fields=country_code2`);
    const data = await res.json();
    const country = data.country_code2 || null;
    cache.set(normalizedIp, { country, ts: Date.now() });
    return country;
  } catch {
    return null;
  }
}
