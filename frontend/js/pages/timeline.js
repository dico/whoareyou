import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { renderPostList } from '../components/post-list.js';
import { attachMention } from '../components/mention.js';
import { toggleVisibilityBtn } from '../utils/visibility.js';
import { contactRowHtml } from '../components/contact-row.js';
import { t, formatDate } from '../utils/i18n.js';

export async function renderTimeline(contactUuid = null) {
  const content = document.getElementById('app-content');
  const isDashboard = !contactUuid;

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        ${contactUuid ? `<button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>` : ''}
        <h2>${contactUuid ? t('posts.title') : t('posts.dashboard')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-post">
          <i class="bi bi-plus-lg"></i> ${t('posts.post')}
        </button>
      </div>

      ${isDashboard ? '<div class="dashboard-layout">' : ''}

      <div class="dashboard-main">
        <div id="new-post-area" class="d-none">
          <form id="new-post-form" class="glass-card post-compose">
            <textarea id="post-body" class="form-control" placeholder="${t('posts.placeholder')}" rows="3" required></textarea>
            <div class="post-compose-bar">
              <div class="visibility-pill" id="post-visibility-btn" data-visibility="shared">
                <span class="visibility-pill-option active" data-val="shared"><i class="bi bi-people-fill"></i> ${t('visibility.shared')}</span>
                <span class="visibility-pill-option" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
              </div>
              <div class="post-compose-actions">
                <div class="post-tags" id="post-tags"></div>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-tag-contact">
                  <i class="bi bi-person-plus"></i> ${t('posts.tag')}
                </button>
                <button type="submit" class="btn btn-primary btn-sm">${t('posts.post')}</button>
              </div>
            </div>
            <div id="post-error" class="alert alert-danger d-none mt-2"></div>
          </form>
        </div>

        <div id="timeline" class="timeline">
          <div class="loading">${t('app.loading')}</div>
        </div>
      </div>

      ${isDashboard ? `
      <div class="dashboard-sidebar">
        <div class="sidebar-card glass-card">
          <h4><i class="bi bi-clock-history"></i> ${t('sidebar.recentlyViewed')}</h4>
          <div id="recently-viewed" class="sidebar-contact-list">
            <div class="loading small">${t('app.loading')}</div>
          </div>
        </div>
        <div class="sidebar-card glass-card">
          <h4><i class="bi bi-person-plus"></i> ${t('sidebar.recentlyAdded')}</h4>
          <div id="recently-added" class="sidebar-contact-list">
            <div class="loading small">${t('app.loading')}</div>
          </div>
        </div>
      </div>
      ` : ''}

      ${isDashboard ? '</div>' : ''}
    </div>

    <!-- Tag contact modal -->
    <div class="modal fade" id="tag-modal" tabindex="-1">
      <div class="modal-dialog modal-sm">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${t('posts.tagContact')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="text" class="form-control mb-3" id="tag-search" placeholder="${t('common.search')}">
            <div id="tag-results" class="tag-results"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  let taggedContacts = [];

  // Pre-tag contact if viewing contact timeline
  if (contactUuid) {
    try {
      const { contact } = await api.get(`/contacts/${contactUuid}`);
      taggedContacts.push({ uuid: contact.uuid, first_name: contact.first_name, last_name: contact.last_name });
    } catch {}
  }

  // Reload function
  const reloadPosts = () => renderPostList('timeline', contactUuid, reloadPosts);

  // Load data
  const loads = [reloadPosts()];
  if (isDashboard) {
    loads.push(loadRecentlyViewed(), loadRecentlyAdded());
  }
  await Promise.all(loads);

  // Back button
  document.getElementById('btn-back')?.addEventListener('click', () => navigate(`/contacts/${contactUuid}`));

  // Toggle compose area
  document.getElementById('btn-new-post').addEventListener('click', () => {
    const area = document.getElementById('new-post-area');
    area.classList.toggle('d-none');
    if (!area.classList.contains('d-none')) {
      document.getElementById('post-body').focus();
      renderTags();
    }
  });

  // Visibility pill toggle on compose
  document.getElementById('post-visibility-btn').addEventListener('click', (e) => {
    const pill = e.currentTarget;
    const clicked = e.target.closest('.visibility-pill-option');
    if (!clicked) return;
    pill.dataset.visibility = clicked.dataset.val;
    pill.querySelectorAll('.visibility-pill-option').forEach(o => o.classList.toggle('active', o.dataset.val === clicked.dataset.val));
  });

  // @-mention in compose textarea
  attachMention(document.getElementById('post-body'), (contact) => {
    if (!taggedContacts.find((c) => c.uuid === contact.uuid)) {
      taggedContacts.push(contact);
      renderTags();
    }
  });

  // Tag contact
  document.getElementById('btn-tag-contact').addEventListener('click', () => {
    const modal = new bootstrap.Modal(document.getElementById('tag-modal'));
    modal.show();
    loadTagSearch('');
  });

  // Tag search
  let tagTimeout;
  document.getElementById('tag-search').addEventListener('input', (e) => {
    clearTimeout(tagTimeout);
    tagTimeout = setTimeout(() => loadTagSearch(e.target.value), 200);
  });

  async function loadTagSearch(search) {
    const results = document.getElementById('tag-results');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', '10');
      const data = await api.get(`/contacts?${params}`);

      results.innerHTML = data.contacts
        .filter((c) => !taggedContacts.find((t) => t.uuid === c.uuid))
        .map((c) => `
          <button type="button" class="tag-result" data-uuid="${c.uuid}" data-name="${c.first_name} ${c.last_name || ''}">
            ${c.first_name} ${c.last_name || ''}
          </button>
        `).join('') || `<p class="text-muted small">${t('common.noResults')}</p>`;

      results.querySelectorAll('.tag-result').forEach((btn) => {
        btn.addEventListener('click', () => {
          taggedContacts.push({
            uuid: btn.dataset.uuid,
            first_name: btn.dataset.name.split(' ')[0],
            last_name: btn.dataset.name.split(' ').slice(1).join(' '),
          });
          renderTags();
          bootstrap.Modal.getInstance(document.getElementById('tag-modal')).hide();
        });
      });
    } catch {}
  }

  function renderTags() {
    const el = document.getElementById('post-tags');
    el.innerHTML = taggedContacts.map((c) => `
      <span class="badge bg-primary">
        ${c.first_name} ${c.last_name || ''}
        <button type="button" class="btn-close btn-close-white ms-1" data-uuid="${c.uuid}" style="font-size:0.5em"></button>
      </span>
    `).join('');

    el.querySelectorAll('.btn-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        taggedContacts = taggedContacts.filter((c) => c.uuid !== btn.dataset.uuid);
        renderTags();
      });
    });
  }

  // Submit post
  document.getElementById('new-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('post-error');
    errorEl.classList.add('d-none');

    try {
      await api.post('/posts', {
        body: document.getElementById('post-body').value,
        contact_uuids: taggedContacts.map((c) => c.uuid),
        visibility: document.getElementById('post-visibility-btn').dataset.visibility,
      });

      document.getElementById('post-body').value = '';
      if (!contactUuid) taggedContacts = [];
      renderTags();
      document.getElementById('new-post-area').classList.add('d-none');
      await reloadPosts();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}

async function loadRecentlyViewed() {
  const el = document.getElementById('recently-viewed');
  if (!el) return;

  try {
    const data = await api.get('/contacts?sort=last_viewed&order=desc&limit=8');
    const contacts = data.contacts.filter((c) => c.last_viewed_at);

    if (contacts.length === 0) {
      el.innerHTML = `<p class="text-muted small">${t('sidebar.noContactsViewed')}</p>`;
      return;
    }

    el.innerHTML = contacts.map((c) => contactRowHtml(c)).join('');
  } catch {
    el.innerHTML = '';
  }
}

async function loadRecentlyAdded() {
  const el = document.getElementById('recently-added');
  if (!el) return;

  try {
    const data = await api.get('/contacts?sort=created&order=desc&limit=8');

    el.innerHTML = data.contacts.map((c) =>
      contactRowHtml(c, { meta: formatDateShort(c.created_at) })
    ).join('');
  } catch {
    el.innerHTML = '';
  }
}

function formatDateShort(dateStr) {
  return formatDate(dateStr, { day: 'numeric', month: 'short' });
}
