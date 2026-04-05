import { t, formatDate, timeAgo, formatDateTime, setLocale } from '../utils/i18n.js';
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
      const refreshToken = getPortalRefreshToken();
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
      clearPortalTokens();
      navigate('/portal/login');
      throw new Error('Session expired');
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
    return res.json();
  },
  get: (path) => portalApi.request('GET', path),
  post: (path, body) => portalApi.request('POST', path, body),
  put: (path, body) => portalApi.request('PUT', path, body),
  delete: (path) => portalApi.request('DELETE', path),
  async upload(path, formData) {
    const token = localStorage.getItem('portalToken') || sessionStorage.getItem('portalToken');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/portal${path}`, { method: 'POST', headers, body: formData });
    if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
    return res.json();
  },
};

// Token storage with cookie fallback (iOS standalone doesn't share localStorage)
function savePortalTokens(token, refreshToken, guest) {
  localStorage.setItem('portalToken', token);
  if (refreshToken) localStorage.setItem('portalRefreshToken', refreshToken);
  if (guest) localStorage.setItem('portalGuest', JSON.stringify(guest));
  // Cookie fallback for iOS standalone mode
  document.cookie = `portalRefreshToken=${refreshToken || ''};path=/portal;max-age=${365*86400};SameSite=Strict`;
}

function getPortalToken() {
  return localStorage.getItem('portalToken') || sessionStorage.getItem('portalToken') || '';
}

function getPortalRefreshToken() {
  return localStorage.getItem('portalRefreshToken')
    || document.cookie.split('; ').find(c => c.startsWith('portalRefreshToken='))?.split('=')[1]
    || '';
}

function clearPortalTokens() {
  localStorage.removeItem('portalToken');
  localStorage.removeItem('portalRefreshToken');
  localStorage.removeItem('portalGuest');
  sessionStorage.removeItem('portalToken');
  document.cookie = 'portalRefreshToken=;path=/portal;max-age=0';
}

function portalAuthUrl(path) {
  if (!path) return '';
  const token = getPortalToken();
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
      savePortalTokens(data.token, data.refreshToken, data.guest);
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
    savePortalTokens(data.token, data.refreshToken, data.guest);
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

// ── Portal Gallery ──

async function loadPortalGallery(contactUuid) {
  const el = document.getElementById('portal-gallery');
  if (!el) return;
  el.innerHTML = `<div class="loading">${t('app.loading')}</div>`;

  try {
    const { images: allImages } = await portalApi.get(`/contacts/${contactUuid}/gallery`);

    if (!allImages?.length) {
      el.innerHTML = `<div class="portal-empty"><i class="bi bi-image"></i><p>${t('posts.noPhotos')}</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="contact-gallery-grid">
        ${allImages.map((img, i) => `
          <div class="contact-gallery-item" data-index="${i}" data-full="${portalAuthUrl(img.file_path)}">
            <img src="${portalAuthUrl(img.thumbnail_path || img.file_path)}" alt="" loading="lazy">
          </div>
        `).join('')}
      </div>
    `;

    el.querySelectorAll('.contact-gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        const images = [...el.querySelectorAll('.contact-gallery-item')].map(el => el.dataset.full);
        showPortalLightbox(images, idx);
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="text-danger small p-3">${err.message}</div>`;
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
        <button class="portal-logout-btn" id="portal-logout"><i class="bi bi-box-arrow-right"></i> ${t('nav.logout')}</button>
      </div>
      <div id="portal-contacts" class="portal-contacts"></div>
      <div class="portal-view-tabs filter-tabs mb-3" id="portal-view-tabs">
        <button class="filter-tab active" data-view="timeline"><i class="bi bi-journal-text me-1"></i>${t('posts.title')}</button>
        <button class="filter-tab" data-view="gallery"><i class="bi bi-grid-3x3-gap me-1"></i>${t('posts.gallery')}</button>
      </div>
      <div id="portal-timeline" class="portal-timeline">
        <div class="loading">${t('app.loading')}</div>
      </div>
      <div id="portal-gallery" class="d-none"></div>
    </div>
  `;

  document.getElementById('portal-logout').addEventListener('click', async () => {
    const mid = 'portal-logout-' + Date.now();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="${mid}" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-body text-center p-4">
              <i class="bi bi-box-arrow-right" style="font-size:2rem;color:var(--color-text-secondary)"></i>
              <h5 class="mt-2">${t('portal.logoutConfirm')}</h5>
              <p class="text-muted small">${t('portal.logoutHint')}</p>
              <div class="d-flex gap-2 justify-content-center mt-3">
                <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
                <button class="btn btn-primary btn-sm" id="${mid}-confirm">${t('nav.logout')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
    const modalEl = document.getElementById(mid);
    const modal = new bootstrap.Modal(modalEl);
    document.getElementById(`${mid}-confirm`).addEventListener('click', () => {
      clearPortalTokens();
      modal.hide();
      navigate('/portal/login');
    });
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
    modal.show();
  });

  // View tabs (timeline / gallery)
  let currentContactUuid = null;
  document.getElementById('portal-view-tabs').addEventListener('click', async (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#portal-view-tabs .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    document.getElementById('portal-timeline').classList.toggle('d-none', view !== 'timeline');
    document.getElementById('portal-gallery').classList.toggle('d-none', view !== 'gallery');
    if (view === 'gallery' && currentContactUuid) {
      await loadPortalGallery(currentContactUuid);
    }
  });

  // Add to homescreen banner
  showInstallBanner();

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
      currentContactUuid = contacts[0].uuid;
      await loadPortalTimeline(currentContactUuid);
    }

    // Contact switching
    document.getElementById('portal-contacts').addEventListener('click', async (e) => {
      const pill = e.target.closest('.portal-contact-pill');
      if (!pill) return;
      document.querySelectorAll('.portal-contact-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentContactUuid = pill.dataset.uuid;
      // Reset to timeline view
      document.querySelectorAll('#portal-view-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('#portal-view-tabs [data-view="timeline"]')?.classList.add('active');
      document.getElementById('portal-timeline').classList.remove('d-none');
      document.getElementById('portal-gallery').classList.add('d-none');
      await loadPortalTimeline(currentContactUuid);
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

    // Compose form for portal guests
    el.innerHTML = `
      <div class="portal-compose glass-card">
        <form class="portal-compose-form" data-contact="${contactUuid}">
          <textarea class="form-control form-control-sm" placeholder="${t('posts.commentPlaceholder')}" rows="2" required></textarea>
          <div class="portal-compose-preview d-none"></div>
          <div class="portal-compose-bar">
            <label class="post-media-btn" title="${t('posts.addMedia')}">
              <i class="bi bi-image"></i>
              <input type="file" class="portal-compose-media" multiple accept="image/*,video/*" hidden>
            </label>
            <button type="submit" class="btn btn-primary btn-sm">${t('posts.post')}</button>
          </div>
        </form>
      </div>
    ` + posts.map(p => renderPortalPost(p)).join('');

    // Compose form handlers
    const composeForm = el.querySelector('.portal-compose-form');
    let portalPostMedia = [];
    const composePreview = el.querySelector('.portal-compose-preview');

    // Auto-resize textarea
    const composeTextarea = composeForm.querySelector('textarea');
    composeTextarea.addEventListener('input', () => {
      composeTextarea.style.height = 'auto';
      composeTextarea.style.height = Math.min(composeTextarea.scrollHeight, 200) + 'px';
    });

    composeForm.querySelector('.portal-compose-media').addEventListener('change', (e) => {
      portalPostMedia.push(...e.target.files);
      composePreview.innerHTML = portalPostMedia.map((f, i) => `
        <div class="portal-compose-thumb">
          <img src="${URL.createObjectURL(f)}" alt="">
          <button type="button" class="portal-compose-thumb-remove" data-index="${i}"><i class="bi bi-x"></i></button>
        </div>
      `).join('');
      composePreview.classList.remove('d-none');
      composePreview.querySelectorAll('.portal-compose-thumb-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          portalPostMedia.splice(parseInt(btn.dataset.index), 1);
          if (!portalPostMedia.length) { composePreview.classList.add('d-none'); composePreview.innerHTML = ''; }
          else composeForm.querySelector('.portal-compose-media').dispatchEvent(new Event('change'));
        });
      });
      e.target.value = '';
    });

    composeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const textarea = composeForm.querySelector('textarea');
      const body = textarea.value.trim();
      if (!body && !portalPostMedia.length) return;

      const submitBtn = composeForm.querySelector('[type="submit"]');
      submitBtn.disabled = true;

      try {
        const { post } = await portalApi.post('/posts', {
          body: body || '',
          contact_uuid: contactUuid,
        });

        if (portalPostMedia.length && post?.uuid) {
          const formData = new FormData();
          for (const file of portalPostMedia) formData.append('media', file);
          await portalApi.upload(`/posts/${post.uuid}/media`, formData);
        }

        textarea.value = '';
        textarea.style.height = 'auto';
        portalPostMedia = [];
        composePreview.classList.add('d-none');
        composePreview.innerHTML = '';
        await loadPortalTimeline(contactUuid);
      } catch (err) {
        await portalConfirm(err.message);
      }
      submitBtn.disabled = false;
    });

    // Edit own post
    el.querySelectorAll('.portal-edit-post').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const postEl = btn.closest('.portal-post');
        const uuid = btn.dataset.uuid;
        const bodyEl = postEl.querySelector('.portal-post-body');
        const currentText = bodyEl?.textContent || '';

        // Replace body with textarea
        const editHtml = `
          <div class="portal-post-edit">
            <textarea class="form-control mb-2" rows="3">${esc(currentText)}</textarea>
            <div class="d-flex gap-2 justify-content-end">
              <button type="button" class="btn btn-outline-secondary btn-sm portal-edit-cancel">${t('common.cancel')}</button>
              <button type="button" class="btn btn-primary btn-sm portal-edit-save">${t('common.save')}</button>
            </div>
          </div>`;
        if (bodyEl) bodyEl.outerHTML = editHtml;
        else postEl.querySelector('.portal-post-header').insertAdjacentHTML('afterend', editHtml);

        const editDiv = postEl.querySelector('.portal-post-edit');
        const textarea = editDiv.querySelector('textarea');
        textarea.focus();

        editDiv.querySelector('.portal-edit-cancel').addEventListener('click', () => {
          editDiv.outerHTML = currentText ? `<p class="portal-post-body">${esc(currentText)}</p>` : '';
        });

        editDiv.querySelector('.portal-edit-save').addEventListener('click', async () => {
          const newBody = textarea.value.trim();
          await portalApi.put(`/posts/${uuid}`, { body: newBody });
          editDiv.outerHTML = newBody ? `<p class="portal-post-body">${esc(newBody)}</p>` : '';
        });
      });
    });

    // Delete own post
    el.querySelectorAll('.portal-delete-post').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const ok = await portalConfirm(t('posts.deletePostConfirm'));
        if (!ok) return;
        await portalApi.delete(`/posts/${btn.dataset.uuid}`);
        const postEl = btn.closest('.portal-post');
        postEl.style.transition = 'opacity 0.3s';
        postEl.style.opacity = '0';
        setTimeout(() => postEl.remove(), 300);
      });
    });

    // Reactions
    el.querySelectorAll('.portal-react-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uuid = btn.dataset.uuid;
        const { reacted, reaction_count, reaction_names } = await portalApi.post(`/posts/${uuid}/reactions`);
        const icon = btn.querySelector('i');
        icon.className = reacted ? 'bi bi-heart-fill text-danger' : 'bi bi-heart';

        // Update engagement bar
        const post = btn.closest('.portal-post');
        const engagementBar = post.querySelector('.portal-engagement-bar');
        const likesEl = post.querySelector('.portal-engagement-likes');
        if (reaction_count > 0) {
          const likesHtml = `<span class="portal-engagement-likes">
            <i class="bi bi-heart-fill text-danger"></i>
            ${formatPortalLikeNames(reaction_names || [], reaction_count)}
          </span>`;
          if (likesEl) {
            likesEl.outerHTML = likesHtml;
          } else if (engagementBar) {
            engagementBar.insertAdjacentHTML('afterbegin', likesHtml);
          } else {
            const actionsBar = post.querySelector('.portal-post-actions');
            actionsBar.insertAdjacentHTML('beforebegin', `<div class="portal-engagement-bar">${likesHtml}</div>`);
          }
        } else if (likesEl) {
          likesEl.remove();
          if (engagementBar && !engagementBar.children.length) engagementBar.remove();
        }
      });
    });

    // Load comments inline (always visible)
    el.querySelectorAll('.portal-comments-section').forEach(async (section) => {
      const postUuid = section.closest('.portal-post')?.dataset.uuid;
      if (postUuid) await loadPortalComments(postUuid, section);
    });

    // Comments toggle still works for expand/collapse if needed
    el.querySelectorAll('.portal-comments-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const section = btn.closest('.portal-post').querySelector('.portal-comments-section');
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        section.querySelector('input')?.focus();
      });
    });

    // Image lightbox — use full-size images (data-full), not thumbnails
    el.querySelectorAll('.portal-media-item').forEach(item => {
      item.addEventListener('click', () => {
        const grid = item.closest('.portal-post-media');
        const items = [...grid.querySelectorAll('.portal-media-item')];
        const idx = items.indexOf(item);
        const images = items.map(el => el.dataset.full || el.querySelector('img')?.src);
        showPortalLightbox(images, Math.max(idx, 0));
      });
    });

    // Infinite scroll
    if (hasMore) {
      let loadingMore = false;
      let nextOffset = 20;
      const sentinel = document.createElement('div');
      sentinel.className = 'portal-scroll-sentinel';
      el.appendChild(sentinel);

      const observer = new IntersectionObserver(async (entries) => {
        if (!entries[0].isIntersecting || loadingMore) return;
        loadingMore = true;
        try {
          const more = await portalApi.get(`/contacts/${contactUuid}/timeline?limit=20&offset=${nextOffset}`);
          sentinel.remove();
          const newHtml = more.posts.map(p => renderPortalPost(p)).join('');
          el.insertAdjacentHTML('beforeend', newHtml);

          // Attach handlers on new posts
          el.querySelectorAll('.portal-post:not([data-initialized])').forEach(post => {
            post.dataset.initialized = '1';
            // Comments
            const section = post.querySelector('.portal-comments-section');
            if (section) loadPortalComments(post.dataset.uuid, section);
            // Images
            post.querySelectorAll('.portal-media-item').forEach(item => {
              item.addEventListener('click', () => {
                const grid = item.closest('.portal-post-media');
                const items = [...grid.querySelectorAll('.portal-media-item')];
                const idx = items.indexOf(item);
                showPortalLightbox(items.map(el => el.dataset.full || el.querySelector('img')?.src), Math.max(idx, 0));
              });
            });
            // Reactions
            post.querySelectorAll('.portal-react-btn').forEach(btn => {
              btn.addEventListener('click', async () => {
                const { reacted } = await portalApi.post(`/posts/${btn.dataset.uuid}/reactions`);
                btn.querySelector('i').className = reacted ? 'bi bi-heart-fill text-danger' : 'bi bi-heart';
                const countEl = btn.querySelector('.portal-react-count');
                let count = parseInt(countEl.textContent) || 0;
                countEl.textContent = (count + (reacted ? 1 : -1)) || '';
              });
            });
          });

          nextOffset += 20;
          if (more.hasMore) {
            el.appendChild(sentinel);
          } else {
            observer.disconnect();
          }
        } catch { observer.disconnect(); }
        loadingMore = false;
      }, { rootMargin: '200px' });

      observer.observe(sentinel);
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
      ${(() => {
        const authorAvatar = p.author?.avatar || p.about?.avatar;
        const authorName = p.author?.name || (p.about ? `${p.about.first_name} ${p.about.last_name || ''}` : '');
        const initial = authorName?.[0] || '?';
        return `
        <div class="portal-post-header">
          <div class="portal-post-avatar">
            ${authorAvatar ? `<img src="${portalAuthUrl(authorAvatar)}" alt="">` : `<span>${initial}</span>`}
          </div>
          <div style="flex:1">
            <strong>${esc(authorName)}</strong>
            <span class="portal-post-date">${formatDate(p.post_date)}</span>
          </div>
          ${p.is_own ? `
          <div class="dropdown">
            <button class="btn btn-link btn-sm p-0" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item portal-edit-post" href="#" data-uuid="${p.uuid}"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger portal-delete-post" href="#" data-uuid="${p.uuid}"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
            </ul>
          </div>
          ` : ''}
        </div>`;
      })()}
      ${p.body ? `<p class="portal-post-body">${esc(p.body)}</p>` : ''}

      ${images.length ? `
        <div class="portal-post-media portal-media-grid-${Math.min(images.length, 4)}">
          ${images.map(m => `
            <div class="portal-media-item" data-full="${portalAuthUrl(m.file_path)}">
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

      ${p.reaction_count || p.comment_count ? `
      <div class="portal-engagement-bar">
        ${p.reaction_count ? `<span class="portal-engagement-likes">
          <i class="bi bi-heart-fill text-danger"></i>
          ${formatPortalLikeNames(p.reaction_names, p.reaction_count)}
        </span>` : ''}
        ${p.comment_count ? `<span class="portal-engagement-comments">
          ${p.comment_count} ${p.comment_count === 1 ? t('posts.commentSingular') : t('posts.commentPlural')}
        </span>` : ''}
      </div>` : ''}
      <div class="portal-post-actions">
        <button class="portal-react-btn" data-uuid="${p.uuid}">
          <i class="bi bi-heart${p.reacted ? '-fill text-danger' : ''}"></i>
          <span>${t('posts.like')}</span>
        </button>
        <button class="portal-comments-toggle" data-uuid="${p.uuid}">
          <i class="bi bi-chat"></i>
          <span>${t('posts.comment')}</span>
        </button>
      </div>

      <div class="portal-comments-section"></div>
    </div>
  `;
}

async function loadPortalComments(postUuid, section) {
  try {
    const { comments } = await portalApi.get(`/posts/${postUuid}/comments`);
    section.innerHTML = `
      ${comments.map(c => `
        <div class="portal-comment" data-id="${c.id}">
          <div class="portal-comment-avatar">
            ${c.avatar ? `<img src="${portalAuthUrl(c.avatar)}" alt="">` : `<span>${(c.author?.[0] || '?')}</span>`}
          </div>
          <div>
            <div class="portal-comment-bubble">
              <strong>${esc(c.author)}</strong>
              <span>${esc(c.body)}</span>
            </div>
            <div class="portal-comment-meta">
              <span class="portal-comment-time" title="${formatDateTime(c.created_at)}">${timeAgo(c.created_at)}</span>
              ${c.is_own ? `<button class="portal-comment-delete" data-id="${c.id}">${t('common.delete')}</button>` : ''}
            </div>
          </div>
        </div>
      `).join('')}
      <form class="portal-comment-form" data-uuid="${postUuid}">
        <textarea class="form-control form-control-sm" placeholder="${t('posts.commentPlaceholder')}" rows="1" required></textarea>
        <button type="submit" class="btn btn-primary btn-sm">${t('posts.send')}</button>
      </form>
    `;

    const form = section.querySelector('.portal-comment-form');
    const textarea = form?.querySelector('textarea');
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      });
    }
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!textarea.value.trim()) return;
      await portalApi.post(`/posts/${postUuid}/comments`, { body: textarea.value.trim() });
      textarea.value = '';
      textarea.style.height = 'auto';
      await loadPortalComments(postUuid, section);
    });

    // Delete own comments
    section.querySelectorAll('.portal-comment-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await portalConfirm(t('posts.deleteCommentConfirm'));
        if (!confirmed) return;
        await portalApi.delete(`/posts/${postUuid}/comments/${btn.dataset.id}`);
        await loadPortalComments(postUuid, section);
      });
    });
  } catch (err) {
    section.innerHTML = `<div class="text-danger small">${err.message}</div>`;
  }
}

