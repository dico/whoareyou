import { api } from '../api/client.js';
import { state } from '../app.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { contactSearchDialog } from '../components/dialogs.js';

export async function renderMgAuthors() {
  const content = document.getElementById('app-content');

  if (state.user?.role !== 'admin' && !state.user?.is_system_admin) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.accessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <a href="/admin/integrations/momentgarden" data-link class="btn btn-link btn-back"><i class="bi bi-arrow-left"></i></a>
        <h2>${t('mg.authorsTitle')}</h2>
      </div>
      <div class="glass-card mb-3 p-3">
        <p class="text-muted small mb-0">${t('mg.authorsDesc')}</p>
      </div>
      <div id="mg-authors-loading" class="text-center py-4">
        <span class="spinner-border spinner-border-sm"></span>
      </div>
      <div id="mg-authors-content" class="d-none"></div>
    </div>
  `;

  try {
    const data = await api.get('/posts/mg-imported');
    document.getElementById('mg-authors-loading').classList.add('d-none');
    const container = document.getElementById('mg-authors-content');
    container.classList.remove('d-none');
    renderList(container, data);
  } catch (err) {
    document.getElementById('mg-authors-loading').innerHTML =
      `<div class="text-danger">${t('common.error')}: ${err.message}</div>`;
  }
}

function renderList(container, data) {
  const { posts, members, guests } = data;

  // Build people list with contact_uuid for matching
  const people = [
    ...members.map(m => ({ contact_uuid: m.contact_uuid, name: m.name, avatar: m.avatar })),
    ...guests.filter(g => g.contact_uuid).map(g => ({ contact_uuid: g.contact_uuid, name: g.name, avatar: g.avatar })),
  ];

  // Map contact_uuid → people index for active matching
  const contactUuidToIdx = new Map();
  people.forEach((p, i) => { if (p.contact_uuid) contactUuidToIdx.set(p.contact_uuid, i); });

  // Map author_contact_id → contact_uuid for matching (need to look up from members/guests)
  const linkedIdToUuid = new Map();
  members.forEach(m => { if (m.contact_uuid) linkedIdToUuid.set(m.contact_uuid, m.contact_uuid); });
  guests.forEach(g => { if (g.contact_uuid) linkedIdToUuid.set(g.contact_uuid, g.contact_uuid); });

  container.innerHTML = `
    <div class="small text-muted mb-2">${posts.length} ${t('mg.importedPosts')}</div>
    <div id="mg-post-list"></div>
  `;

  const listEl = document.getElementById('mg-post-list');

  for (const post of posts) {
    const row = document.createElement('div');
    row.className = 'mg-author-row glass-card mb-2';

    const thumb = post.thumbnail
      ? `<img src="${authUrl(post.thumbnail)}" alt="" class="mg-author-thumb">`
      : `<div class="mg-author-thumb mg-author-no-img"><i class="bi bi-card-text"></i></div>`;

    const bodyPreview = post.body ? post.body.slice(0, 60) + (post.body.length > 60 ? '…' : '') : '';
    const dateStr = post.post_date ? new Date(post.post_date).toLocaleDateString('nb-NO') : '';

    const avatarPicks = people.map((p, idx) => {
      // Match by checking if this person's linked_contact_id matches the post's author
      const isActive = post.author === p.name;
      return `<div class="mg-avatar-pick ${isActive ? 'is-active' : ''}" data-idx="${idx}" data-contact-uuid="${p.contact_uuid}" title="${p.name}">
        ${p.avatar
          ? `<img src="${authUrl(p.avatar)}" alt="">`
          : `<span>${p.name[0]}</span>`
        }
      </div>`;
    }).join('');

    row.innerHTML = `
      ${thumb}
      <div class="mg-author-info">
        <div class="mg-author-meta">
          ${post.contact_name ? `<span class="fw-medium">${post.contact_name}</span> · ` : ''}
          <span class="text-muted">${dateStr}</span>
        </div>
        <div class="mg-author-body text-muted small">${bodyPreview}</div>
      </div>
      <div class="mg-avatar-picks">
        ${avatarPicks}
        <div class="mg-avatar-pick mg-avatar-search" title="${t('common.search')}">
          <span>+</span>
        </div>
      </div>
    `;

    async function assignAuthor(pick, contactUuid) {
      if (pick.classList.contains('is-saving')) return;
      pick.classList.add('is-saving');
      try {
        await api.put(`/posts/${post.uuid}/author`, { contact_uuid: contactUuid });
        row.querySelectorAll('.mg-avatar-pick').forEach(p => p.classList.remove('is-active'));
        pick.classList.add('is-active');
      } catch {}
      pick.classList.remove('is-saving');
    }

    // Avatar pick clicks
    row.querySelectorAll('.mg-avatar-pick:not(.mg-avatar-search)').forEach(pick => {
      pick.addEventListener('click', () => {
        if (pick.classList.contains('is-active')) return;
        assignAuthor(pick, pick.dataset.contactUuid);
      });
    });

    // Search button — opens contact search dialog
    row.querySelector('.mg-avatar-search').addEventListener('click', async () => {
      const contact = await contactSearchDialog({ title: t('mg.assignAuthor') });
      if (!contact) return;
      // Check if this contact is already in the picks
      const existing = row.querySelector(`.mg-avatar-pick[data-contact-uuid="${contact.uuid}"]`);
      if (existing) {
        assignAuthor(existing, contact.uuid);
      } else {
        // Add a temporary avatar pick and assign
        const pick = document.createElement('div');
        pick.className = 'mg-avatar-pick';
        pick.dataset.contactUuid = contact.uuid;
        pick.title = `${contact.first_name} ${contact.last_name || ''}`.trim();
        pick.innerHTML = contact.avatar
          ? `<img src="${authUrl(contact.avatar)}" alt="">`
          : `<span>${contact.first_name[0]}</span>`;
        row.querySelector('.mg-avatar-search').before(pick);
        assignAuthor(pick, contact.uuid);
      }
    });

    listEl.appendChild(row);
  }
}
