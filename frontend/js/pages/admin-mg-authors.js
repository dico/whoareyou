import { api } from '../api/client.js';
import { state } from '../app.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { contactSearchDialog, confirmDialog } from '../components/dialogs.js';

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

  // Build people list with contact_uuid
  const people = [
    ...members.map(m => ({ contact_uuid: m.contact_uuid, name: m.name, avatar: m.avatar })),
    ...guests.filter(g => g.contact_uuid).map(g => ({ contact_uuid: g.contact_uuid, name: g.name, avatar: g.avatar })),
  ];

  // Group posts by about-contact for the filter tabs
  const byContact = new Map();
  for (const post of posts) {
    const key = post.contact_name || '_none';
    if (!byContact.has(key)) byContact.set(key, []);
    byContact.get(key).push(post);
  }

  const filterTabs = [...byContact.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, list]) =>
      `<button class="btn btn-outline-secondary btn-sm mg-filter-tab" data-contact="${name}">${name === '_none' ? t('mg.noContact') : name} (${list.length})</button>`
    ).join('');

  container.innerHTML = `
    <div class="glass-card mb-3 p-3">
      <label class="form-label fw-medium mb-2">${t('mg.filterByContact')}</label>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-primary btn-sm mg-filter-tab is-active-filter" data-contact="">${t('mg.allPosts')} (${posts.length})</button>
        ${filterTabs}
      </div>
    </div>
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="small text-muted" id="mg-post-count">${posts.length} ${t('mg.importedPosts')}</span>
      <button class="btn btn-outline-secondary btn-sm" id="mg-assign-all"><i class="bi bi-people me-1"></i>${t('mg.assignAll')}</button>
    </div>
    <div id="mg-post-list"></div>
  `;

  const listEl = document.getElementById('mg-post-list');
  let filteredContact = null; // null = all

  // Filter tabs
  container.querySelectorAll('.mg-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.mg-filter-tab').forEach(t => {
        t.classList.remove('btn-primary', 'is-active-filter');
        t.classList.add('btn-outline-secondary');
      });
      tab.classList.remove('btn-outline-secondary');
      tab.classList.add('btn-primary', 'is-active-filter');
      filteredContact = tab.dataset.contact || null;
      renderPostRows();
    });
  });

  function getVisiblePosts() {
    if (!filteredContact) return posts;
    return posts.filter(p => (p.contact_name || '_none') === filteredContact);
  }

  function renderPostRows() {
    const visible = getVisiblePosts();
    document.getElementById('mg-post-count').textContent = `${visible.length} ${t('mg.importedPosts')}`;
    listEl.innerHTML = '';

    for (const post of visible) {
      const row = document.createElement('div');
      row.className = 'mg-author-row glass-card mb-2';

      const thumb = post.thumbnail
        ? `<img src="${authUrl(post.thumbnail)}" alt="" class="mg-author-thumb">`
        : `<div class="mg-author-thumb mg-author-no-img"><i class="bi bi-card-text"></i></div>`;

      const bodyPreview = post.body ? post.body.slice(0, 60) + (post.body.length > 60 ? '…' : '') : '';
      const dateStr = post.post_date ? new Date(post.post_date).toLocaleDateString('nb-NO') : '';

      // Check if current author is outside the people list
      const author = post.author; // { name, uuid, avatar } or null
      const authorInPeople = author && people.some(p => p.contact_uuid === author.uuid);

      const avatarPicks = people.map(p => {
        const isActive = author && p.contact_uuid === author.uuid;
        return `<div class="mg-avatar-pick ${isActive ? 'is-active' : ''}" data-contact-uuid="${p.contact_uuid}" title="${p.name}">
          ${p.avatar
            ? `<img src="${authUrl(p.avatar)}" alt="">`
            : `<span>${p.name[0]}</span>`
          }
        </div>`;
      }).join('');

      // If author is set but not in the people list, add an extra avatar
      const extraAuthor = (author && !authorInPeople)
        ? `<div class="mg-avatar-pick is-active" data-contact-uuid="${author.uuid}" title="${author.name}">
            ${author.avatar
              ? `<img src="${authUrl(author.avatar)}" alt="">`
              : `<span>${author.name[0]}</span>`
            }
          </div>`
        : '';

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
          ${extraAuthor}
          <div class="mg-avatar-pick mg-avatar-search" title="${t('common.search')}"><span>+</span></div>
        </div>
      `;

      // Individual avatar picks
      row.querySelectorAll('.mg-avatar-pick:not(.mg-avatar-search)').forEach(pick => {
        pick.addEventListener('click', () => {
          if (pick.classList.contains('is-active') || pick.classList.contains('is-saving')) return;
          assignSingle(row, pick, post.uuid, pick.dataset.contactUuid);
        });
      });

      row.querySelector('.mg-avatar-search').addEventListener('click', async () => {
        const contact = await contactSearchDialog({ title: t('mg.assignAuthor') });
        if (!contact) return;
        const existing = row.querySelector(`.mg-avatar-pick[data-contact-uuid="${contact.uuid}"]`);
        if (existing) {
          assignSingle(row, existing, post.uuid, contact.uuid);
        } else {
          const pick = document.createElement('div');
          pick.className = 'mg-avatar-pick';
          pick.dataset.contactUuid = contact.uuid;
          pick.title = `${contact.first_name} ${contact.last_name || ''}`.trim();
          pick.innerHTML = contact.avatar
            ? `<img src="${authUrl(contact.avatar)}" alt="">`
            : `<span>${contact.first_name[0]}</span>`;
          row.querySelector('.mg-avatar-search').before(pick);
          assignSingle(row, pick, post.uuid, contact.uuid);
        }
      });

      listEl.appendChild(row);
    }
  }

  async function assignSingle(row, pick, postUuid, contactUuid) {
    pick.classList.add('is-saving');
    try {
      await api.put(`/posts/${postUuid}/author`, { contact_uuid: contactUuid });
      row.querySelectorAll('.mg-avatar-pick').forEach(p => p.classList.remove('is-active'));
      pick.classList.add('is-active');
    } catch {}
    pick.classList.remove('is-saving');
  }

  // "Assign all" — uses bulk endpoint, filtered by current contact tab
  document.getElementById('mg-assign-all').addEventListener('click', async () => {
    const contact = await contactSearchDialog({ title: t('mg.assignAllTitle') });
    if (!contact) return;
    const name = `${contact.first_name} ${contact.last_name || ''}`.trim();
    const visible = getVisiblePosts();
    const label = filteredContact && filteredContact !== '_none' ? filteredContact : t('mg.allPosts').toLowerCase();
    const confirmed = await confirmDialog(
      t('mg.assignAllConfirm', { name, count: visible.length, label }),
      { title: t('mg.assignAll'), confirmText: t('mg.assignAllBtn', { count: visible.length }) },
    );
    if (!confirmed) return;

    const btn = document.getElementById('mg-assign-all');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('mg.assigningAll')}`;

    try {
      const payload = { contact_uuid: contact.uuid };
      // If filtered by contact, pass the about_contact_uuid so backend filters too
      if (filteredContact && filteredContact !== '_none') {
        const aboutPost = visible.find(p => p.contact_name === filteredContact);
        // Get about contact UUID from the posts data — need to find it
        // Use the mg-imported endpoint's contact_uuid filter approach
        const aboutContact = await api.get(`/contacts?search=${encodeURIComponent(filteredContact)}&limit=1`);
        if (aboutContact.contacts?.[0]) {
          payload.about_contact_uuid = aboutContact.contacts[0].uuid;
        }
      }
      const result = await api.put('/posts/mg-bulk-author', payload);
      btn.innerHTML = `<i class="bi bi-check me-1"></i>${result.updated} ${t('mg.updated')}`;
      btn.classList.remove('btn-outline-secondary');
      btn.classList.add('btn-success');
      // Reload after short delay
      setTimeout(() => renderMgAuthors(), 1500);
    } catch (err) {
      btn.innerHTML = `<i class="bi bi-x me-1"></i>${t('common.error')}`;
      btn.disabled = false;
    }
  });

  renderPostRows();
}
