import { db } from '../db.js';

const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Get a system setting by key. Uses short-lived cache to avoid DB hits on every request.
 */
export async function getSetting(key, defaultValue = null) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const row = await db('system_settings').where({ key }).first();
  const value = row ? row.value : defaultValue;
  cache.set(key, { value, ts: Date.now() });
  return value;
}

/**
 * Set a system setting.
 */
export async function setSetting(key, value) {
  const exists = await db('system_settings').where({ key }).first();
  if (exists) {
    await db('system_settings').where({ key }).update({ value, updated_at: db.fn.now() });
  } else {
    await db('system_settings').insert({ key, value });
  }
  cache.set(key, { value, ts: Date.now() });
}
