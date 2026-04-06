import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

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
  let activeIndex = -1;

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
    dropdown.innerHTML = items.map((item, i) => {
      const imgSrc = item.image_url
        ? (/^https?:\/\//i.test(item.image_url) ? item.image_url : authUrl(item.image_url))
        : null;
      const img = imgSrc
        ? `<img src="${escapeHtml(imgSrc)}" alt="" class="product-picker-thumb" onerror="this.outerHTML='<span class=\\'product-picker-thumb product-picker-thumb-placeholder\\'><i class=\\'bi bi-box\\'></i></span>'">`
        : `<span class="product-picker-thumb product-picker-thumb-placeholder"><i class="bi bi-${item.isCreate ? 'plus' : 'box'}"></i></span>`;
      return `
      <div class="product-picker-item${item.isCreate ? ' product-picker-create' : ''}" data-index="${i}">
        ${img}
        <span class="product-picker-name">${escapeHtml(item.label)}</span>
        ${item.price ? `<span class="product-picker-price">${item.price} kr</span>` : ''}
      </div>
    `;}).join('');
    dropdown.classList.remove('d-none');
    activeIndex = -1;

    dropdown.querySelectorAll('.product-picker-item').forEach(el => {
      el.addEventListener('click', () => selectItem(items[parseInt(el.dataset.index)]));
      el.addEventListener('mouseenter', () => setActive(parseInt(el.dataset.index)));
    });
  }

  function setActive(i) {
    const els = dropdown.querySelectorAll('.product-picker-item');
    if (!els.length) return;
    activeIndex = (i + els.length) % els.length;
    els.forEach((el, idx) => el.classList.toggle('active', idx === activeIndex));
    els[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  async function selectItem(item) {
    dropdown.classList.add('d-none');

    if (item.isCreate) {
      // Create product then open edit modal for full details
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
        // Open edit modal for full product details (image, links, description)
        try {
          const { showProductEditModal } = await import('../pages/gift-products.js');
          if (showProductEditModal) showProductEditModal(result.product.uuid);
        } catch {}
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
    const open = !dropdown.classList.contains('d-none');
    if (e.key === 'Escape') { dropdown.classList.add('d-none'); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const els = dropdown.querySelectorAll('.product-picker-item');
      const target = activeIndex >= 0 ? els[activeIndex] : els[0];
      if (target) target.click();
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
