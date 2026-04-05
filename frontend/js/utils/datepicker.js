/**
 * Locale-aware date picker using flatpickr.
 * Replaces native <input type="date"> with flatpickr for consistent
 * date format across browsers (dd.mm.yyyy for Norwegian, dd/mm/yyyy for English).
 *
 * Auto-initializes via MutationObserver — no manual calls needed.
 * Just use <input type="date"> and it will be picked up automatically.
 */

let flatpickrLoaded = false;
let flatpickrLoading = null;

async function loadFlatpickr() {
  if (flatpickrLoaded) return;
  if (flatpickrLoading) return flatpickrLoading;

  flatpickrLoading = (async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    document.head.appendChild(link);

    // Constrain width of flatpickr date inputs in edit bars (not in modals)
    const style = document.createElement('style');
    style.textContent = `.edit-actions input.fp-date { width: 120px !important; flex: 0 0 auto !important; }`;
    document.head.appendChild(style);

    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
      script.onload = resolve;
      document.head.appendChild(script);
    });

    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/no.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });

    flatpickrLoaded = true;
    flatpickrLoading = null;
  })();

  return flatpickrLoading;
}

async function initInput(input) {
  if (input.dataset.fpInit) return;
  input.dataset.fpInit = 'true';

  await loadFlatpickr();

  const locale = localStorage.getItem('locale') || 'en';
  const fpLocale = locale === 'nb' ? 'no' : 'default';
  const val = input.value;

  input.type = 'text';
  input.setAttribute('autocomplete', 'off');

  const fp = window.flatpickr(input, {
    locale: fpLocale,
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: locale === 'nb' ? 'd.m.Y' : 'd/m/Y',
    allowInput: true,
    defaultDate: val || null,
  });

  // Add sizing class to the visible altInput
  if (fp.altInput) fp.altInput.classList.add('fp-date');
}

// Auto-initialize on any date input that appears in the DOM
function scanAndInit(root) {
  const inputs = (root || document).querySelectorAll('input[type="date"]:not([data-fp-init])');
  inputs.forEach(input => initInput(input));
}

// Initial scan
document.addEventListener('DOMContentLoaded', () => scanAndInit());

// Watch for dynamically added date inputs (debounced to avoid performance issues)
let scanTimeout;
const observer = new MutationObserver(() => {
  clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => scanAndInit(), 200);
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
