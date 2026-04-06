import { api } from '../api/client.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

/**
 * Contact gift modal — shown when clicking a contact name inside the gift app.
 * Displays avatar, name, a button to open the full contact profile, and a
 * history of gifts this contact has received and given.
 *
 * Gift pages wire this up by marking contact links with
 *   data-gift-contact-uuid, data-gift-contact-first-name,
 *   data-gift-contact-last-name, data-gift-contact-avatar
 * A single document-level click delegate handles all of them.
 */

export async function openContactGiftModal(contact) {
  const mid = 'contact-gift-modal-' + Date.now();
  const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
  const initials = (contact.first_name?.[0] || '') + (contact.last_name?.[0] || '');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title mb-0">${t('gifts.giftHistory')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="contact-gift-card">
              <span class="contact-gift-card-avatar">
                ${contact.avatar
                  ? `<img src="${authUrl(contact.avatar)}" alt="">`
                  : `<span>${esc(initials)}</span>`}
              </span>
              <div class="contact-gift-card-name">${esc(name)}</div>
              <button type="button" class="btn btn-primary btn-sm" id="${mid}-open">
                <i class="bi bi-person me-1"></i>${t('gifts.openContactProfile')}
              </button>
            </div>
            <div id="${mid}-history">
              <div class="text-center text-muted">${t('app.loading')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();

  document.getElementById(`${mid}-open`).addEventListener('click', () => {
    modal.hide();
    history.pushState(null, '', `/contacts/${contact.uuid}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  try {
    const { orders } = await api.get(`/gifts/orders?contact_uuid=${encodeURIComponent(contact.uuid)}&limit=200`);

    const received = [];
    const given = [];
    for (const o of orders) {
      const isRecipient = (o.recipients || []).some(c => c.uuid === contact.uuid);
      const isGiver = (o.givers || []).some(c => c.uuid === contact.uuid);
      if (isRecipient) received.push(o);
      if (isGiver) given.push(o);
    }

    const body = document.getElementById(`${mid}-history`);
    if (!received.length && !given.length) {
      body.innerHTML = `<p class="text-muted text-center mb-0">${t('gifts.noGiftHistory')}</p>`;
      return;
    }

    const defaultTab = received.length ? 'received' : 'given';
    body.innerHTML = `
      <div class="filter-tabs mb-2">
        <button class="filter-tab ${defaultTab === 'received' ? 'active' : ''}" data-tab="received" ${!received.length ? 'disabled' : ''}>
          ${t('gifts.giftsReceived')} (${received.length})
        </button>
        <button class="filter-tab ${defaultTab === 'given' ? 'active' : ''}" data-tab="given" ${!given.length ? 'disabled' : ''}>
          ${t('gifts.giftsGiven')} (${given.length})
        </button>
      </div>
      <div class="contact-gift-tab-pane" data-pane="received" ${defaultTab !== 'received' ? 'hidden' : ''}>
        ${received.map(renderOrderCard).join('')}
      </div>
      <div class="contact-gift-tab-pane" data-pane="given" ${defaultTab !== 'given' ? 'hidden' : ''}>
        ${given.map(renderOrderCard).join('')}
      </div>
    `;

    body.querySelectorAll('.filter-tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const target = btn.dataset.tab;
        body.querySelectorAll('.filter-tab[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
        body.querySelectorAll('.contact-gift-tab-pane').forEach(p => { p.hidden = p.dataset.pane !== target; });
      });
    });

    body.addEventListener('click', async (e) => {
      const prodEl = e.target.closest('[data-product-uuid]');
      if (prodEl) {
        e.preventDefault();
        modal.hide();
        const { showProductDetailModal } = await import('./product-detail-modal.js');
        showProductDetailModal(prodEl.dataset.productUuid);
        return;
      }
      const eventEl = e.target.closest('[data-event-uuid]');
      if (eventEl) {
        e.preventDefault();
        modal.hide();
        history.pushState(null, '', `/gifts/events/${eventEl.dataset.eventUuid}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    });
  } catch (err) {
    document.getElementById(`${mid}-history`).innerHTML =
      `<div class="alert alert-danger mb-0">${esc(err.message || 'Error')}</div>`;
  }
}

function renderOrderCard(o) {
  const imgSrc = o.product_image_url
    ? (/^https?:\/\//i.test(o.product_image_url) ? esc(o.product_image_url) : authUrl(o.product_image_url))
    : null;
  const thumb = imgSrc
    ? `<img src="${imgSrc}" alt="" class="contact-gift-order-thumb${o.product_uuid ? ' contact-gift-order-thumb-clickable' : ''}"${o.product_uuid ? ` data-product-uuid="${esc(o.product_uuid)}"` : ''}>`
    : `<span class="contact-gift-order-thumb contact-gift-order-thumb-placeholder${o.product_uuid ? ' contact-gift-order-thumb-clickable' : ''}"${o.product_uuid ? ` data-product-uuid="${esc(o.product_uuid)}"` : ''}><i class="bi bi-gift"></i></span>`;
  const titleHtml = o.product_uuid
    ? `<a href="#" class="contact-gift-order-title" data-product-uuid="${esc(o.product_uuid)}">${esc(o.title)}</a>`
    : `<span class="contact-gift-order-title">${esc(o.title)}</span>`;
  const eventHtml = o.event_name
    ? (o.event_uuid
        ? `<a href="#" class="contact-gift-order-event" data-event-uuid="${esc(o.event_uuid)}">${esc(o.event_name)}</a> · `
        : `${esc(o.event_name)} · `)
    : '';
  return `
    <div class="contact-gift-order-card">
      ${thumb}
      <div class="contact-gift-order-info">
        ${titleHtml}
        <div class="text-muted small">
          <span class="badge bg-${statusColor(o.status)} me-1">${t('gifts.statuses.' + o.status)}</span>
          ${eventHtml}${formatDate(o.created_at)}${o.price ? ` · ${Math.round(o.price)} kr` : ''}
        </div>
        ${o.givers?.length ? `<div class="contact-gift-order-people small"><span class="text-muted">${t('gifts.from')}:</span> ${chipNames(o.givers)}</div>` : ''}
        ${o.recipients?.length ? `<div class="contact-gift-order-people small"><span class="text-muted">${t('gifts.to')}:</span> ${chipNames(o.recipients)}</div>` : ''}
      </div>
    </div>
  `;
}

function chipNames(contacts) {
  return contacts.map(c => {
    const initials = (c.first_name?.[0] || '') + (c.last_name?.[0] || '');
    return `<a href="#" class="contact-chip" ${giftContactLinkAttrs(c)}>` +
      `<span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${esc(initials)}</span>`}</span>` +
      `${esc(c.first_name || '')}</a>`;
  }).join(' ');
}

/**
 * Produce data-* attributes for a contact link inside the gift app.
 * Use this on any element that should open the contact gift modal on click.
 */
export function giftContactLinkAttrs(contact) {
  return [
    `data-gift-contact-uuid="${esc(contact.uuid || '')}"`,
    `data-gift-contact-first-name="${esc(contact.first_name || '')}"`,
    `data-gift-contact-last-name="${esc(contact.last_name || '')}"`,
    `data-gift-contact-avatar="${esc(contact.avatar || '')}"`,
  ].join(' ');
}

const STATUS_COLORS = {
  idea: 'secondary', reserved: 'info', purchased: 'warning',
  wrapped: 'purple', given: 'success', cancelled: 'danger',
};
function statusColor(s) { return STATUS_COLORS[s] || 'secondary'; }
function esc(str) { if (str == null) return ''; const d = document.createElement('div'); d.textContent = String(str); return d.innerHTML; }

// Global click delegate — one listener handles every contact link in the gift app.
if (typeof document !== 'undefined' && !document.__contactGiftModalBound) {
  document.__contactGiftModalBound = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-gift-contact-uuid]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    openContactGiftModal({
      uuid: el.dataset.giftContactUuid,
      first_name: el.dataset.giftContactFirstName,
      last_name: el.dataset.giftContactLastName,
      avatar: el.dataset.giftContactAvatar,
    });
  });
}
