import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';

let map = null;

export async function renderMap() {
  const content = document.getElementById('app-content');
  content.classList.add('map-fullwidth');

  content.innerHTML = `
    <div class="map-page">
      <div class="map-toolbar glass-card">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input type="text" id="address-search" placeholder="${t('map.searchPlaceholder')}">
        </div>
        <div id="search-results" class="search-results d-none"></div>
      </div>
      <div id="map-container" class="map-container"></div>
    </div>
  `;

  // Load Leaflet if not already loaded
  if (!window.L) {
    await loadLeaflet();
  }

  // Restore saved position or use default
  const saved = JSON.parse(localStorage.getItem('map.view') || 'null');
  const center = saved ? [saved.lat, saved.lng] : [59.9, 10.75];
  const zoom = saved ? saved.zoom : 10;

  map = L.map('map-container').setView(center, zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  // Save position on move/zoom
  map.on('moveend', () => {
    const c = map.getCenter();
    localStorage.setItem('map.view', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
  });

  // Load addresses
  await loadMarkers();

  // Address search
  let searchTimeout;
  document.getElementById('address-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) {
      document.getElementById('search-results').classList.add('d-none');
      return;
    }
    searchTimeout = setTimeout(() => searchAddresses(q), 300);
  });
}

async function loadMarkers() {
  const groupIcon = L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;background:#e67e22;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
  try {
    const { addresses } = await api.get('/addresses/map');

    const bounds = [];

    for (const addr of addresses) {
      const lat = addr.latitude;
      const lng = addr.longitude;
      bounds.push([lat, lng]);

      const names = addr.contacts.map((c) =>
        `<a href="/contacts/${c.uuid}" class="map-contact-link" data-uuid="${c.uuid}">${c.first_name} ${c.last_name || ''}</a>`
      ).join('<br>');

      const popup = `
        <div class="map-popup">
          <strong>${addr.street}</strong><br>
          <span class="text-muted">${[addr.postal_code, addr.city].filter(Boolean).join(' ')}</span>
          <hr style="margin:4px 0">
          ${names}
          ${addr.address_id ? `<hr style="margin:4px 0"><a href="/addresses/${addr.address_id}" class="map-contact-link map-address-link" data-address-id="${addr.address_id}"><i class="bi bi-house-door"></i> ${t('addresses.viewAddress')}</a>` : ''}
        </div>
      `;

      L.marker([lat, lng])
        .addTo(map)
        .bindPopup(popup);
    }

    // Load groups/companies with coordinates
    try {
      const { companies } = await api.get('/companies');
      const typeIcons = { company: 'bi-building', school: 'bi-mortarboard', club: 'bi-people', team: 'bi-trophy', association: 'bi-diagram-3', class: 'bi-easel', other: 'bi-collection' };

      for (const c of companies) {
        if (!c.latitude || !c.longitude) continue;
        bounds.push([c.latitude, c.longitude]);

        const popup = `
          <div class="map-popup">
            <strong><i class="bi ${typeIcons[c.type] || 'bi-people'} me-1"></i>${c.name}</strong>
            ${c.industry ? `<br><span class="text-muted">${c.industry}</span>` : ''}
            <hr style="margin:4px 0">
            <a href="/groups/${c.uuid}" class="map-contact-link" data-group-uuid="${c.uuid}"><i class="bi bi-box-arrow-up-right me-1"></i>${t('common.open')}</a>
          </div>
        `;

        L.marker([c.latitude, c.longitude], { icon: groupIcon })
          .addTo(map)
          .bindPopup(popup);
      }
    } catch {}

    // Fit map to markers (only if no saved position)
    if (bounds.length && !localStorage.getItem('map.view')) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    // Handle popup link clicks
    map.on('popupopen', () => {
      document.querySelectorAll('.map-contact-link').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('app-content')?.classList.remove('map-fullwidth');
          if (link.dataset.addressId) {
            navigate(`/addresses/${link.dataset.addressId}`);
          } else if (link.dataset.groupUuid) {
            navigate(`/groups/${link.dataset.groupUuid}`);
          } else {
            navigate(`/contacts/${link.dataset.uuid}`);
          }
        });
      });
    });
  } catch (err) {
    console.error('Failed to load map markers:', err);
  }
}

async function searchAddresses(q) {
  const results = document.getElementById('search-results');
  try {
    const data = await api.get(`/addresses/search?q=${encodeURIComponent(q)}`);

    if (data.results.length === 0) {
      results.innerHTML = `<div class="p-2 text-muted">${t('common.noResults')}</div>`;
      results.classList.remove('d-none');
      return;
    }

    results.innerHTML = data.results.map((r) => `
      <a href="/contacts/${r.uuid}" data-link class="search-result-item">
        <strong>${r.first_name} ${r.last_name || ''}</strong>
        <span>${r.street}, ${[r.postal_code, r.city].filter(Boolean).join(' ')}</span>
      </a>
    `).join('');
    results.classList.remove('d-none');
  } catch {
    results.classList.add('d-none');
  }
}

async function loadLeaflet() {
  // CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);

  // JS
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

// Cleanup when navigating away
export function destroyMap() {
  if (map) {
    map.remove();
    map = null;
  }
  document.getElementById('app-content')?.classList.remove('map-fullwidth');
}
