/**
 * Append auth token to an upload URL for protected image serving.
 * @param {string} url - e.g. "/uploads/contacts/uuid/photo.webp"
 * @returns {string} URL with ?token= appended
 */
export function authUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  if (url.includes('token=')) return url; // Already has token
  const token = localStorage.getItem('token');
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${token}`;
}
