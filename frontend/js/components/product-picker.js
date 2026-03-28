import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';

/**
 * Product picker — search existing products or create new ones inline.
 * Supports URL paste to auto-fetch product metadata.
 *
 * @param {HTMLElement} container - Element to render into
 * @param {function} onSelect - Callback: ({ product_id, uuid, title, price, url, image_url }) => void
 * @returns {{ clear: () => void }}
 */
export function createProductPicker(container, onSelect) {
  let debounceTimer = null;
  let selectedProduct = null;

  container.innerHTML = `
    <div class="product-picker">
      <input type="text" class="form-control form-control-sm product-picker-input"
        placeholder="${t('gifts.giftPlaceholder')}" autocomplete="off">
      <div class="product-picker-dropdown d-none"></div>
    </div>
  `;

  const input = container.querySelector('.product-picker-input');
  const dropdown = container.querySelector('.product-picker-dropdown');

  function showDropdown(items) {
    if (!items.length) {
      dropdown.classList.add('d-none');
      return;
    }
    dropdown.innerHTML = items.map((item, i) => `
      <div class="product-picker-item${item.isCreate ? ' product-picker-create' : ''}" data-index="${i}">
        <span class="product-picker-name">${escapeHtml(item.label)}</span>
        ${item.price ? `<span class="product-picker-price">${item.price} kr</span>` : ''}
      </div>
    `).join('');
    dropdown.classList.remove('d-none');

    dropdown.querySelectorAll('.product-picker-item').forEach(el => {
      el.addEventListener('click', () => selectItem(items[parseInt(el.dataset.index)]));
    });
  }

  async function selectItem(item) {
    dropdown.classList.add('d-none');

    if (item.isCreate) {
      // Create product inline
      try {
        const result = await api.post('/gifts/products', {
          name: item.createName,
          url: item.url || null,
          image_url: item.image_url || null,
          default_price: item.price || null,
        });
        selectedProduct = {
          product_id: null,
          uuid: result.product.uuid,
          title: result.product.name,
          price: result.product.default_price,
          url: result.product.url,
          image_url: result.product.image_url,
        };
      } catch {
        selectedProduct = { product_id: null, uuid: null, title: item.createName, price: null, url: null, image_url: null };
      }
    } else {
      selectedProduct = {
        product_id: null,
        uuid: item.uuid,
        title: item.name,
        price: item.default_price,
        url: item.url,
        image_url: item.image_url,
      };
    }

    input.value = selectedProduct.title;
    onSelect(selectedProduct);
  }

  async function search(query) {
    const items = [];

    if (query.length >= 2) {
      try {
        const { products } = await api.get(`/gifts/products?search=${encodeURIComponent(query)}&limit=8`);
        products.forEach(p => items.push({
          uuid: p.uuid, name: p.name, label: p.name,
          default_price: p.default_price, price: p.default_price,
          url: p.url, image_url: p.image_url,
        }));
      } catch { /* ignore */ }
    }

    // Always offer to create if text doesn't exactly match
    const exactMatch = items.some(i => i.name.toLowerCase() === query.toLowerCase());
    if (query.trim() && !exactMatch) {
      items.push({
        isCreate: true,
        createName: query.trim(),
        label: t('gifts.createProduct', { name: query.trim() }),
      });
    }

    showDropdown(items);
  }

  // URL detection and scraping
  async function handleUrlPaste(text) {
    if (!/^https?:\/\/.+/i.test(text)) return;

    input.value = t('gifts.fetchingUrl');
    input.disabled = true;

    try {
      const meta = await api.get(`/gifts/products/scrape?url=${encodeURIComponent(text)}`);
      input.disabled = false;
      if (meta.title) {
        input.value = meta.title;
        // Show create option with scraped data
        showDropdown([{
          isCreate: true,
          createName: meta.title,
          label: t('gifts.createProduct', { name: meta.title }),
          url: meta.url || text,
          image_url: meta.image_url || null,
          price: meta.price || null,
        }]);
      } else {
        input.value = text;
        search(text);
      }
    } catch {
      input.disabled = false;
      input.value = text;
    }
  }

  input.addEventListener('input', () => {
    selectedProduct = null;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(input.value.trim()), 200);
  });

  input.addEventListener('paste', (e) => {
    setTimeout(() => handleUrlPaste(input.value.trim()), 50);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.add('d-none');
    if (e.key === 'Enter' && !dropdown.classList.contains('d-none')) {
      e.preventDefault();
      const first = dropdown.querySelector('.product-picker-item');
      if (first) first.click();
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.classList.add('d-none');
  });

  return {
    clear() {
      input.value = '';
      selectedProduct = null;
      dropdown.classList.add('d-none');
    },
    getSelected() {
      // If user typed something without selecting, treat as custom title
      if (!selectedProduct && input.value.trim()) {
        return { product_id: null, uuid: null, title: input.value.trim() };
      }
      return selectedProduct;
    },
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
