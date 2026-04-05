import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t, formatDate } from '../utils/i18n.js';
import { contactRowHtml } from '../components/contact-row.js';
import { contactSearchDialog } from '../components/dialogs.js';
import { confirmDialog } from '../components/dialogs.js';

export async function renderAddressDetail(addressId) {
  const content = document.getElementById('app-content');
  content.innerHTML = `<div class="page-container"><div class="loading">${t('app.loading')}</div></div>`;

  try {
    const { address, currentResidents, previousResidents } = await api.get(`/addresses/${addressId}`);

    content.innerHTML = `
      <div class="page-container">
        <div class="page-header">
          <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
          <h2><i class="bi bi-geo-alt"></i> ${escapeHtml(address.street)}</h2>
          <div></div>
        </div>

        <div class="profile-layout">
          <div class="profile-main">
            <!-- Current residents -->
            <div class="detail-card glass-card">
              <h4>
                <i class="bi bi-people-fill"></i> ${t('addresses.currentResidents')}
                <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-resident" title="${t('addresses.addResident')}">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </h4>
              ${currentResidents.length ? `
                <div class="address-residents">
                  ${currentResidents.map(r => contactRowHtml(r, {
                    meta: r.moved_in_at ? `${t('common.since')} ${formatDate(r.moved_in_at)}` : (r.label || ''),
                  })).join('')}
                </div>
              ` : `<p class="text-muted small">${t('addresses.noCurrentResidents')}</p>`}
            </div>

            <!-- Previous residents -->
            ${previousResidents.length ? `
            <div class="detail-card glass-card">
              <h4><i class="bi bi-clock-history"></i> ${t('addresses.previousResidents')}</h4>
              <div class="address-residents">
                ${previousResidents.map(r => contactRowHtml(r, {
                  meta: [
                    r.moved_in_at ? formatDate(r.moved_in_at) : '',
                    r.moved_out_at ? formatDate(r.moved_out_at) : '',
                  ].filter(Boolean).join(' — ') || r.label || '',
                })).join('')}
              </div>
            </div>
            ` : ''}
          </div>

          <!-- Sidebar with map -->
          <div class="profile-sidebar">
            <div class="sidebar-card glass-card">
              <h4><i class="bi bi-geo-alt"></i> ${t('addresses.title')}</h4>
              <p>${escapeHtml(address.street)}${address.street2 ? ', ' + escapeHtml(address.street2) : ''}<br>
              ${[address.postal_code, address.city].filter(Boolean).join(' ')}
              ${address.country ? '<br>' + escapeHtml(address.country) : ''}</p>
            </div>
            ${address.latitude ? `
            <div class="sidebar-card glass-card">
              <div id="address-map" class="contact-mini-map" style="height:200px"></div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-back').addEventListener('click', () => window.history.back());

    // Add resident
    document.getElementById('btn-add-resident')?.addEventListener('click', async () => {
      const selected = await contactSearchDialog({ title: t('addresses.addResident') });
      if (!selected) return;
      try {
        await api.post('/addresses/link', {
          contact_uuid: selected.uuid,
          address_id: address.id,
        });
        renderAddressDetail(addressId);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    });

    // Init map
    if (address.latitude && document.getElementById('address-map')) {
      await initAddressMap(address);
    }
  } catch (err) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${err.message}</div></div>`;
  }
}

async function initAddressMap(address) {
  if (!window.L) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    await new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  const el = document.getElementById('address-map');
  if (!el) return;

  const lat = parseFloat(address.latitude);
  const lng = parseFloat(address.longitude);

  const map = L.map(el).setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  L.marker([lat, lng]).addTo(map);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
