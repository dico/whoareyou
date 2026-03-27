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

async function request(method, path, body = null, _isRetry = false) {
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
