import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { confirmDialog } from '../components/dialogs.js';
import { t, formatDate } from '../utils/i18n.js';
import { contactRowHtml } from '../components/contact-row.js';
import { attachContactSearch } from '../components/contact-search.js';
import { authUrl } from '../utils/auth-url.js';

const EVENT_TYPES = ['christmas', 'birthday', 'wedding', 'other'];
const EVENT_ICONS = { christmas: 'tree', birthday: 'balloon', wedding: 'heart', other: 'calendar-event' };

function giftSubNav(active) {
  return `
    <div class="gift-sub-nav">
      <a href="/gifts" data-link class="gift-sub-link${active === 'dashboard' ? ' active' : ''}">${t('gifts.dashboard')}</a>
      <a href="/gifts/events" data-link class="gift-sub-link${active === 'events' ? ' active' : ''}">${t('gifts.events')}</a>
      <a href="/gifts/planning" data-link class="gift-sub-link${active === 'planning' ? ' active' : ''}">${t('gifts.planning')}</a>
      <a href="/gifts/wishlists" data-link class="gift-sub-link${active === 'wishlists' ? ' active' : ''}">${t('gifts.wishlists')}</a>
      <a href="/gifts/products" data-link class="gift-sub-link${active === 'products' ? ' active' : ''}">${t('gifts.products')}</a>
    </div>
  `;
}

// ── Dashboard ──
export async function renderGifts() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      ${giftSubNav('dashboard')}
      <div class="gift-dashboard">
        <div class="gift-dashboard-section glass-card">
          <h4>${t('gifts.latestEvents')}</h4>
          <div id="latest-events"><div class="loading">${t('app.loading')}</div></div>
        </div>
        <div class="gift-dashboard-section glass-card">
          <h4>${t('gifts.recentGifts')}</h4>
          <div id="recent-gifts"><div class="loading">${t('app.loading')}</div></div>
        </div>
      </div>
    </div>
  `;

  const [eventsData, giftsData] = await Promise.all([
    api.get('/gifts/events').catch(() => ({ events: [] })),
    api.get('/gifts/orders?limit=10').catch(() => ({ orders: [] })),
  ]);

  // Latest events (most recent first)
  const evEl = document.getElementById('latest-events');
  if (!evEl) return;

  const latestEvents = eventsData.events.slice(0, 5);
  if (latestEvents.length) {
    evEl.innerHTML = latestEvents.map(e => `
      <a href="/gifts/events/${e.uuid}" data-link class="gift-event-row">
        <div class="gift-event-row-icon gift-event-icon-${e.event_type}">
          <i class="bi bi-${EVENT_ICONS[e.event_type] || 'calendar-event'}"></i>
        </div>
        <div class="gift-event-row-info">
          <span class="gift-event-name">${escapeHtml(e.name)}</span>
          <span class="text-muted small">${e.event_date ? formatDate(e.event_date) : ''} · ${t('gifts.giftsCount', { count: e.gift_count || 0 })}</span>
        </div>
      </a>
    `).join('');
  } else {
    evEl.innerHTML = `<p class="text-muted small">${t('gifts.noEvents')}</p>`;
  }

  // Recent gifts with product image
  const recentEl = document.getElementById('recent-gifts');
  if (!recentEl) return;

  if (giftsData.orders.length) {
    recentEl.innerHTML = giftsData.orders.map(g => {
      const imgSrc = g.product_image_url
        ? (g.product_image_url.startsWith('/uploads/') ? authUrl(g.product_image_url) : escapeHtml(g.product_image_url))
        : '';
      const meta = [
        g.event_name || '',
        g.recipients?.map(r => r.first_name).join(', ') || '',
      ].filter(Boolean).join(' · ');

      return `
        <div class="gift-recent-row" ${g.product_uuid ? `data-product-uuid="${g.product_uuid}" style="cursor:pointer"` : ''}>
          <div class="gift-recent-avatar">
            ${imgSrc
              ? `<img src="${imgSrc}" alt="">`
              : `<span><i class="bi bi-gift"></i></span>`
            }
          </div>
          <div class="gift-recent-info">
            <span class="gift-recent-title">${escapeHtml(g.title)}</span>
            ${meta ? `<span class="text-muted small">${meta}</span>` : ''}
          </div>
          ${g.price ? `<span class="text-muted small">${Math.round(g.price)} kr</span>` : ''}
        </div>
      `;
    }).join('');

    // Click to open product detail
    recentEl.querySelectorAll('[data-product-uuid]').forEach(row => {
      row.addEventListener('click', async () => {
        const { showProductDetailModal } = await import('../components/product-detail-modal.js');
        showProductDetailModal(row.dataset.productUuid);
      });
    });
  } else {
    recentEl.innerHTML = `<p class="text-muted small">${t('gifts.noGifts')}</p>`;
  }
}

// ── Events list ──
export async function renderGiftEvents() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      ${giftSubNav('events')}
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3>${t('gifts.allEvents')}</h3>
        <button class="btn btn-primary btn-sm" id="btn-new-event">
          <i class="bi bi-plus-lg me-1"></i>${t('gifts.newEvent')}
        </button>
      </div>
      <div id="events-list"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;

  document.getElementById('btn-new-event').addEventListener('click', () => showEventModal());
  await loadEventsList();
}

async function loadEventsList() {
  const el = document.getElementById('events-list');
  if (!el) return;

  try {
    const { events } = await api.get('/gifts/events');

    if (!events.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-gift"></i>
          <p>${t('gifts.noEvents')}</p>
        </div>
      `;
      return;
    }

    // Group by year
    const byYear = {};
    for (const e of events) {
      const year = e.event_date ? new Date(e.event_date).getFullYear() : '—';
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(e);
    }

    el.innerHTML = Object.entries(byYear)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, evts]) => `
        <div class="gift-year-group">
          <h5 class="gift-year-label">${year}</h5>
          ${evts.map(e => `
            <a href="/gifts/events/${e.uuid}" data-link class="gift-event-card glass-card">
              <div class="gift-event-card-main">
                <strong>${escapeHtml(e.name)}</strong>
              </div>
              <div class="gift-event-card-meta text-muted small">
                ${[
                  e.event_date ? formatDate(e.event_date) : '',
                  e.honoree_first_name ? `${escapeHtml(e.honoree_first_name)} ${escapeHtml(e.honoree_last_name || '')}` : '',
                  t('gifts.giftsCount', { count: e.gift_count || 0 }),
                ].filter(Boolean).join(' · ')}
              </div>
            </a>
          `).join('')}
        </div>
      `).join('');
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// Default dates per event type
const EVENT_DEFAULTS = {
  christmas: { month: 12, day: 24 },
  birthday: {},
  wedding: {},
  other: {},
};

