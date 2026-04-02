import { api } from '../api/client.js';
import { contactRowHtml } from './contact-row.js';
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

    dropdown.innerHTML = contacts.map((c, i) =>
      contactRowHtml(c, { tag: 'div', meta: c.meta || '', extraClass: `contact-search-item${i === activeIndex ? ' active' : ''}` })
    ).join('');
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
        const data = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=${limit}`);
        showResults(data.contacts);
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