function showInstallBanner() {
  // Don't show if already in standalone mode or dismissed
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (window.navigator.standalone) return; // iOS standalone
  if (localStorage.getItem('portalInstallDismissed')) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  if (!isIOS && !isAndroid) return; // Only show on mobile

  const instructions = isIOS
    ? t('portal.installIOS')
    : t('portal.installAndroid');

  const banner = document.createElement('div');
  banner.className = 'portal-install-banner';
  banner.innerHTML = `
    <div class="portal-install-content">
      <i class="bi bi-phone me-2"></i>
      <span>${instructions}</span>
    </div>
    <button class="portal-install-close" id="portal-install-dismiss"><i class="bi bi-x-lg"></i></button>
  `;

  document.querySelector('.portal-app')?.prepend(banner);

  document.getElementById('portal-install-dismiss')?.addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('portalInstallDismissed', '1');
  });
}

// Capture Android's beforeinstallprompt
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Show Android native install if banner is visible
  const banner = document.querySelector('.portal-install-banner');
  if (banner) {
    banner.querySelector('.portal-install-content').innerHTML = `
      <i class="bi bi-phone me-2"></i>
      <span>${t('portal.installAndroid')}</span>
      <button class="btn btn-primary btn-sm ms-2" id="portal-install-btn">${t('portal.install')}</button>
    `;
    document.getElementById('portal-install-btn')?.addEventListener('click', async () => {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') banner.remove();
      deferredInstallPrompt = null;
    });
  }
});

