import { api } from '../api/client.js';
import { confirmDialog } from '../components/dialogs.js';
import { contactRowHtml } from '../components/contact-row.js';
import { authUrl } from '../utils/auth-url.js';
import { t } from '../utils/i18n.js';
import { createProductPicker } from '../components/product-picker.js';
import { giftSubNav } from './gifts.js';

const STATUS_COLORS = {
  idea: 'secondary', reserved: 'info', purchased: 'warning',
  wrapped: 'purple', given: 'success', cancelled: 'danger',
};

export async function renderGiftPlanning() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      ${giftSubNav('planning')}
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3>${t('gifts.planning')}</h3>
        <button class="btn btn-primary btn-sm" id="btn-new-idea">
          <i class="bi bi-plus-lg me-1"></i>${t('gifts.newIdea')}
        </button>
      </div>
      <p class="text-muted small mb-3">${t('gifts.planningDesc')}</p>
      <div id="planning-list"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;

  document.getElementById('btn-new-idea').addEventListener('click', () => showIdeaModal());
  await loadPlanningList();
}

async function loadPlanningList() {
  const el = document.getElementById('planning-list');
  if (!el) return;

  try {
    // Get all ideas and reserved — regardless of event
    const [ideasData, reservedData] = await Promise.all([
      api.get('/gifts/orders?status=idea&limit=200'),
      api.get('/gifts/orders?status=reserved&limit=200'),
    ]);
    const allIdeas = [...(ideasData.orders || []), ...(reservedData.orders || [])];

    if (!allIdeas.length) {
      el.innerHTML = `<div class="empty-state"><i class="bi bi-lightbulb"></i><p>${t('gifts.noIdeas')}</p></div>`;
      return;
    }

    // Group by recipient
    const groups = new Map();
    for (const g of allIdeas) {
      const recipientKey = g.recipients?.map(r => r.uuid).sort().join(',') || '_none';
      if (!groups.has(recipientKey)) {
        groups.set(recipientKey, { recipients: g.recipients || [], gifts: [] });
      }
      groups.get(recipientKey).gifts.push(g);
    }

    el.innerHTML = [...groups.values()].map(group => `
      <div class="gift-group">
        ${group.recipients.length
          ? groupHeader(group.recipients, group.gifts.length)
          : `<div class="gift-group-header"><span>${t('gifts.noRecipient')}</span><span class="text-muted small ms-1">(${group.gifts.length})</span></div>`
        }
        ${group.gifts.map(g => renderIdeaCard(g)).join('')}
      </div>
    `).join('');

    attachPlanningHandlers();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderIdeaCard(g) {
  const statusColor = STATUS_COLORS[g.status] || 'secondary';
  const giversText = g.givers?.map(c => `${c.first_name} ${c.last_name || ''}`.trim()).join(', ') || '';

  return `
    <div class="gift-card gift-card-idea" data-uuid="${g.uuid}">
      <div class="gift-card-image">
        ${g.product_image_url
          ? `<img src="${g.product_image_url.startsWith('/uploads/') ? authUrl(g.product_image_url) : esc(g.product_image_url)}" alt="">`
          : `<div class="gift-card-placeholder"><i class="bi bi-lightbulb"></i></div>`
        }
      </div>
      <div class="gift-card-body">
        <div class="gift-card-title">${esc(g.title)}</div>
        <div class="gift-card-sub text-muted small">
          ${g.event_name ? `<span class="gift-event-type-badge gift-type-other" style="font-size:0.65rem">${esc(g.event_name)}</span> ` : ''}
          ${giversText ? `${t('gifts.from').toLowerCase()} ${giversText}` : ''}
        </div>
      </div>
      <div class="gift-card-end">
        ${g.price ? `<span class="gift-card-price">${Math.round(g.price)} kr</span>` : ''}
        <span class="badge bg-${statusColor}">${t('gifts.statuses.' + g.status)}</span>
      </div>
      <div class="dropdown">
        <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
        <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
          <li><a class="dropdown-item idea-edit" href="#" data-uuid="${g.uuid}" data-title="${esc(g.title)}" data-price="${g.price || ''}" data-notes="${esc(g.notes || '')}"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
          <li><a class="dropdown-item idea-assign-event" href="#" data-uuid="${g.uuid}"><i class="bi bi-calendar-event me-2"></i>${g.event_uuid ? t('gifts.reassignEvent') : t('gifts.assignToEvent')}</a></li>
          ${g.event_uuid ? `<li><a class="dropdown-item idea-unassign-event" href="#" data-uuid="${g.uuid}"><i class="bi bi-x-circle me-2"></i>${t('gifts.removeFromEvent')}</a></li>` : ''}
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item text-danger idea-delete" href="#" data-uuid="${g.uuid}"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
        </ul>
      </div>
    </div>
  `;
}

function attachPlanningHandlers() {
  const el = document.getElementById('planning-list');
  if (!el) return;

  // Edit gift
  el.querySelectorAll('.idea-edit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const mid = 'edit-gift-' + Date.now();
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="${mid}" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${t('gifts.editGift')}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <form id="${mid}-form">
                <div class="modal-body">
                  <div class="mb-3">
                    <label class="form-label">${t('gifts.gift')}</label>
                    <input type="text" class="form-control form-control-sm" id="${mid}-title" value="${btn.dataset.title}" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">${t('gifts.price')}</label>
                    <input type="number" class="form-control form-control-sm" id="${mid}-price" value="${btn.dataset.price}" step="1">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">${t('gifts.notes')}</label>
                    <input type="text" class="form-control form-control-sm" id="${mid}-notes" value="${btn.dataset.notes}">
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
      const modalEl = document.getElementById(mid);
      const modal = new bootstrap.Modal(modalEl);
      document.getElementById(`${mid}-form`).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await api.put(`/gifts/orders/${btn.dataset.uuid}`, {
          title: document.getElementById(`${mid}-title`).value.trim(),
          price: parseFloat(document.getElementById(`${mid}-price`).value) || null,
          notes: document.getElementById(`${mid}-notes`).value.trim() || null,
        });
        modal.hide();
        await loadPlanningList();
      });
      modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
      modal.show();
    });
  });

  // Assign to event
  el.querySelectorAll('.idea-assign-event').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await showAssignEventModal(btn.dataset.uuid);
    });
  });

  // Remove from event
  el.querySelectorAll('.idea-unassign-event').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await api.put(`/gifts/orders/${btn.dataset.uuid}`, { event_uuid: null });
      await loadPlanningList();
    });
  });

  // Delete
  el.querySelectorAll('.idea-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (await confirmDialog(t('gifts.deleteGiftConfirm'), { title: t('gifts.deleteGift'), confirmText: t('common.delete') })) {
        await api.delete(`/gifts/orders/${btn.dataset.uuid}`);
        await loadPlanningList();
      }
    });
  });
}

