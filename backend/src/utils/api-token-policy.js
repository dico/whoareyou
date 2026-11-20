import crypto from 'crypto';

/**
 * What an API token (AI agent / script) may do. Deny by default: a request
 * is allowed only if its path is under one of ALLOWED_PREFIXES, it doesn't
 * match BLOCKED, and the method fits the token's scope.
 *
 *   read  → GET
 *   write → GET, POST, PUT, PATCH
 *   DELETE is never allowed — removing data stays a human action.
 *
 * Everything else (auth, admin, export, import, system, portal, signage,
 * uploads, notifications, gifts, posts …) is out of reach, including the
 * token management endpoints themselves.
 */
const ALLOWED_PREFIXES = [
  '/api/contacts',
  '/api/companies',
  '/api/addresses',
  '/api/relationships',
  '/api/life-events',
  '/api/labels',
];

// Bulk/destructive operations that happen to use POST, and file uploads.
const BLOCKED = [
  /^\/api\/contacts\/tools(\/|$)/,           // trash, merge, duplicates
  /^\/api\/addresses\/merge(\/|$)/,
  /^\/api\/labels\/[^/]+\/contacts\/batch-remove$/,
  /^\/api\/companies\/import-from-label$/,
  /\/logo$/,
  /\/photos(\/|$)/,
];

const READ_METHODS = new Set(['GET', 'HEAD']);
const WRITE_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH']);

export const API_TOKEN_PREFIX = 'way_';
export const API_TOKEN_SCOPES = ['read', 'write'];
// Allowed lifetimes in hours (UI offers these; backend enforces the max)
export const API_TOKEN_LIFETIMES = [1, 4, 24, 168];

export function isApiToken(raw) {
  return typeof raw === 'string' && raw.startsWith(API_TOKEN_PREFIX);
}

export function hashApiToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateApiToken() {
  return API_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}

/** Returns null if allowed, otherwise a short reason. */
export function checkApiTokenAccess(method, originalUrl, scope) {
  // Normalise the way Express matches routes (case-insensitive) and undo
  // encoding/duplicate slashes, so "/api/contacts/%54OOLS//merge" can't slip
  // past BLOCKED while still reaching the route.
  let path;
  try {
    path = decodeURIComponent(String(originalUrl || '').split('?')[0]);
  } catch {
    return 'Malformed path';
  }
  path = path.toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  if (path.split('/').some(seg => seg === '..' || seg === '.')) return 'Malformed path';
  const m = String(method || '').toUpperCase();

  if (!ALLOWED_PREFIXES.some(p => path === p || path.startsWith(p + '/'))) {
    return 'Route not available to API tokens';
  }
  if (BLOCKED.some(re => re.test(path))) {
    return 'Operation not available to API tokens';
  }
  const methods = scope === 'write' ? WRITE_METHODS : READ_METHODS;
  if (!methods.has(m)) {
    return m === 'DELETE' ? 'API tokens cannot delete' : 'Token scope does not allow this method';
  }
  return null;
}
