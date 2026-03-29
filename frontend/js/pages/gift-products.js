import { api } from '../api/client.js';
import { confirmDialog } from '../components/dialogs.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { giftSubNav } from './gifts.js';
import { showProductDetailModal } from '../components/product-detail-modal.js';

export async function renderGiftProducts() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      ${giftSubNav('products')}
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3>${t('gifts.productLibrary')}</h3>
      </div>
      <div class="mb-3">
        <input type="text" class="form-control form-control-sm" id="product-search" placeholder="${t('gifts.productSearch')}">
      </div>
      <div id="products-list"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;

  let debounce = null;
  document.getElementById('product-search').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => loadProducts(e.target.value.trim()), 200);
  });

  // Reload when product is updated from detail/edit modal
  const onUpdate = () => {
    if (document.getElementById('products-list')) {
      loadProducts(document.getElementById('product-search')?.value?.trim() || '');
    }
  };
  document.addEventListener('product-updated', onUpdate);
  const obs = new MutationObserver(() => {
    if (!document.getElementById('products-list')) { document.removeEventListener('product-updated', onUpdate); obs.disconnect(); }
  });
  obs.observe(content, { childList: true });

  await loadProducts('');
}

async function loadProducts(search) {
  const el = document.getElementById('products-list');
  if (!el) return;

  try {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const { products } = await api.get(`/gifts/products${params}`);

    if (!products.length) {
      el.innerHTML = `<div class="empty-state"><i class="bi bi-box-seam"></i><p>${t('gifts.noProducts')}</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="gift-products-grid">
        ${products.map(p => `
          <div class="gift-product-card glass-card" data-uuid="${p.uuid}" ${p.url ? `data-url="${escapeHtml(p.url)}"` : ''}>
            <div class="gift-product-avatar">
              ${p.image_url
                ? `<img src="${p.image_url.startsWith('/uploads/') ? authUrl(p.image_url) : escapeHtml(p.image_url)}" alt="">`
                : `<span><i class="bi bi-gift"></i></span>`
              }
            </div>
            <div class="gift-product-body gift-product-clickable">
              <strong class="gift-product-name">${escapeHtml(p.name)}</strong>
              <span class="gift-product-meta text-muted small">
                ${p.default_price ? `${Math.round(p.default_price)} kr` : ''}
                ${p.default_price && p.url ? ' · ' : ''}
                ${p.url ? getDomain(p.url) : ''}
              </span>
            </div>
            <div class="dropdown">
              <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
              <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                ${p.url ? `<li><a class="dropdown-item" href="${escapeHtml(p.url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-2"></i>${t('common.open')}</a></li>` : ''}
                <li><a class="dropdown-item btn-edit-product" href="#" data-uuid="${p.uuid}"><i class="bi bi-pencil me-2"></i>${t('gifts.editProduct')}</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger btn-delete-product" href="#" data-uuid="${p.uuid}"><i class="bi bi-trash me-2"></i>${t('gifts.deleteProduct')}</a></li>
              </ul>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Click on product body opens detail modal
    el.querySelectorAll('.gift-product-clickable').forEach(body => {
      body.style.cursor = 'pointer';
      body.addEventListener('click', () => {
        const uuid = body.closest('.gift-product-card').dataset.uuid;
        showProductDetailModal(uuid);
      });
    });

    // Delete handlers
    el.querySelectorAll('.btn-delete-product').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await confirmDialog(t('gifts.deleteProductConfirm'), { title: t('gifts.deleteProduct'), confirmText: t('common.delete') })) {
          await api.delete(`/gifts/products/${btn.dataset.uuid}`);
          btn.closest('.gift-product-card').remove();
        }
      });
    });

    // Edit handlers
    el.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await showProductEditModal(btn.dataset.uuid);
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

