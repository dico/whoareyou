import { state, navigate } from '../app.js';
import { api } from '../api/client.js';
import { contactRowHtml } from './contact-row.js';
import { t } from '../utils/i18n.js';

export function renderNavbar() {
  const nav = document.getElementById('app-navbar');
  if (!nav) return;

  const user = state.user;

  nav.innerHTML = `
    <div class="navbar-inner">
      <a href="/" data-link class="navbar-brand">
        <i class="bi bi-people-fill"></i>
        <span>WhoareYou</span>
      </a>

      <div class="navbar-search">
        <i class="bi bi-search"></i>
        <input type="text" id="navbar-search" placeholder="${t('nav.searchPlaceholder')}" autocomplete="off">
        <div id="navbar-search-results" class="navbar-search-results d-none"></div>
      </div>

      <div class="navbar-links">
        <a href="/timeline" data-link class="nav-link">
          <i class="bi bi-journal-text"></i>
          <span>${t('nav.timeline')}</span>
        </a>
        <a href="/contacts" data-link class="nav-link">
          <i class="bi bi-person-lines-fill"></i>
          <span>${t('nav.contacts')}</span>
        </a>
        <a href="/map" data-link class="nav-link">
          <i class="bi bi-geo-alt"></i>
          <span>${t('nav.map')}</span>
        </a>
      </div>

      <div class="navbar-end">
        <button class="nav-link" id="btn-notifications" title="${t('nav.notifications')}">
          <i class="bi bi-bell"></i>
        </button>

        <div class="dropdown">
          <button class="nav-link nav-user" data-bs-toggle="dropdown">
            <span class="user-avatar">${user ? (user.first_name[0] + user.last_name[0]) : '?'}</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
            <li class="dropdown-header">${user ? `${user.first_name} ${user.last_name}` : ''}</li>
            <li class="dropdown-header text-muted small">${user?.tenant_name || ''}</li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="/settings" data-link><i class="bi bi-gear me-2"></i>${t('nav.settings')}</a></li>
            ${user?.is_system_admin ? `<li><a class="dropdown-item" href="/admin/system" data-link><i class="bi bi-shield-lock me-2"></i>${t('nav.systemAdmin')}</a></li>` : ''}
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#" id="btn-logout"><i class="bi bi-box-arrow-right me-2"></i>${t('nav.logout')}</a></li>
          </ul>
        </div>
      </div>
    </div>
  `;

  // Logout handler
  nav.querySelector('#btn-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    state.token = null;
    state.user = null;
    navigate('/login');
  });

  // Search
  const searchInput = document.getElementById('navbar-search');
  const searchResults = document.getElementById('navbar-search-results');
  let searchTimeout;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) {
      searchResults.classList.add('d-none');
      return;
    }
    searchTimeout = setTimeout(() => loadSearchResults(q), 200);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (!searchResults.classList.contains('d-none')) {
      const items = searchResults.querySelectorAll('.contact-row');
      const active = searchResults.querySelector('.contact-row.active');
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
        if (target) {
          searchInput.value = '';
          searchResults.classList.add('d-none');
          navigate(`/contacts/${target.dataset.uuid}`);
        }
      } else if (e.key === 'Escape') {
        searchResults.classList.add('d-none');
        searchInput.blur();
      }
    }
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => searchResults.classList.add('d-none'), 200);
  });

  // Keyboard shortcut: / to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  async function loadSearchResults(q) {
    try {
      const data = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=8`);

      if (data.contacts.length === 0) {
        searchResults.innerHTML = `<div class="navbar-search-empty">${t('common.noResults')}</div>`;
        searchResults.classList.remove('d-none');
        return;
      }

      searchResults.innerHTML = data.contacts.map((c, i) =>
        contactRowHtml(c, {
          tag: 'a',
          active: i === 0,
          meta: c.nickname ? `"${c.nickname}"` : '',
        })
      ).join('');
      searchResults.classList.remove('d-none');

      searchResults.querySelectorAll('.contact-row').forEach((item) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          searchInput.value = '';
          searchResults.classList.add('d-none');
          navigate(`/contacts/${item.dataset.uuid}`);
        });
      });
    } catch {
      searchResults.classList.add('d-none');
    }
  }
}
