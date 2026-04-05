import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { confirmDialog } from '../components/dialogs.js';
import { t, formatDate } from '../utils/i18n.js';
import { createProductPicker } from '../components/product-picker.js';
import { showEventModal, giftSubNav } from './gifts.js';
import { authUrl } from '../utils/auth-url.js';
import { contactRowHtml } from '../components/contact-row.js';
import { attachContactSearch } from '../components/contact-search.js';
import { showProductDetailModal } from '../components/product-detail-modal.js';

const EVENT_ICONS = {
  christmas: 'tree', birthday: 'balloon', wedding: 'heart', other: 'calendar-event',
};
const STATUS_ORDER = ['idea', 'purchased', 'given'];
const STATUS_COLORS = {
  idea: 'secondary', reserved: 'info', purchased: 'warning',
  wrapped: 'purple', given: 'success', cancelled: 'danger',
};
const PLANNING_STATUSES = ['idea', 'reserved'];
const DONE_STATUSES = ['purchased', 'wrapped', 'given'];

// Page-level state so reload can access it
let pageEventUuid = null;
let pageMembers = [];
let pageGiftsCache = [];

export async function renderGiftEventDetail(uuid) {
  pageEventUuid = uuid;
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      ${giftSubNav('events')}
      <div id="event-detail"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;
  await loadEventDetail(uuid);
}

