import { api } from '../api/client.js';
import { confirmDialog } from '../components/dialogs.js';
import { t } from '../utils/i18n.js';
import { giftSubNav } from './gifts.js';

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
                ? `<img src="${escapeHtml(p.image_url)}" alt="">`
                : `<span><i class="bi bi-gift"></i></span>`
              }
            </div>
            <div class="gift-product-body gift-product-clickable">
              <strong class="gift-product-name">${escapeHtml(p.name)}</strong>
              <span class="gift-product-meta text-muted small">
                ${p.default_price ? `${p.default_price} kr` : ''}
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

    // Click on product body opens URL
    el.querySelectorAll('.gift-product-clickable').forEach(body => {
      const card = body.closest('.gift-product-card');
      const url = card.dataset.url;
      if (url) {
        body.style.cursor = 'pointer';
        body.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      }
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
        const card = btn.closest('.gift-product-card');
        const name = card.querySelector('strong').textContent;
        const newName = prompt(t('gifts.editProduct'), name);
        if (newName && newName !== name) {
          await api.put(`/gifts/products/${btn.dataset.uuid}`, { name: newName });
          card.querySelector('strong').textContent = newName;
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
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
