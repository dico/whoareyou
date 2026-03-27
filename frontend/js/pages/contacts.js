import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { toggleVisibilityBtn } from '../utils/visibility.js';
import { t } from '../utils/i18n.js';

let currentSearch = '';
let currentFilter = 'all';
let currentSort = 'first_name';
let currentOrder = 'asc';

export async function renderContacts() {
  const content = document.getElementById('app-content');

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2>${t('contacts.title')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-add-contact">
          <i class="bi bi-plus-lg"></i> ${t('contacts.new')}
        </button>
      </div>

      <div class="contacts-toolbar">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input type="text" id="contact-search" placeholder="${t('contacts.searchPlaceholder')}" value="${currentSearch}">
        </div>
        <div class="filter-tabs">
          <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">${t('contacts.all')}</button>
          <button class="filter-tab ${currentFilter === 'favorites' ? 'active' : ''}" data-filter="favorites">
            <i class="bi bi-star-fill"></i> ${t('contacts.favorites')}
          </button>
        </div>
        <select class="form-select form-select-sm sort-select" id="sort-select">
          <option value="first_name:asc" ${currentSort === 'first_name' ? 'selected' : ''}>${t('contacts.sortNameAZ')}</option>
          <option value="first_name:desc">${t('contacts.sortNameZA')}</option>
          <option value="created:desc" ${currentSort === 'created' ? 'selected' : ''}>${t('contacts.sortNewest')}</option>
          <option value="last_viewed:desc" ${currentSort === 'last_viewed' ? 'selected' : ''}>${t('contacts.sortRecentlyViewed')}</option>
          <option value="last_contacted:desc" ${currentSort === 'last_contacted' ? 'selected' : ''}>${t('contacts.sortLastContacted')}</option>
        </select>
      </div>

      <div id="contacts-list" class="contacts-list">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>

    <!-- Add contact modal -->
    <div class="modal fade" id="add-contact-modal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${t('contacts.newContact')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="add-contact-form">
            <div class="modal-body">
              <div class="row g-2 mb-3">
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="new-first-name" placeholder="${t('auth.firstName')}" required>
                    <label>${t('auth.firstName')}</label>
                  </div>
                </div>
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="new-last-name" placeholder="${t('auth.lastName')}">
                    <label>${t('auth.lastName')}</label>
                  </div>
                </div>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="new-nickname" placeholder="${t('contacts.nickname')}">
                <label>${t('contacts.nickname')}</label>
              </div>
              <div class="form-floating mb-3">
                <input type="date" class="form-control" id="new-dob" placeholder="${t('contacts.dateOfBirth')}">
                <label>${t('contacts.dateOfBirth')}</label>
              </div>
              <div class="form-floating mb-3">
                <textarea class="form-control" id="new-how-met" placeholder="${t('contacts.howWeMet')}" style="height:80px"></textarea>
                <label>${t('contacts.howWeMet')}</label>
              </div>
              <div class="visibility-toggle mb-3">
                <button type="button" class="btn btn-sm visibility-btn" id="new-visibility-btn" data-visibility="shared">
                  <i class="bi bi-people-fill"></i> ${t('visibility.shared')}
                </button>
                <span class="visibility-hint text-muted small">${t('visibility.sharedHint')}</span>
              </div>
              <div id="add-contact-error" class="alert alert-danger d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('contacts.cancel')}</button>
              <button type="submit" class="btn btn-primary">${t('contacts.create')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  // Load contacts
  await loadContacts();

  // Search (debounced)
  let searchTimeout;
  document.getElementById('contact-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value;
      loadContacts();
    }, 300);
  });

  // Filter tabs
  content.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentFilter = tab.dataset.filter;
      content.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      loadContacts();
    });
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', (e) => {
    const [sort, order] = e.target.value.split(':');
    currentSort = sort;
    currentOrder = order;
    loadContacts();
  });

  // Add contact button
  document.getElementById('btn-add-contact').addEventListener('click', () => {
    const modal = new bootstrap.Modal(document.getElementById('add-contact-modal'));
    modal.show();
  });

  // Visibility toggle
  document.getElementById('new-visibility-btn').addEventListener('click', (e) => {
    toggleVisibilityBtn(e.currentTarget);
  });

  // Add contact form
  document.getElementById('add-contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-contact-error');
    errorEl.classList.add('d-none');

    try {
      const data = await api.post('/contacts', {
        first_name: document.getElementById('new-first-name').value,
        last_name: document.getElementById('new-last-name').value || undefined,
        nickname: document.getElementById('new-nickname').value || undefined,
        date_of_birth: document.getElementById('new-dob').value || undefined,
        how_we_met: document.getElementById('new-how-met').value || undefined,
        visibility: document.getElementById('new-visibility-btn').dataset.visibility,
      });

      bootstrap.Modal.getInstance(document.getElementById('add-contact-modal')).hide();
      e.target.reset();
      navigate(`/contacts/${data.contact.uuid}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}

async function loadContacts() {
  const listEl = document.getElementById('contacts-list');
  if (!listEl) return;

  try {
    const params = new URLSearchParams();
    if (currentSearch) params.set('search', currentSearch);
    if (currentFilter === 'favorites') params.set('favorite', 'true');
    if (currentSort) params.set('sort', currentSort);
    if (currentOrder) params.set('order', currentOrder);

    const data = await api.get(`/contacts?${params}`);

    if (data.contacts.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-people"></i>
          <p>${currentSearch ? t('contacts.noContactsFound') : t('contacts.noContactsYet')}</p>
          ${!currentSearch ? `<p class="text-muted">${t('contacts.addFirstHint')}</p>` : ''}
        </div>
      `;
      return;
    }

    listEl.innerHTML = data.contacts.map((c) => `
      <a href="/contacts/${c.uuid}" data-link class="contact-list-row">
        <div class="contact-avatar">
          ${c.avatar
            ? `<img src="${c.avatar}" alt="">`
            : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`
          }
        </div>
        <div class="contact-info">
          <div class="contact-name">
            ${c.first_name} ${c.last_name || ''}
            ${c.nickname ? `<span class="contact-nickname">"${c.nickname}"</span>` : ''}
          </div>
          ${c.last_contacted_at
            ? `<div class="contact-meta">${t('contacts.lastContact', { date: new Date(c.last_contacted_at).toLocaleDateString() })}</div>`
            : ''
          }
        </div>
        <div class="contact-actions">
          ${c.visibility === 'private' ? `<i class="bi bi-lock-fill text-muted" title="${t('common.private')}"></i>` : ''}
          ${c.is_favorite ? '<i class="bi bi-star-fill text-warning"></i>' : ''}
        </div>
      </a>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}
