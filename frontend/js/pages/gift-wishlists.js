import { api } from '../api/client.js';
import { confirmDialog } from '../components/dialogs.js';
import { t, formatPrice } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { giftSubNav } from './gifts.js';
import { createProductPicker } from '../components/product-picker.js';
import { showProductDetailModal } from '../components/product-detail-modal.js';
import { giftContactLinkAttrs } from '../components/contact-gift-modal.js';

export async function renderGiftWishlists() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      ${giftSubNav('wishlists')}
      <h3 class="mb-3">${t('gifts.wishlists')}</h3>
      <div id="wishlists-content"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;

  // Reload when a product is edited from detail modal
  const handler = () => loadWishlists();
  document.addEventListener('product-updated', handler);
  // Clean up on navigation (page re-render)
  const observer = new MutationObserver(() => {
    if (!document.getElementById('wishlists-content')) {
      document.removeEventListener('product-updated', handler);
      observer.disconnect();
    }
  });
  observer.observe(content, { childList: true });

  await loadWishlists();
}

async function loadWishlists() {
  const el = document.getElementById('wishlists-content');
  if (!el) return;

  try {
    const [membersData, wishlistsData] = await Promise.all([
      api.get('/auth/members').catch(() => ({ members: [] })),
      api.get('/gifts/wishlists'),
    ]);

    const members = (membersData.members || []).filter(m => m.is_active !== false);
    const wishlists = wishlistsData.wishlists || [];

    // Map wishlists by contact uuid (for linked members) or by member uuid
    const wlByContact = new Map();
    for (const wl of wishlists) {
      if (!wlByContact.has(wl.contact_uuid)) wlByContact.set(wl.contact_uuid, []);
      wlByContact.get(wl.contact_uuid).push(wl);
    }

    // Show each family member with their wishlists
    el.innerHTML = members.map(m => {
      const contactUuid = m.linked_contact_uuid || m.uuid; // fall back to user uuid
      const memberWishlists = m.linked_contact_uuid ? (wlByContact.get(m.linked_contact_uuid) || []) : [];
      const defaultWl = memberWishlists.find(w => w.is_default) || memberWishlists[0];
      const contact = { uuid: contactUuid, first_name: m.first_name, last_name: m.last_name || '', avatar: m.avatar || null };
      const hasContact = !!m.linked_contact_uuid;

      const addBtnHtml = hasContact ? `
        <button class="btn btn-outline-secondary btn-sm wishlist-add-btn" data-contact-uuid="${contactUuid}" data-contact-name="${esc(m.first_name)} ${esc(m.last_name || '')}">
          <i class="bi bi-plus me-1"></i>${t('gifts.addWish')}
        </button>
      ` : '';

      return `
        <div class="gift-group" data-contact-uuid="${contactUuid}">
          ${groupHeader(contact, defaultWl?.item_count, addBtnHtml)}
          <div class="wishlist-items" data-contact-uuid="${contactUuid}" data-wishlist-uuid="${defaultWl?.uuid || ''}">
            ${defaultWl ? '' : `<p class="text-muted small">${hasContact ? t('gifts.noWishes') : t('gifts.linkContactFirst')}</p>`}
          </div>
          ${hasContact ? `<div class="wishlist-picker-wrap d-none mt-2" data-contact-uuid="${contactUuid}"></div>` : ''}
        </div>
      `;
    }).join('') || `<div class="empty-state"><i class="bi bi-gift"></i><p>${t('gifts.noWishes')}</p></div>`;

    // Load items for each member's default wishlist
    for (const m of members) {
      if (!m.linked_contact_uuid) continue;
      const memberWishlists = wlByContact.get(m.linked_contact_uuid) || [];
      const defaultWl = memberWishlists.find(w => w.is_default) || memberWishlists[0];
      if (defaultWl) {
        await loadWishlistItems(defaultWl.uuid, m.linked_contact_uuid);
      }
    }

    // Add-item buttons
    el.querySelectorAll('.wishlist-add-btn').forEach(btn => {
      let pickerCreated = false;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const contactUuid = btn.dataset.contactUuid;
        const pickerWrap = el.querySelector(`.wishlist-picker-wrap[data-contact-uuid="${contactUuid}"]`);
        if (!pickerWrap) return;

        if (pickerCreated) {
          pickerWrap.classList.toggle('d-none');
          if (!pickerWrap.classList.contains('d-none')) pickerWrap.querySelector('input')?.focus();
          return;
        }
        pickerCreated = true;
        pickerWrap.classList.remove('d-none');

        const itemsEl = el.querySelector(`.wishlist-items[data-contact-uuid="${contactUuid}"]`);
        let wishlistUuid = itemsEl?.dataset.wishlistUuid;

        const picker = createProductPicker(pickerWrap, async (product) => {
          if (!product) return;
          try {
            if (!wishlistUuid) {
              const { uuid } = await api.post('/gifts/wishlists', {
                contact_uuid: contactUuid,
                name: t('gifts.wishlistDefault'),
              });
              wishlistUuid = uuid;
              if (itemsEl) itemsEl.dataset.wishlistUuid = uuid;
            }
            await api.post(`/gifts/wishlists/${wishlistUuid}/items`, {
              title: product.title,
              product_uuid: product.uuid || null,
            });
            await loadWishlistItems(wishlistUuid, contactUuid);
            picker.clear();
            pickerWrap.querySelector('input')?.focus();
          } catch (err) {
            confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
          }
        });
        pickerWrap.querySelector('input')?.focus();
      });
    });

  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function loadWishlistItems(wishlistUuid, contactUuid) {
  const container = document.querySelector(`.wishlist-items[data-contact-uuid="${contactUuid}"]`);
  if (!container) return;

  try {
    const { items } = await api.get(`/gifts/wishlists/${wishlistUuid}`);

    if (!items.length) {
      container.innerHTML = `<p class="text-muted small">${t('gifts.noWishes')}</p>`;
      return;
    }

    const activeItems = items.filter(i => !i.is_fulfilled);
    const fulfilledItems = items.filter(i => i.is_fulfilled);

    const renderItem = (item) => `
      <div class="gift-card ${item.is_fulfilled ? 'gift-card-fulfilled' : ''} ${item.product_uuid ? 'gift-card-clickable' : ''}" data-item-id="${item.id}" data-product-uuid="${item.product_uuid || ''}">
        <div class="gift-card-image">
          ${item.product_image_url
            ? `<img src="${item.product_image_url.startsWith('/uploads/') ? authUrl(item.product_image_url) : esc(item.product_image_url)}" alt="">`
            : `<div class="gift-card-placeholder"><i class="bi bi-gift"></i></div>`
          }
        </div>
        <div class="gift-card-body">
          <div class="gift-card-title">${esc(item.title)}</div>
          ${(() => {
            const desc = item.notes || item.product_description;
            return desc ? `<div class="gift-card-desc text-muted" title="${esc(desc)}">${esc(desc)}</div>` : '';
          })()}
        </div>
        <div class="gift-card-end">
          ${item.default_price ? `<span class="gift-card-price">${formatPrice(item.default_price)}</span>` : ''}
        </div>
        <div class="dropdown">
          <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
            <li><a class="dropdown-item wishlist-toggle-fulfilled" href="#" data-wl="${wishlistUuid}" data-id="${item.id}" data-fulfilled="${item.is_fulfilled ? '1' : '0'}">
              <i class="bi bi-${item.is_fulfilled ? 'arrow-counterclockwise' : 'check-lg'} me-2"></i>${item.is_fulfilled ? t('gifts.markUnfulfilled') : t('gifts.markFulfilled')}
            </a></li>
            <li><a class="dropdown-item wishlist-edit-item" href="#" data-wl="${wishlistUuid}" data-id="${item.id}" data-notes="${esc(item.notes || '')}" data-title="${esc(item.title)}">
              <i class="bi bi-pencil me-2"></i>${t('gifts.editWish')}
            </a></li>
            ${item.product_uuid ? `<li><a class="dropdown-item wishlist-edit-product" href="#" data-product-uuid="${item.product_uuid}">
              <i class="bi bi-box me-2"></i>${t('gifts.editProduct')}
            </a></li>` : ''}
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger wishlist-delete-item" href="#" data-wl="${wishlistUuid}" data-id="${item.id}">
              <i class="bi bi-trash me-2"></i>${t('common.delete')}
            </a></li>
          </ul>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${activeItems.length
        ? activeItems.map(renderItem).join('')
        : `<p class="text-muted small">${t('gifts.noWishes')}</p>`}
      ${fulfilledItems.length ? `
        <button type="button" class="btn btn-link btn-sm wishlist-fulfilled-toggle mt-1" data-expanded="0">
          <i class="bi bi-chevron-right me-1"></i>${t('gifts.showFulfilled', { count: fulfilledItems.length })}
        </button>
        <div class="wishlist-fulfilled-list d-none">
          ${fulfilledItems.map(renderItem).join('')}
        </div>
      ` : ''}
    `;

    const toggleBtn = container.querySelector('.wishlist-fulfilled-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const expanded = toggleBtn.dataset.expanded === '1';
        toggleBtn.dataset.expanded = expanded ? '0' : '1';
        container.querySelector('.wishlist-fulfilled-list').classList.toggle('d-none', expanded);
        toggleBtn.innerHTML = `<i class="bi bi-chevron-${expanded ? 'right' : 'down'} me-1"></i>${
          expanded
            ? t('gifts.showFulfilled', { count: fulfilledItems.length })
            : t('gifts.hideFulfilled', { count: fulfilledItems.length })
        }`;
      });
    }

    // Handlers
    container.querySelectorAll('.wishlist-toggle-fulfilled').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await api.put(`/gifts/wishlists/${btn.dataset.wl}/items/${btn.dataset.id}`, {
          is_fulfilled: btn.dataset.fulfilled === '0',
        });
        await loadWishlistItems(wishlistUuid, contactUuid);
      });
    });

    container.querySelectorAll('.wishlist-edit-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openWishlistItemEditModal({
          wishlistUuid: btn.dataset.wl,
          itemId: btn.dataset.id,
          title: btn.dataset.title,
          notes: btn.dataset.notes,
          onSaved: () => loadWishlistItems(wishlistUuid, contactUuid),
        });
      });
    });

    container.querySelectorAll('.wishlist-edit-product').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const { showProductEditModal } = await import('./gift-products.js');
        showProductEditModal(btn.dataset.productUuid);
      });
    });

    container.querySelectorAll('.wishlist-delete-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await api.delete(`/gifts/wishlists/${btn.dataset.wl}/items/${btn.dataset.id}`);
        await loadWishlistItems(wishlistUuid, contactUuid);
      });
    });

    // Click on card opens product detail
    container.querySelectorAll('.gift-card-clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.dropdown') || e.target.closest('a') || e.target.closest('.gift-card-desc')) return;
        const productUuid = card.dataset.productUuid;
        if (productUuid) showProductDetailModal(productUuid);
      });
    });

    // Click on description toggles expand/collapse in place
    container.querySelectorAll('.gift-card-desc').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        el.classList.toggle('expanded');
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="text-danger small">${err.message}</div>`;
  }
}

function groupHeader(contact, count, actionsHtml = '') {
  return `
    <div class="gift-group-header">
      <a href="#" class="gift-group-header-link" ${giftContactLinkAttrs(contact)}>
        <span class="gift-group-avatar">
          ${contact.avatar
            ? `<img src="${authUrl(contact.avatar)}" alt="">`
            : `<span>${(contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')}</span>`
          }
        </span>
        <span>${esc(contact.first_name)} ${esc(contact.last_name || '')}</span>
      </a>
      ${count ? `<span class="text-muted small ms-1">(${count})</span>` : ''}
      <span class="gift-group-header-actions">${actionsHtml}</span>
    </div>
  `;
}

function openWishlistItemEditModal({ wishlistUuid, itemId, title, notes, onSaved }) {
  const mid = 'wl-item-edit-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${esc(title)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${mid}-form">
            <div class="modal-body">
              <div class="mb-2">
                <label class="form-label small">${t('gifts.wishNotes')}</label>
                <textarea class="form-control form-control-sm" id="${mid}-notes" rows="4"
                  placeholder="${t('gifts.wishNotesPlaceholder')}">${esc(notes || '')}</textarea>
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
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
  document.getElementById(`${mid}-notes`).focus();

  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put(`/gifts/wishlists/${wishlistUuid}/items/${itemId}`, {
        notes: document.getElementById(`${mid}-notes`).value.trim() || null,
      });
      modal.hide();
      onSaved?.();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
