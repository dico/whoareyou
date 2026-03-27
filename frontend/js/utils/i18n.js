/**
 * Lightweight i18n — loads JSON locale files, provides t() for translation.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from '../utils/i18n.js';
 *   await setLocale('nb');
 *   t('contacts.title')           → "Kontakter"
 *   t('greeting', { name: 'Ola' }) → "Hei, Ola!"
 */

let currentLocale = 'en';
let strings = {};
let fallbackStrings = {};
const loadedLocales = {};

/**
 * Load and activate a locale.
 * @param {string} locale - e.g. 'en', 'nb'
 */
export async function setLocale(locale) {
  if (!loadedLocales[locale]) {
    try {
      const res = await fetch(`/locales/${locale}.json`);
      if (!res.ok) throw new Error(`Locale ${locale} not found`);
      loadedLocales[locale] = await res.json();
    } catch {
      console.warn(`Failed to load locale: ${locale}, falling back to en`);
      locale = 'en';
      if (!loadedLocales.en) {
        const res = await fetch('/locales/en.json');
        loadedLocales.en = await res.json();
      }
    }
  }

  // Always keep English as fallback
  if (locale !== 'en' && !loadedLocales.en) {
    try {
      const res = await fetch('/locales/en.json');
      loadedLocales.en = await res.json();
    } catch {}
  }

  currentLocale = locale;
  strings = loadedLocales[locale] || {};
  fallbackStrings = locale !== 'en' ? (loadedLocales.en || {}) : {};
}

/**
 * Get current locale.
 * @returns {string}
 */
export function getLocale() {
  return currentLocale;
}

/**
 * Translate a key. Supports {placeholder} interpolation.
 * Falls back to English, then to the key itself.
 *
 * @param {string} key - dot-separated key, e.g. 'contacts.title'
 * @param {object} params - interpolation values, e.g. { name: 'Ola' }
 * @returns {string}
 */
export function t(key, params) {
  let str = resolve(strings, key) ?? resolve(fallbackStrings, key) ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }

  return str;
}

/**
 * Format a date string according to current locale.
 * @param {string} dateStr - ISO date string
 * @param {object} options - Intl.DateTimeFormat options (default: day + month short + year)
 * @returns {string}
 */
export function formatDate(dateStr, options) {
  if (!dateStr) return '';
  const localeMap = { nb: 'nb-NO', en: 'en-GB' };
  const intlLocale = localeMap[currentLocale] || currentLocale;
  const defaults = { day: 'numeric', month: 'short', year: 'numeric' };
  return new Date(dateStr).toLocaleDateString(intlLocale, options || defaults);
}

/**
 * Format a date with full month name.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateLong(dateStr) {
  return formatDate(dateStr, { day: 'numeric', month: 'long', year: 'numeric' });
}

function resolve(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
