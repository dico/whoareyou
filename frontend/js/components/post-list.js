import { api } from '../api/client.js';
import { confirmDialog, contactSearchDialog } from './dialogs.js';
import { attachMention } from './mention.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

/**
 * Render a list of posts into a container element.
 * Supports edit, delete, and tag management.
 * @param {string} containerId - DOM element ID to render into
 * @param {string|null} contactUuid - Filter by contact, or null for global
 * @param {function} onChanged - Callback after post is edited/deleted
 */
let currentLimit = {};

export async function renderPostList(containerId, contactUuid, onChanged, { loadMore = false, keepLimit = false } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const key = containerId + (contactUuid || '');
  if (loadMore) currentLimit[key] = (currentLimit[key] || 20) + 20;
  else if (!keepLimit) currentLimit[key] = 20;

  try {
    const params = new URLSearchParams();
    if (contactUuid) params.set('contact', contactUuid);
    params.set('limit', currentLimit[key]);

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

    el.innerHTML = data.posts.map((p) => p.type === 'life_event' ? renderLifeEventCard(p, contactUuid) : `
      <div class="timeline-post glass-card" data-post-uuid="${p.uuid}">
        <div class="post-view">
          ${p.about ? `
            <a href="/contacts/${p.about.uuid}" data-link class="post-about-header">
              <div class="post-about-avatar">
                ${p.about.avatar
                  ? `<img src="${authUrl(p.about.avatar)}" alt="">`
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
            ${p.visibility === 'private' ? `<i class="bi bi-lock-fill text-muted post-visibility-icon" title="${t('visibility.private')}"></i>` : ''}
            ${p.visibility === 'family' ? `<i class="bi bi-people-fill text-muted post-visibility-icon" title="${t('visibility.family')}"></i>` : ''}
            <div class="dropdown">
              <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
              <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                <li><a class="dropdown-item btn-edit-post" href="#" data-uuid="${p.uuid}"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
                <li><a class="dropdown-item btn-set-visibility" href="#" data-uuid="${p.uuid}" data-vis="shared">
                  <i class="bi bi-globe2 me-2"></i>${t('visibility.shared')} ${p.visibility === 'shared' ? '<i class="bi bi-check"></i>' : ''}
                </a></li>
                <li><a class="dropdown-item btn-set-visibility" href="#" data-uuid="${p.uuid}" data-vis="family">
                  <i class="bi bi-people-fill me-2"></i>${t('visibility.family')} ${p.visibility === 'family' ? '<i class="bi bi-check"></i>' : ''}
                </a></li>
                <li><a class="dropdown-item btn-set-visibility" href="#" data-uuid="${p.uuid}" data-vis="private">
                  <i class="bi bi-lock-fill me-2"></i>${t('visibility.private')} ${p.visibility === 'private' ? '<i class="bi bi-check"></i>' : ''}
                </a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger btn-delete-post" href="#" data-uuid="${p.uuid}"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
              </ul>
            </div>
          </div>
          <div class="post-body">${linkifyPost(escapeHtml(p.body), p.contacts)}</div>
          ${p.contacts.length ? `
            <div class="post-contacts">
              ${p.contacts.map((c) => `
                <a href="/contacts/${c.uuid}" data-link class="contact-chip">
                  <span class="contact-chip-avatar">
                    ${c.avatar
                      ? `<img src="${authUrl(c.avatar)}" alt="">`
                      : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`
                    }
                  </span>
                  ${c.first_name} ${c.last_name || ''}
                </a>
              `).join('')}
            </div>
          ` : ''}
          ${(() => {
            const images = p.media.filter(m => m.file_type?.startsWith('image'));
            const videos = p.media.filter(m => m.file_type?.startsWith('video'));
            const docs = p.media.filter(m => !m.file_type?.startsWith('image') && !m.file_type?.startsWith('video'));
            let html = '';
            if (images.length) {
              html += `<div class="post-media post-media-grid-${Math.min(images.length, 4)}" data-post-uuid="${p.uuid}">
                ${images.map((m, mi) => `<div class="post-media-item" data-index="${mi}" data-src="${authUrl(m.file_path)}"><img src="${authUrl(m.thumbnail_path || m.file_path)}" alt=""></div>`).join('')}
              </div>`;
            }
            if (videos.length) {
              html += `<div class="post-videos">${videos.map(m =>
                `<div class="post-video-item">
                  <video src="${authUrl(m.file_path)}" controls preload="metadata" playsinline></video>
                </div>`
              ).join('')}</div>`;
            }
            if (docs.length) {
              html += `<div class="post-documents">${docs.map(m => {
                const icon = m.file_type?.includes('pdf') ? 'bi-file-earmark-pdf'
                  : (m.file_type?.includes('word') || m.file_type?.includes('document')) ? 'bi-file-earmark-word'
                  : (m.file_type?.includes('excel') || m.file_type?.includes('sheet')) ? 'bi-file-earmark-spreadsheet'
                  : m.file_type?.includes('text') ? 'bi-file-earmark-text' : 'bi-file-earmark';
                const name = m.original_name || m.file_path.split('/').pop();
                const size = m.file_size ? formatFileSize(m.file_size) : '';
                const canPreview = m.file_type?.includes('pdf') || m.file_type?.includes('text');
                return `<a href="${authUrl(m.file_path)}" class="post-document-link${canPreview ? ' doc-previewable' : ''}" ${canPreview ? '' : `target="_blank" download="${escapeHtml(name)}"`} data-name="${escapeHtml(name)}" data-type="${m.file_type || ''}">
                  <i class="bi ${icon}"></i> <span>${escapeHtml(name)}</span>${size ? ` <span class="text-muted small">(${size})</span>` : ''}
                </a>`;
              }).join('')}</div>`;
            }
            return html;
          })()}
          <div class="post-actions-bar">
            <button class="post-action-btn btn-react" data-uuid="${p.uuid}" title="${t('posts.like')}">
              <i class="bi bi-heart${p.reacted ? '-fill text-danger' : ''}"></i>
              ${p.reaction_count ? `<span class="post-action-count">${p.reaction_count}</span>` : ''}
            </button>
            <button class="post-action-btn btn-toggle-comments" data-uuid="${p.uuid}" title="${t('posts.comment')}">
              <i class="bi bi-chat"></i>
              ${p.comment_count ? `<span class="post-action-count">${p.comment_count}</span>` : ''}
            </button>
          </div>
          <div class="post-comments-section d-none" data-uuid="${p.uuid}">
            <div class="post-comments-list"></div>
            <form class="post-comment-form">
              <input type="text" class="form-control form-control-sm" placeholder="${t('posts.commentPlaceholder')}" required>
              <button type="submit" class="btn btn-primary btn-sm">${t('posts.send')}</button>
            </form>
          </div>
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

    // Add "load more" button if there are more posts
    const hasMore = data.pagination && data.posts.length >= currentLimit[key];
    if (hasMore) {
      el.insertAdjacentHTML('beforeend', `
        <button class="btn btn-outline-secondary btn-sm w-100 mt-3 load-more-btn">
          ${t('posts.loadMore')}
        </button>
      `);
      el.querySelector('.load-more-btn').addEventListener('click', () => {
        renderPostList(containerId, contactUuid, onChanged, { loadMore: true });
      });
    }

    // Store post data for editing
    const postsMap = new Map(data.posts.map((p) => [p.uuid, p]));

    // Edit handlers
    el.querySelectorAll('.btn-edit-post').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const postEl = el.querySelector(`[data-post-uuid="${btn.dataset.uuid}"]`);
        postEl.querySelector('.post-view').classList.add('d-none');
        postEl.querySelector('.post-edit').classList.remove('d-none');

        // Attach @-mention to edit textarea (once)
        const textarea = postEl.querySelector('.edit-post-body');
        if (!textarea.dataset.mentionAttached) {
          textarea.dataset.mentionAttached = 'true';
          attachMention(textarea, (contact) => {
            const tagsList = postEl.querySelector('.edit-tags-list');
            const existingUuids = [...tagsList.querySelectorAll('.edit-tag')].map((el) => el.dataset.uuid);
            if (existingUuids.includes(contact.uuid)) return;

            const tag = document.createElement('span');
            tag.className = 'edit-tag';
            tag.dataset.uuid = contact.uuid;
            tag.innerHTML = `${contact.first_name} ${contact.last_name || ''} <button type="button" class="btn-remove-tag"><i class="bi bi-x"></i></button>`;
            tag.querySelector('.btn-remove-tag').addEventListener('click', () => tag.remove());
            const addBtn = tagsList.querySelector('.btn-add-tag-edit');
            tagsList.insertBefore(tag, addBtn);
          });
        }
        textarea.focus();
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
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const contact = await contactSearchDialog({ title: t('posts.tagContact') });
          if (!contact) return;

          const tagsList = btn.closest('.edit-tags-list');
          const existingUuids = [...tagsList.querySelectorAll('.edit-tag')].map((el) => el.dataset.uuid);
          if (existingUuids.includes(contact.uuid)) return;

          const tag = document.createElement('span');
          tag.className = 'edit-tag';
          tag.dataset.uuid = contact.uuid;
          tag.innerHTML = `${contact.first_name} ${contact.last_name || ''} <button type="button" class="btn-remove-tag"><i class="bi bi-x"></i></button>`;
          tag.querySelector('.btn-remove-tag').addEventListener('click', () => tag.remove());
          tagsList.insertBefore(tag, btn);
        } catch (err) {
          console.error('Add tag error:', err);
        }
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
          // Reload feed but preserve current pagination limit
          renderPostList(containerId, contactUuid, onChanged, { keepLimit: true });
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
        }
      });
    });

    // Set visibility handlers
    el.querySelectorAll('.btn-set-visibility').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const newVis = btn.dataset.vis;
        await api.put(`/posts/${btn.dataset.uuid}`, { visibility: newVis });
        // Update in-place
        const post = postsMap.get(btn.dataset.uuid);
        if (post) post.visibility = newVis;
        const postEl = el.querySelector(`[data-post-uuid="${btn.dataset.uuid}"]`);
        if (postEl) {
          // Update visibility icon
          postEl.querySelectorAll('.post-visibility-icon').forEach(i => i.remove());
          const actions = postEl.querySelector('.post-header-actions');
          if (newVis === 'private') actions.insertAdjacentHTML('afterbegin', `<i class="bi bi-lock-fill text-muted post-visibility-icon" title="${t('visibility.private')}"></i>`);
          if (newVis === 'family') actions.insertAdjacentHTML('afterbegin', `<i class="bi bi-people-fill text-muted post-visibility-icon" title="${t('visibility.family')}"></i>`);
          // Update check marks in menu
          postEl.querySelectorAll('.btn-set-visibility').forEach(b => {
            const check = b.querySelector('.bi-check');
            if (check) check.remove();
            if (b.dataset.vis === newVis) b.insertAdjacentHTML('beforeend', ' <i class="bi bi-check"></i>');
          });
        }
      });
    });

    // Delete handlers
    el.querySelectorAll('.btn-delete-post').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await confirmDialog(t('posts.deletePostConfirm'), { title: t('posts.deletePost'), confirmText: t('common.delete') })) {
          await api.delete(`/posts/${btn.dataset.uuid}`);
          // Remove from DOM instead of reloading entire feed
          const postEl = el.querySelector(`[data-post-uuid="${btn.dataset.uuid}"]`);
          if (postEl) postEl.remove();
          postsMap.delete(btn.dataset.uuid);
          // Show empty state if no posts left
          if (el.querySelectorAll('.timeline-post').length === 0) {
            el.innerHTML = `
              <div class="empty-state">
                <i class="bi bi-journal-text"></i>
                <p>${t('posts.noPosts')}</p>
              </div>
            `;
          }
        }
      });
    });

    // Media lightbox
    el.querySelectorAll('.post-media-item').forEach((item) => {
      item.addEventListener('click', () => {
        const grid = item.closest('.post-media');
        const items = [...grid.querySelectorAll('.post-media-item')];
        const index = parseInt(item.dataset.index);
        const images = items.map(i => ({ file_path: i.dataset.src }));
        showMediaLightbox(images, index);
      });
    });
    // Document preview (PDF, text)
    el.querySelectorAll('.doc-previewable').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.getAttribute('href');
        const name = link.dataset.name || 'Document';
        const dlgId = 'doc-preview-' + Date.now();
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal fade" id="${dlgId}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered" style="max-width:90vw;width:90vw">
              <div class="modal-content" style="height:85vh">
                <div class="modal-header">
                  <h5 class="modal-title"><i class="bi bi-file-earmark me-2"></i>${escapeHtml(name)}</h5>
                  <a href="${url}" download="${escapeHtml(name)}" class="btn btn-outline-primary btn-sm ms-auto me-3"><i class="bi bi-download"></i></a>
                  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-0" style="flex:1;overflow:hidden">
                  <iframe src="${url}" style="width:100%;height:100%;border:none"></iframe>
                </div>
              </div>
            </div>
          </div>
        `);
        const modalEl = document.getElementById(dlgId);
        const modal = new bootstrap.Modal(modalEl);
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
        modal.show();
      });
    });

    // Reactions — toggle heart
    el.querySelectorAll('.btn-react').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { action } = await api.post(`/posts/${btn.dataset.uuid}/reactions`, { emoji: '❤️' });
        const icon = btn.querySelector('i');
        const countEl = btn.querySelector('.post-action-count');
        const count = parseInt(countEl?.textContent || '0');
        if (action === 'added') {
          icon.className = 'bi bi-heart-fill text-danger';
          if (countEl) countEl.textContent = count + 1;
          else btn.insertAdjacentHTML('beforeend', `<span class="post-action-count">${count + 1}</span>`);
        } else {
          icon.className = 'bi bi-heart';
          const newCount = Math.max(0, count - 1);
          if (countEl) { if (newCount) countEl.textContent = newCount; else countEl.remove(); }
        }
      });
    });

    // Comments — toggle section + load
    el.querySelectorAll('.btn-toggle-comments').forEach(btn => {
      btn.addEventListener('click', async () => {
        const section = el.querySelector(`.post-comments-section[data-uuid="${btn.dataset.uuid}"]`);
        section.classList.toggle('d-none');
        if (!section.classList.contains('d-none') && !section.dataset.loaded) {
          section.dataset.loaded = 'true';
          await loadComments(section, btn.dataset.uuid);
        }
      });
    });

    // Comment submit
    el.querySelectorAll('.post-comment-form').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const section = form.closest('.post-comments-section');
        const uuid = section.dataset.uuid;
        const input = form.querySelector('input');
        if (!input.value.trim()) return;
        try {
          const { comment } = await api.post(`/posts/${uuid}/comments`, { body: input.value });
          input.value = '';
          const list = section.querySelector('.post-comments-list');
          list.insertAdjacentHTML('beforeend', renderComment(comment));
          // Update count on button
          const btn = el.querySelector(`.btn-toggle-comments[data-uuid="${uuid}"]`);
          const countEl = btn.querySelector('.post-action-count');
          const count = parseInt(countEl?.textContent || '0') + 1;
          if (countEl) countEl.textContent = count;
          else btn.insertAdjacentHTML('beforeend', `<span class="post-action-count">${count}</span>`);
          // Bind delete on new comment
          bindCommentDelete(list.lastElementChild, uuid, btn);
        } catch {}
      });
    });

    function renderComment(c) {
      return `<div class="post-comment" data-id="${c.id}">
        <div class="post-comment-avatar">
          ${c.user.avatar ? `<img src="${authUrl(c.user.avatar)}" alt="">` : `<span>${c.user.first_name[0]}${c.user.last_name?.[0] || ''}</span>`}
        </div>
        <div class="post-comment-content">
          <strong>${escapeHtml(c.user.first_name)}</strong>
          <span>${escapeHtml(c.body)}</span>
        </div>
        ${c.is_own ? `<button class="btn btn-link btn-sm post-comment-delete" title="${t('common.delete')}"><i class="bi bi-x"></i></button>` : ''}
      </div>`;
    }

    async function loadComments(section, uuid) {
      const list = section.querySelector('.post-comments-list');
      try {
        const { comments } = await api.get(`/posts/${uuid}/comments`);
        list.innerHTML = comments.map(c => renderComment(c)).join('');
        const btn = el.querySelector(`.btn-toggle-comments[data-uuid="${uuid}"]`);
        list.querySelectorAll('.post-comment-delete').forEach(del => bindCommentDelete(del.closest('.post-comment'), uuid, btn));
      } catch {}
    }

    function bindCommentDelete(commentEl, postUuid, countBtn) {
      const del = commentEl?.querySelector('.post-comment-delete');
      if (!del) return;
      del.addEventListener('click', async () => {
        const id = commentEl.dataset.id;
        await api.delete(`/posts/${postUuid}/comments/${id}`);
        commentEl.remove();
        const countEl = countBtn.querySelector('.post-action-count');
        const count = Math.max(0, parseInt(countEl?.textContent || '1') - 1);
        if (countEl) { if (count) countEl.textContent = count; else countEl.remove(); }
      });
    }

    // Scroll to and highlight specific post if requested via URL param
    const urlPost = new URLSearchParams(window.location.search).get('post');
    if (urlPost) {
      const postEl = el.querySelector(`[data-post-uuid="${urlPost}"]`);
      if (postEl) {
        postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        postEl.classList.add('post-highlight');
        setTimeout(() => postEl.classList.remove('post-highlight'), 3000);
      }
      // Clean URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderLifeEventCard(e, currentContactUuid) {
  // Build list of all involved people: event owner + linked contacts
  const allPeople = [
    { uuid: e.contact_uuid, first_name: e.first_name, last_name: e.last_name },
    ...(e.linked_contacts || []),
  ];
  // Filter out the contact whose profile we're viewing
  const visible = currentContactUuid
    ? allPeople.filter(c => c.uuid !== currentContactUuid)
    : allPeople;
  // Deduplicate by uuid
  const seen = new Set();
  const unique = visible.filter(c => { if (seen.has(c.uuid)) return false; seen.add(c.uuid); return true; });

  // Some event types don't make sense with "together with"
  const noLinkedTypes = ['retired', 'passed_away'];
  const showLinked = unique.length > 0 && !noLinkedTypes.includes(e.event_type);

  const linkedNames = unique.map(c =>
    `<a href="/contacts/${c.uuid}" data-link class="mention-link">${c.first_name} ${c.last_name || ''}</a>`
  ).join(', ');

  const preposition = t(`lifeEvents.withPerson.${e.event_type}`) || t('lifeEvents.withPerson.other');

  return `
    <div class="timeline-post glass-card life-event-card">
      <div class="life-event-card-inner">
        <div class="life-event-card-icon" style="color:${e.color}">
          <i class="${e.icon}"></i>
        </div>
        <div class="life-event-card-content">
          <div>
            <strong>${t('lifeEvents.types.' + e.event_type)}</strong>
            ${showLinked ? (unique.length === 1
              ? `<span class="life-event-with">${preposition}</span> ${linkedNames}`
              : `<span class="life-event-with">—</span> ${linkedNames}`
            ) : ''}
            <span class="post-date">${formatDate(e.post_date)}</span>
          </div>
          ${e.description ? `<p class="text-muted small mb-0">${escapeHtml(e.description)}</p>` : ''}
        </div>
      </div>
    </div>
  `;
}

