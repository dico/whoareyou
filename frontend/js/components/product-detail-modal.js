import { api } from '../api/client.js';
import { t, formatDate, formatPrice } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { giftContactLinkAttrs } from './contact-gift-modal.js';

/**
 * Show product detail modal — shop-style layout with image left, info right.
 */
export async function showProductDetailModal(productUuid) {
  const mid = 'product-detail-' + Date.now();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-lg">
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
  modalEl.addEventListener('hidden.bs.modal', () => {
    modalEl.remove();
    document.dispatchEvent(new CustomEvent('product-updated'));
  }, { once: true });
  modal.show();

  try {
    const data = await api.get(`/gifts/products/${productUuid}`);
    const { product, orders } = data;
    const links = data.links || [];
    const wishlist_items = data.wishlist_items || [];
    const allLinks = links.length ? links : (product.url ? [{ store_name: getDomain(product.url), url: product.url, price: null }] : []);
    const imgSrc = product.image_url
      ? (product.image_url.startsWith('/uploads/') ? authUrl(product.image_url) : esc(product.image_url))
      : '';

    modalEl.querySelector('.modal-content').innerHTML = `
      <div class="modal-header">
        <h5 class="modal-title">${t('gifts.product')}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="product-detail-layout">
          <div class="product-detail-image product-detail-dropzone" id="${mid}-dropzone" title="${t('gifts.dropImage')}">
            ${imgSrc
              ? `<img src="${imgSrc}" alt="" id="${mid}-img">`
              : `<div class="product-detail-placeholder" id="${mid}-img"><i class="bi bi-gift"></i></div>`
            }
            <input type="file" accept="image/*" class="d-none" id="${mid}-file">
          </div>
          <div class="product-detail-info">
            <h4 class="mb-2">${esc(product.name)}</h4>
            ${product.default_price ? `<div class="product-detail-price">${formatPrice(product.default_price)}</div>` : ''}
            ${product.description ? `<p class="text-muted small mb-0">${esc(product.description)}</p>` : ''}
            ${allLinks.length ? `
              <div class="mt-3">
                <span class="text-muted small text-uppercase d-block mb-1">${t('gifts.productLinks')}</span>
                ${allLinks.map(l => `
                  <a href="${esc(l.url)}" target="_blank" rel="noopener" class="product-detail-link">
                    <i class="bi bi-shop me-1"></i>${esc(l.store_name || getDomain(l.url))}
                    ${l.price ? `<span class="text-muted ms-1">${formatPrice(l.price)}</span>` : ''}
                    <i class="bi bi-box-arrow-up-right ms-auto small"></i>
                  </a>
                `).join('')}
              </div>
            ` : ''}
            ${!product.default_price && !product.description && !allLinks.length ? `<p class="text-muted small mt-2">${t('gifts.noProductInfo')}</p>` : ''}
          </div>
        </div>

        ${orders.length || wishlist_items.length ? '<hr>' : ''}

        ${orders.length ? `
          <h6 class="text-muted small text-uppercase mb-2">${t('gifts.history')}</h6>
          ${orders.map(o => `
            <div class="product-history-card">
              <div class="product-history-card-header">
                <span class="badge bg-${statusColor(o.status)}">${t('gifts.statuses.' + o.status)}</span>
                <span class="text-muted small">${o.event_name ? `${esc(o.event_name)} · ` : ''}${formatDate(o.created_at)}${o.price ? ` · ${formatPrice(o.price)}` : ''}</span>
              </div>
              ${o.givers?.length ? `<div class="product-history-card-row"><span class="product-history-label">${t('gifts.from')}</span>${chipNames(o.givers)}</div>` : ''}
              ${o.recipients?.length ? `<div class="product-history-card-row"><span class="product-history-label">${t('gifts.to')}</span>${chipNames(o.recipients)}</div>` : ''}
            </div>
          `).join('')}
        ` : ''}

        ${wishlist_items.length ? `
          <h6 class="text-muted small text-uppercase mb-2 ${orders.length ? 'mt-3' : ''}">${t('gifts.wishlists')}</h6>
          ${wishlist_items.map(w => `
            <div class="product-history-card">
              <span>${w.is_fulfilled ? '<i class="bi bi-check-circle text-success me-1"></i>' : '<i class="bi bi-heart me-1 text-muted"></i>'}</span>
              <div>
                <span class="small">${t('gifts.wishlistFor', { name: `${esc(w.first_name)} ${esc(w.last_name || '')}` })}</span>
                ${w.notes ? `<div class="text-muted small">${esc(w.notes)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        ` : ''}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-danger btn-sm" id="${mid}-delete"><i class="bi bi-trash me-1"></i>${t('common.delete')}</button>
        <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" id="${mid}-edit"><i class="bi bi-pencil me-1"></i>${t('common.edit')}</button>
      </div>
    `;

    document.getElementById(`${mid}-edit`)?.addEventListener('click', async () => {
      modal.hide();
      const { showProductEditModal } = await import('../pages/gift-products.js');
      if (showProductEditModal) showProductEditModal(productUuid);
    });

    document.getElementById(`${mid}-delete`)?.addEventListener('click', async () => {
      const { confirmDialog } = await import('./dialogs.js');
      if (await confirmDialog(t('gifts.deleteProductConfirm'), { title: t('gifts.deleteProduct'), confirmText: t('common.delete') })) {
        await api.delete(`/gifts/products/${productUuid}`);
        modal.hide();
      }
    });

    // Image upload — click or drag-and-drop directly on image area
    const dropzone = document.getElementById(`${mid}-dropzone`);
    const fileInput = document.getElementById(`${mid}-file`);

    dropzone.addEventListener('click', (e) => { if (!e.target.closest('input')) fileInput.click(); });
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        await uploadImage(file);
      } else {
        // Try URL from browser drag
        let imgUrl = e.dataTransfer.getData('text/uri-list') || '';
        if (!imgUrl) { const html = e.dataTransfer.getData('text/html') || ''; const m = html.match(/src=["']([^"']+)["']/i); if (m) imgUrl = m[1]; }
        if (!imgUrl) imgUrl = e.dataTransfer.getData('text/plain') || '';
        if (imgUrl && /^https?:\/\/.+/i.test(imgUrl)) {
          try {
            const resp = await fetch(imgUrl); const blob = await resp.blob();
            const ext = blob.type.split('/')[1] || 'jpg';
            await uploadImage(new File([blob], `drop.${ext}`, { type: blob.type }));
          } catch {
            await api.put(`/gifts/products/${productUuid}`, { image_url: imgUrl });
            updatePreview(imgUrl);
          }
        }
      }
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) uploadImage(fileInput.files[0]); });

    async function uploadImage(file) {
      const formData = new FormData();
      formData.append('image', file);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/gifts/products/${productUuid}/image`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        updatePreview(authUrl(data.image_url));
      } catch { /* silent */ }
    }

    function updatePreview(src) {
      const el = document.getElementById(`${mid}-img`);
      if (el) el.outerHTML = `<img src="${src}" alt="" id="${mid}-img">`;
    }
  } catch (err) {
    modalEl.querySelector('.modal-content').innerHTML = `
      <div class="modal-body"><div class="alert alert-danger">${err.message}</div></div>
    `;
  }
}

function chipNames(contacts) {
  return contacts.map(c => {
    const initials = (c.first_name?.[0] || '') + (c.last_name?.[0] || '');
    return `<a href="#" class="contact-chip" ${giftContactLinkAttrs(c)}>` +
      `<span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${initials}</span>`}</span>` +
      `${esc(c.first_name)}</a>`;
  }).join(' ');
}

const STATUS_COLORS = { idea: 'secondary', reserved: 'info', purchased: 'warning', wrapped: 'purple', given: 'success', cancelled: 'danger' };
function statusColor(s) { return STATUS_COLORS[s] || 'secondary'; }
function getDomain(url) { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } }
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
