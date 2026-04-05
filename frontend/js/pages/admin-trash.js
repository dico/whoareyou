import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t, formatDate } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { authUrl } from '../utils/auth-url.js';

export async function renderTrash() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-trash3"></i> ${t('trash.title')}</h2>
        <button class="btn btn-outline-danger btn-sm" id="btn-empty-all">
          <i class="bi bi-trash me-1"></i>${t('trash.emptyAll')}
        </button>
      </div>

      <div class="filter-tabs mb-3" id="trash-tabs">
        <button class="filter-tab active" data-view="contacts"><i class="bi bi-people me-1"></i>${t('nav.contacts')}</button>
        <button class="filter-tab" data-view="posts"><i class="bi bi-journal-text me-1"></i>${t('posts.title')}</button>
      </div>

      <div id="trash-contacts"></div>
      <div id="trash-posts" class="d-none"></div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));

  // Tabs
  let currentView = 'contacts';
  document.getElementById('trash-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#trash-tabs .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentView = tab.dataset.view;
    document.getElementById('trash-contacts').classList.toggle('d-none', currentView !== 'contacts');
    document.getElementById('trash-posts').classList.toggle('d-none', currentView !== 'posts');
  });

  // Empty all
  document.getElementById('btn-empty-all').addEventListener('click', async () => {
    if (!await confirmDialog(t('trash.emptyAllConfirm'), { title: t('trash.emptyAll'), confirmText: t('trash.emptyAll') })) return;
    await api.delete('/contacts/tools/empty-trash');
    // Also permanently delete all trashed posts
    const { posts } = await api.get('/posts/trash');
    for (const p of posts) {
      await api.delete(`/posts/permanent/${p.uuid}`);
    }
    loadContacts();
    loadPosts();
  });

  await Promise.all([loadContacts(), loadPosts()]);

  async function loadContacts() {
    const el = document.getElementById('trash-contacts');
    try {
      const { contacts } = await api.get('/contacts/tools/trash');
      if (!contacts.length) {
        el.innerHTML = `<div class="empty-state"><i class="bi bi-check-circle"></i><p>${t('trash.noContacts')}</p></div>`;
        return;
      }
      el.innerHTML = contacts.map(c => `
        <div class="settings-section glass-card mb-2 trash-item" data-uuid="${c.uuid}">
          <div class="d-flex align-items-center gap-3">
            <div class="contact-row-avatar">
              ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`}
            </div>
            <div class="flex-fill">
              <strong>${c.first_name} ${c.last_name || ''}</strong>
              <div class="text-muted small">${t('trash.deletedOn')} ${formatDate(c.deleted_at)}</div>
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-outline-primary btn-sm btn-restore" data-uuid="${c.uuid}" title="${t('trash.restore')}">
                <i class="bi bi-arrow-counterclockwise"></i>
              </button>
              <button class="btn btn-outline-danger btn-sm btn-permanent" data-uuid="${c.uuid}" title="${t('trash.permanentDelete')}">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('');

      el.querySelectorAll('.btn-restore').forEach(btn => {
        btn.addEventListener('click', async () => {
          await api.post(`/contacts/tools/restore/${btn.dataset.uuid}`);
          fadeAndRemove(btn.closest('.trash-item'));
        });
      });

      el.querySelectorAll('.btn-permanent').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!await confirmDialog(t('trash.permanentConfirm'), { title: t('trash.permanentDelete'), confirmText: t('common.delete') })) return;
          await api.delete(`/contacts/tools/permanent/${btn.dataset.uuid}`);
          fadeAndRemove(btn.closest('.trash-item'));
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  }

  async function loadPosts() {
    const el = document.getElementById('trash-posts');
    try {
      const { posts } = await api.get('/posts/trash');
      if (!posts.length) {
        el.innerHTML = `<div class="empty-state"><i class="bi bi-check-circle"></i><p>${t('trash.noPosts')}</p></div>`;
        return;
      }
      el.innerHTML = posts.map(p => `
        <div class="settings-section glass-card mb-2 trash-item" data-uuid="${p.uuid}">
          <div class="d-flex align-items-center gap-3">
            <div class="contact-row-avatar" style="background:var(--color-text-secondary)">
              <i class="bi bi-journal-text" style="font-size:0.7rem"></i>
            </div>
            <div class="flex-fill" style="min-width:0">
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><strong>${p.body ? escapeHtml(p.body.substring(0, 80)) : t('posts.noText')}</strong></div>
              <div class="text-muted small">${formatDate(p.post_date)} · ${t('trash.deletedOn')} ${formatDate(p.deleted_at)}${p.media_count ? ` · ${p.media_count} ${t('posts.media')}` : ''}</div>
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-outline-primary btn-sm btn-restore-post" data-uuid="${p.uuid}" title="${t('trash.restore')}">
                <i class="bi bi-arrow-counterclockwise"></i>
              </button>
              <button class="btn btn-outline-danger btn-sm btn-permanent-post" data-uuid="${p.uuid}" title="${t('trash.permanentDelete')}">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('');

      el.querySelectorAll('.btn-restore-post').forEach(btn => {
        btn.addEventListener('click', async () => {
          await api.post(`/posts/restore/${btn.dataset.uuid}`);
          fadeAndRemove(btn.closest('.trash-item'));
        });
      });

      el.querySelectorAll('.btn-permanent-post').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!await confirmDialog(t('trash.permanentConfirm'), { title: t('trash.permanentDelete'), confirmText: t('common.delete') })) return;
          await api.delete(`/posts/permanent/${btn.dataset.uuid}`);
          fadeAndRemove(btn.closest('.trash-item'));
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  }
}

function fadeAndRemove(el) {
  if (!el) return;
  el.style.transition = 'opacity 0.3s, transform 0.3s';
  el.style.opacity = '0';
  el.style.transform = 'scale(0.95)';
  setTimeout(() => el.remove(), 300);
}

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
