import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { confirmDialog } from '../components/dialogs.js';
import { t, formatDate, formatNumber } from '../utils/i18n.js';
import { attachPriceInput, readPriceInput } from '../utils/price-input.js';
import { createProductPicker } from '../components/product-picker.js';
import { showEventModal, giftSubNav } from './gifts.js';
import { authUrl } from '../utils/auth-url.js';
import { contactRowHtml } from '../components/contact-row.js';
import { attachContactSearch } from '../components/contact-search.js';
import { giftContactLinkAttrs } from '../components/contact-gift-modal.js';
import { productChipHtml } from '../components/product-chip.js';

const EVENT_ICONS = {
  christmas: 'tree', birthday: 'balloon', wedding: 'heart', other: 'calendar-event',
};
const PLANNING_STATUSES = ['idea', 'reserved'];
const DONE_STATUSES = ['purchased', 'wrapped', 'given'];

// Page-level state so reload can access it
let pageEventUuid = null;
let pageMembers = [];
let pageGiftsCache = [];
let pageEventCache = null;

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
    pageEventCache = event;
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
    event.honoree ? `<a href="#" class="text-muted" ${giftContactLinkAttrs(event.honoree)}>${esc(event.honoree.first_name)} ${esc(event.honoree.last_name || '')}</a>` : '',
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

  // Outgoing only shows non-idea gifts — ideas live in the /gifts/planning tab.
  return [...groups.values()]
    .map(group => {
      const mainGifts = group.gifts.filter(g => !PLANNING_STATUSES.includes(g.status));
      const uuids = mainGifts.map(g => g.uuid).join(',');
      const recipientData = encodeURIComponent(JSON.stringify(group.recipients.map(r => ({ uuid: r.uuid, first_name: r.first_name, last_name: r.last_name || '' }))));
      if (!mainGifts.length) return '';
      return giftChipRow({
        contacts: group.recipients,
        contactsLabel: 'to',
        gifts: mainGifts,
        uuids,
        actionsHtml: `
          <button class="btn btn-link btn-sm gift-add-for-recipient" data-recipients="${recipientData}" title="${t('gifts.newGift')}">
            <i class="bi bi-plus-lg"></i>
          </button>
          <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
            <li><a class="dropdown-item gift-edit-group" href="#" data-uuids="${uuids}">
              <i class="bi bi-pencil me-2"></i>${t('common.edit')}
            </a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger gift-delete-group" href="#" data-uuids="${uuids}">
              <i class="bi bi-trash me-2"></i>${t('common.delete')}
            </a></li>
          </ul>
        `,
      });
    })
    .filter(Boolean)
    .join('') || `<div class="empty-state"><i class="bi bi-gift"></i><p>${t('gifts.noGifts')}</p></div>`;
}

/**
 * Shared two-column gift row used by both incoming and outgoing lists.
 * Each row renders a muted inline label ("From" / "To", "Gifts") above
 * its content so users can tell the columns apart without a separate header.
 */