export async function showProductEditModal(productUuid) {
  const mid = 'edit-product-' + Date.now();

  // Load product + links
  let product, links;
  try {
    const data = await api.get(`/gifts/products/${productUuid}`);
    product = data.product;
    const linksData = await api.get(`/gifts/products/${productUuid}/links`);
    links = linksData.links || [];

    // If product has a URL but no matching link, auto-create it
    if (product.url && !links.some(l => l.url === product.url)) {
      try {
        const { id } = await api.post(`/gifts/products/${productUuid}/links`, {
          store_name: getDomain(product.url), url: product.url,
        });
        links.push({ id, store_name: getDomain(product.url), url: product.url, price: null });
      } catch { /* ignore */ }
    }
  } catch (err) {
    confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    return;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('gifts.editProduct')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="product-edit-image-area mb-3" id="${mid}-dropzone">
              ${product.image_url
                ? `<img src="${product.image_url.startsWith('/uploads/') ? authUrl(product.image_url) : escapeHtml(product.image_url)}" alt="" class="product-edit-preview" id="${mid}-preview">`
                : `<div class="product-edit-placeholder" id="${mid}-preview"><i class="bi bi-image"></i><span class="small">${t('gifts.dropImage')}</span></div>`
              }
              <input type="file" accept="image/*" class="d-none" id="${mid}-file-input">
            </div>
            <div class="text-danger small d-none mb-2" id="${mid}-image-error"></div>

            <div class="mb-3">
              <label class="form-label">${t('gifts.gift')}</label>
              <input type="text" class="form-control form-control-sm" id="${mid}-name" value="${escapeHtml(product.name)}" required>
            </div>
            <div class="mb-3">
              <label class="form-label">${t('gifts.description')}</label>
              <textarea class="form-control form-control-sm" id="${mid}-desc" rows="2">${escapeHtml(product.description || '')}</textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">${t('gifts.price')}</label>
              <input type="number" class="form-control form-control-sm" id="${mid}-price" value="${product.default_price || ''}" step="1">
            </div>

            <label class="form-label">${t('gifts.storeLinks')}</label>
            <div id="${mid}-links" class="mb-2">
              ${links.map(l => renderLinkRow(l)).join('')}
            </div>
            <div class="product-add-link-row">
              <input type="url" class="form-control form-control-sm" id="${mid}-new-link-url" placeholder="${t('gifts.addLinkPlaceholder')}">
              <button type="button" class="btn btn-outline-secondary btn-sm" id="${mid}-add-link" title="${t('common.add')}"><i class="bi bi-plus"></i></button>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${mid}-save">${t('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  const dropzone = document.getElementById(`${mid}-dropzone`);
  const fileInput = document.getElementById(`${mid}-file-input`);

  // ── Image drag-and-drop + click ──
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');

    // 1. Try file drop (from desktop)
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await uploadProductImage(productUuid, file, mid);
      return;
    }

    // 2. Try image URL from browser drag (text/uri-list or text/html)
    let imgUrl = e.dataTransfer.getData('text/uri-list') || '';
    if (!imgUrl) {
      const html = e.dataTransfer.getData('text/html') || '';
      const match = html.match(/src=["']([^"']+)["']/i);
      if (match) imgUrl = match[1];
    }
    if (!imgUrl) imgUrl = e.dataTransfer.getData('text/plain') || '';

    if (imgUrl && /^https?:\/\/.+/i.test(imgUrl)) {
      // Fetch image and upload as file
      try {
        dropzone.style.opacity = '0.5';
        const resp = await fetch(imgUrl);
        const blob = await resp.blob();
        if (!blob.type.startsWith('image/')) {
          // Try saving URL as external image instead
          await api.put(`/gifts/products/${productUuid}`, { image_url: imgUrl });
          const preview = document.getElementById(`${mid}-preview`);
          if (preview) preview.outerHTML = `<img src="${escapeHtml(imgUrl)}" alt="" class="product-edit-preview" id="${mid}-preview">`;
          product.image_url = imgUrl;
          dropzone.style.opacity = '';
          return;
        }
        const ext = blob.type.split('/')[1] || 'jpg';
        const imageFile = new File([blob], `drop.${ext}`, { type: blob.type });
        await uploadProductImage(productUuid, imageFile, mid);
        dropzone.style.opacity = '';
      } catch {
        // Fetch failed (CORS) — save as external URL
        await api.put(`/gifts/products/${productUuid}`, { image_url: imgUrl });
        const preview = document.getElementById(`${mid}-preview`);
        if (preview) preview.outerHTML = `<img src="${escapeHtml(imgUrl)}" alt="" class="product-edit-preview" id="${mid}-preview">`;
        product.image_url = imgUrl;
        dropzone.style.opacity = '';
      }
    }
  });

  fileInput.addEventListener('change', async () => {
    if (fileInput.files[0]) await uploadProductImage(productUuid, fileInput.files[0], mid);
  });

  // ── Delete links ──
  document.getElementById(`${mid}-links`).addEventListener('click', async (e) => {
    const btn = e.target.closest('.product-link-delete');
    if (!btn) return;
    await api.delete(`/gifts/products/links/${btn.dataset.linkId}`);
    btn.closest('.product-link-row').remove();
  });

  // ── Add link (just save URL, no auto-scrape) ──
  document.getElementById(`${mid}-add-link`).addEventListener('click', async () => {
    const urlInput = document.getElementById(`${mid}-new-link-url`);
    const url = urlInput.value.trim();
    if (!url) return;

    try {
      const { id } = await api.post(`/gifts/products/${productUuid}/links`, {
        store_name: getDomain(url), url,
      });

      document.getElementById(`${mid}-links`).insertAdjacentHTML('beforeend', renderLinkRow({ id, store_name: getDomain(url), url, price: null }));
      urlInput.value = '';
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  // ── Scrape metadata from link (per-link button) ──
  document.getElementById(`${mid}-links`).addEventListener('click', async (e) => {
    const scrapeBtn = e.target.closest('.product-link-scrape');
    if (!scrapeBtn) return;
    const url = scrapeBtn.dataset.url;
    const origHtml = scrapeBtn.innerHTML;
    scrapeBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    scrapeBtn.disabled = true;

    try {
      const meta = await api.get(`/gifts/products/scrape?url=${encodeURIComponent(url)}`);
      scrapeBtn.innerHTML = origHtml;
      scrapeBtn.disabled = false;

      if (meta.blocked || (!meta.title && !meta.image_url && !meta.description && !meta.price)) {
        confirmDialog(meta.blocked ? t('gifts.scrapeBlocked') : t('gifts.scrapeNoData'), { title: t('gifts.fetchMetadata'), confirmText: 'OK', confirmClass: 'btn-primary' });
        return;
      }

      // Show preview modal for user to choose what to apply
      showScrapePreviewModal(meta, {
        onApply: (selected) => {
          if (selected.title) document.getElementById(`${mid}-name`).value = meta.title;
          if (selected.description) document.getElementById(`${mid}-desc`).value = meta.description;
          if (selected.price) document.getElementById(`${mid}-price`).value = meta.price;
          if (selected.image_url) {
            api.put(`/gifts/products/${productUuid}`, { image_url: meta.image_url });
            const preview = document.getElementById(`${mid}-preview`);
            if (preview) {
              preview.outerHTML = `<img src="${escapeHtml(meta.image_url)}" alt="" class="product-edit-preview" id="${mid}-preview">`;
            }
            product.image_url = meta.image_url;
          }
        }
      });
    } catch {
      scrapeBtn.innerHTML = origHtml;
      scrapeBtn.disabled = false;
    }
  });

  // ── Save ──
  document.getElementById(`${mid}-save`).addEventListener('click', async () => {
    try {
      // Use first link as product URL
      const firstLink = document.querySelector(`#${mid}-links .product-link-row a`);
      await api.put(`/gifts/products/${productUuid}`, {
        name: document.getElementById(`${mid}-name`).value.trim(),
        description: document.getElementById(`${mid}-desc`).value.trim() || null,
        default_price: parseFloat(document.getElementById(`${mid}-price`).value) || null,
        url: firstLink?.href || null,
      });
      modal.hide();
      // Refresh product list if on products page, otherwise update card in-place
      if (document.getElementById('products-list')) {
        loadProducts(document.getElementById('product-search')?.value?.trim() || '');
      } else {
        // Update any visible product card with this UUID
        const card = document.querySelector(`.gift-product-card[data-uuid="${productUuid}"]`);
        if (card) {
          const nameEl = card.querySelector('.gift-product-name');
          if (nameEl) nameEl.textContent = document.getElementById(`${mid}-name`).value.trim();
        }
      }
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    modalEl.remove();
    // Refresh product list when closing edit modal
    if (document.getElementById('products-list')) {
      loadProducts(document.getElementById('product-search')?.value?.trim() || '');
    }
  }, { once: true });
  modal.show();
}

async function uploadProductImage(productUuid, file, mid) {
  const formData = new FormData();
  formData.append('image', file);

  const errorEl = document.getElementById(`${mid}-image-error`);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/gifts/products/${productUuid}/image`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    if (errorEl) errorEl.classList.add('d-none');
    const preview = document.getElementById(`${mid}-preview`);
    if (preview) {
      const authSrc = authUrl(data.image_url);
      preview.outerHTML = `<img src="${authSrc}" alt="" class="product-edit-preview" id="${mid}-preview">`;
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
      setTimeout(() => errorEl.classList.add('d-none'), 4000);
    }
  }
}

function showScrapePreviewModal(meta, { onApply }) {
  const sid = 'scrape-preview-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${sid}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('gifts.scrapeResults')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-3">${t('gifts.scrapeSelectHint')}</p>
            ${meta.image_url ? `
              <div class="form-check mb-3">
                <input type="checkbox" class="form-check-input" id="${sid}-image" checked>
                <label class="form-check-label" for="${sid}-image">
                  <strong>${t('gifts.productImage')}</strong><br>
                  <img src="${escapeHtml(meta.image_url)}" alt="" style="max-width:100%;max-height:120px;border-radius:var(--radius-sm);margin-top:4px">
                </label>
              </div>
            ` : ''}
            ${meta.title ? `
              <div class="form-check mb-2">
                <input type="checkbox" class="form-check-input" id="${sid}-title">
                <label class="form-check-label" for="${sid}-title">
                  <strong>${t('gifts.productName')}</strong>: ${escapeHtml(meta.title)}
                </label>
              </div>
            ` : ''}
            ${meta.description ? `
              <div class="form-check mb-2">
                <input type="checkbox" class="form-check-input" id="${sid}-desc">
                <label class="form-check-label" for="${sid}-desc">
                  <strong>${t('gifts.description')}</strong>: <span class="text-muted small">${escapeHtml(meta.description).slice(0, 150)}${meta.description.length > 150 ? '...' : ''}</span>
                </label>
              </div>
            ` : ''}
            ${meta.price ? `
              <div class="form-check mb-2">
                <input type="checkbox" class="form-check-input" id="${sid}-price">
                <label class="form-check-label" for="${sid}-price">
                  <strong>${t('gifts.price')}</strong>: ${Math.round(meta.price)} kr
                </label>
              </div>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${sid}-apply">${t('gifts.applySelected')}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(sid);
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById(`${sid}-apply`).addEventListener('click', () => {
    onApply({
      title: document.getElementById(`${sid}-title`)?.checked || false,
      description: document.getElementById(`${sid}-desc`)?.checked || false,
      price: document.getElementById(`${sid}-price`)?.checked || false,
      image_url: document.getElementById(`${sid}-image`)?.checked || false,
    });
    modal.hide();
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function renderLinkRow(l) {
  return `
    <div class="product-link-row" data-link-id="${l.id}">
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="subtle-link small flex-grow-1">${escapeHtml(l.store_name || getDomain(l.url))} <i class="bi bi-box-arrow-up-right"></i></a>
      ${l.price ? `<span class="text-muted small">${Math.round(l.price)} kr</span>` : ''}
      <button class="btn btn-outline-secondary btn-sm product-link-scrape" data-url="${escapeHtml(l.url)}" title="${t('gifts.fetchMetadata')}"><i class="bi bi-cloud-download"></i></button>
      <button class="btn btn-outline-danger btn-sm product-link-delete" data-link-id="${l.id}"><i class="bi bi-x-lg"></i></button>
    </div>
  `;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
