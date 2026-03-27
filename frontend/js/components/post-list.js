import { api } from '../api/client.js';
import { confirmDialog, contactSearchDialog } from './dialogs.js';
import { t, formatDate } from '../utils/i18n.js';

/**
 * Render a list of posts into a container element.
 * Supports edit, delete, and tag management.
 * @param {string} containerId - DOM element ID to render into
 * @param {string|null} contactUuid - Filter by contact, or null for global
 * @param {function} onChanged - Callback after post is edited/deleted
 */
export async function renderPostList(containerId, contactUuid, onChanged) {
  const el = document.getElementById(containerId);
  if (!el) return;

  try {
    const params = new URLSearchParams();
    if (contactUuid) params.set('contact', contactUuid);

    const data = await api.get(`/posts?${params}`);

    if (data.posts.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-journal-text"></i>
          <p>${t('posts.noPosts')}</p>
        </div>
      `;
      return;
    }

    el.innerHTML = data.posts.map((p) => `
      <div class="timeline-post glass-card" data-post-uuid="${p.uuid}">
        <div class="post-view">
          ${p.about ? `
            <a href="/contacts/${p.about.uuid}" data-link class="post-about-header">
              <div class="post-about-avatar">
                ${p.about.avatar
                  ? `<img src="${p.about.avatar}" alt="">`
                  : `<span>${(p.about.first_name[0] || '') + (p.about.last_name?.[0] || '')}</span>`
                }
              </div>
              <div>
                <strong>${p.about.first_name} ${p.about.last_name || ''}</strong>
                <span class="post-date">${formatDate(p.post_date)}</span>
              </div>
            </a>
          ` : `
            <div class="post-header">
              <span class="post-date">${formatDate(p.post_date)}</span>
            </div>
          `}
          <div class="post-header-actions">
            ${p.visibility === 'private' ? `<i class="bi bi-lock-fill text-muted post-visibility-icon" title="${t('common.private')}"></i>` : ''}
            <div class="dropdown">
              <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
              <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                <li><a class="dropdown-item btn-edit-post" href="#" data-uuid="${p.uuid}"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
                <li><a class="dropdown-item btn-toggle-visibility" href="#" data-uuid="${p.uuid}">
                  <i class="bi bi-${p.visibility === 'private' ? 'people-fill' : 'lock-fill'} me-2"></i>${p.visibility === 'private' ? t('posts.makeShared') : t('posts.makePrivate')}
                </a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger btn-delete-post" href="#" data-uuid="${p.uuid}"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
              </ul>
            </div>
          </div>
          <div class="post-body">${linkify(escapeHtml(p.body))}</div>
          ${p.contacts.length ? `
            <div class="post-contacts">
              ${p.contacts.map((c) => `
                <a href="/contacts/${c.uuid}" data-link class="badge bg-primary">${c.first_name} ${c.last_name || ''}</a>
              `).join(' ')}
            </div>
          ` : ''}
          ${p.media.length ? `
            <div class="post-media">
              ${p.media.map((m) => `<img src="${m.thumbnail_path || m.file_path}" alt="">`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="post-edit d-none">
          <form class="edit-post-form" data-post-uuid="${p.uuid}">
            ${p.about ? `
              <div class="edit-about" data-has-about="true">
                <span class="edit-about-contact" data-uuid="${p.about.uuid}">
                  <i class="bi bi-person-fill"></i>
                  <span class="edit-about-name">${p.about.first_name} ${p.about.last_name || ''}</span>
                </span>
                <button type="button" class="edit-action btn-change-about" title="${t('relationships.change')}"><i class="bi bi-pencil"></i></button>
                <button type="button" class="edit-action btn-remove-about" title="Remove"><i class="bi bi-x-lg"></i></button>
              </div>
            ` : `
              <div class="edit-about d-none" data-has-about="false">
                <span class="edit-about-contact" data-uuid="">
                  <i class="bi bi-person-fill"></i>
                  <span class="edit-about-name"></span>
                </span>
              </div>
            `}
            <textarea class="form-control edit-post-body" rows="3">${escapeHtml(p.body)}</textarea>
            <div class="edit-bar">
              <div class="edit-tags-list">
                ${p.contacts.map((c) => `
                  <span class="edit-tag" data-uuid="${c.uuid}">
                    ${c.first_name} ${c.last_name || ''}
                    <button type="button" class="btn-remove-tag" data-uuid="${c.uuid}"><i class="bi bi-x"></i></button>
                  </span>
                `).join('')}
                <button type="button" class="edit-action btn-add-tag-edit" title="${t('posts.tagContact')}"><i class="bi bi-person-plus"></i></button>
              </div>
              <div class="edit-actions">
                <button type="button" class="edit-action btn-cancel-edit">${t('common.cancel')}</button>
                <button type="submit" class="edit-action edit-action-primary">${t('common.save')}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `).join('');

    // Store post data for editing
    const postsMap = new Map(data.posts.map((p) => [p.uuid, p]));

    // Edit handlers
    el.querySelectorAll('.btn-edit-post').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const postEl = el.querySelector(`[data-post-uuid="${btn.dataset.uuid}"]`);
        postEl.querySelector('.post-view').classList.add('d-none');
        postEl.querySelector('.post-edit').classList.remove('d-none');
      });
    });

    // Cancel edit
    el.querySelectorAll('.btn-cancel-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const postEl = btn.closest('[data-post-uuid]');
        postEl.querySelector('.post-view').classList.remove('d-none');
        postEl.querySelector('.post-edit').classList.add('d-none');
      });
    });

    // Change "about" contact
    el.querySelectorAll('.btn-change-about').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const contact = await contactSearchDialog({ title: t('relationships.change') });
        if (!contact) return;
        const aboutEl = btn.closest('.edit-about').querySelector('.edit-about-contact');
        aboutEl.dataset.uuid = contact.uuid;
        aboutEl.querySelector('.edit-about-name').textContent = `${contact.first_name} ${contact.last_name || ''}`;
      });
    });

    // Remove "about" — convert to activity post
    el.querySelectorAll('.btn-remove-about').forEach((btn) => {
      btn.addEventListener('click', () => {
        const aboutSection = btn.closest('.edit-about');
        aboutSection.querySelector('.edit-about-contact').dataset.uuid = '';
        aboutSection.classList.add('d-none');
      });
    });

    // Remove tag in edit mode
    el.querySelectorAll('.btn-remove-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('.edit-tag').remove();
      });
    });

    // Add tag in edit mode
    el.querySelectorAll('.btn-add-tag-edit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const contact = await contactSearchDialog();
        if (!contact) return;

        const tagsList = btn.closest('.post-edit-tags').querySelector('.edit-tags-list');
        const existingUuids = [...tagsList.querySelectorAll('.edit-tag')].map((t) => t.dataset.uuid);
        if (existingUuids.includes(contact.uuid)) return;

        const tag = document.createElement('span');
        tag.className = 'badge bg-primary edit-tag';
        tag.dataset.uuid = contact.uuid;
        tag.innerHTML = `${contact.first_name} ${contact.last_name || ''} <button type="button" class="btn-close btn-close-white ms-1 btn-remove-tag" style="font-size:0.5em"></button>`;
        tag.querySelector('.btn-remove-tag').addEventListener('click', () => tag.remove());
        tagsList.appendChild(tag);
      });
    });

    // Save edit
    el.querySelectorAll('.edit-post-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const postEl = form.closest('[data-post-uuid]');
        const uuid = postEl.dataset.postUuid;
        const body = form.querySelector('.edit-post-body').value.trim();
        const contactUuids = [...form.querySelectorAll('.edit-tag')].map((t) => t.dataset.uuid);

        // Get "about" contact (may have been changed or removed)
        const aboutEl = form.querySelector('.edit-about-contact');
        const aboutUuid = aboutEl ? (aboutEl.dataset.uuid || null) : undefined;

        if (!body) return;

        try {
          const payload = { body, contact_uuids: contactUuids };
          // Only send about_contact_uuid if we have the edit-about section
          if (aboutEl) {
            payload.about_contact_uuid = aboutUuid;
          }
          await api.put(`/posts/${uuid}`, payload);
          if (onChanged) onChanged();
          else renderPostList(containerId, contactUuid, onChanged);
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
        }
      });
    });

    // Toggle visibility handlers
    el.querySelectorAll('.btn-toggle-visibility').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const post = postsMap.get(btn.dataset.uuid);
        if (!post) return;
        const newVis = post.visibility === 'private' ? 'shared' : 'private';
        await api.put(`/posts/${btn.dataset.uuid}`, { visibility: newVis });
        if (onChanged) onChanged();
        else renderPostList(containerId, contactUuid, onChanged);
      });
    });

    // Delete handlers
    el.querySelectorAll('.btn-delete-post').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await confirmDialog(t('posts.deletePostConfirm'), { title: t('posts.deletePost'), confirmText: t('common.delete') })) {
          await api.delete(`/posts/${btn.dataset.uuid}`);
          if (onChanged) onChanged();
          else renderPostList(containerId, contactUuid, onChanged);
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function linkify(html) {
  return html
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

