import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { toggleVisibilityBtn } from '../utils/visibility.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { addContactModalHtml, initAddContactModal, showAddContactModal } from '../components/add-contact-modal.js';

let currentSearch = '';
let currentFilter = localStorage.getItem('contacts.filter') || 'all';
let currentLabel = localStorage.getItem('contacts.label') || '';
let currentSort = localStorage.getItem('contacts.sort') || 'first_name';
let currentOrder = localStorage.getItem('contacts.order') || 'asc';
let currentBirthYear = '';
let currentCompany = '';

export async function renderContacts() {
  // Check URL params for label filter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('label')) {
    currentLabel = urlParams.get('label');
    localStorage.setItem('contacts.label', currentLabel);
  }

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
          <option value="first_name:asc" ${currentSort === 'first_name' && currentOrder === 'asc' ? 'selected' : ''}>${t('contacts.sortNameAZ')}</option>
          <option value="first_name:desc" ${currentSort === 'first_name' && currentOrder === 'desc' ? 'selected' : ''}>${t('contacts.sortNameZA')}</option>
          <option value="created:desc" ${currentSort === 'created' ? 'selected' : ''}>${t('contacts.sortNewest')}</option>
          <option value="last_viewed:desc" ${currentSort === 'last_viewed' ? 'selected' : ''}>${t('contacts.sortRecentlyViewed')}</option>
          <option value="last_contacted:desc" ${currentSort === 'last_contacted' ? 'selected' : ''}>${t('contacts.sortLastContacted')}</option>
        </select>
        <button class="btn btn-outline-secondary btn-sm" id="btn-toggle-filters" title="${t('contacts.filters')}">
          <i class="bi bi-funnel"></i>
        </button>
      </div>

      <div class="contacts-filter-bar d-none" id="filter-bar">
        <select class="form-select form-select-sm" id="label-filter" style="max-width:200px">
          <option value="">${t('labels.title')}</option>
        </select>
        <select class="form-select form-select-sm" id="group-filter" style="max-width:200px">
          <option value="">${t('groups.title')}</option>
        </select>
        <select class="form-select form-select-sm" id="birth-year-filter" style="max-width:150px">
          <option value="">${t('contacts.birthYear')}</option>
        </select>
        <button class="btn btn-link btn-sm text-muted" id="btn-clear-filters">${t('contacts.clearFilters')}</button>
      </div>

      <div id="contacts-list" class="contacts-list">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>

    ${addContactModalHtml()}
  `;

  // Load labels for filter
  try {
    const { labels } = await api.get('/labels');
    const labelFilter = document.getElementById('label-filter');
    labelFilter.innerHTML = `<option value="">${t('labels.title')}</option>` +
      labels.map(l => `<option value="${l.name}" ${currentLabel === l.name ? 'selected' : ''}>${l.name} (${l.contact_count})</option>`).join('');
  } catch {}

  // Load groups for filter
  try {
    const { companies } = await api.get('/companies');
    const groupFilter = document.getElementById('group-filter');
    groupFilter.innerHTML = `<option value="">${t('groups.title')}</option>` +
      companies.map(c => `<option value="${c.uuid}" ${currentCompany === c.uuid ? 'selected' : ''}>${c.name} (${c.employee_count})</option>`).join('');
  } catch {}

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
      localStorage.setItem('contacts.filter', currentFilter);
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
    localStorage.setItem('contacts.sort', currentSort);
    localStorage.setItem('contacts.order', currentOrder);
    loadContacts();
  });

  // Label filter
  document.getElementById('label-filter').addEventListener('change', (e) => {
    currentLabel = e.target.value;
    localStorage.setItem('contacts.label', currentLabel);
    const url = currentLabel ? `/contacts?label=${encodeURIComponent(currentLabel)}` : '/contacts';
    window.history.replaceState({}, '', url);
    loadContacts();
  });

  // Group filter
  document.getElementById('group-filter').addEventListener('change', (e) => {
    currentCompany = e.target.value;
    loadContacts();
  });

  // Toggle filter bar
  const filterBar = document.getElementById('filter-bar');
  document.getElementById('btn-toggle-filters').addEventListener('click', () => {
    filterBar.classList.toggle('d-none');
    document.getElementById('btn-toggle-filters').classList.toggle('active', !filterBar.classList.contains('d-none'));
  });
  // Auto-show filter bar if filters are active
  if (currentLabel) filterBar.classList.remove('d-none');

  // Populate birth year filter
  try {
    const { contacts: allC } = await api.get('/contacts?limit=2000&sort=first_name:asc');
    const years = [...new Set(allC.filter(c => c.birth_year).map(c => c.birth_year))].sort((a, b) => b - a);
    const yearFilter = document.getElementById('birth-year-filter');
    yearFilter.innerHTML = `<option value="">${t('contacts.birthYear')}</option>` +
      years.map(y => `<option value="${y}">${y}</option>`).join('');
  } catch {}

  // Birth year filter
  document.getElementById('birth-year-filter').addEventListener('change', (e) => {
    currentBirthYear = e.target.value;
    loadContacts();
  });

  // Clear all filters
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('label-filter').value = '';
    document.getElementById('group-filter').value = '';
    document.getElementById('birth-year-filter').value = '';
    currentLabel = '';
    currentCompany = '';
    currentBirthYear = '';
    localStorage.removeItem('contacts.label');
    window.history.replaceState({}, '', '/contacts');
    loadContacts();
  });

  // Add contact modal (shared component)
  initAddContactModal();
  document.getElementById('btn-add-contact').addEventListener('click', showAddContactModal);
}

async function loadContacts() {
  const listEl = document.getElementById('contacts-list');
  if (!listEl) return;

  try {
    const params = new URLSearchParams();
    if (currentSearch) params.set('search', currentSearch);
    if (currentFilter === 'favorites') params.set('favorite', 'true');
    if (currentLabel) params.set('label', currentLabel);
    if (currentCompany) params.set('company', currentCompany);
    if (currentSort) params.set('sort', currentSort);
    if (currentOrder) params.set('order', currentOrder);
    if (currentBirthYear) params.set('birth_year', currentBirthYear);

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
      <a href="/contacts/${c.uuid}" data-link class="contact-card">
        <div class="contact-avatar">
          ${c.avatar
            ? `<img src="${authUrl(c.avatar)}" alt="">`
            : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`
          }
        </div>
        <div class="contact-info">
          <div class="contact-name">
            ${c.first_name} ${c.last_name || ''}
            ${c.nickname ? `<span class="contact-nickname">"${c.nickname}"</span>` : ''}
          </div>
          ${c.birth_year
            ? `<div class="contact-meta"><i class="bi bi-cake2"></i> ${calcAge(c.birth_year, c.birth_month, c.birth_day)}</div>`
            : c.birth_month && c.birth_day
              ? `<div class="contact-meta"><i class="bi bi-cake2"></i> ${formatBirthDate(c.birth_day, c.birth_month)}</div>`
              : c.last_contacted_at
                ? `<div class="contact-meta">${t('contacts.lastContact', { date: formatDate(c.last_contacted_at) })}</div>`
                : ''
          }
        </div>
        <div class="contact-badges">
          ${c.is_favorite ? '<i class="bi bi-star-fill text-warning"></i>' : ''}
          ${c.visibility === 'private'
            ? `<span class="badge bg-secondary badge-sm"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>`
            : `<span class="badge bg-light text-muted badge-sm"><i class="bi bi-people-fill"></i></span>`
          }
        </div>
      </a>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function calcAge(birthYear, birthMonth, birthDay) {
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  if (birthMonth && birthDay) {
    const m = today.getMonth() + 1 - birthMonth;
    if (m < 0 || (m === 0 && today.getDate() < birthDay)) age--;
  }
  return `${age} ${t('contacts.years')}`;
}

function formatBirthDate(day, month) {
  const date = new Date(2000, month - 1, day);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
