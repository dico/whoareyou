import { authUrl } from '../utils/auth-url.js';

/**
 * Product chip — visual mirror of `contact-chip`: round 24px thumbnail + title.
 *
 * Used anywhere we need to reference a product inline (gift lists, add
 * forms, etc.). Self-wires click handling via a global delegate on
 * `[data-product-chip-uuid]` that opens the product detail modal.
 *
 * @param {object} opts
 * @param {string} opts.title - Visible chip label
 * @param {string} [opts.image_url] - Full or /uploads/-relative URL
 * @param {string} [opts.product_uuid] - When set, clicking opens product detail
 * @param {boolean} [opts.removable=false] - Show an X button; caller wires the listener
 * @param {string} [opts.dataAttrs=''] - Extra raw data-attributes to add on the element
 * @returns {string} HTML string
 */
export function productChipHtml({ title, image_url, product_uuid, removable = false, dataAttrs = '' }) {
  const imgSrc = image_url
    ? (/^https?:\/\//i.test(image_url) ? image_url : authUrl(image_url))
    : null;
  const thumb = imgSrc
    ? `<img src="${esc(imgSrc)}" alt="">`
    : `<i class="bi bi-gift"></i>`;
  const clickAttr = product_uuid ? ` data-product-chip-uuid="${esc(product_uuid)}"` : '';
  const tag = product_uuid ? 'a' : 'span';
  const href = product_uuid ? ' href="#"' : '';
  const removeBtn = removable
    ? `<button type="button" class="product-chip-remove"><i class="bi bi-x"></i></button>`
    : '';
  return `<${tag}${href} class="product-chip"${clickAttr}${dataAttrs ? ` ${dataAttrs}` : ''}>` +
    `<span class="product-chip-avatar">${thumb}</span>` +
    `${esc(title || '')}` +
    `${removeBtn}` +
    `</${tag}>`;
}

function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// Global click delegate — opens product detail modal when a chip with
// product_uuid is clicked. Bound once per document.
if (typeof document !== 'undefined' && !document.__productChipBound) {
  document.__productChipBound = true;
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-product-chip-uuid]');
    if (!el) return;
    // Ignore clicks on the remove button (caller handles those)
    if (e.target.closest('.product-chip-remove')) return;
    e.preventDefault();
    e.stopPropagation();
    const { showProductDetailModal } = await import('./product-detail-modal.js');
    showProductDetailModal(el.dataset.productChipUuid);
  });
}
