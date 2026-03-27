const BASE_URL = '/api';

async function request(method, path, body = null) {
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
