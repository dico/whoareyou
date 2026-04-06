// Reusable media picker. Opens a modal with a grid of image thumbnails and
// returns a Promise that resolves to the selected items (or an empty array
// if cancelled).
//
// Currently supports picking media from a single contact — profile photos
// and post media where the contact is the subject or tagged. More sources
// (groups, books, multi-contact) can be added by extending `loadFromSource`
// below; the picker UI is source-agnostic and only needs a list of items
// with `{ file_path, thumbnail_path?, post_date?, post_body? }` shape.
//
// Future reuse ideas:
//  - Set a contact's profile photo by picking from their existing gallery
//  - Pick a hero image for a gift product from already-uploaded media
//  - Multi-contact family book covers (pass a list of contact UUIDs)

import { api } from '../api/client.js';
import { authUrl } from '../utils/auth-url.js';
import { t, formatDate } from '../utils/i18n.js';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Normalize the raw data from different endpoints into a common item shape.
function normalizeItem(raw, kind) {
  return {
    file_path: raw.file_path,
    thumbnail_path: raw.thumbnail_path || raw.file_path,
    post_date: raw.post_date || raw.taken_at || null,
    post_body: raw.post_body || raw.caption || '',
    kind,
  };
}

// Load items from a source description. Extended easily for new sources.
async function loadFromSource(source) {
  if (!source) return [];

  // Pre-loaded items passed directly by the caller.
  if (Array.isArray(source.items)) {
    return source.items.map(m => normalizeItem(m, m.kind || 'preloaded'));
  }

  // Normalize a single contact uuid to the array form below.
  const uuids = source.contactUuids
    ? source.contactUuids
    : (source.contactUuid ? [source.contactUuid] : null);

  // One or more contacts: profile photos + post gallery (subject + tagged
  // posts) for each, deduplicated by file_path so a photo that appears
  // for several contacts only shows once.
  if (uuids && uuids.length) {
    const seen = new Set();
    const out = [];
    await Promise.all(uuids.map(async (uuid) => {
      const [contactRes, galleryRes] = await Promise.all([
        api.get(`/contacts/${uuid}`),
        api.get(`/posts/gallery?contact=${encodeURIComponent(uuid)}`),
      ]);
      const items = [
        ...(contactRes.contact?.photos || []).map(p => normalizeItem(p, 'profile')),
        ...(galleryRes.images || []).map(m => normalizeItem(m, 'post')),
      ];
      for (const it of items) {
        if (it.file_path && !seen.has(it.file_path)) {
          seen.add(it.file_path);
          out.push(it);
        }
      }
    }));
    return out;
  }

  // TODO: source.groupUuid — group/company media
  // TODO: source.bookUuid — media from posts already included in a book

  return [];
}

/**
 * Show a media picker modal.
 *
 * @param {object} opts
 * @param {string} [opts.title] - Modal title
 * @param {object} opts.source - Source descriptor. Use one of:
 *   - { items: [...] } preloaded items
 *   - { contactUuid: 'uuid' } load a contact's media
 *   (more source types can be added to loadFromSource)
 * @param {boolean} [opts.multi=false] - Allow multi-select
 * @param {string} [opts.confirmText] - Custom confirm button label
 * @returns {Promise<Array>} Selected items (empty array if cancelled)
 */
export function showMediaPicker(opts = {}) {
  const {
    title = t('mediaPicker.title'),
    source,
    multi = false,
    confirmText = t('common.select'),
  } = opts;

  return new Promise(async (resolve) => {
    const id = 'media-picker-' + Date.now();
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'modal fade';
    wrap.tabIndex = -1;
    wrap.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${escapeHtml(title)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="media-picker-toolbar mb-2">
              <input type="text" class="form-control form-control-sm media-picker-search"
                     placeholder="${escapeHtml(t('mediaPicker.search'))}">
            </div>
            <div class="media-picker-status text-muted small mb-2" id="${id}-status">${escapeHtml(t('common.loading'))}</div>
            <div class="contact-gallery-grid media-picker-grid" id="${id}-grid"></div>
          </div>
          <div class="modal-footer">
            <span class="text-muted small me-auto" id="${id}-count"></span>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">
              ${escapeHtml(t('common.cancel'))}
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="${id}-confirm" disabled>
              ${escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const modal = new window.bootstrap.Modal(wrap);
    modal.show();

    const gridEl = wrap.querySelector(`#${id}-grid`);
    const statusEl = wrap.querySelector(`#${id}-status`);
    const countEl = wrap.querySelector(`#${id}-count`);
    const confirmBtn = wrap.querySelector(`#${id}-confirm`);
    const searchEl = wrap.querySelector('.media-picker-search');

    let items = [];
    let filtered = [];
    const selected = new Set(); // keys by file_path

    const renderGrid = () => {
      if (!filtered.length) {
        gridEl.innerHTML = `<p class="text-muted p-3 mb-0">${escapeHtml(t('common.noResults'))}</p>`;
        return;
      }
      gridEl.innerHTML = filtered.map(item => {
        const isSel = selected.has(item.file_path);
        return `
          <div class="contact-gallery-item media-picker-item ${isSel ? 'is-selected' : ''}"
               data-path="${escapeHtml(item.file_path)}">
            <img src="${authUrl(item.thumbnail_path)}" alt="" loading="lazy">
            ${item.post_date ? `<div class="contact-gallery-meta">${escapeHtml(formatDate(item.post_date))}</div>` : ''}
            ${isSel ? '<div class="media-picker-check"><i class="bi bi-check-lg"></i></div>' : ''}
          </div>
        `;
      }).join('');

      gridEl.querySelectorAll('.media-picker-item').forEach((el) => {
        el.onclick = () => {
          const path = el.dataset.path;
          if (selected.has(path)) {
            selected.delete(path);
          } else {
            if (!multi) selected.clear();
            selected.add(path);
          }
          renderGrid();
          updateFooter();
        };
      });
    };

    const updateFooter = () => {
      countEl.textContent = multi && selected.size > 0
        ? t('mediaPicker.nSelected', { n: selected.size })
        : '';
      confirmBtn.disabled = selected.size === 0;
    };

    const applyFilter = () => {
      const q = searchEl.value.trim().toLowerCase();
      filtered = q
        ? items.filter(i => (i.post_body || '').toLowerCase().includes(q))
        : items.slice();
      renderGrid();
    };

    searchEl.addEventListener('input', applyFilter);

    confirmBtn.onclick = () => {
      const picked = items.filter(i => selected.has(i.file_path));
      modal.hide();
      resolve(picked);
    };

    wrap.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      // If the user dismissed without confirming, resolve with empty array.
      // (Confirm handler resolves before hide, so this is a no-op then.)
      resolve([]);
    }, { once: true });

    // Load items
    try {
      items = await loadFromSource(source);
      filtered = items.slice();
      statusEl.textContent = items.length
        ? t('mediaPicker.countAvailable', { n: items.length })
        : t('mediaPicker.empty');
      renderGrid();
    } catch (err) {
      statusEl.textContent = err.message || 'Failed to load';
    }
  });
}
