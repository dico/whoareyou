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
            ${event.directions !== 'incoming' ? `<button class="filter-tab" data-direction="outgoing">${t('gifts.outgoing')}</button>` : ''}
            ${event.directions !== 'outgoing' ? `<button class="filter-tab" data-direction="incoming">${t('gifts.incoming')}</button>` : ''}
          </div>
          <button class="btn btn-primary btn-sm" id="btn-new-gift">
            <i class="bi bi-plus-lg me-1"></i>${t('gifts.newGift')}
          </button>
        </div>
      </div>

      <div id="gift-list"></div>
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

    // Direction tabs — pick the active one based on the event's
    // allowed directions plus a remembered preference where applicable.
    const allowedDirs = event.directions === 'both'
      ? ['outgoing', 'incoming']
      : [event.directions];
    const savedDir = localStorage.getItem('giftDirection');
    const initialDir = allowedDirs.includes(savedDir) ? savedDir : allowedDirs[0];
    document.querySelectorAll('#gift-direction-tabs .filter-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`#gift-direction-tabs [data-direction="${initialDir}"]`)?.classList.add('active');
    document.getElementById('gift-list').innerHTML = renderGiftList(gifts, pageMembers, initialDir);
    updateEventMeta(event, gifts, initialDir);
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
      const dir = document.querySelector('#gift-direction-tabs .filter-tab.active')?.dataset.direction || allowedDirs[0];
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
    event.honorees?.length
      ? event.honorees.map(h => `<a href="#" class="text-muted" ${giftContactLinkAttrs(h)}>${esc(h.first_name)} ${esc(h.last_name || '')}</a>`).join(', ')
      : '',
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
            <li><a class="dropdown-item gift-copy-group" href="#" data-uuids="${uuids}">
              <i class="bi bi-files me-2"></i>${t('common.duplicate')}
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
  // If the event has honorees (birthday, wedding, etc.) we treat them as
  // the implicit recipient(s) when a gift was saved with no explicit
  // recipients — the user shouldn't have to type "to Vigdis" on her own
  // birthday. Without honorees we fall back to a generic "?" group.
  const eventHonorees = pageEventCache?.honorees?.length
    ? pageEventCache.honorees
    : (pageEventCache?.honoree ? [pageEventCache.honoree] : []);

  // Group gifts by the full recipient set (sorted UUID list) so a joint
  // gift to "Kari + Ola" stays in one group with both names in the header,
  // rather than being duplicated under each recipient individually.
  const byRecipientSet = new Map();
  for (const g of gifts) {
    let recs = g.recipients?.length ? g.recipients : [];
    if (!recs.length && eventHonorees.length) {
      recs = eventHonorees.map(h => ({ ...h, type: 'contact' }));
    }
    const key = recs.length ? recs.map(r => r.uuid).sort().join(',') : '_unknown';
    if (!byRecipientSet.has(key)) {
      byRecipientSet.set(key, { recipients: recs, gifts: [] });
    }
    byRecipientSet.get(key).gifts.push(g);
  }

  const groups = [...byRecipientSet.values()];
  if (!groups.length) {
    return `<div class="empty-state"><i class="bi bi-gift"></i><p>${t('gifts.noGifts')}</p></div>`;
  }

  // Sort: solo family-member groups first (matching the member order),
  // then everything else.
  const familyUuids = new Set((members || []).filter(m => m.linked_contact_uuid).map(m => m.linked_contact_uuid));
  const memberOrder = new Map((members || []).filter(m => m.linked_contact_uuid).map((m, i) => [m.linked_contact_uuid, i]));
  groups.sort((a, b) => {
    const aSolo = a.recipients.length === 1 && familyUuids.has(a.recipients[0].uuid);
    const bSolo = b.recipients.length === 1 && familyUuids.has(b.recipients[0].uuid);
    if (aSolo && bSolo) return memberOrder.get(a.recipients[0].uuid) - memberOrder.get(b.recipients[0].uuid);
    if (aSolo) return -1;
    if (bSolo) return 1;
    return 0;
  });

  return groups.map(group => {
    // Add button prefills with this group's recipient set
    const recipientData = encodeURIComponent(JSON.stringify(
      group.recipients.map(r => ({ uuid: r.uuid, first_name: r.first_name, last_name: r.last_name || '', avatar: r.avatar || null }))
    ));
    const addBtn = `<button class="btn btn-link btn-sm gift-add-for-recipients" data-recipients="${recipientData}"><i class="bi bi-plus-lg"></i></button>`;

    // Group this recipient set's gifts by giver(s) key
    const byGiver = new Map();
    for (const g of group.gifts) {
      const key = g.givers?.map(c => c.uuid).sort().join(',') || '_unknown';
      if (!byGiver.has(key)) byGiver.set(key, { givers: g.givers || [], gifts: [] });
      byGiver.get(key).gifts.push(g);
    }

    const giverGroups = [...byGiver.values()];
    const headerContacts = group.recipients.length
      ? group.recipients
      : [{ uuid: '_unknown', first_name: '?', last_name: '' }];

    return `
      <div class="gift-group">
        ${renderGroupHeader(headerContacts, { count: group.gifts.length, actionsHtml: addBtn })}
        ${giverGroups.map(gg => {
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
          }).join('')}
      </div>
    `;
  }).join('');
}

