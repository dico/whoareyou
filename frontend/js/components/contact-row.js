/**
 * Standardized contact row — used in sidebar, search dropdowns, relationship lists, dialogs.
 *
 * @param {object} contact - { uuid, first_name, last_name, avatar?, nickname? }
 * @param {object} options - { tag?: 'a'|'div', meta?: string, active?: boolean, extraClass?: string }
 * @returns {string} HTML string
 */
export function contactRowHtml(contact, options = {}) {
  const {
    tag = 'a',
    meta = '',
    active = false,
    extraClass = '',
  } = options;

  const initials = (contact.first_name?.[0] || '') + (contact.last_name?.[0] || '');
  const avatarHtml = contact.avatar
    ? `<img src="${contact.avatar}" alt="">`
    : `<span>${initials}</span>`;

  const href = tag === 'a' ? ` href="/contacts/${contact.uuid}" data-link` : '';
  const classes = `contact-row ${active ? 'active' : ''} ${extraClass}`.trim();
  const dataAttrs = `data-uuid="${contact.uuid}" data-first="${escapeAttr(contact.first_name || '')}" data-last="${escapeAttr(contact.last_name || '')}"`;

  return `
    <${tag} class="${classes}" ${href} ${dataAttrs}>
      <div class="contact-row-avatar">${avatarHtml}</div>
      <div class="contact-row-info">
        <div class="contact-row-name">${escapeHtml(contact.first_name || '')} ${escapeHtml(contact.last_name || '')}</div>
        ${meta ? `<div class="contact-row-meta">${meta}</div>` : ''}
      </div>
    </${tag}>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