async function loadEventDetail(uuid) {
  const el = document.getElementById('event-detail');
  if (!el) return;

  try {
    const [data, membersData] = await Promise.all([
      api.get(`/gifts/events/${uuid}`),
      api.get('/auth/members').catch(() => ({ members: [] })),
    ]);
    const { event, gifts } = data;
    pageGiftsCache = gifts;
    pageMembers = membersData.members || [];

    el.innerHTML = `
      <div class="gift-event-header-wrap detail-header-wrap">
        <div class="detail-header glass-card">
          <div class="detail-header-icon gift-event-icon-${event.event_type}">
            <i class="bi bi-${EVENT_ICONS[event.event_type] || 'calendar-event'}"></i>
          </div>
          <div class="detail-header-info">
            <h3 class="mb-0">${esc(event.name)}</h3>
            <span class="text-muted small" id="event-meta"></span>
          </div>
          <div class="detail-header-actions">
            <div class="dropdown">
              <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
              <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                <li><a class="dropdown-item" href="#" id="btn-edit-event"><i class="bi bi-pencil me-2"></i>${t('gifts.editEvent')}</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger" href="#" id="btn-delete-event"><i class="bi bi-trash me-2"></i>${t('gifts.deleteEvent')}</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div class="detail-header-toolbar">
          <div class="filter-tabs" id="gift-direction-tabs">
            <button class="filter-tab active" data-direction="outgoing">${t('gifts.outgoing')}</button>
            <button class="filter-tab" data-direction="incoming">${t('gifts.incoming')}</button>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-new-gift">
            <i class="bi bi-plus-lg me-1"></i>${t('gifts.newGift')}
          </button>
        </div>
      </div>

      <div id="gift-list">
        ${renderGiftList(gifts, pageMembers, 'outgoing')}
      </div>
    `;

    // Back
    // Back navigation removed — use browser back or sub-nav

    // Edit/delete event
    document.getElementById('btn-edit-event').addEventListener('click', (e) => {
      e.preventDefault();
      showEventModal(event, () => renderGiftEventDetail(uuid));
    });
    document.getElementById('btn-delete-event').addEventListener('click', async (e) => {
      e.preventDefault();
      if (await confirmDialog(t('gifts.deleteEventConfirm'), { title: t('gifts.deleteEvent'), confirmText: t('common.delete') })) {
        await api.delete(`/gifts/events/${uuid}`);
        navigate('/gifts/events');
      }
    });

    // Direction tabs — remember selection
    const defaultDir = ['birthday', 'wedding'].includes(event.event_type) ? 'incoming' : 'outgoing';
    const savedDir = localStorage.getItem('giftDirection') || defaultDir;
    if (savedDir !== 'outgoing') {
      document.querySelectorAll('#gift-direction-tabs .filter-tab').forEach(b => b.classList.remove('active'));
      document.querySelector(`#gift-direction-tabs [data-direction="${savedDir}"]`)?.classList.add('active');
      document.getElementById('gift-list').innerHTML = renderGiftList(gifts, pageMembers, savedDir);
    }
    updateEventMeta(event, gifts, savedDir);
    document.getElementById('gift-direction-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      document.querySelectorAll('#gift-direction-tabs .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const dir = btn.dataset.direction;
      localStorage.setItem('giftDirection', dir);
      updateEventMeta(event, gifts, dir);
      document.getElementById('gift-list').innerHTML = renderGiftList(gifts, pageMembers, dir);
      attachGiftListHandlers(uuid);
    });

    // New gift modal
    document.getElementById('btn-new-gift').addEventListener('click', () => {
      const dir = document.querySelector('#gift-direction-tabs .filter-tab.active')?.dataset.direction || 'outgoing';
      showGiftModal(uuid, event, dir);
    });

    attachGiftListHandlers(uuid);

  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function updateEventMeta(event, gifts, direction) {
  const count = gifts.filter(g => g.order_type === direction).length;
  const parts = [
    event.event_date ? formatDate(event.event_date) : '',
    event.honoree ? `<a href="/contacts/${event.honoree.uuid}" data-link class="text-muted">${esc(event.honoree.first_name)} ${esc(event.honoree.last_name || '')}</a>` : '',
    t('gifts.giftsCount', { count }),
  ].filter(Boolean);
  const el = document.getElementById('event-meta');
  if (el) el.innerHTML = parts.join(' · ');
}

// ═══════════════════════════════════════
// Gift list rendering
// ═══════════════════════════════════════

function renderGiftList(gifts, members, direction) {
  const filtered = gifts.filter(g => g.order_type === direction);
  if (!filtered.length) {
    return `<div class="empty-state"><i class="bi bi-gift"></i><p>${t('gifts.noGifts')}</p></div>`;
  }

  if (direction === 'outgoing') {
    return renderOutgoingList(filtered);
  }
  return renderIncomingList(filtered, members);
}

function renderOutgoingList(gifts) {
  // Group by recipient(s) key
  const groups = new Map();
  for (const g of gifts) {
    const key = g.recipients?.map(r => r.uuid).sort().join(',') || '_none';
    if (!groups.has(key)) {
      groups.set(key, { recipients: g.recipients || [], gifts: [] });
    }
    groups.get(key).gifts.push(g);
  }

  return [...groups.values()].map(group => {
    const ideas = group.gifts.filter(g => PLANNING_STATUSES.includes(g.status));
    const done = group.gifts.filter(g => DONE_STATUSES.includes(g.status));
    const cancelled = group.gifts.filter(g => g.status === 'cancelled');
    const recipientData = encodeURIComponent(JSON.stringify(group.recipients.map(r => ({ uuid: r.uuid, first_name: r.first_name, last_name: r.last_name || '' }))));
    const addBtn = `<button class="btn btn-link btn-sm gift-add-for-recipient" data-recipients="${recipientData}"><i class="bi bi-plus-lg"></i></button>`;

    return `
      <div class="gift-group">
        ${group.recipients.length ? renderGroupHeader(group.recipients, { count: done.length, actionsHtml: addBtn }) : ''}
        ${done.map(g => renderGiftCard(g, false)).join('')}
        ${cancelled.map(g => renderGiftCard(g, false)).join('')}
        ${ideas.length ? `
          <details class="gift-ideas-section">
            <summary class="gift-ideas-label">${t('gifts.ideas')} (${ideas.length})</summary>
            ${ideas.map(g => renderGiftCard(g, false)).join('')}
          </details>
        ` : ''}
      </div>
    `;
  }).join('');
}

function renderIncomingList(gifts, members) {
  // Build contact lookup from gifts (has avatars) and members
  const contactLookup = new Map();
  for (const g of gifts) {
    for (const r of (g.recipients || [])) {
      if (!contactLookup.has(r.uuid)) contactLookup.set(r.uuid, r);
    }
  }

  // Family members (may not have avatar from members API — enrich from gifts if possible)
  const familyMembers = (members || [])
    .filter(m => m.linked_contact_uuid)
    .map(m => {
      const fromGift = contactLookup.get(m.linked_contact_uuid);
      return {
        uuid: m.linked_contact_uuid,
        first_name: m.first_name, last_name: m.last_name || '',
        avatar: fromGift?.avatar || m.avatar || null,
      };
    });

  // Group gifts by recipient
  const giftsByRecipient = new Map();
  for (const g of gifts) {
    const recipient = g.recipients?.[0];
    const key = recipient?.uuid || '_unknown';
    if (!giftsByRecipient.has(key)) giftsByRecipient.set(key, []);
    giftsByRecipient.get(key).push(g);
  }

  const groups = [];
  const shown = new Set();

  for (const m of familyMembers) {
    groups.push({ contact: m, gifts: giftsByRecipient.get(m.uuid) || [] });
    shown.add(m.uuid);
  }

  for (const [key, giftList] of giftsByRecipient) {
    if (!shown.has(key)) {
      const r = giftList[0]?.recipients?.[0] || { uuid: key, first_name: '?', last_name: '' };
      groups.push({ contact: r, gifts: giftList });
    }
  }

  if (!groups.length) {
    return `<div class="empty-state"><i class="bi bi-gift"></i><p>${t('gifts.noGifts')}</p></div>`;
  }

  return groups.map(group => {
    const addBtn = `<button class="btn btn-link btn-sm gift-add-for-member" data-uuid="${group.contact.uuid}" data-name="${esc(group.contact.first_name)}"><i class="bi bi-plus-lg"></i></button>`;

    // Group this member's gifts by giver(s) key
    const byGiver = new Map();
    for (const g of group.gifts) {
      const key = g.givers?.map(c => c.uuid).sort().join(',') || '_unknown';
      if (!byGiver.has(key)) byGiver.set(key, { givers: g.givers || [], gifts: [] });
      byGiver.get(key).gifts.push(g);
    }

    const giverGroups = [...byGiver.values()];

    return `
      <div class="gift-group">
        ${renderGroupHeader([group.contact], { count: group.gifts.length, actionsHtml: addBtn })}
        ${group.gifts.length
          ? giverGroups.map(gg => {
            const uuids = gg.gifts.map(g => g.uuid).join(',');
            return `
            <div class="gift-received-row gift-show-details" data-uuids="${uuids}">
              <div class="gift-received-items">
                ${gg.gifts.map(g => `<span class="gift-received-item">${esc(g.title)}</span>`).join(', ')}
              </div>
              <div class="gift-received-from">
                ${t('gifts.from').toLowerCase()} ${contactChips(gg.givers)}
              </div>
            </div>
          `}).join('')
          : `<p class="text-muted small ps-2">${t('gifts.noGifts')}</p>`
        }
      </div>
    `;
  }).join('');
}

function contactChips(contacts, prefix = '') {
  if (!contacts?.length) return '';
  return `${prefix}${contacts.map(c =>
    `<a href="/contacts/${c.uuid}" data-link class="contact-chip">` +
    `<span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}</span>`}</span>` +
    `${esc(c.first_name)}</a>`
  ).join(' ')}`;
}

/**
 * Standardized group header with avatar, clickable name, count and action buttons.
 * Used across gift event detail (outgoing/incoming), wishlists, planning.
 */
function renderGroupHeader(contacts, { count, actionsHtml } = {}) {
  if (!contacts?.length) return '';
  const links = contacts.map(c => `
    <a href="/contacts/${c.uuid}" data-link class="gift-group-header-link">
      <span class="gift-group-avatar">
        ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}</span>`}
      </span>
      <span>${esc(c.first_name)} ${esc(c.last_name || '')}</span>
    </a>
  `).join('');

  return `
    <div class="gift-group-header">
      ${links}
      ${count !== undefined ? `<span class="text-muted small ms-1">(${count})</span>` : ''}
      <span class="gift-group-header-actions">${actionsHtml || ''}</span>
    </div>
  `;
}

