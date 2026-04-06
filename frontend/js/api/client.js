const BASE_URL = '/api';

let isRefreshing = false;
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');

  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    // Refresh failed — clear auth and redirect
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    throw new Error('Session expired');
  }

  const data = await response.json();
  localStorage.setItem('token', data.token);
  return data.token;
}

/**
 * Decode a JWT payload (base64url) without verifying the signature.
 * Returns null if the token is malformed.
 */
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Refresh the access token if it has expired or is within 60 seconds
 * of expiry. This keeps `localStorage.token` fresh enough that
 * `<img src>` URLs with `?token=...` (which don't go through the
 * fetch interceptor) stay valid between API calls.
 */
async function ensureFreshToken() {
  const token = localStorage.getItem('token');
  if (!token) return;
  const payload = decodeJwt(token);
  if (!payload?.exp) return;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp - now > 60) return; // still valid
  if (!localStorage.getItem('refreshToken')) return;
  try {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
    }
    await refreshPromise;
  } catch { /* ignore — request path will handle 401 */ }
  finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

// Background refresh: keep the access token fresh even when the user
// is idle on the page without making API calls. Runs every 5 minutes;
// ensureFreshToken is a no-op when the token has >60s left.
if (typeof setInterval !== 'undefined') {
  setInterval(() => { ensureFreshToken().catch(() => {}); }, 5 * 60 * 1000);
}

async function request(method, path, body = null, _isRetry = false) {
  await ensureFreshToken();

  const options = {
    method,
    headers: {},
  };

  const token = localStorage.getItem('token');
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body && !(body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    options.body = body;
  }

  const response = await fetch(`${BASE_URL}${path}`, options);

  // On 401, try to refresh token (once)
  if (response.status === 401 && !_isRetry && localStorage.getItem('refreshToken')) {
    try {
      // Deduplicate concurrent refresh attempts
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken();
      }
      await refreshPromise;
      isRefreshing = false;
      refreshPromise = null;

      // Retry original request with new token
      return request(method, path, body, true);
    } catch {
      isRefreshing = false;
      refreshPromise = null;
      // Redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.location.hash = '#/login';
      const err = new Error('Session expired');
      err.status = 401;
      throw err;
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const err = new Error(error.error || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData),
};
