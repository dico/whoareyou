import { api } from '../api/client.js';
import { contactRowHtml } from './contact-row.js';
import { authUrl } from '../utils/auth-url.js';
import { t } from '../utils/i18n.js';

/**
 * Attach a reusable contact search dropdown to an input element.
 *
 * @param {HTMLInputElement} input - The text input to attach to
 * @param {object} options
 * @param {number} options.limit - Max results (default 8)
 * @param {boolean} options.floating - Use absolute positioned dropdown (default true)
 * @param {boolean} options.keyboard - Enable arrow key navigation (default true)
 * @param {function} options.onSelect - Callback when contact is selected: (contact) => void
 * @param {function} options.onClear - Optional callback when input is cleared
 * @param {string} options.placeholder - Input placeholder override
 * @returns {{ destroy: function, hide: function, clear: function }}
 */
export function attachContactSearch(input, options = {}) {
  const {
    limit = 8,
    floating = true,
    keyboard = true,
    onSelect,
    onClear,
    includeCompanies = false,
  } = options;

  if (options.placeholder) input.placeholder = options.placeholder;

  // Create dropdown container
  const dropdown = document.createElement('div');
  dropdown.className = 'contact-search-dropdown';
  if (floating) {
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;z-index:1050';
  }
  dropdown.style.display = 'none';

  // Ensure parent is positioned for floating dropdown
  if (floating && input.parentElement) {
    const pos = getComputedStyle(input.parentElement).position;
    if (pos === 'static') input.parentElement.style.position = 'relative';
  }

  // Detect if inside a modal (skip shadow, use simpler style)
  const inModal = !!input.closest('.modal');
  if (inModal) dropdown.classList.add('in-modal');

  input.parentElement.appendChild(dropdown);

  let searchTimeout;
  let activeIndex = -1;
  let lastResults = []; // cache for re-showing on focus

  function showResults(contacts) {
    lastResults = contacts;
    if (!contacts.length) {
      dropdown.innerHTML = `<div class="contact-search-empty">${t('common.noResults')}</div>`;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = contacts.map((c, i) => {
      const active = i === activeIndex ? ' active' : '';
      if (c.type === 'company') {
        // Inline company row — mirrors contactRowHtml structure so the
        // dropdown keyboard navigation selector (`.contact-search-item`)
        // still matches.
        const initials = (c.name?.[0] || '?');
        const logo = c.logo_path || c.avatar;
        const avatar = logo
          ? `<img src="${authUrl(logo)}" alt="">`
          : `<span>${escapeHtml(initials)}</span>`;
        return `<div class="contact-row contact-search-item${active}">
          <span class="contact-row-avatar contact-row-avatar-square">${avatar}</span>
          <span class="contact-row-info">
            <span class="contact-row-name">${escapeHtml(c.name || '')}</span>
            <span class="contact-row-meta text-muted small"><i class="bi bi-building me-1"></i>${escapeHtml(c.type_label || '')}</span>
          </span>
        </div>`;
      }
      return contactRowHtml(c, { tag: 'div', meta: c.meta || '', extraClass: `contact-search-item${active}` });
    }).join('');
    dropdown.style.display = 'block';

    // Click handlers
    dropdown.querySelectorAll('.contact-search-item').forEach((row, i) => {
      row.style.cursor = 'pointer';
      row.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur
        if (onSelect) onSelect(contacts[i]);
        hide();
      });
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  function hide() {
    dropdown.style.display = 'none';
    activeIndex = -1;
  }

  function handleInput() {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) {
      hide();
      lastResults = [];
      if (q.length === 0 && onClear) onClear();
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const contactsPromise = api.get(`/contacts?search=${encodeURIComponent(q)}&limit=${limit}`);
        const companiesPromise = includeCompanies
          ? api.get(`/companies?search=${encodeURIComponent(q)}&limit=${limit}`).catch(() => ({ companies: [] }))
          : Promise.resolve({ companies: [] });
        const [{ contacts }, { companies }] = await Promise.all([contactsPromise, companiesPromise]);
        const companyLabel = t('companies.title') || 'Groups';
        const companyResults = (companies || []).map(c => ({ ...c, type: 'company', type_label: companyLabel }));
        showResults([...contacts, ...companyResults].slice(0, limit));
      } catch {
        hide();
      }
    }, 200);
  }

  function handleFocus() {
    // Re-show cached results if input still has text
    if (input.value.trim().length >= 2 && lastResults.length && dropdown.style.display === 'none') {
      showResults(lastResults);
    }
  }

  function handleKeydown(e) {
    if (!keyboard) return;
    const items = dropdown.querySelectorAll('.contact-search-item');

    if (e.key === 'Escape') {
      hide();
      return;
    }

    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive(items);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      items[activeIndex]?.dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  function updateActive(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === activeIndex);
      if (i === activeIndex) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function handleBlur() {
    // Delay to allow click on dropdown items
    setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) hide();
    }, 200);
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('focus', handleFocus);
  input.addEventListener('keydown', handleKeydown);
  input.addEventListener('blur', handleBlur);

  return {
    destroy() {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('keydown', handleKeydown);
      input.removeEventListener('blur', handleBlur);
      clearTimeout(searchTimeout);
      dropdown.remove();
    },
    hide,
    clear() {
      input.value = '';
      lastResults = [];
      hide();
    },
  };
}