function showMediaLightbox(images, startIndex) {
  let current = startIndex;
  const id = 'lightbox-' + Date.now();

  function render() {
    return `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content" style="background:#000;border:none;overflow:hidden;border-radius:var(--radius-lg)">
            <div class="photo-viewer" style="position:relative;text-align:center">
              <img src="${authUrl(images[current].file_path)}" alt="" id="${id}-img" style="max-width:100%;max-height:70vh;object-fit:contain">
              ${images.length > 1 ? `
                <button type="button" class="photo-viewer-nav photo-viewer-prev" id="${id}-prev"><i class="bi bi-chevron-left"></i></button>
                <button type="button" class="photo-viewer-nav photo-viewer-next" id="${id}-next"><i class="bi bi-chevron-right"></i></button>
              ` : ''}
            </div>
            <div class="photo-viewer-footer" style="background:var(--color-surface)">
              <span id="${id}-caption" class="photo-viewer-caption">${current + 1} / ${images.length}</span>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  document.body.insertAdjacentHTML('beforeend', render());
  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);

  function update() {
    document.getElementById(`${id}-img`).src = authUrl(images[current].file_path);
    document.getElementById(`${id}-caption`).textContent = `${current + 1} / ${images.length}`;
  }

  modalEl.querySelector(`#${id}-prev`)?.addEventListener('click', () => {
    current = (current - 1 + images.length) % images.length;
    update();
  });

  modalEl.querySelector(`#${id}-next`)?.addEventListener('click', () => {
    current = (current + 1) % images.length;
    update();
  });

  // Keyboard nav
  const keyHandler = (e) => {
    if (e.key === 'ArrowLeft') { current = (current - 1 + images.length) % images.length; update(); }
    if (e.key === 'ArrowRight') { current = (current + 1) % images.length; update(); }
  };
  document.addEventListener('keydown', keyHandler);

  modalEl.addEventListener('hidden.bs.modal', () => {
    document.removeEventListener('keydown', keyHandler);
    modalEl.remove();
  }, { once: true });

  modal.show();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function linkifyPost(html, contacts) {
  // Replace URLs
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  // Replace tagged contact names with clickable links
  if (contacts?.length) {
    // Sort by full name length descending to match longest first
    const sorted = [...contacts].sort((a, b) => {
      const nameA = a.first_name + (a.last_name || '');
      const nameB = b.first_name + (b.last_name || '');
      return nameB.length - nameA.length;
    });

    for (const c of sorted) {
      const fullName = c.first_name + (c.last_name ? ' ' + c.last_name : '');
      const link = `<a href="/contacts/${c.uuid}" data-link class="mention-link">${escapeHtml(fullName)}</a>`;
      // Try @FullName, @FirstName, then plain FullName
      const patterns = [
        `@${escapeRegex(fullName)}`,
        `@${escapeRegex(c.first_name)}(?![\\wæøåÆØÅ])`,
        escapeRegex(fullName),
      ];
      let matched = false;
      for (const pat of patterns) {
        const before = html;
        html = html.replace(new RegExp(`(?<![\\wæøåÆØÅ">/])${pat}`, 'i'), link);
        if (html !== before) { matched = true; break; }
      }
    }
  }

  return html.replace(/\n/g, '<br>');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

