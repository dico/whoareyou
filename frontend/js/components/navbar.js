import { state, navigate } from '../app.js';
import { api } from '../api/client.js';
import { contactRowHtml } from './contact-row.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

export function renderNavbar() {
  const nav = document.getElementById('app-navbar');
  if (!nav) return;

  const user = state.user;

  nav.innerHTML = `
    <div class="navbar-inner">
      <a href="/" data-link class="navbar-brand">
        <img src="/img/logo-v3-people-circle.svg" alt="WhoareYou" class="navbar-logo">
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
        <a href="/groups" data-link class="nav-link">
          <i class="bi bi-people-fill"></i>
          <span>${t('nav.companies')}</span>
        </a>
        <a href="/gifts" data-link class="nav-link">
          <i class="bi bi-gift"></i>
          <span>${t('nav.gifts')}</span>
        </a>
      </div>

      <div class="navbar-end">
        <div class="dropdown">
          <button class="nav-link notification-bell" id="btn-notifications" data-bs-toggle="dropdown" title="${t('nav.notifications')}">
            <i class="bi bi-bell"></i>
            <span class="notification-badge d-none" id="notification-count"></span>
          </button>
          <div class="dropdown-menu dropdown-menu-end notification-dropdown" id="notification-dropdown">
            <div class="notification-header">
              <strong>${t('nav.notifications')}</strong>
              <button class="btn btn-link btn-sm" id="btn-mark-all-read">${t('notifications.markAllRead')}</button>
            </div>
            <div id="notification-list" class="notification-list">
              <div class="loading small p-3">${t('app.loading')}</div>
            </div>
          </div>
        </div>

        <div class="dropdown">
          <button class="nav-link nav-user nav-user-with-dot ${user?.show_sensitive ? 'is-sensitive-on' : ''}"
            data-bs-toggle="dropdown"
            title="${user?.show_sensitive ? t('sensitive.dotTooltipOn') : t('sensitive.dotTooltipOff')}">
            ${user?.avatar
              ? `<img class="user-avatar" src="${authUrl(user.avatar)}" alt="">`
              : `<span class="user-avatar">${user ? (user.first_name[0] + user.last_name[0]) : '?'}</span>`
            }
            <span class="nav-user-dot"></span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
            ${user?.linked_contact_uuid
              ? `<li><a class="dropdown-item" href="/contacts/${user.linked_contact_uuid}" data-link><i class="bi bi-person-circle me-2"></i>${t('nav.myProfile')}</a></li>`
              : ''
            }
            <li><a class="dropdown-item" href="/profile" data-link><i class="bi bi-gear me-2"></i>${t('nav.accountSettings')}</a></li>
            <li><a class="dropdown-item" href="/settings/notifications" data-link><i class="bi bi-bell me-2"></i>${t('notifications.settingsTitle')}</a></li>
            ${user?.role === 'admin' || user?.is_system_admin ? `<li><a class="dropdown-item" href="/settings" data-link><i class="bi bi-sliders me-2"></i>${t('settings.administration')}</a></li>` : ''}
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#" id="btn-logout"><i class="bi bi-box-arrow-right me-2"></i>${t('nav.logout')}</a></li>
          </ul>
        </div>
      </div>
    </div>
  `;

  // Logout handler
  nav.querySelector('#btn-logout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    state.token = null;
    state.user = null;
    navigate('/login');
  });

  // Notifications
  loadNotifications();

  // Generate notifications on load (checks for today's birthdays/reminders)
  api.post('/notifications/generate', {}).catch(() => {});

  document.getElementById('btn-notifications')?.addEventListener('show.bs.dropdown', () => {
    loadNotifications();
  });

  document.getElementById('btn-mark-all-read')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await api.post('/notifications/mark-read', {});
    loadNotifications();
  });

  async function loadNotifications() {
    try {
      const { notifications, unread_count } = await api.get('/notifications?limit=15');
      const badge = document.getElementById('notification-count');
      const list = document.getElementById('notification-list');

      if (unread_count > 0) {
        badge.textContent = unread_count > 9 ? '9+' : unread_count;
        badge.classList.remove('d-none');
      } else {
        badge.classList.add('d-none');
      }

      if (!notifications.length) {
        list.innerHTML = `<div class="p-3 text-muted small text-center">${t('notifications.empty')}</div>`;
        return;
      }

      list.innerHTML = notifications.map(n => {
        const iconByType = {
          birthday: 'cake2', anniversary: 'calendar-heart', reminder: 'bell',
          memory: 'clock-history', family_post: 'chat-square-text', family_comment: 'chat-left-text',
        };
        const icon = iconByType[n.type] || 'info-circle';
        let title = n.title;
        let avatarHtml = `<div class="notification-icon"><i class="bi bi-${icon}"></i></div>`;

        if (n.type === 'birthday') {
          title = t('notifications.birthday', { name: n.title });
        } else if (n.type === 'anniversary') {
          const parts = (n.body || '').split('|');
          const eventType = parts[1] || '';
          const years = parts[2] || '';
          title = t('notifications.anniversary', { name: n.title, event: t('lifeEvents.types.' + eventType), years });
        } else if (n.type === 'memory') {
          const [count, thumb] = (n.body || '').split('|');
          const years = parseInt(n.title, 10);
          title = t('notifications.memory', { n: parseInt(count, 10) || 1, years });
          if (thumb) avatarHtml = `<div class="notification-thumb"><img src="${authUrl(thumb)}" alt=""></div>`;
        } else if (n.type === 'family_post') {
          const [, thumb] = (n.body || '').split('|');
          title = t('notifications.familyPost', { name: n.title });
          if (thumb) avatarHtml = `<div class="notification-thumb"><img src="${authUrl(thumb)}" alt=""></div>`;
        } else if (n.type === 'family_comment') {
          const [, preview] = (n.body || '').split('|');
          title = t('notifications.familyComment', { name: n.title, preview: preview || '' });
        }

        return `
        <a href="${n.link || '#'}" data-link class="notification-item ${n.is_read ? 'read' : ''}" data-id="${n.id}">
          ${avatarHtml}
          <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-time">${formatTimeAgo(n.created_at)}</div>
          </div>
          ${!n.is_read ? '<span class="notification-dot"></span>' : ''}
        </a>`;
      }).join('');

      // Mark as read on click
      list.querySelectorAll('.notification-item:not(.read)').forEach(item => {
        item.addEventListener('click', () => {
          api.post('/notifications/mark-read', { ids: [parseInt(item.dataset.id)] }).catch(() => {});
        });
      });
    } catch {}
  }

  function formatTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('notifications.justNow');
    if (mins < 60) return t('notifications.minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('notifications.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    return t('notifications.daysAgo', { n: days });
  }

  // Search
  const searchInput = document.getElementById('navbar-search');
  const searchResults = document.getElementById('navbar-search-results');
  let searchTimeout;
  let lastSearchQuery = '';

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) {
      searchResults.classList.add('d-none');
      return;
    }
    searchTimeout = setTimeout(() => { lastSearchQuery = q; loadSearchResults(q); }, 200);
  });

  // Re-show last results on focus
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2 && searchResults.innerHTML && lastSearchQuery) {
      searchResults.classList.remove('d-none');
    }
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
          searchResults.classList.add('d-none');
          searchInput.blur();
          if (target.dataset.uuid) navigate(`/contacts/${target.dataset.uuid}`);
          else if (target.getAttribute('href')) navigate(target.getAttribute('href'));
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
      const data = await api.get(`/contacts/search/global?q=${encodeURIComponent(q)}`);

      if (!data.contacts.length && !data.posts.length && !data.companies?.length) {
        searchResults.innerHTML = `<div class="navbar-search-empty">${t('common.noResults')}</div>`;
        searchResults.classList.remove('d-none');
        return;
      }

      let html = '';

      // Contacts
      if (data.contacts.length) {
        html += `<div class="search-section-label">${t('nav.contacts')}</div>`;
        html += data.contacts.map((c, i) =>
          contactRowHtml(c, {
            tag: 'a',
            active: i === 0,
            meta: c.nickname ? `"${c.nickname}"` : '',
          })
        ).join('');
      }

      // Groups
      if (data.companies?.length) {
        html += `<div class="search-section-label">${t('nav.companies')}</div>`;
        const typeIcon = { company: 'bi-building', school: 'bi-mortarboard', club: 'bi-people', team: 'bi-trophy', association: 'bi-diagram-3', class: 'bi-easel', other: 'bi-collection' };
        html += data.companies.map(c => `
          <a class="contact-row" href="/groups/${c.uuid}" data-link>
            <div class="contact-row-avatar" style="background:var(--color-text-secondary)">
              ${c.logo_path ? `<img src="${authUrl(c.logo_path)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<i class="bi ${typeIcon[c.type] || 'bi-people'}" style="font-size:0.8rem"></i>`}
            </div>
            <div class="contact-row-info">
              <div class="contact-row-name">${escapeSearchHtml(c.name)}</div>
              ${c.industry ? `<div class="contact-row-meta">${escapeSearchHtml(c.industry)}</div>` : ''}
            </div>
          </a>
        `).join('');
      }

      // Posts
      if (data.posts.length) {
        html += `<div class="search-section-label">${t('nav.timeline')}</div>`;
        html += data.posts.map(p => `
          <a class="contact-row search-post-result" href="${p.about ? `/contacts/${p.about.uuid}?post=${p.uuid}` : `/timeline?post=${p.uuid}`}" data-link data-post-uuid="${p.uuid}">
            <div class="contact-row-avatar" style="background:var(--color-text-secondary)">
              <i class="bi bi-journal-text" style="font-size:0.8rem"></i>
            </div>
            <div class="contact-row-info">
              <div class="contact-row-name">${escapeSearchHtml(p.body)}</div>
              <div class="contact-row-meta">${p.about ? p.about.first_name + ' ' + (p.about.last_name || '') : ''}</div>
            </div>
          </a>
        `).join('');
      }

      searchResults.innerHTML = html;
      searchResults.classList.remove('d-none');

      searchResults.querySelectorAll('.contact-row').forEach((item) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          searchResults.classList.add('d-none');
          searchInput.blur();
          if (item.dataset.uuid) {
            navigate(`/contacts/${item.dataset.uuid}`);
          } else if (item.getAttribute('href')) {
            navigate(item.getAttribute('href'));
          }
        });
      });
    } catch {
      searchResults.classList.add('d-none');
    }
  }

  function escapeSearchHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
