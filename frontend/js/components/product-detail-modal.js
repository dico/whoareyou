import { api } from '../api/client.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

/**
 * Show product detail modal with history (gifts given/received, wishlists).
 * Reusable — call from products page, event detail, planning, etc.
 */
export async function showProductDetailModal(productUuid) {
  const mid = 'product-detail-' + Date.now();

  // Show loading modal
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-body text-center p-4">
            <div class="loading">${t('app.loading')}</div>
          </div>
        </div>
      </div>
    </div>
  `);
  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();

  try {
    const { product, orders, wishlist_items } = await api.get(`/gifts/products/${productUuid}`);

    modalEl.querySelector('.modal-content').innerHTML = `
      <div class="modal-header">
        <h5 class="modal-title">${esc(product.name)}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        ${product.image_url ? `<div class="text-center mb-3"><img src="${esc(product.image_url)}" alt="" style="max-width:100%;max-height:200px;border-radius:var(--radius-md)"></div>` : ''}

        <div class="d-flex flex-wrap gap-3 mb-3">
          ${product.default_price ? `<div><span class="text-muted small">${t('gifts.price')}</span><br><strong>${product.default_price} ${product.currency_code || 'kr'}</strong></div>` : ''}
          ${product.url ? `<div><span class="text-muted small">${t('common.open')}</span><br><a href="${esc(product.url)}" target="_blank" rel="noopener" class="subtle-link">${getDomain(product.url)} <i class="bi bi-box-arrow-up-right"></i></a></div>` : ''}
        </div>

        ${product.description ? `<p class="text-muted small mb-3">${esc(product.description)}</p>` : ''}

        ${orders.length ? `
          <h6 class="text-muted small text-uppercase mb-2">${t('gifts.history')}</h6>
          ${orders.map(o => `
            <div class="product-history-item">
              <div class="product-history-main">
                <span class="badge bg-${statusColor(o.status)} me-1">${t('gifts.statuses.' + o.status)}</span>
                <span class="small">
                  ${o.givers?.length ? chipNames(o.givers) : ''}
                  ${o.givers?.length && o.recipients?.length ? ' → ' : ''}
                  ${o.recipients?.length ? chipNames(o.recipients) : ''}
                </span>
              </div>
              <div class="product-history-meta text-muted small">
                ${o.event_name ? `${esc(o.event_name)} · ` : ''}${formatDate(o.created_at)}
                ${o.price ? ` · ${o.price} kr` : ''}
              </div>
            </div>
          `).join('')}
        ` : ''}

        ${wishlist_items.length ? `
          <h6 class="text-muted small text-uppercase mb-2 ${orders.length ? 'mt-3' : ''}">${t('gifts.wishlists')}</h6>
          ${wishlist_items.map(w => `
            <div class="product-history-item">
              <span>${w.is_fulfilled ? '<i class="bi bi-check-circle text-success me-1"></i>' : '<i class="bi bi-heart me-1 text-muted"></i>'}</span>
              <span class="small">${t('gifts.wishlistFor', { name: `${esc(w.first_name)} ${esc(w.last_name || '')}` })}</span>
            </div>
          `).join('')}
        ` : ''}

        ${!orders.length && !wishlist_items.length ? `<p class="text-muted small">${t('gifts.noHistory')}</p>` : ''}
      </div>
    `;
  } catch (err) {
    modalEl.querySelector('.modal-content').innerHTML = `
      <div class="modal-body"><div class="alert alert-danger">${err.message}</div></div>
    `;
  }
}

function chipNames(contacts) {
  return contacts.map(c => {
    const initials = (c.first_name?.[0] || '') + (c.last_name?.[0] || '');
    return `<a href="/contacts/${c.uuid}" data-link class="contact-chip">` +
      `<span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${initials}</span>`}</span>` +
      `${esc(c.first_name)}</a>`;
  }).join(' ');
}

const STATUS_COLORS = { idea: 'secondary', reserved: 'info', purchased: 'warning', wrapped: 'purple', given: 'success', cancelled: 'danger' };
function statusColor(s) { return STATUS_COLORS[s] || 'secondary'; }
function getDomain(url) { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } }
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
