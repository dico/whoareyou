/**
 * Public wishlist — standalone read-only page for share links.
 *
 * Entry point: /w/{token}
 * Fetches /api/public/wishlists/{token}. A link covers one person or several
 * (e.g. the whole family); several people get a name bar to jump between
 * sections. No login, no SPA router, no i18n bundle: the few strings live
 * here, picked from the browser language.
 */

const STRINGS = {
  nb: {
    title: (name) => `Ønskelisten til ${name}`,
    titleMany: 'Ønskelister',
    empty: 'Ingen ønsker på listen akkurat nå.',
    notFound: 'Denne ønskelisten finnes ikke, eller lenken er ikke lenger delt.',
    error: 'Kunne ikke laste ønskelisten.',
    view: 'Se produkt',
    footer: 'Delt fra WhoareYou',
  },
  en: {
    title: (name) => `${name}'s wishlist`,
    titleMany: 'Wishlists',
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

function render({ people }) {
  if (!people.length) return showMessage(s.notFound);

  if (people.length === 1) {
    const [person] = people;
    document.title = s.title(person.first_name);
    root.innerHTML = `
      <header class="wl-header">
        ${avatarHtml(person, 'wl-avatar')}
        <h1>${esc(s.title(person.first_name))}</h1>
      </header>
      ${itemsHtml(person.items)}
      <footer class="wl-footer">${s.footer}</footer>
    `;
    return;
  }

  document.title = s.titleMany;
  root.innerHTML = `
    <header class="wl-header">
      <h1>${s.titleMany}</h1>
    </header>
    <nav class="wl-people-nav">
      ${people.map((p, i) => `
        <a href="#person-${i}" class="wl-people-chip">
          ${avatarHtml(p, 'wl-chip-avatar')}
          <span>${esc(p.first_name)}</span>
        </a>
      `).join('')}
    </nav>
    ${people.map((p, i) => `
      <section class="wl-person" id="person-${i}">
        <h2 class="wl-person-head">
          ${avatarHtml(p, 'wl-person-avatar')}
          <span>${esc(p.first_name)} ${esc(p.last_name || '')}</span>
        </h2>
        ${itemsHtml(p.items)}
      </section>
    `).join('')}
    <footer class="wl-footer">${s.footer}</footer>
  `;
}

function avatarHtml(person, cls) {
  const initials = (person.first_name?.[0] || '') + (person.last_name?.[0] || '');
  return `<span class="${cls}">${person.avatar ? `<img src="${esc(person.avatar)}" alt="">` : esc(initials)}</span>`;
}

function itemsHtml(items) {
  return items.length
    ? `<ul class="wl-items">${items.map(renderItem).join('')}</ul>`
    : `<p class="wl-empty">${s.empty}</p>`;
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