/**
 * Render a list of participants (contacts and/or companies) as chips.
 * Contacts become contact-chip (opens contact-gift-modal via global delegate).
 * Companies become a chip that navigates to /groups/:uuid.
 */
function participantChips(participants, prefix = '') {
  if (!participants?.length) return '';
  return `${prefix}${participants.map(p => {
    if (p.type === 'company') {
      const initials = (p.name?.[0] || '?');
      const avatarHtml = p.avatar
        ? `<img src="${authUrl(p.avatar)}" alt="">`
        : `<span>${esc(initials)}</span>`;
      return `<a href="/groups/${p.uuid}" data-link class="contact-chip">` +
        `<span class="contact-chip-avatar">${avatarHtml}</span>` +
        `${esc(p.name)}</a>`;
    }
    // Contact (default for rows created before the type field existed).
    return `<a href="#" class="contact-chip" ${giftContactLinkAttrs(p)}>` +
      `<span class="contact-chip-avatar">${p.avatar ? `<img src="${authUrl(p.avatar)}" alt="">` : `<span>${(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}</span>`}</span>` +
      `${esc(p.first_name)}</a>`;
  }).join(' ')}`;
}

// Backwards-compatible alias — many call sites still use this name.
const contactChips = participantChips;

/**
 * Standardized group header with avatar, clickable name, count and action buttons.
 * Used across gift event detail (outgoing/incoming), wishlists, planning.
 */