function renderGiftCard(g, isIncoming) {
  const statusColor = STATUS_COLORS[g.status] || 'secondary';
  const isIdea = PLANNING_STATUSES.includes(g.status);

  const subHtml = isIncoming
    ? contactChips(g.givers, `${t('gifts.from').toLowerCase()} `)
    : contactChips(g.recipients, '→ ');

  return `
    <div class="gift-card ${isIdea ? 'gift-card-idea' : ''}" data-uuid="${g.uuid}">
      <div class="gift-card-image">
        ${g.product_image_url
          ? `<img src="${g.product_image_url.startsWith('/uploads/') ? authUrl(g.product_image_url) : esc(g.product_image_url)}" alt="">`
          : `<div class="gift-card-placeholder"><i class="bi bi-gift"></i></div>`
        }
      </div>
      <div class="gift-card-body">
        <div class="gift-card-title">${esc(g.title)}</div>
        ${subHtml ? `<div class="gift-card-sub text-muted small">${subHtml}</div>` : ''}
      </div>
      <div class="gift-card-end">
        ${g.price ? `<span class="gift-card-price">${Math.round(g.price)} kr</span>` : ''}
        <button class="gift-status-badge badge bg-${statusColor} gift-status-cycle" data-uuid="${g.uuid}" data-status="${g.status}">
          ${t('gifts.statuses.' + g.status)}
        </button>
      </div>
      <div class="dropdown">
        <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
        <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
          ${['idea', 'reserved', 'purchased', 'wrapped', 'given', 'cancelled'].map(s => `
            <li><a class="dropdown-item gift-set-status" href="#" data-uuid="${g.uuid}" data-status="${s}">
              <span class="gift-status-dot gift-status-${s}"></span> ${t('gifts.statuses.' + s)}
              ${s === g.status ? ' <i class="bi bi-check"></i>' : ''}
            </a></li>
          `).join('')}
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item text-danger gift-delete" href="#" data-uuid="${g.uuid}"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
        </ul>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════
// Gift modal (add/edit)
// ═══════════════════════════════════════

function showGiftModal(eventUuid, event, direction = 'outgoing', prefilledRecipients = null) {
  const mid = 'gift-modal-' + Date.now();
  const addedGifts = []; // track gifts added in this session

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('gifts.newGift')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">${t('gifts.from')}</label>
              <div class="gift-chips-wrap" id="${mid}-givers"></div>
              <div class="position-relative mt-1">
                <input type="text" class="form-control form-control-sm" id="${mid}-giver-search" placeholder="${t('common.search')}" autocomplete="off">
                <div class="product-picker-dropdown d-none" id="${mid}-giver-results"></div>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">${t('gifts.to')}</label>
              <div class="gift-chips-wrap" id="${mid}-recipients"></div>
              <div class="position-relative mt-1">
                <input type="text" class="form-control form-control-sm" id="${mid}-recipient-search" placeholder="${t('common.search')}" autocomplete="off">
                <div class="product-picker-dropdown d-none" id="${mid}-recipient-results"></div>
              </div>
            </div>

            <label class="form-label">${t('gifts.gifts')}</label>
            <div id="${mid}-added" class="mb-2"></div>
            <div class="gift-add-row">
              <div class="gift-add-row-product" id="${mid}-product"></div>
              <input type="number" class="form-control form-control-sm gift-add-row-price" id="${mid}-price" placeholder="${t('gifts.price')}" step="1">
              <button type="button" class="btn btn-primary btn-sm" id="${mid}-add-btn">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>

            <details class="mt-3">
              <summary class="text-muted small" style="cursor:pointer">${t('gifts.showAdvanced')}</summary>
              <div class="row g-2 mt-2">
                <div class="col-6">
                  <label class="form-label small">${t('gifts.status')}</label>
                  <select class="form-select form-select-sm" id="${mid}-status">
                    ${['idea', 'reserved', 'purchased', 'wrapped', 'given'].map(s => {
                      const defaultStatus = direction === 'incoming' ? 'given' : 'idea';
                      return `<option value="${s}" ${s === defaultStatus ? 'selected' : ''}>${t('gifts.statuses.' + s)}</option>`;
                    }).join('')}
                  </select>
                </div>
                <div class="col-6">
                  <label class="form-label small">${t('gifts.direction')}</label>
                  <select class="form-select form-select-sm" id="${mid}-direction">
                    <option value="outgoing" ${direction === 'outgoing' ? 'selected' : ''}>${t('gifts.outgoing')}</option>
                    <option value="incoming" ${direction === 'incoming' ? 'selected' : ''}>${t('gifts.incoming')}</option>
                  </select>
                </div>
              </div>
            </details>
          </div>
          <div class="modal-footer">
            <span class="text-muted small me-auto" id="${mid}-count"></span>
            <button type="button" class="btn btn-primary btn-sm" id="${mid}-done">${t('common.done')}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);

  // Product picker
  const picker = createProductPicker(document.getElementById(`${mid}-product`), () => {});

  // Participant management
  const givers = [];
  const recipients = [];

  if (prefilledRecipients?.length) {
    recipients.push(...prefilledRecipients);
    renderModalChips(`${mid}-recipients`, recipients);
  } else if (event?.honoree && direction === 'outgoing') {
    recipients.push(event.honoree);
    renderModalChips(`${mid}-recipients`, recipients);
  }

  // Inline contact search for givers
  setupContactSearch(`${mid}-giver-search`, `${mid}-giver-results`, (c) => {
    if (!givers.some(g => g.uuid === c.uuid)) { givers.push(c); renderModalChips(`${mid}-givers`, givers); }
  });

  // Inline contact search for recipients
  setupContactSearch(`${mid}-recipient-search`, `${mid}-recipient-results`, (c) => {
    if (!recipients.some(r => r.uuid === c.uuid)) { recipients.push(c); renderModalChips(`${mid}-recipients`, recipients); }
  });

  function updateAddedList() {
    const el = document.getElementById(`${mid}-added`);
    const countEl = document.getElementById(`${mid}-count`);
    if (!el) return;
    el.innerHTML = addedGifts.map(g => `
      <div class="gift-added-item">
        <div class="gift-card-image">
          ${g.image_url
            ? `<img src="${g.image_url.startsWith('/uploads/') ? authUrl(g.image_url) : esc(g.image_url)}" alt="">`
            : `<div class="gift-card-placeholder"><i class="bi bi-gift"></i></div>`
          }
        </div>
        <span>${esc(g.title)}</span>
        ${g.price ? `<span class="text-muted small ms-auto">${Math.round(g.price)} kr</span>` : ''}
      </div>
    `).join('');
    if (countEl) countEl.textContent = addedGifts.length ? `${addedGifts.length} ${t('gifts.added')}` : '';
  }

  // Add gift (per row)
  async function addGift() {
    const product = picker.getSelected();
    if (!product) return;
    const price = parseFloat(document.getElementById(`${mid}-price`).value) || null;

    try {
      await api.post('/gifts/orders', {
        title: product.title,
        product_uuid: product.uuid || null,
        event_uuid: eventUuid,
        status: document.getElementById(`${mid}-status`).value,
        order_type: document.getElementById(`${mid}-direction`).value,
        price,
        giver_uuids: givers.map(g => g.uuid),
        recipient_uuids: recipients.map(r => r.uuid),
      });
      addedGifts.push({ title: product.title, price, image_url: product.image_url || null });
      updateAddedList();
      picker.clear();
      document.getElementById(`${mid}-price`).value = '';
      // Focus back on product input for rapid entry
      document.querySelector(`#${mid}-product input`)?.focus();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  }

  document.getElementById(`${mid}-add-btn`).addEventListener('click', addGift);

  // Enter in price field adds gift
  document.getElementById(`${mid}-price`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addGift(); }
  });

  // Done — close and reload
  document.getElementById(`${mid}-done`).addEventListener('click', () => {
    modal.hide();
  });

  modalEl.addEventListener('hidden.bs.modal', async () => {
    modalEl.remove();
    if (addedGifts.length) await reloadGifts(eventUuid);
  }, { once: true });

  modal.show();
}

