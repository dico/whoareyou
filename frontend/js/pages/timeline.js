import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { renderPostList } from '../components/post-list.js';
import { attachMention } from '../components/mention.js';
import { attachContactSearch } from '../components/contact-search.js';
import { toggleVisibilityBtn } from '../utils/visibility.js';
import { contactRowHtml } from '../components/contact-row.js';
import { t, formatDate } from '../utils/i18n.js';
import { enableDropZone } from '../utils/drop-zone.js';
import { authUrl } from '../utils/auth-url.js';
import { addContactModalHtml, initAddContactModal, showAddContactModal } from '../components/add-contact-modal.js';

export async function renderTimeline(contactUuid = null) {
  const content = document.getElementById('app-content');
  const isDashboard = !contactUuid;

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        ${contactUuid ? `<button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>` : ''}
        <h2>${contactUuid ? t('posts.title') : t('posts.dashboard')}</h2>
        <div class="d-flex gap-2">
          ${isDashboard ? `<button class="btn btn-outline-primary btn-sm" id="btn-add-contact-timeline">
            <i class="bi bi-person-plus"></i> ${t('contacts.newContact')}
          </button>` : ''}
          <button class="btn btn-primary btn-sm" id="btn-new-post">
            <i class="bi bi-plus-lg"></i> ${t('posts.post')}
          </button>
        </div>
      </div>

      ${isDashboard ? '<div class="dashboard-layout">' : ''}

      <div class="dashboard-main">
        <div id="new-post-area" class="d-none">
          <form id="new-post-form" class="glass-card post-compose">
            <textarea id="post-body" class="form-control" placeholder="${t('posts.placeholder')}" rows="3"></textarea>
            <div id="post-media-preview" class="post-media-preview d-none"></div>
            <div id="post-tags" class="post-tags"></div>
            <div class="post-compose-bar">
              <div class="visibility-pill" id="post-visibility-btn" data-visibility="shared">
                <span class="visibility-pill-option active" data-val="shared"><i class="bi bi-globe2"></i> ${t('visibility.shared')}</span>
                <span class="visibility-pill-option" data-val="family"><i class="bi bi-people-fill"></i> ${t('visibility.family')}</span>
                <span class="visibility-pill-option" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
              </div>
              <div class="post-compose-actions">
                <label class="post-media-btn" id="btn-add-media" title="${t('posts.addMedia')}">
                  <i class="bi bi-image"></i>
                  <input type="file" id="post-media-input" multiple accept="image/*,video/*" hidden>
                </label>
                <label class="post-media-btn" title="${t('posts.addDocument')}">
                  <i class="bi bi-paperclip"></i>
                  <input type="file" id="post-doc-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" hidden>
                </label>
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
        <div class="sidebar-card glass-card">
          <h4><i class="bi bi-cake2"></i> ${t('sidebar.upcomingBirthdays')}</h4>
          <div id="upcoming-birthdays" class="sidebar-contact-list">
            <div class="loading small">${t('app.loading')}</div>
          </div>
        </div>
      </div>
      ` : ''}

      ${isDashboard ? '</div>' : ''}
    </div>

    <!-- Tag contact modal -->
    <div class="modal fade" id="tag-modal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${t('posts.tagContact')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="text" class="form-control" id="tag-search" placeholder="${t('common.search')}" autofocus>
          </div>
        </div>
      </div>
    </div>

    ${isDashboard ? addContactModalHtml() : ''}
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
    loads.push(loadRecentlyViewed(), loadRecentlyAdded(), loadUpcomingBirthdays());
  }
  await Promise.all(loads);

  // Back button
  document.getElementById('btn-back')?.addEventListener('click', () => navigate(`/contacts/${contactUuid}`));

  // Add contact button (dashboard only)
  if (isDashboard) {
    initAddContactModal();
    document.getElementById('btn-add-contact-timeline').addEventListener('click', showAddContactModal);
  }

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

  // Media file handling (images + documents)
  let pendingMedia = [];
  document.getElementById('post-media-input').addEventListener('change', (e) => {
    for (const file of e.target.files) {
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) pendingMedia.push(file);
    }
    renderMediaPreview();
    e.target.value = '';
  });

  document.getElementById('post-doc-input').addEventListener('change', (e) => {
    for (const file of e.target.files) pendingMedia.push(file);
    renderMediaPreview();
    e.target.value = '';
  });

  const docIcons = { 'application/pdf': 'bi-file-earmark-pdf', 'text/plain': 'bi-file-earmark-text', 'text/csv': 'bi-file-earmark-spreadsheet' };
  function getDocIcon(type) {
    if (type.includes('word') || type.includes('document')) return 'bi-file-earmark-word';
    if (type.includes('excel') || type.includes('sheet') || type.includes('csv')) return 'bi-file-earmark-spreadsheet';
    return docIcons[type] || 'bi-file-earmark';
  }

  function renderMediaPreview() {
    const el = document.getElementById('post-media-preview');
    if (!pendingMedia.length) { el.classList.add('d-none'); el.innerHTML = ''; return; }
    el.classList.remove('d-none');
    el.innerHTML = pendingMedia.map((f, i) => {
      if (f.type.startsWith('image/')) {
        return `<div class="media-preview-item">
          <img src="${URL.createObjectURL(f)}" alt="">
          <button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button>
        </div>`;
      }
      if (f.type.startsWith('video/')) {
        return `<div class="media-preview-item">
          <video src="${URL.createObjectURL(f)}" muted style="height:64px;width:64px;object-fit:cover;border-radius:var(--radius-sm)"></video>
          <div class="media-preview-video-badge"><i class="bi bi-play-fill"></i></div>
          <button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button>
        </div>`;
      }
      return `<div class="media-preview-item media-preview-doc">
        <i class="${getDocIcon(f.type)}"></i>
        <span class="media-preview-doc-name">${f.name}</span>
        <button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button>
      </div>`;
    }).join('');
    el.querySelectorAll('.media-preview-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingMedia.splice(parseInt(btn.dataset.index), 1);
        renderMediaPreview();
      });
    });
  }

  // Drop zone on compose form (drag images from browser/filesystem, or paste)
  const composeForm = document.getElementById('new-post-form');
  if (composeForm) {
    enableDropZone(composeForm, (files) => {
      pendingMedia.push(...files);
      renderMediaPreview();
      document.getElementById('new-post-area').classList.remove('d-none');
    }, { acceptDocuments: true });
  }

  // Auto-expand compose textarea
  const composeTextarea = document.getElementById('post-body');
  composeTextarea.addEventListener('input', () => {
    composeTextarea.style.height = 'auto';
    composeTextarea.style.height = composeTextarea.scrollHeight + 'px';
  });

  // @-mention in compose textarea
  attachMention(document.getElementById('post-body'), (contact) => {
    if (!taggedContacts.find((c) => c.uuid === contact.uuid)) {
      taggedContacts.push(contact);
      renderTags();
    }
  });

  // Tag contact
  const tagModal = document.getElementById('tag-modal');
  const tagSearchInput = document.getElementById('tag-search');

  document.getElementById('btn-tag-contact').addEventListener('click', () => {
    new bootstrap.Modal(tagModal).show();
  });

  tagModal.addEventListener('shown.bs.modal', () => { tagSearchInput.value = ''; tagSearchInput.focus(); });

  attachContactSearch(tagSearchInput, {
    limit: 8,
    floating: false,
    onSelect: (c) => {
      if (!taggedContacts.find(t => t.uuid === c.uuid)) {
        taggedContacts.push({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name, avatar: c.avatar || null });
        renderTags();
      }
      bootstrap.Modal.getInstance(tagModal).hide();
    },
  });

  function renderTags() {
    const el = document.getElementById('post-tags');
    el.innerHTML = taggedContacts.map((c) => `
      <span class="contact-chip" data-uuid="${c.uuid}">
        <span class="contact-chip-avatar">
          ${c.avatar
            ? `<img src="${authUrl(c.avatar)}" alt="">`
            : `<span>${(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}</span>`
          }
        </span>
        ${c.first_name} ${c.last_name || ''}
        <button type="button" class="contact-chip-remove" data-uuid="${c.uuid}"><i class="bi bi-x"></i></button>
      </span>
    `).join('');

    el.querySelectorAll('.contact-chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        taggedContacts = taggedContacts.filter((c) => c.uuid !== btn.dataset.uuid);
        renderTags();
      });
    });
  }

  // Submit post
  document.getElementById('new-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('[type="submit"]');
    const btnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
    const errorEl = document.getElementById('post-error');
    errorEl.classList.add('d-none');

    try {
      const { post } = await api.post('/posts', {
        body: document.getElementById('post-body').value,
        contact_uuids: taggedContacts.map((c) => c.uuid),
        visibility: document.getElementById('post-visibility-btn').dataset.visibility,
      });

      // Upload media if any
      if (pendingMedia.length && post?.uuid) {
        const formData = new FormData();
        for (const file of pendingMedia) formData.append('media', file);
        await api.upload(`/posts/${post.uuid}/media`, formData);
      }

      document.getElementById('post-body').value = '';
      document.getElementById('post-body').style.height = 'auto';
      pendingMedia = [];
      renderMediaPreview();
      if (!contactUuid) taggedContacts = [];
      renderTags();
      document.getElementById('new-post-area').classList.add('d-none');
      await reloadPosts();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnText;
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

async function loadUpcomingBirthdays() {
  const el = document.getElementById('upcoming-birthdays');
  if (!el) return;

  try {
    const data = await api.get('/contacts/upcoming-birthdays/list');

    if (data.contacts.length === 0) {
      el.innerHTML = `<p class="text-muted small">${t('sidebar.noBirthdays')}</p>`;
      return;
    }

    el.innerHTML = data.contacts.map((c) => {
      const agePart = c.turning_age != null ? ` — ${t('sidebar.turnsAge', { age: c.turning_age })}` : '';
      const meta = c.days_until === 0
        ? `<strong>${t('sidebar.today')}</strong>${agePart}`
        : c.days_until === 1
          ? `${t('sidebar.tomorrow')}${agePart}`
          : `${t('sidebar.inDays', { days: c.days_until })}${agePart}`;
      return contactRowHtml(c, { meta });
    }).join('');
  } catch {
    el.innerHTML = '';
  }
}

function formatDateShort(dateStr) {
  return formatDate(dateStr, { day: 'numeric', month: 'short' });
}