function renderGroupHeader(participants, { count, actionsHtml } = {}) {
  if (!participants?.length) return '';
  const links = participants.map(p => {
    if (p.type === 'company') {
      const initials = (p.name?.[0] || '?');
      const avatar = p.avatar ? `<img src="${authUrl(p.avatar)}" alt="">` : `<span>${esc(initials)}</span>`;
      return `
        <a href="/groups/${p.uuid}" data-link class="gift-group-header-link">
          <span class="gift-group-avatar">${avatar}</span>
          <span>${esc(p.name)}</span>
        </a>
      `;
    }
    return `
      <a href="#" class="gift-group-header-link" ${giftContactLinkAttrs(p)}>
        <span class="gift-group-avatar">
          ${p.avatar ? `<img src="${authUrl(p.avatar)}" alt="">` : `<span>${(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}</span>`}
        </span>
        <span>${esc(p.first_name)} ${esc(p.last_name || '')}</span>
      </a>
    `;
  }).join('');

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

function showGiftModal(eventUuid, event, direction = 'outgoing', prefilledRecipients = null, editGroup = null, copyFrom = null) {
  const mid = 'gift-modal-' + Date.now();
  const isEdit = !!editGroup?.length;
  // Track original uuids so we can diff on save: existing → update,
  // missing → delete, new (no uuid) → create.
  const originalUuids = isEdit ? editGroup.map(g => g.uuid) : [];
  // In edit mode, status should default to the shared status of the edited group.
  const editStatus = isEdit ? editGroup[0].status : null;
  // For events with honorees (birthday, wedding) the recipient is
  // implicit and the To field is hidden — gifts are always for/from
  // the honoree(s), no need to type "to Vigdis" on her own birthday.
  // Applies to both directions: incoming = honorees receive from others,
  // outgoing = we give to honoree(s).
  const eventHonoreesList = event?.honorees?.length
    ? event.honorees
    : (event?.honoree ? [event.honoree] : []);
  const hasHonoree = eventHonoreesList.length > 0;
  const hideRecipients = hasHonoree;

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
              <div class="gift-quick-add mt-1">
                ${direction === 'outgoing' ? `<button type="button" class="btn btn-link btn-sm p-0 me-2" id="${mid}-add-my-family"><i class="bi bi-house-heart me-1"></i>${t('gifts.addMyFamily')}</button>` : ''}
                <button type="button" class="btn btn-link btn-sm p-0 d-none" id="${mid}-add-household-giver"><i class="bi bi-people me-1"></i>${t('gifts.addHousehold')}</button>
              </div>
            </div>
            <div class="mb-3${hideRecipients ? ' d-none' : ''}">
              <label class="form-label">${t('gifts.to')}</label>
              <div class="gift-chips-wrap" id="${mid}-recipients"></div>
              <div class="position-relative mt-1">
                <input type="text" class="form-control form-control-sm" id="${mid}-recipient-search" placeholder="${t('common.search')}" autocomplete="off">
                <div class="product-picker-dropdown d-none" id="${mid}-recipient-results"></div>
              </div>
              <div class="gift-quick-add mt-1">
                <button type="button" class="btn btn-link btn-sm p-0 d-none" id="${mid}-add-household-recipient"><i class="bi bi-people me-1"></i>${t('gifts.addHousehold')}</button>
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
                    // Default: 'given' for incoming (already received), 'purchased' for outgoing
                    // (gifts added from the Giving tab are things we've bought/are giving, not just ideas).
                    // Planning-only 'idea'/'reserved' items live in the /gifts/planning page instead.
                    const defaultStatus = editStatus || (direction === 'incoming' ? 'given' : 'purchased');
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
  } else if (copyFrom?.length) {
    // Duplicate flow: prefill givers/recipients and drafts (without uuids)
    // so the user can tweak and save as new gifts.
    givers.push(...(copyFrom[0].givers || []));
    recipients.push(...(copyFrom[0].recipients || []));
    renderModalChips(`${mid}-givers`, givers);
    renderModalChips(`${mid}-recipients`, recipients);
    copyFrom.forEach(g => drafts.push({
      title: g.title,
      product_uuid: g.product_uuid || null,
      image_url: g.product_image_url || null,
      price: g.price != null ? Number(g.price) : null,
    }));
    renderDrafts();
    const copyNote = copyFrom.find(g => g.notes)?.notes || '';
    document.getElementById(`${mid}-group-notes`).value = copyNote;
  } else if (prefilledRecipients?.length) {
    recipients.push(...prefilledRecipients);
    renderModalChips(`${mid}-recipients`, recipients);
  } else if (eventHonoreesList.length) {
    // Honorees are the default recipients for both directions:
    //   outgoing = we give to honoree(s)
    //   incoming = honoree(s) receive from others
    eventHonoreesList.forEach(h => recipients.push({ ...h, type: 'contact' }));
    renderModalChips(`${mid}-recipients`, recipients);
  }

  // Inline participant search for givers — contacts AND companies
  setupParticipantSearch(`${mid}-giver-search`, `${mid}-giver-results`, (p) => {
    if (!givers.some(g => g.uuid === p.uuid && (g.type || 'contact') === (p.type || 'contact'))) {
      givers.push(p);
      renderModalChips(`${mid}-givers`, givers);
      refreshHouseholdButton(givers, `${mid}-add-household-giver`);
    }
  });

  // Inline participant search for recipients
  setupParticipantSearch(`${mid}-recipient-search`, `${mid}-recipient-results`, (p) => {
    if (!recipients.some(r => r.uuid === p.uuid && (r.type || 'contact') === (p.type || 'contact'))) {
      recipients.push(p);
      renderModalChips(`${mid}-recipients`, recipients);
      refreshHouseholdButton(recipients, `${mid}-add-household-recipient`);
    }
  });

  // Household lookup cache (contact uuid → array of household members).
  // Avoids re-fetching when the user re-renders chips.
  const householdCache = new Map();
  async function loadHousehold(contactUuid) {
    if (householdCache.has(contactUuid)) return householdCache.get(contactUuid);
    try {
      const { contact } = await api.get(`/contacts/${contactUuid}`);
      const household = contact?.household || [];
      householdCache.set(contactUuid, household);
      return household;
    } catch {
      householdCache.set(contactUuid, []);
      return [];
    }
  }

  // Show or hide the "Add household" button based on the first contact
  // in the list — only visible when that contact actually has household
  // members not already in the list.
  async function refreshHouseholdButton(list, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const anchor = list.find(p => (p.type || 'contact') === 'contact');
    if (!anchor) { btn.classList.add('d-none'); return; }
    const household = await loadHousehold(anchor.uuid);
    const existing = new Set(list.filter(p => (p.type || 'contact') === 'contact').map(p => p.uuid));
    const toAdd = household.filter(h => !existing.has(h.uuid));
    btn.classList.toggle('d-none', toAdd.length === 0);
  }

  async function addHouseholdTo(list, containerId, btnId) {
    const anchor = list.find(p => (p.type || 'contact') === 'contact');
    if (!anchor) return;
    const household = await loadHousehold(anchor.uuid);
    let added = 0;
    for (const h of household) {
      if (list.some(p => p.uuid === h.uuid && (p.type || 'contact') === 'contact')) continue;
      list.push({ type: 'contact', uuid: h.uuid, first_name: h.first_name, last_name: h.last_name || '', avatar: h.avatar || null });
      added++;
    }
    if (added > 0) {
      renderModalChips(containerId, list);
      refreshHouseholdButton(list, btnId);
    }
  }

  document.getElementById(`${mid}-add-household-giver`)?.addEventListener('click', () => addHouseholdTo(givers, `${mid}-givers`, `${mid}-add-household-giver`));
  document.getElementById(`${mid}-add-household-recipient`)?.addEventListener('click', () => addHouseholdTo(recipients, `${mid}-recipients`, `${mid}-add-household-recipient`));

  // Initial refresh for prefilled participants (edit/copy/honoree flows)
  refreshHouseholdButton(givers, `${mid}-add-household-giver`);
  refreshHouseholdButton(recipients, `${mid}-add-household-recipient`);

  // Quick-add: "my family" — all tenant members with a linked contact.
  // Useful on Giving From, since gifts from this household are common.
  const addMyFamilyBtn = document.getElementById(`${mid}-add-my-family`);
  if (addMyFamilyBtn) {
    addMyFamilyBtn.addEventListener('click', () => {
      const family = (pageMembers || [])
        .filter(m => m.linked_contact_uuid)
        .map(m => ({
          type: 'contact',
          uuid: m.linked_contact_uuid,
          first_name: m.first_name,
          last_name: m.last_name || '',
          avatar: m.avatar || null,
        }));
      let added = 0;
      for (const f of family) {
        if (givers.some(g => g.uuid === f.uuid && (g.type || 'contact') === 'contact')) continue;
        givers.push(f);
        added++;
      }
      if (added > 0) renderModalChips(`${mid}-givers`, givers);
    });
  }

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
    const giver_uuids = givers.filter(g => (g.type || 'contact') === 'contact').map(g => g.uuid);
    const giver_company_uuids = givers.filter(g => g.type === 'company').map(g => g.uuid);
    let recipient_uuids = recipients.filter(r => (r.type || 'contact') === 'contact').map(r => r.uuid);
    const recipient_company_uuids = recipients.filter(r => r.type === 'company').map(r => r.uuid);

    // Nothing to save
    if (!drafts.length) return;

    // For events with honorees, a gift with no explicit recipient is
    // implicitly for the honoree(s) — auto-fill so the row never renders
    // as an orphan with an empty To column. Applies to both directions.
    if (hasHonoree && !recipient_uuids.length && !recipient_company_uuids.length) {
      recipient_uuids = eventHonoreesList.map(h => h.uuid);
    }

    // Require at least one recipient (outgoing: who's it for?)
    // and one giver (incoming: who gave it?). Otherwise the row renders
    // as an orphan with an empty From/To column.
    if (direction === 'outgoing' && !recipient_uuids.length && !recipient_company_uuids.length) {
      throw new Error(t('gifts.errorRecipientRequired'));
    }
    if (direction === 'incoming' && !giver_uuids.length && !giver_company_uuids.length) {
      throw new Error(t('gifts.errorGiverRequired'));
    }

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

    const participantPayload = {
      giver_uuids,
      recipient_uuids,
      giver_company_uuids,
      recipient_company_uuids,
    };
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
          ...participantPayload,
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
          ...participantPayload,
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

function renderModalChips(containerId, participants) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.contact-chip').forEach(c => c.remove());
  participants.forEach((p, i) => {
    const chip = document.createElement('span');
    chip.className = 'contact-chip';
    if (p.type === 'company') {
      const initials = (p.name?.[0] || '?');
      chip.innerHTML = `
        <span class="contact-chip-avatar">
          ${p.avatar ? `<img src="${authUrl(p.avatar)}" alt="">` : `<span>${esc(initials)}</span>`}
        </span>
        ${esc(p.name)}
        <button type="button" class="contact-chip-remove" data-index="${i}"><i class="bi bi-x"></i></button>
      `;
    } else {
      chip.innerHTML = `
        <span class="contact-chip-avatar">
          ${p.avatar ? `<img src="${authUrl(p.avatar)}" alt="">` : `<span>${(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}</span>`}
        </span>
        ${esc(p.first_name)} ${esc(p.last_name || '')}
        <button type="button" class="contact-chip-remove" data-index="${i}"><i class="bi bi-x"></i></button>
      `;
    }
    chip.querySelector('.contact-chip-remove').addEventListener('click', () => {
      participants.splice(i, 1);
      renderModalChips(containerId, participants);
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

  // "Add gift for recipients" in incoming view — prefills the modal with
  // the full recipient set from this group's header.
  el.querySelectorAll('.gift-add-for-recipients').forEach(btn => {
    btn.addEventListener('click', () => {
      const recipients = JSON.parse(decodeURIComponent(btn.dataset.recipients));
      showGiftModal(eventUuid, pageEventCache, 'incoming', recipients);
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

  // Duplicate a gift group — open a fresh add modal prefilled with
  // the same participants and gifts (no uuids), so the user can tweak
  // e.g. the recipient(s) and save as a new gift.
  el.querySelectorAll('.gift-copy-group').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const uuids = link.dataset.uuids.split(',');
      const gifts = uuids.map(uuid => pageGiftsCache.find(g => g.uuid === uuid)).filter(Boolean);
      if (!gifts.length) return;
      showGiftModal(eventUuid, pageEventCache, gifts[0].order_type, null, null, gifts);
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
function setupParticipantSearch(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  if (!input) return;
  document.getElementById(resultsId)?.remove();
  attachContactSearch(input, {
    limit: 6,
    includeCompanies: true,
    onSelect: (p) => {
      if (p.type === 'company') {
        onSelect({ type: 'company', uuid: p.uuid, name: p.name, avatar: p.logo_path || p.avatar || null });
      } else {
        onSelect({ type: 'contact', uuid: p.uuid, first_name: p.first_name, last_name: p.last_name || '', avatar: p.avatar || null });
      }
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
