import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

let map = null;

export async function renderMap() {
  const content = document.getElementById('app-content');
  content.classList.add('map-fullwidth');

  // Restore filter state
  const filters = JSON.parse(localStorage.getItem('map.filters') || '{"addresses":true,"groups":true,"photos":true}');

  content.innerHTML = `
    <div class="map-page">
      <div class="map-toolbar glass-card">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input type="text" id="address-search" placeholder="${t('map.searchPlaceholder')}">
        </div>
        <div class="map-filters">
          <label class="map-filter-toggle ${filters.addresses ? 'active' : ''}" title="${t('nav.contacts')}">
            <input type="checkbox" id="filter-addresses" ${filters.addresses ? 'checked' : ''} hidden>
            <i class="bi bi-geo-alt"></i>
          </label>
          <label class="map-filter-toggle ${filters.groups ? 'active' : ''}" title="${t('groups.title')}">
            <input type="checkbox" id="filter-groups" ${filters.groups ? 'checked' : ''} hidden>
            <i class="bi bi-people-fill"></i>
          </label>
          <label class="map-filter-toggle ${filters.photos ? 'active' : ''}" title="${t('groups.photos')}">
            <input type="checkbox" id="filter-photos" ${filters.photos ? 'checked' : ''} hidden>
            <i class="bi bi-camera"></i>
          </label>
        </div>
        <div id="search-results" class="search-results d-none"></div>
      </div>
      <div id="map-container" class="map-container"></div>
    </div>
  `;

  if (!window.L) await loadLeaflet();

  const saved = JSON.parse(localStorage.getItem('map.view') || 'null');
  const center = saved ? [saved.lat, saved.lng] : [59.9, 10.75];
  const zoom = saved ? saved.zoom : 10;

  map = L.map('map-container').setView(center, zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  map.on('moveend', () => {
    const c = map.getCenter();
    localStorage.setItem('map.view', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
  });

  // Layer groups for filtering
  const layers = {
    addresses: L.layerGroup().addTo(map),
    groups: L.layerGroup().addTo(map),
    photos: L.layerGroup().addTo(map),
  };

  // Apply initial filter state
  if (!filters.addresses) map.removeLayer(layers.addresses);
  if (!filters.groups) map.removeLayer(layers.groups);
  if (!filters.photos) map.removeLayer(layers.photos);

  // Filter toggle handlers
  document.querySelectorAll('.map-filter-toggle').forEach(label => {
    label.addEventListener('click', () => {
      const input = label.querySelector('input');
      // Toggle happens after click, so check new state
      setTimeout(() => {
        label.classList.toggle('active', input.checked);
        const key = input.id.replace('filter-', '');
        if (input.checked) map.addLayer(layers[key]);
        else map.removeLayer(layers[key]);
        // Save state
        const state = {
          addresses: document.getElementById('filter-addresses').checked,
          groups: document.getElementById('filter-groups').checked,
          photos: document.getElementById('filter-photos').checked,
        };
        localStorage.setItem('map.filters', JSON.stringify(state));
      }, 0);
    });
  });

  await loadMarkers(layers);

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

async function loadMarkers(layers) {
  const groupIcon = L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;background:#e67e22;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });

  const photoIcon = L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;background:#9b59b6;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center"><i class="bi bi-camera-fill" style="color:#fff;font-size:10px"></i></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });

  try {
    const bounds = [];

    // Addresses
    try {
      const { addresses } = await api.get('/addresses/map');
      for (const addr of addresses) {
        bounds.push([addr.latitude, addr.longitude]);
        const names = addr.contacts.map(c =>
          `<a href="/contacts/${c.uuid}" class="map-contact-link" data-uuid="${c.uuid}">${c.first_name} ${c.last_name || ''}</a>`
        ).join('<br>');
        const popup = `<div class="map-popup">
          <strong>${addr.street}</strong><br>
          <span class="text-muted">${[addr.postal_code, addr.city].filter(Boolean).join(' ')}</span>
          <hr style="margin:4px 0">${names}
          ${addr.address_id ? `<hr style="margin:4px 0"><a href="/addresses/${addr.address_id}" class="map-contact-link map-address-link" data-address-id="${addr.address_id}"><i class="bi bi-house-door"></i> ${t('addresses.viewAddress')}</a>` : ''}
        </div>`;
        L.marker([addr.latitude, addr.longitude]).addTo(layers.addresses).bindPopup(popup);
      }
    } catch {}

    // Groups
    try {
      const { companies } = await api.get('/companies');
      const typeIcons = { company: 'bi-building', school: 'bi-mortarboard', club: 'bi-people', team: 'bi-trophy', association: 'bi-diagram-3', class: 'bi-easel', other: 'bi-collection' };
      for (const c of companies) {
        if (!c.latitude || !c.longitude) continue;
        bounds.push([c.latitude, c.longitude]);
        const popup = `<div class="map-popup">
          <strong><i class="bi ${typeIcons[c.type] || 'bi-people'} me-1"></i>${c.name}</strong>
          ${c.industry ? `<br><span class="text-muted">${c.industry}</span>` : ''}
          <hr style="margin:4px 0">
          <a href="/groups/${c.uuid}" class="map-contact-link" data-group-uuid="${c.uuid}"><i class="bi bi-box-arrow-up-right me-1"></i>${t('common.open')}</a>
        </div>`;
        L.marker([c.latitude, c.longitude], { icon: groupIcon }).addTo(layers.groups).bindPopup(popup);
      }
    } catch {}

    // Photos with GPS
    try {
      const { photos } = await api.get('/posts/geo');
      for (const p of photos) {
        bounds.push([p.latitude, p.longitude]);
        const popup = `<div class="map-popup">
          <img src="${authUrl(p.thumbnail_path)}" alt="" style="width:100%;max-width:200px;border-radius:4px;margin-bottom:4px">
          ${p.taken_at ? `<br><span class="text-muted small">${p.taken_at}</span>` : ''}
          ${p.contact ? `<br><a href="/contacts/${p.contact.uuid}" class="map-contact-link" data-uuid="${p.contact.uuid}">${p.contact.first_name} ${p.contact.last_name || ''}</a>` : ''}
          ${p.post_body ? `<br><span class="small">${p.post_body.substring(0, 60)}${p.post_body.length > 60 ? '...' : ''}</span>` : ''}
        </div>`;
        L.marker([p.latitude, p.longitude], { icon: photoIcon }).addTo(layers.photos).bindPopup(popup);
      }
    } catch {}

    if (bounds.length && !localStorage.getItem('map.view')) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    // Handle popup link clicks
    map.on('popupopen', () => {
      document.querySelectorAll('.map-contact-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('app-content')?.classList.remove('map-fullwidth');
          if (link.dataset.addressId) navigate(`/addresses/${link.dataset.addressId}`);
          else if (link.dataset.groupUuid) navigate(`/groups/${link.dataset.groupUuid}`);
          else navigate(`/contacts/${link.dataset.uuid}`);
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
    results.innerHTML = data.results.map((r, i) => `
      <a href="#" class="search-result-item" data-index="${i}">
        <strong>${r.first_name} ${r.last_name || ''}</strong>
        <span>${r.street}, ${[r.postal_code, r.city].filter(Boolean).join(' ')}</span>
      </a>
    `).join('');
    results.classList.remove('d-none');

    results.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const r = data.results[parseInt(item.dataset.index)];
        if (r.latitude && r.longitude) {
          map.setView([r.latitude, r.longitude], 16);
          // Open the marker popup at this location
          map.eachLayer(layer => {
            if (layer.getLatLng) {
              const ll = layer.getLatLng();
              if (Math.abs(ll.lat - r.latitude) < 0.0001 && Math.abs(ll.lng - r.longitude) < 0.0001) {
                layer.openPopup();
              }
            }
          });
        }
        results.classList.add('d-none');
        document.getElementById('address-search').value = '';
      });
    });
  } catch {
    results.classList.add('d-none');
  }
}

async function loadLeaflet() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

export function destroyMap() {
  if (map) { map.remove(); map = null; }
  document.getElementById('app-content')?.classList.remove('map-fullwidth');
}
