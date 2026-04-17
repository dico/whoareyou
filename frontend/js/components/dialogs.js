import { api } from '../api/client.js';
import { contactRowHtml } from './contact-row.js';
import { t } from '../utils/i18n.js';

/**
 * Show a confirm dialog (replaces window.confirm).
 * @param {string} message
 * @param {object} options - { title, confirmText, confirmClass }
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, options = {}) {
  const {
    title = t('common.confirm'),
    confirmText = t('common.confirm'),
    confirmClass = 'btn-danger',
    size = 'modal-sm',
  } = options;

  return new Promise((resolve) => {
    const id = 'dialog-confirm-' + Date.now();
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog ${size} modal-dialog-centered">
          <div class="modal-content glass-card">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="mb-0">${message}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn ${confirmClass} btn-sm" id="${id}-confirm">${confirmText}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);

    modalEl.querySelector(`#${id}-confirm`).addEventListener('click', () => {
      modal.hide();
      resolve(true);
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
      modalEl.remove();
      resolve(false);
    }, { once: true });

    modal.show();
  });
}

/**
 * Show a contact search dialog (replaces prompt-based search).
 * @param {object} options - { title, excludeUuids }
 * @returns {Promise<{uuid, first_name, last_name}|null>}
 */
export function contactSearchDialog(options = {}) {
  const {
    title = t('common.search'),
    excludeUuids = [],
  } = options;

  return new Promise((resolve) => {
    const id = 'dialog-search-' + Date.now();
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="text" class="form-control mb-3" id="${id}-input" placeholder="${t('common.search')}" autofocus>
              <div id="${id}-results" class="contact-search-results"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);
    const input = document.getElementById(`${id}-input`);
    const results = document.getElementById(`${id}-results`);
    let resolved = false;

    // Focus input when modal opens
    modalEl.addEventListener('shown.bs.modal', () => input.focus());

    // Search
    let searchTimeout;
    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim();
      if (q.length < 1) {
        results.innerHTML = '';
        return;
      }
      searchTimeout = setTimeout(() => loadResults(q), 200);
    });

    // Keyboard nav
    input.addEventListener('keydown', (e) => {
      const items = results.querySelectorAll('.contact-row');
      const active = results.querySelector('.contact-row.active');
      let index = [...items].indexOf(active);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        index = Math.min(index + 1, items.length - 1);
        items.forEach((i) => i.classList.remove('active'));
        items[index]?.classList.add('active');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        index = Math.max(index - 1, 0);
        items.forEach((i) => i.classList.remove('active'));
        items[index]?.classList.add('active');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = active || items[0];
        if (target) selectItem(target);
      } else if (e.key === 'Escape') {
        modal.hide();
      }
    });

    async function loadResults(q) {
      try {
        const data = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=8`);
        const contacts = data.contacts.filter((c) => !excludeUuids.includes(c.uuid));

        if (contacts.length === 0) {
          results.innerHTML = `<div class="text-muted small p-2">${t('common.noResults')}</div>`;
          return;
        }

        results.innerHTML = contacts.map((c, i) =>
          contactRowHtml(c, {
            tag: 'div',
            active: i === 0,
            meta: c.nickname ? `"${c.nickname}"` : '',
          })
        ).join('');

        results.querySelectorAll('.contact-row').forEach((item, i) => {
          item.addEventListener('click', () => selectItem(contacts[i]));
        });
      } catch {
        results.innerHTML = '';
      }
    }

    function selectItem(contact) {
      resolved = true;
      modal.hide();
      resolve({
        uuid: contact.uuid,
        first_name: contact.first_name,
        last_name: contact.last_name,
        avatar: contact.avatar || null,
      });
    }

    modalEl.addEventListener('hidden.bs.modal', () => {
      modalEl.remove();
      if (!resolved) resolve(null);
    }, { once: true });

    modal.show();
  });
}

/**
 * Show a group/company search dialog.
 * @param {object} options - { title }
 * @returns {Promise<{uuid, name, logo_path}|null>}
 */
export function groupSearchDialog(options = {}) {
  const { title = t('common.search') } = options;

  return new Promise((resolve) => {
    const id = 'dialog-group-search-' + Date.now();
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="text" class="form-control mb-3" id="${id}-input" placeholder="${t('common.search')}" autofocus>
              <div id="${id}-results" class="contact-search-results"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);
    const input = document.getElementById(`${id}-input`);
    const results = document.getElementById(`${id}-results`);
    let resolved = false;

    modalEl.addEventListener('shown.bs.modal', () => input.focus());

    let searchTimeout;
    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim();
      if (q.length < 1) { results.innerHTML = ''; return; }
      searchTimeout = setTimeout(() => loadResults(q), 200);
    });

    input.addEventListener('keydown', (e) => {
      const items = results.querySelectorAll('.contact-row');
      const active = results.querySelector('.contact-row.active');
      let index = [...items].indexOf(active);
      if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, items.length - 1); items.forEach(i => i.classList.remove('active')); items[index]?.classList.add('active'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); items.forEach(i => i.classList.remove('active')); items[index]?.classList.add('active'); }
      else if (e.key === 'Enter') { e.preventDefault(); const target = active || items[0]; if (target) selectItem(target); }
      else if (e.key === 'Escape') { modal.hide(); }
    });

    async function loadResults(q) {
      try {
        const { companies } = await api.get(`/companies?search=${encodeURIComponent(q)}&limit=8`);
        if (!companies?.length) { results.innerHTML = `<div class="text-muted small p-2">${t('common.noResults')}</div>`; return; }
        results.innerHTML = companies.map((c, i) =>
          contactRowHtml({ first_name: c.name, last_name: '', avatar: c.logo_path, uuid: c.uuid }, {
            tag: 'div', active: i === 0, meta: t(`companies.types.${c.type}`),
          })
        ).join('');
        results.querySelectorAll('.contact-row').forEach((item, i) => {
          item.addEventListener('click', () => { resolved = true; modal.hide(); resolve(companies[i]); });
        });
      } catch { results.innerHTML = ''; }
    }

    function selectItem(row) {
      const index = [...results.querySelectorAll('.contact-row')].indexOf(row);
      if (index >= 0) row.click();
    }

    modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); if (!resolved) resolve(null); }, { once: true });
    modal.show();
  });
}
