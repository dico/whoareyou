import { formatNumber } from './i18n.js';

/**
 * Attach thousands-separator formatting to a price input.
 *
 * Call this on a text input (inputmode="numeric"). The displayed value is
 * formatted with the locale's thousands separator on blur, and stripped
 * back to raw digits on focus so the user can edit. Use `readPriceInput()`
 * to get the numeric value at submit time.
 *
 * @param {HTMLInputElement} input
 */
export function attachPriceInput(input) {
  if (!input || input.dataset.priceInputBound) return;
  input.dataset.priceInputBound = '1';
  input.type = 'text';
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');

  // Format initial value if present.
  if (input.value) input.value = formatNumber(stripDigits(input.value));

  input.addEventListener('focus', () => {
    input.value = stripDigits(input.value);
  });
  input.addEventListener('blur', () => {
    const raw = stripDigits(input.value);
    input.value = raw === '' ? '' : formatNumber(raw);
  });
  input.addEventListener('input', () => {
    // Allow only digits while editing (no separators, no decimals).
    const cleaned = input.value.replace(/[^\d]/g, '');
    if (cleaned !== input.value) input.value = cleaned;
  });
}

/**
 * Read the numeric value from a price input (ignores formatting).
 * @param {HTMLInputElement} input
 * @returns {number|null}
 */
export function readPriceInput(input) {
  if (!input) return null;
  const raw = stripDigits(input.value);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function stripDigits(value) {
  return String(value ?? '').replace(/[^\d]/g, '');
}