function showPortalLightbox(images, startIndex) {
  let current = startIndex;
  const mid = 'portal-lb-' + Date.now();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" style="background:#000;border:none;border-radius:var(--radius-lg);overflow:hidden">
          <div class="photo-viewer" id="${mid}-viewer" style="position:relative;text-align:center">
            <img src="${images[current]}" alt="" style="max-width:100%;max-height:80vh;object-fit:contain">
            ${images.length > 1 ? `
              <button type="button" class="photo-viewer-nav photo-viewer-prev" id="${mid}-prev"><i class="bi bi-chevron-left"></i></button>
              <button type="button" class="photo-viewer-nav photo-viewer-next" id="${mid}-next"><i class="bi bi-chevron-right"></i></button>
            ` : ''}
          </div>
          <div class="photo-viewer-footer" style="background:var(--color-surface)">
            <span id="${mid}-caption" class="photo-viewer-caption">${current + 1} / ${images.length}</span>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);

  function update() {
    modalEl.querySelector('.photo-viewer img').src = images[current];
    document.getElementById(`${mid}-caption`).textContent = `${current + 1} / ${images.length}`;
  }

  document.getElementById(`${mid}-prev`)?.addEventListener('click', () => { current = (current - 1 + images.length) % images.length; update(); });
  document.getElementById(`${mid}-next`)?.addEventListener('click', () => { current = (current + 1) % images.length; update(); });

  const keyHandler = (e) => {
    if (e.key === 'ArrowLeft') { current = (current - 1 + images.length) % images.length; update(); }
    if (e.key === 'ArrowRight') { current = (current + 1) % images.length; update(); }
  };
  document.addEventListener('keydown', keyHandler);
  modalEl.addEventListener('hidden.bs.modal', () => { document.removeEventListener('keydown', keyHandler); modalEl.remove(); }, { once: true });
  modal.show();
}

function portalConfirm(message) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content glass-card">
          <div class="modal-body text-center py-4">
            <p class="mb-3">${message}</p>
            <div class="d-flex gap-2 justify-content-center">
              <button class="btn btn-outline-secondary btn-sm px-3" data-action="cancel">${t('common.cancel')}</button>
              <button class="btn btn-danger btn-sm px-3" data-action="confirm">${t('common.delete')}</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const modal = new bootstrap.Modal(el);
    el.querySelector('[data-action="confirm"]').addEventListener('click', () => { modal.hide(); resolve(true); });
    el.querySelector('[data-action="cancel"]').addEventListener('click', () => { modal.hide(); resolve(false); });
    el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(false); }, { once: true });
    modal.show();
  });
}

function formatPortalLikeNames(names, count) {
  if (!names?.length) return count;
  if (names.length <= 2) return esc(names.join(` ${t('common.and')} `));
  return `${esc(names[0])}, ${esc(names[1])} ${t('posts.andOthers', { count: count - 2 })}`;
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