function giftChipRow({ contacts, contactsLabel, gifts, uuids, actionsHtml }) {
  return `
    <div class="gift-received-row" data-uuids="${uuids}">
      <div class="gift-received-givers">
        <div class="gift-row-label">${t('gifts.' + contactsLabel)}</div>
        <div class="gift-row-content">${contactChips(contacts)}</div>
      </div>
      <div class="gift-received-products">
        <div class="gift-row-label">${t('gifts.gifts')}</div>
        <div class="gift-row-content">
          ${gifts.map(g => productChipHtml({
            title: g.title,
            image_url: g.product_image_url,
            product_uuid: g.product_uuid,
            price: g.price,
            dataAttrs: `data-gift-uuid="${g.uuid}"`,
          })).join('')}
        </div>
      </div>
      <div class="dropdown gift-received-actions">
        ${actionsHtml}
      </div>
    </div>
  `;
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
            return giftChipRow({
              contacts: gg.givers,
              contactsLabel: 'from',
              gifts: gg.gifts,
              uuids,
              actionsHtml: `
                <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
                <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                  <li><a class="dropdown-item gift-edit-group" href="#" data-uuids="${uuids}">
                    <i class="bi bi-pencil me-2"></i>${t('common.edit')}
                  </a></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item text-danger gift-delete-group" href="#" data-uuids="${uuids}">
                    <i class="bi bi-trash me-2"></i>${t('common.delete')}
                  </a></li>
                </ul>
              `,
            });
          }).join('')
          : `<p class="text-muted small ps-2">${t('gifts.noGifts')}</p>`
        }
      </div>
    `;
  }).join('');
}

function contactChips(contacts, prefix = '') {
  if (!contacts?.length) return '';
  return `${prefix}${contacts.map(c =>
    `<a href="#" class="contact-chip" ${giftContactLinkAttrs(c)}>` +
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
    <a href="#" class="gift-group-header-link" ${giftContactLinkAttrs(c)}>
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


// ═══════════════════════════════════════
// Gift modal (add/edit)
// ═══════════════════════════════════════

function showGiftModal(eventUuid, event, direction = 'outgoing', prefilledRecipients = null, editGroup = null) {
  const mid = 'gift-modal-' + Date.now();
  const isEdit = !!editGroup?.length;
  // Track original uuids so we can diff on save: existing → update,
  // missing → delete, new (no uuid) → create.
  const originalUuids = isEdit ? editGroup.map(g => g.uuid) : [];
  // In edit mode, status should default to the shared status of the edited group.
  const editStatus = isEdit ? editGroup[0].status : null;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${isEdit ? t('gifts.editGift') : t('gifts.newGift')}</h5>
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
            <div id="${mid}-added" class="gift-added-list mb-2"></div>
            <div id="${mid}-product"></div>

            <div class="mt-3">
              <label class="form-label small">${t('gifts.notes')}</label>
              <textarea class="form-control form-control-sm" id="${mid}-group-notes" rows="2"
                placeholder="${t('gifts.notesPlaceholder')}"></textarea>
            </div>

            <details class="mt-3">
              <summary class="text-muted small" style="cursor:pointer">${t('gifts.showAdvanced')}</summary>
              <div class="mt-2">
                <label class="form-label small">${t('gifts.status')}</label>
                <select class="form-select form-select-sm" id="${mid}-status">
                  ${['idea', 'reserved', 'purchased', 'wrapped', 'given', 'cancelled'].map(s => {
                    const defaultStatus = editStatus || (direction === 'incoming' ? 'given' : 'idea');
                    return `<option value="${s}" ${s === defaultStatus ? 'selected' : ''}>${t('gifts.statuses.' + s)}</option>`;
                  }).join('')}
                </select>
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

  // Drafts: gifts being composed or edited in this modal session.
  // Each entry: {uuid?, title, product_uuid, image_url, price, notes}
  // Existing gifts (edit mode) have `uuid`; new ones don't.
  const drafts = [];
  let savedCount = 0;

  // Product picker — each selection auto-adds a draft row
  const picker = createProductPicker(document.getElementById(`${mid}-product`), (product) => {
    if (!product || !product.title?.trim()) return;
    drafts.push({
      title: product.title,
      product_uuid: product.uuid || null,
      image_url: product.image_url || null,
      price: product.price != null ? Number(product.price) : null,
      notes: '',
    });
    renderDrafts();
    picker.clear();
    setTimeout(() => document.querySelector(`#${mid}-product input`)?.focus(), 0);
  });

  // Participant management
  const givers = [];
  const recipients = [];

  if (isEdit) {
    // Pre-populate givers/recipients from the first gift in the group
    // (all gifts in a group share the same participants by construction).
    givers.push(...(editGroup[0].givers || []));
    recipients.push(...(editGroup[0].recipients || []));
    renderModalChips(`${mid}-givers`, givers);
    renderModalChips(`${mid}-recipients`, recipients);
    // Pre-populate drafts with original uuids so save can update in place
    editGroup.forEach(g => drafts.push({
      uuid: g.uuid,
      title: g.title,
      product_uuid: g.product_uuid || null,
      image_url: g.product_image_url || null,
      price: g.price != null ? Number(g.price) : null,
    }));
    renderDrafts();
    // Group notes — stored per order but shared across the group.
    // Pre-fill from the first gift that has a note.
    const groupNote = editGroup.find(g => g.notes)?.notes || '';
    document.getElementById(`${mid}-group-notes`).value = groupNote;
  } else if (prefilledRecipients?.length) {
    recipients.push(...prefilledRecipients);
    renderModalChips(`${mid}-recipients`, recipients);
  } else if (event?.honoree) {
    // Honoree is the default recipient for both directions:
    //   outgoing = we give to honoree
    //   incoming = honoree receives from others
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

  function renderDrafts() {
    const el = document.getElementById(`${mid}-added`);
    const countEl = document.getElementById(`${mid}-count`);
    if (!el) return;
    el.innerHTML = drafts.map((d, i) => `
      <div class="gift-draft-row" data-index="${i}">
        <div class="gift-draft-main">
          ${productChipHtml({ title: d.title, image_url: d.image_url, product_uuid: d.product_uuid })}
          <input type="text" inputmode="numeric" class="form-control form-control-sm gift-draft-price"
            placeholder="${t('gifts.price')}" value="${d.price != null ? formatNumber(d.price) : ''}">
          <button type="button" class="btn btn-link btn-sm text-danger gift-draft-remove" title="${t('common.delete')}">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.gift-draft-price').forEach((input, i) => {
      attachPriceInput(input);
      input.addEventListener('blur', () => { drafts[i].price = readPriceInput(input); });
    });
    el.querySelectorAll('.gift-draft-remove').forEach((btn, i) => {
      btn.addEventListener('click', () => { drafts.splice(i, 1); renderDrafts(); });
    });

    if (countEl) {
      const n = drafts.length;
      countEl.textContent = n ? `${n} ${n === 1 ? t('gifts.gift').toLowerCase() : t('gifts.gifts').toLowerCase()}` : '';
    }
  }

  // Flush any text the user typed into the picker but forgot to select
  // from the dropdown — treat it as a free-text gift.
  function flushPendingPickerText() {
    const selected = picker.getSelected();
    if (selected && selected.title?.trim() && !drafts.some(d => d.title === selected.title)) {
      drafts.push({
        title: selected.title.trim(),
        product_uuid: selected.uuid || null,
        image_url: selected.image_url || null,
        price: selected.price != null ? Number(selected.price) : null,
        notes: '',
      });
      picker.clear();
      renderDrafts();
    }
  }

  async function saveAllDrafts() {
    flushPendingPickerText();
    const status = document.getElementById(`${mid}-status`).value;
    const notes = document.getElementById(`${mid}-group-notes`).value.trim() || null;
    const giver_uuids = givers.map(g => g.uuid);
    const recipient_uuids = recipients.map(r => r.uuid);

    // Delete original gifts that were removed from the drafts list
    if (isEdit) {
      const keptUuids = new Set(drafts.filter(d => d.uuid).map(d => d.uuid));
      for (const uuid of originalUuids) {
        if (!keptUuids.has(uuid)) {
          await api.delete(`/gifts/orders/${uuid}`);
          savedCount++;
        }
      }
    }

    for (const d of drafts) {
      if (d.uuid) {
        // Existing gift — update in place
        await api.put(`/gifts/orders/${d.uuid}`, {
          title: d.title,
          product_uuid: d.product_uuid || null,
          status,
          order_type: direction,
          price: d.price,
          notes,
          giver_uuids,
          recipient_uuids,
        });
      } else {
        // New gift — create
        await api.post('/gifts/orders', {
          title: d.title,
          product_uuid: d.product_uuid || null,
          event_uuid: eventUuid,
          status,
          order_type: direction,
          price: d.price,
          notes,
          giver_uuids,
          recipient_uuids,
        });
      }
      savedCount++;
    }
    drafts.length = 0;
  }

  // Done — save all drafts, then close.
  document.getElementById(`${mid}-done`).addEventListener('click', async () => {
    try {
      await saveAllDrafts();
      modal.hide();
    } catch (err) {
      console.error('Save gifts failed', err);
      confirmDialog(err.message || String(err), { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', async () => {
    modalEl.remove();
    if (savedCount > 0) await reloadGifts(eventUuid);
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

  // "Add gift for member" in incoming view. Look up the full contact
  // (including avatar) so the prefilled chip renders correctly.
  el.querySelectorAll('.gift-add-for-member').forEach(btn => {
    btn.addEventListener('click', () => {
      const uuid = btn.dataset.uuid;
      const fromGift = pageGiftsCache
        .flatMap(g => g.recipients || [])
        .find(r => r.uuid === uuid);
      const fromMember = pageMembers.find(m => m.linked_contact_uuid === uuid);
      const recipient = fromGift || (fromMember ? {
        uuid,
        first_name: fromMember.first_name,
        last_name: fromMember.last_name || '',
        avatar: fromMember.avatar || null,
      } : { uuid, first_name: btn.dataset.name, last_name: '' });
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

  // Edit an entire gift group (from row dropdown)
  el.querySelectorAll('.gift-edit-group').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const uuids = link.dataset.uuids.split(',');
      const gifts = uuids.map(uuid => pageGiftsCache.find(g => g.uuid === uuid)).filter(Boolean);
      if (!gifts.length) return;
      showGiftModal(eventUuid, pageEventCache, gifts[0].order_type, null, gifts);
    });
  });

  // Delete all gifts in a received group (from row dropdown)
  el.querySelectorAll('.gift-delete-group').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const uuids = link.dataset.uuids.split(',');
      if (!await confirmDialog(t('gifts.deleteGiftConfirm'), { title: t('gifts.deleteGift'), confirmText: t('common.delete') })) return;
      for (const uuid of uuids) {
        await api.delete(`/gifts/orders/${uuid}`);
      }
      await reloadGifts(eventUuid);
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
  pageEventCache = data.event;
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


function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
