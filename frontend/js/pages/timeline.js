import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { renderPostList } from '../components/post-list.js';
import { openPostComposer } from '../components/post-composer.js';
import { contactRowHtml } from '../components/contact-row.js';
import { t, formatDate } from '../utils/i18n.js';
import { enableDropZone } from '../utils/drop-zone.js';
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

    ${isDashboard ? addContactModalHtml() : ''}
  `;

  // Pre-tag contact if viewing contact timeline
  const preTags = [];
  if (contactUuid) {
    try {
      const { contact } = await api.get(`/contacts/${contactUuid}`);
      preTags.push({ uuid: contact.uuid, first_name: contact.first_name, last_name: contact.last_name, avatar: contact.avatar || null });
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

  // New post → composer modal. Files dropped on the feed open it pre-filled.
  const openComposer = (extra = {}) => openPostComposer({ tags: preTags, onPosted: reloadPosts, ...extra });
  document.getElementById('btn-new-post').addEventListener('click', () => openComposer());
  enableDropZone(content.querySelector('.dashboard-main'), (files) => openComposer({ files }), { acceptDocuments: true, paste: false });
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
