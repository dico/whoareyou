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
 * Format a number with locale-aware thousands separator.
 * @param {number|string} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const localeMap = { nb: 'nb-NO', en: 'en-GB' };
  const intlLocale = localeMap[currentLocale] || currentLocale;
  return n.toLocaleString(intlLocale);
}

/**
 * Format a price with thousands separator and currency suffix.
 * @param {number|string} value
 * @param {string} [currency='kr']
 * @returns {string}
 */
export function formatPrice(value, currency = 'kr') {
  const formatted = formatNumber(Math.round(Number(value)));
  return formatted ? `${formatted} ${currency}` : '';
}

/**
 * Format a date with full month name.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateLong(dateStr) {
  return formatDate(dateStr, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Format a date with time — "29. mars 2026 kl. 14:32"
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const localeMap = { nb: 'nb-NO', en: 'en-GB' };
  const intlLocale = localeMap[currentLocale] || currentLocale;
  return new Date(dateStr).toLocaleString(intlLocale, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Relative time string — "3 minutter siden", "om 5 dager", etc.
 * Works both directions (past and future).
 * Falls back to formatted date for anything > 30 days.
 *
 * @param {string|Date} dateInput - ISO date string or Date object
 * @returns {string}
 */
export function timeAgo(dateInput) {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const now = new Date();
  const diffMs = now - date;
  const absDiff = Math.abs(diffMs);
  const isPast = diffMs > 0;

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const u = (key, n) => t(`time.${key}`, { n });

  let text;
  if (seconds < 60) text = t('time.justNow');
  else if (minutes < 60) text = u(minutes === 1 ? 'oneMinute' : 'minutes', minutes);
  else if (hours < 24) text = u(hours === 1 ? 'oneHour' : 'hours', hours);
  else if (days < 30) text = u(days === 1 ? 'oneDay' : 'days', days);
  else return formatDate(dateInput);

  return isPast ? t('time.ago', { time: text }) : t('time.in', { time: text });
}

function resolve(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
