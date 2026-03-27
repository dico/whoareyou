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
  } = options;

  return new Promise((resolve) => {
    const id = 'dialog-confirm-' + Date.now();
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-sm modal-dialog-centered">
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

        results.querySelectorAll('.contact-row').forEach((item) => {
          item.addEventListener('click', () => selectItem(item));
        });
      } catch {
        results.innerHTML = '';
      }
    }

    function selectItem(item) {
      resolved = true;
      modal.hide();
      resolve({
        uuid: item.dataset.uuid,
        first_name: item.dataset.first,
        last_name: item.dataset.last,
      });
    }

    modalEl.addEventListener('hidden.bs.modal', () => {
      modalEl.remove();
      if (!resolved) resolve(null);
    }, { once: true });

    modal.show();
  });
}
