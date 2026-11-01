/**
 * Public wishlist — standalone read-only page for share links.
 *
 * Entry point: /w/{token}
 * Fetches /api/public/wishlists/{token}. No login, no SPA router, no i18n
 * bundle: the few strings live here, picked from the browser language.
 */

const STRINGS = {
  nb: {
    title: (name) => `Ønskelisten til ${name}`,
    empty: 'Ingen ønsker på listen akkurat nå.',
    notFound: 'Denne ønskelisten finnes ikke, eller lenken er ikke lenger delt.',
    error: 'Kunne ikke laste ønskelisten.',
    view: 'Se produkt',
    footer: 'Delt fra WhoareYou',
  },
  en: {
    title: (name) => `${name}'s wishlist`,
    empty: 'No wishes on the list right now.',
    notFound: 'This wishlist does not exist, or the link is no longer shared.',
    error: 'Could not load the wishlist.',
    view: 'View product',
    footer: 'Shared from WhoareYou',
  },
};
const lang = /^(nb|no|nn)\b/i.test(navigator.language || '') ? 'nb' : 'en';
const s = STRINGS[lang];
document.documentElement.lang = lang;

const root = document.getElementById('wishlist-root');
const token = window.location.pathname.split('/').filter(Boolean)[1];

if (!token) {
  showMessage(s.notFound);
} else {
  load();
}

async function load() {
  try {
    const res = await fetch(`/api/public/wishlists/${encodeURIComponent(token)}`);
    if (res.status === 404) return showMessage(s.notFound);
    if (!res.ok) throw new Error();
    render(await res.json());
  } catch {
    showMessage(s.error);
  }
}

function render({ wishlist, items }) {
  const title = s.title(wishlist.first_name);
  document.title = title;
  const initials = (wishlist.first_name?.[0] || '') + (wishlist.last_name?.[0] || '');

  root.innerHTML = `
    <header class="wl-header">
      <div class="wl-avatar">
        ${wishlist.avatar ? `<img src="${esc(wishlist.avatar)}" alt="">` : `<span>${esc(initials)}</span>`}
      </div>
      <h1>${esc(title)}</h1>
    </header>
    ${items.length ? `<ul class="wl-items">${items.map(renderItem).join('')}</ul>` : `<p class="wl-center">${s.empty}</p>`}
    <footer class="wl-footer">${s.footer}</footer>
  `;
}

function renderItem(item) {
  return `
    <li class="wl-item">
      <div class="wl-item-image">
        ${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : '<i class="bi bi-gift"></i>'}
      </div>
      <div class="wl-item-body">
        <div class="wl-item-title">${esc(item.title)}</div>
        ${item.description ? `<div class="wl-item-desc">${esc(item.description)}</div>` : ''}
        <div class="wl-item-meta">
          ${item.price ? `<span class="wl-item-price">${formatPrice(item.price)}</span>` : ''}
          ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${s.view} <i class="bi bi-box-arrow-up-right"></i></a>` : ''}
        </div>
      </div>
    </li>
  `;
}

function showMessage(text) {
  root.innerHTML = `<p class="wl-center">${esc(text)}</p>`;
}

function formatPrice(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? `${n.toLocaleString('nb-NO')} kr` : '';
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML.replace(/"/g, '&quot;');
}