async function showAssignEventModal(giftUuid) {
  try {
    const { events } = await api.get('/gifts/events');
    if (!events.length) {
      await confirmDialog(t('gifts.noEvents'), { title: t('gifts.assignToEvent'), confirmText: 'OK', confirmClass: 'btn-primary' });
      return;
    }

    const mid = 'assign-event-' + Date.now();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="${mid}" tabindex="-1">
        <div class="modal-dialog modal-sm">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${t('gifts.assignToEvent')}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              ${events.map(ev => `
                <button class="btn btn-outline-secondary btn-sm w-100 mb-2 text-start assign-event-btn" data-event-uuid="${ev.uuid}">
                  <span class="gift-event-type-badge gift-type-${ev.event_type} me-2">${t('gifts.types.' + ev.event_type)}</span>
                  ${esc(ev.name)}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `);

    const modalEl = document.getElementById(mid);
    const modal = new bootstrap.Modal(modalEl);

    modalEl.querySelectorAll('.assign-event-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.put(`/gifts/orders/${giftUuid}`, {
          event_uuid: btn.dataset.eventUuid,
          status: 'purchased',
        });
        modal.hide();
        await loadPlanningList();
      });
    });

    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
    modal.show();
  } catch (err) {
    confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
  }
}

function showIdeaModal() {
  const mid = 'idea-modal-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('gifts.newIdea')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${mid}-form">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">${t('gifts.gift')}</label>
                <div id="${mid}-product"></div>
              </div>
              <div class="mb-3">
                <label class="form-label">${t('gifts.to')}</label>
                <div class="gift-chips-wrap" id="${mid}-recipients"></div>
                <div class="position-relative mt-1">
                  <input type="text" class="form-control form-control-sm" id="${mid}-recipient-search" placeholder="${t('common.search')}" autocomplete="off">
                  <div class="product-picker-dropdown d-none" id="${mid}-recipient-results"></div>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">${t('gifts.price')}</label>
                <input type="number" class="form-control form-control-sm" id="${mid}-price" step="1">
              </div>
              <div class="mb-3">
                <label class="form-label">${t('gifts.notes')}</label>
                <input type="text" class="form-control form-control-sm" id="${mid}-notes">
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

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  const picker = createProductPicker(document.getElementById(`${mid}-product`), () => {});
  const recipients = [];

  // Inline contact search for recipients
  setupInlineContactSearch(`${mid}-recipient-search`, `${mid}-recipient-results`, (c) => {
    if (!recipients.some(r => r.uuid === c.uuid)) {
      recipients.push(c);
      renderChips(`${mid}-recipients`, recipients);
    }
  });

  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const product = picker.getSelected();
    if (!product) return;

    try {
      await api.post('/gifts/orders', {
        title: product.title,
        product_uuid: product.uuid || null,
        status: 'idea',
        order_type: 'outgoing',
        price: parseFloat(document.getElementById(`${mid}-price`).value) || null,
        notes: document.getElementById(`${mid}-notes`).value || null,
        recipient_uuids: recipients.map(r => r.uuid),
      });
      modal.hide();
      await loadPlanningList();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function renderChips(containerId, contacts) {
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
      <button type="button" class="contact-chip-remove" data-index="${i}"><i class="bi bi-x"></i></button>`;
    chip.querySelector('.contact-chip-remove').addEventListener('click', () => {
      contacts.splice(i, 1);
      renderChips(containerId, contacts);
    });
    container.prepend(chip);
  });
}

function groupHeader(contacts, count) {
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
      ${count ? `<span class="text-muted small ms-1">(${count})</span>` : ''}
    </div>
  `;
}

function setupInlineContactSearch(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  let debounce = null;
  let contactsCache = [];
  let activeIdx = -1;

  function updateHighlight() {
    results.querySelectorAll('.contact-row').forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  }

  function selectByIndex(i) {
    const c = contactsCache[i];
    if (!c) return;
    onSelect({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name || '', avatar: c.avatar || null });
    input.value = '';
    results.classList.add('d-none');
    activeIdx = -1;
    contactsCache = [];
    input.focus();
  }

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    activeIdx = -1;
    const q = input.value.trim();
    if (q.length < 2) { results.classList.add('d-none'); contactsCache = []; return; }
    debounce = setTimeout(async () => {
      try {
        const { contacts } = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=6`);
        contactsCache = contacts || [];
        if (!contactsCache.length) { results.classList.add('d-none'); return; }
        results.innerHTML = contactsCache.map(c => contactRowHtml(c, { tag: 'div' })).join('');
        results.classList.remove('d-none');
        results.querySelectorAll('.contact-row').forEach((el, i) => el.addEventListener('click', () => selectByIndex(i)));
      } catch { results.classList.add('d-none'); contactsCache = []; }
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    const visible = !results.classList.contains('d-none') && contactsCache.length;
    if (e.key === 'Escape') { results.classList.add('d-none'); activeIdx = -1; return; }
    if (!visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, contactsCache.length - 1); updateHighlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); updateHighlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); selectByIndex(activeIdx >= 0 ? activeIdx : 0); }
  });
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