async function showEventModal(existing = null, onSaved = null) {
  const isEdit = !!existing;
  const title = isEdit ? t('gifts.editEvent') : t('gifts.newEvent');
  const currentYear = new Date().getFullYear();
  const showHonoree = existing ? existing.event_type !== 'christmas' : true;

  const modalId = 'event-modal-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${modalId}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${title}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${modalId}-form">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">${t('gifts.eventName')}</label>
                <input type="text" class="form-control" id="${modalId}-name" placeholder="${t('gifts.eventNamePlaceholder')}" value="${escapeHtml(existing?.name || '')}" required>
              </div>
              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label class="form-label">${t('gifts.eventType')}</label>
                  <select class="form-select" id="${modalId}-type">
                    ${!existing ? `<option value="" selected>${t('gifts.chooseType')}</option>` : ''}
                    ${EVENT_TYPES.map(tp => `<option value="${tp}" ${existing?.event_type === tp ? 'selected' : ''}>${t('gifts.types.' + tp)}</option>`).join('')}
                  </select>
                </div>
                <div class="col-6">
                  <label class="form-label">${t('gifts.eventDate')}</label>
                  <input type="date" class="form-control" id="${modalId}-date" value="${existing?.event_date?.split('T')[0] || ''}">
                </div>
              </div>
              <div class="mb-3 ${showHonoree ? '' : 'd-none'}" id="${modalId}-honoree-section">
                <label class="form-label">${t('gifts.honoree')}</label>
                <div class="position-relative" id="${modalId}-honoree-search-wrap" ${existing?.honoree ? 'style="display:none"' : ''}>
                  <input type="text" class="form-control" id="${modalId}-honoree-search" placeholder="${t('nav.searchPlaceholder')}" autocomplete="off">
                  <input type="hidden" id="${modalId}-honoree-uuid" value="${existing?.honoree?.uuid || ''}">
                </div>
                <div id="${modalId}-honoree-chip">${existing?.honoree ? `
                  <span class="contact-chip">
                    <span class="contact-chip-avatar">${existing.honoree.avatar ? `<img src="${authUrl(existing.honoree.avatar)}" alt="">` : `<span>${existing.honoree.first_name[0]}</span>`}</span>
                    ${existing.honoree.first_name} ${existing.honoree.last_name || ''}
                    <button type="button" class="contact-chip-remove" id="${modalId}-honoree-clear"><i class="bi bi-x"></i></button>
                  </span>` : ''}</div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('common.save')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(modalId);
  const modal = new bootstrap.Modal(modalEl);
  const typeSelect = document.getElementById(`${modalId}-type`);
  const dateInput = document.getElementById(`${modalId}-date`);
  const nameInput = document.getElementById(`${modalId}-name`);
  const honoreeSection = document.getElementById(`${modalId}-honoree-section`);
  const honoreeSearch = document.getElementById(`${modalId}-honoree-search`);
  const honoreeResults = document.getElementById(`${modalId}-honoree-results`);
  const honoreeUuid = document.getElementById(`${modalId}-honoree-uuid`);
  const honoreeSearchWrap = document.getElementById(`${modalId}-honoree-search-wrap`);
  const honoreeChip = document.getElementById(`${modalId}-honoree-chip`);

  // Auto-fill on type change
  typeSelect.addEventListener('change', () => {
    const tp = typeSelect.value;
    const defaults = EVENT_DEFAULTS[tp];

    // Auto-fill date
    if (!isEdit && defaults.month) {
      dateInput.value = `${currentYear}-${String(defaults.month).padStart(2, '0')}-${String(defaults.day).padStart(2, '0')}`;
    }

    // Auto-fill name
    if (!isEdit && !nameInput.value.trim()) {
      if (tp === 'christmas') nameInput.value = `${t('gifts.types.christmas')} ${currentYear}`;
    }

    // Show/hide honoree
    if (tp === 'christmas') {
      honoreeSection.classList.add('d-none');
      honoreeUuid.value = '';
      honoreeSearch.value = '';
      if (honoreeChip) honoreeChip.innerHTML = '';
      if (honoreeSearchWrap) honoreeSearchWrap.style.display = '';
    } else {
      honoreeSection.classList.remove('d-none');
    }
  });

  // No auto-trigger — user must select type explicitly

  // Inline honoree search (no modal-in-modal)
  let honoreeDebounce = null;
  function showHonoreeChip(c) {
    honoreeUuid.value = c.uuid;
    honoreeSearchWrap.style.display = 'none';
    honoreeChip.innerHTML = `
      <span class="contact-chip">
        <span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${c.first_name[0]}</span>`}</span>
        ${c.first_name} ${c.last_name || ''}
        <button type="button" class="contact-chip-remove" id="${modalId}-honoree-clear"><i class="bi bi-x"></i></button>
      </span>`;
    honoreeChip.querySelector(`#${modalId}-honoree-clear`).addEventListener('click', clearHonoree);
  }

  function clearHonoree() {
    honoreeUuid.value = '';
    honoreeChip.innerHTML = '';
    honoreeSearchWrap.style.display = '';
    honoreeSearch.value = '';
    honoreeSearch.focus();
  }

  // Wire up existing chip clear button (for edit mode)
  document.getElementById(`${modalId}-honoree-clear`)?.addEventListener('click', clearHonoree);

  attachContactSearch(honoreeSearch, {
    limit: 6,
    onSelect: (c) => showHonoreeChip(c),
  });

  // Submit
  document.getElementById(`${modalId}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: nameInput.value.trim(),
      event_type: typeSelect.value,
      event_date: dateInput.value || null,
      honoree_contact_uuid: honoreeUuid.value || null,
    };

    try {
      if (isEdit) {
        await api.put(`/gifts/events/${existing.uuid}`, payload);
      } else {
        const { uuid } = await api.post('/gifts/events', payload);
        modal.hide();
        navigate(`/gifts/events/${uuid}`);
        return;
      }
      modal.hide();
      if (onSaved) onSaved();
      else loadEventsList();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
  nameInput.focus();
}

// Export for use in event detail page
export { showEventModal, giftSubNav };

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