function showGiftModalForRecipient(eventUuid, recipient) {
  // Open the gift modal with incoming direction and pre-filled recipient
  showGiftModal(eventUuid, null, 'incoming', [recipient]);
}

function renderModalChips(containerId, contacts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.contact-chip').forEach(c => c.remove());
  contacts.forEach((c, i) => {
    const chip = document.createElement('span');
    chip.className = 'contact-chip';
    chip.innerHTML = `
      <span class="contact-chip-avatar">
        ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}</span>`}
      </span>
      ${esc(c.first_name)} ${esc(c.last_name || '')}
      <button type="button" class="contact-chip-remove" data-index="${i}"><i class="bi bi-x"></i></button>
    `;
    chip.querySelector('.contact-chip-remove').addEventListener('click', () => {
      contacts.splice(i, 1);
      renderModalChips(containerId, contacts);
    });
    container.prepend(chip);
  });
}

// ═══════════════════════════════════════
// Handlers & reload
// ═══════════════════════════════════════

function attachGiftListHandlers(eventUuid) {
  const el = document.getElementById('gift-list');
  if (!el) return;

  el.querySelectorAll('.gift-status-cycle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = STATUS_ORDER.indexOf(btn.dataset.status);
      const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
      await api.patch(`/gifts/orders/${btn.dataset.uuid}/status`, { status: next });
      await reloadGifts(eventUuid);
    });
  });

  el.querySelectorAll('.gift-set-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await api.patch(`/gifts/orders/${btn.dataset.uuid}/status`, { status: btn.dataset.status });
      await reloadGifts(eventUuid);
    });
  });

  el.querySelectorAll('.gift-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (await confirmDialog(t('gifts.deleteGiftConfirm'), { title: t('gifts.deleteGift'), confirmText: t('common.delete') })) {
        await api.delete(`/gifts/orders/${btn.dataset.uuid}`);
        await reloadGifts(eventUuid);
      }
    });
  });

  // "Add gift for member" in incoming view
  el.querySelectorAll('.gift-add-for-member').forEach(btn => {
    btn.addEventListener('click', () => {
      const recipient = { uuid: btn.dataset.uuid, first_name: btn.dataset.name, last_name: '' };
      showGiftModalForRecipient(eventUuid, recipient);
    });
  });

  // "Add gift for recipient" in outgoing view
  el.querySelectorAll('.gift-add-for-recipient').forEach(btn => {
    btn.addEventListener('click', () => {
      const recipients = JSON.parse(decodeURIComponent(btn.dataset.recipients));
      showGiftModal(eventUuid, null, 'outgoing', recipients);
    });
  });

  // Show gift details for a received group (click on card)
  el.querySelectorAll('.gift-show-details').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('a[data-link]')) return; // don't intercept contact-chip links
      const uuids = row.dataset.uuids.split(',');
      const gifts = uuids.map(uuid => pageGiftsCache.find(g => g.uuid === uuid)).filter(Boolean);
      if (gifts.length) showGiftsDetailModal(gifts);
    });
  });
}

async function reloadGifts(eventUuid) {
  const [data, membersData] = await Promise.all([
    api.get(`/gifts/events/${eventUuid}`),
    api.get('/auth/members').catch(() => ({ members: [] })),
  ]);
  const el = document.getElementById('gift-list');
  if (!el) return;

  pageMembers = membersData.members || [];
  pageGiftsCache = data.gifts;
  const dir = document.querySelector('#gift-direction-tabs .filter-tab.active')?.dataset.direction || 'outgoing';
  el.innerHTML = renderGiftList(data.gifts, pageMembers, dir);
  attachGiftListHandlers(eventUuid);
  updateEventMeta(data.event, data.gifts, dir);
}

/**
 * Inline contact search within a modal — no modal-in-modal.
 * Reuses .product-picker-dropdown for consistent styling.
 */
/**
 * Inline contact search with keyboard navigation.
 * Uses contactRowHtml, supports ArrowDown/Up + Enter + Escape + Tab.
 */
function setupContactSearch(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  if (!input) return;
  document.getElementById(resultsId)?.remove();
  attachContactSearch(input, {
    limit: 6,
    onSelect: (c) => {
      onSelect({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name || '', avatar: c.avatar || null });
      input.value = '';
      input.focus();
    },
  });
}

function showGiftsDetailModal(gifts) {
  const mid = 'gift-detail-' + Date.now();
  const g0 = gifts[0];
  const giversHtml = contactChips(g0.givers);
  const recipientsHtml = contactChips(g0.recipients);

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${giversHtml ? `${t('gifts.from')} ${giversHtml}` : t('gifts.gifts')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${gifts.map(g => `
              <div class="gift-detail-item">
                <div class="gift-card-image">
                  ${g.product_image_url
                    ? `<img src="${g.product_image_url.startsWith('/uploads/') ? authUrl(g.product_image_url) : esc(g.product_image_url)}" alt="">`
                    : `<div class="gift-card-placeholder"><i class="bi bi-gift"></i></div>`
                  }
                </div>
                <div class="gift-detail-item-body">
                  ${g.product_uuid
                    ? `<a href="#" class="gift-open-product" data-product-uuid="${g.product_uuid}"><strong>${esc(g.title)}</strong></a>`
                    : `<strong>${esc(g.title)}</strong>`
                  }
                  ${g.price ? `<span class="text-muted small">${Math.round(g.price)} kr</span>` : ''}
                  ${g.notes ? `<span class="text-muted small">${esc(g.notes)}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);

  // Product links in detail modal
  modalEl.querySelectorAll('.gift-open-product').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      modal.hide();
      showProductDetailModal(link.dataset.productUuid);
    });
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
