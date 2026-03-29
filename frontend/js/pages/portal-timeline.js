import { t, formatDate, setLocale } from '../utils/i18n.js';
import { navigate } from '../app.js';

// Portal API client — separate from main app
const portalApi = {
  async request(method, path, body = null) {
    const token = localStorage.getItem('portalToken') || sessionStorage.getItem('portalToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`/api/portal${path}`, opts);
    if (res.status === 401) {
      // Try refresh
      const refreshToken = localStorage.getItem('portalRefreshToken');
      if (refreshToken) {
        try {
          const refreshRes = await fetch('/api/portal/auth/refresh', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem('portalToken', data.token);
            headers['Authorization'] = `Bearer ${data.token}`;
            const retry = await fetch(`/api/portal${path}`, { method, headers, body: opts.body });
            if (!retry.ok) throw new Error((await retry.json()).error || 'Request failed');
            return retry.json();
          }
        } catch { /* fall through to logout */ }
      }
      localStorage.removeItem('portalToken');
      localStorage.removeItem('portalRefreshToken');
      sessionStorage.removeItem('portalToken');
      navigate('/portal/login');
      throw new Error('Session expired');
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
    return res.json();
  },
  get: (path) => portalApi.request('GET', path),
  post: (path, body) => portalApi.request('POST', path, body),
};

function portalAuthUrl(path) {
  if (!path) return '';
  const token = localStorage.getItem('portalToken') || sessionStorage.getItem('portalToken') || '';
  if (path.startsWith('/uploads/')) return `${path}?token=${token}`;
  return path;
}

// ── Portal Login ──

export function renderPortalLogin() {
  const root = document.getElementById('portal-root') || document.getElementById('app');
  root.innerHTML = `
    <div class="portal-login">
      <div class="portal-login-card glass-card">
        <div class="text-center mb-4">
          <img src="/img/logo-v3-people-circle.svg" alt="WhoareYou" class="portal-logo">
          <h2>${t('app.name')}</h2>
          <p class="text-muted">${t('portal.title')}</p>
        </div>
        <form id="portal-login-form">
          <div class="form-floating mb-3">
            <input type="email" class="form-control" id="portal-email" required>
            <label>${t('auth.email')}</label>
          </div>
          <div class="form-floating mb-3">
            <input type="password" class="form-control" id="portal-password" required>
            <label>${t('auth.password')}</label>
          </div>
          <div id="portal-login-error" class="alert alert-danger d-none"></div>
          <button type="submit" class="btn btn-primary w-100">${t('auth.login')}</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('portal-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('portal-login-error');
    errorEl.classList.add('d-none');
    try {
      const data = await portalApi.post('/auth/login', {
        email: document.getElementById('portal-email').value.trim(),
        password: document.getElementById('portal-password').value,
      });
      localStorage.setItem('portalToken', data.token);
      localStorage.setItem('portalRefreshToken', data.refreshToken);
      localStorage.setItem('portalGuest', JSON.stringify(data.guest));
      navigate('/portal');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}

// ── Share Link Handler ──

export async function handleShareLink(token) {
  const root = document.getElementById('portal-root') || document.getElementById('app');
  root.innerHTML = `<div class="portal-loading"><div class="loading">${t('app.loading')}</div></div>`;

  try {
    const data = await portalApi.post('/auth/link', { token });
    sessionStorage.setItem('portalToken', data.token);
    if (data.refreshToken) localStorage.setItem('portalRefreshToken', data.refreshToken);
    localStorage.setItem('portalGuest', JSON.stringify(data.guest));
    navigate('/portal');
  } catch (err) {
    root.innerHTML = `
      <div class="portal-login">
        <div class="portal-login-card glass-card text-center">
          <i class="bi bi-x-circle text-danger" style="font-size:3rem"></i>
          <h3 class="mt-3">${t('portal.linkInvalid')}</h3>
          <p class="text-muted">${err.message}</p>
          <a href="/portal/login" class="btn btn-primary btn-sm">${t('auth.login')}</a>
        </div>
      </div>
    `;
  }
}

// ── Portal Timeline ──

export async function renderPortalTimeline() {
  const root = document.getElementById('portal-root') || document.getElementById('app');
  const guest = JSON.parse(localStorage.getItem('portalGuest') || '{}');

  await setLocale(localStorage.getItem('locale') || 'nb');

  root.innerHTML = `
    <div class="portal-app">
      <div class="portal-header">
        <div class="portal-header-left">
          <img src="/img/logo-v3-people-circle.svg" alt="" class="portal-header-logo">
          <span class="portal-header-name">${esc(guest.display_name || t('portal.title'))}</span>
        </div>
        <button class="btn btn-link btn-sm text-muted" id="portal-logout"><i class="bi bi-box-arrow-right"></i></button>
      </div>
      <div id="portal-contacts" class="portal-contacts"></div>
      <div id="portal-timeline" class="portal-timeline">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>
  `;

  document.getElementById('portal-logout').addEventListener('click', () => {
    localStorage.removeItem('portalToken');
    localStorage.removeItem('portalRefreshToken');
    localStorage.removeItem('portalGuest');
    sessionStorage.removeItem('portalToken');
    navigate('/portal/login');
  });

  // Load contacts
  try {
    const { contacts } = await portalApi.get('/contacts');

    document.getElementById('portal-contacts').innerHTML = contacts.map((c, i) => `
      <button class="portal-contact-pill ${i === 0 ? 'active' : ''}" data-uuid="${c.uuid}">
        <div class="portal-contact-avatar">
          ${c.avatar ? `<img src="${portalAuthUrl(c.avatar)}" alt="">` : `<span>${(c.first_name?.[0] || '')}</span>`}
        </div>
        <span>${esc(c.first_name)}</span>
      </button>
    `).join('');

    // Load first contact's timeline
    if (contacts.length) {
      await loadPortalTimeline(contacts[0].uuid);
    }

    // Contact switching
    document.getElementById('portal-contacts').addEventListener('click', async (e) => {
      const pill = e.target.closest('.portal-contact-pill');
      if (!pill) return;
      document.querySelectorAll('.portal-contact-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      await loadPortalTimeline(pill.dataset.uuid);
    });
  } catch (err) {
    document.getElementById('portal-contacts').innerHTML = `<div class="text-danger small p-3">${err.message}</div>`;
  }
}

async function loadPortalTimeline(contactUuid) {
  const el = document.getElementById('portal-timeline');
  if (!el) return;
  el.innerHTML = `<div class="loading">${t('app.loading')}</div>`;

  try {
    const { posts, hasMore } = await portalApi.get(`/contacts/${contactUuid}/timeline?limit=20`);

    if (!posts.length) {
      el.innerHTML = `<div class="portal-empty"><i class="bi bi-image"></i><p>${t('posts.noPosts')}</p></div>`;
      return;
    }

    el.innerHTML = posts.map(p => renderPortalPost(p)).join('');

    // Reactions
    el.querySelectorAll('.portal-react-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { reacted } = await portalApi.post(`/posts/${btn.dataset.uuid}/reactions`);
        const icon = btn.querySelector('i');
        icon.className = reacted ? 'bi bi-heart-fill text-danger' : 'bi bi-heart';
        const countEl = btn.querySelector('.portal-react-count');
        let count = parseInt(countEl.textContent) || 0;
        count += reacted ? 1 : -1;
        countEl.textContent = count > 0 ? count : '';
      });
    });

    // Comments toggle
    el.querySelectorAll('.portal-comments-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const section = btn.closest('.portal-post').querySelector('.portal-comments-section');
        if (section.classList.contains('d-none')) {
          section.classList.remove('d-none');
          await loadPortalComments(btn.dataset.uuid, section);
        } else {
          section.classList.add('d-none');
        }
      });
    });

    // Load more
    if (hasMore) {
      el.insertAdjacentHTML('beforeend', `
        <button class="btn btn-outline-secondary btn-sm w-100 mt-3 portal-load-more" data-uuid="${contactUuid}" data-offset="20">
          ${t('posts.loadMore')}
        </button>
      `);
      el.querySelector('.portal-load-more')?.addEventListener('click', async (e) => {
        const btn = e.target;
        const offset = parseInt(btn.dataset.offset);
        btn.textContent = t('app.loading');
        const more = await portalApi.get(`/contacts/${contactUuid}/timeline?limit=20&offset=${offset}`);
        btn.remove();
        el.insertAdjacentHTML('beforeend', more.posts.map(p => renderPortalPost(p)).join(''));
        if (more.hasMore) {
          el.insertAdjacentHTML('beforeend', `
            <button class="btn btn-outline-secondary btn-sm w-100 mt-3 portal-load-more" data-uuid="${contactUuid}" data-offset="${offset + 20}">
              ${t('posts.loadMore')}
            </button>
          `);
        }
      });
    }
  } catch (err) {
    el.innerHTML = `<div class="text-danger small p-3">${err.message}</div>`;
  }
}

function renderPortalPost(p) {
  const images = (p.media || []).filter(m => m.file_type?.startsWith('image/'));
  const videos = (p.media || []).filter(m => m.file_type?.startsWith('video/'));

  return `
    <div class="portal-post" data-uuid="${p.uuid}">
      ${p.about ? `
        <div class="portal-post-header">
          <div class="portal-post-avatar">
            ${p.about.avatar ? `<img src="${portalAuthUrl(p.about.avatar)}" alt="">` : `<span>${(p.about.first_name?.[0] || '')}</span>`}
          </div>
          <div>
            <strong>${esc(p.about.first_name)} ${esc(p.about.last_name || '')}</strong>
            <span class="portal-post-date">${formatDate(p.post_date)}</span>
          </div>
        </div>
      ` : `<div class="portal-post-date-only">${formatDate(p.post_date)}</div>`}

      ${p.body ? `<p class="portal-post-body">${esc(p.body)}</p>` : ''}

      ${images.length ? `
        <div class="portal-post-media portal-media-grid-${Math.min(images.length, 4)}">
          ${images.map(m => `
            <div class="portal-media-item">
              <img src="${portalAuthUrl(m.thumbnail_path || m.file_path)}" alt="" loading="lazy">
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${videos.length ? videos.map(v => `
        <video class="portal-post-video" controls preload="metadata">
          <source src="${portalAuthUrl(v.file_path)}" type="${v.file_type}">
        </video>
      `).join('') : ''}

      <div class="portal-post-actions">
        <button class="portal-react-btn" data-uuid="${p.uuid}">
          <i class="bi bi-heart${p.reacted ? '-fill text-danger' : ''}"></i>
          <span class="portal-react-count">${p.reaction_count || ''}</span>
        </button>
        <button class="portal-comments-toggle" data-uuid="${p.uuid}">
          <i class="bi bi-chat"></i>
          <span>${p.comment_count || ''}</span>
        </button>
      </div>

      <div class="portal-comments-section d-none"></div>
    </div>
  `;
}

async function loadPortalComments(postUuid, section) {
  try {
    const { comments } = await portalApi.get(`/posts/${postUuid}/comments`);
    section.innerHTML = `
      ${comments.map(c => `
        <div class="portal-comment">
          <strong class="small">${esc(c.author)}</strong>
          <span class="small">${esc(c.body)}</span>
          <span class="text-muted" style="font-size:0.7rem">${formatDate(c.created_at)}</span>
        </div>
      `).join('')}
      <form class="portal-comment-form" data-uuid="${postUuid}">
        <input type="text" class="form-control form-control-sm" placeholder="${t('posts.commentPlaceholder')}" required>
        <button type="submit" class="btn btn-primary btn-sm">${t('posts.send')}</button>
      </form>
    `;

    section.querySelector('.portal-comment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      await portalApi.post(`/posts/${postUuid}/comments`, { body: input.value.trim() });
      input.value = '';
      await loadPortalComments(postUuid, section);
    });
  } catch (err) {
    section.innerHTML = `<div class="text-danger small">${err.message}</div>`;
  }
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
