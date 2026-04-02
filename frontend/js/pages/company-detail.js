import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t, formatDate } from '../utils/i18n.js';
import { contactRowHtml } from '../components/contact-row.js';
import { attachContactSearch } from '../components/contact-search.js';
import { confirmDialog, contactSearchDialog } from '../components/dialogs.js';
import { authUrl } from '../utils/auth-url.js';

export async function renderCompanyDetail(uuid) {
  const content = document.getElementById('app-content');
  content.innerHTML = `<div class="page-container"><div class="loading">${t('app.loading')}</div></div>`;

  try {
    const { company, currentEmployees, previousEmployees } = await api.get(`/companies/${uuid}`);

    content.innerHTML = `
      <div class="page-container">
        <div class="page-header">
          <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
          <h2><i class="bi bi-building"></i> ${escapeHtml(company.name)}</h2>
          <div class="dropdown">
            <button class="btn btn-link" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
              <li><a class="dropdown-item" href="#" id="btn-edit-company"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" id="btn-delete-company"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
            </ul>
          </div>
        </div>

        <div class="profile-layout">
          <div class="profile-main">
            <!-- Current employees -->
            <div class="detail-card glass-card">
              <h4>
                <i class="bi bi-people"></i> ${t('companies.employees')}
                <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-employee" title="${t('common.add')}">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </h4>
              ${currentEmployees.length ? `
                <div class="address-residents">
                  ${currentEmployees.map(e => `
                    <div class="relationship-row-wrapper" data-link-id="${e.link_id}">
                      ${contactRowHtml(e, { meta: [e.title, e.start_date ? `${t('addresses.since')} ${formatDate(e.start_date)}` : ''].filter(Boolean).join(' — ') })}
                      <div class="relationship-actions">
                        <button type="button" class="btn btn-link btn-sm btn-end-employment" data-link-id="${e.link_id}" title="${t('companies.endEmployment')}"><i class="bi bi-box-arrow-right"></i></button>
                        <button type="button" class="btn btn-link btn-sm text-danger btn-remove-employee" data-link-id="${e.link_id}" title="${t('common.delete')}"><i class="bi bi-x-lg"></i></button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `<p class="text-muted small">${t('companies.noEmployees')}</p>`}
            </div>

            ${previousEmployees.length ? `
            <div class="detail-card glass-card">
              <h4><i class="bi bi-clock-history"></i> ${t('companies.previousEmployees')}</h4>
              <div class="address-residents">
                ${previousEmployees.map(e =>
                  contactRowHtml(e, { meta: [e.title, [e.start_date ? formatDate(e.start_date) : '', e.end_date ? formatDate(e.end_date) : ''].filter(Boolean).join(' — ')].filter(Boolean).join(' — ') })
                ).join('')}
              </div>
            </div>
            ` : ''}
          </div>

          <!-- Sidebar -->
          <div class="profile-sidebar">
            <!-- Logo -->
            <div class="sidebar-card glass-card text-center">
              <div class="company-logo-wrap" id="company-logo-wrap">
                ${company.logo_path
                  ? `<img src="${authUrl(company.logo_path)}" alt="" class="company-logo">`
                  : `<div class="company-logo-placeholder"><i class="bi bi-building"></i></div>`
                }
                <label class="company-logo-upload-btn" title="${t('companies.uploadLogo')}">
                  <i class="bi bi-camera-fill"></i>
                  <input type="file" id="logo-upload" accept="image/*" hidden>
                </label>
              </div>
            </div>

            <div class="sidebar-card glass-card">
              <h4><i class="bi bi-building"></i> ${t('companies.info')}</h4>
              ${company.org_number ? `<div class="info-field"><span class="info-label">${t('companies.orgNumber')}</span><span>${escapeHtml(company.org_number)}</span></div>` : ''}
              ${company.industry ? `<div class="info-field"><span class="info-label">${t('companies.industry')}</span><span>${escapeHtml(company.industry)}</span></div>` : ''}
              ${company.address ? `<div class="info-field"><span class="info-label">${t('addresses.address')}</span><span>${escapeHtml(company.address)}</span></div>` : ''}
              ${company.website ? `<div class="info-field"><span class="info-label">${t('companies.website')}</span><a href="${company.website.startsWith('http') ? company.website : 'https://' + company.website}" target="_blank" rel="noopener">${escapeHtml(company.website)}</a></div>` : ''}
              ${company.phone ? `<div class="info-field"><span class="info-label">${t('companies.phone')}</span><a href="tel:${company.phone}">${escapeHtml(company.phone)}</a></div>` : ''}
              ${company.email ? `<div class="info-field"><span class="info-label">${t('companies.email')}</span><a href="mailto:${company.email}">${escapeHtml(company.email)}</a></div>` : ''}
              ${company.notes ? `<div class="info-field"><span class="info-label">${t('contacts.notes')}</span><span class="text-muted">${escapeHtml(company.notes)}</span></div>` : ''}
            </div>

            ${company.latitude && company.longitude ? `
            <div class="sidebar-card glass-card">
              <h4><i class="bi bi-geo-alt"></i> ${t('nav.map')}</h4>
              <div id="company-map" class="contact-map" style="height:200px;border-radius:var(--radius-md)"></div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-back').addEventListener('click', () => window.history.back());

    // Add employee
    document.getElementById('btn-add-employee').addEventListener('click', () => {
      showAddEmployeeDialog(uuid, () => renderCompanyDetail(uuid));
    });

    // End employment
    document.querySelectorAll('.btn-end-employment').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.put(`/companies/employees/${btn.dataset.linkId}`, { end_date: new Date().toISOString().split('T')[0] });
        renderCompanyDetail(uuid);
      });
    });

    // Remove employee
    document.querySelectorAll('.btn-remove-employee').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.delete(`/companies/employees/${btn.dataset.linkId}`);
        renderCompanyDetail(uuid);
      });
    });

    // Edit company
    document.getElementById('btn-edit-company').addEventListener('click', async (e) => {
      e.preventDefault();
      showEditCompanyDialog(uuid, company, () => renderCompanyDetail(uuid));
    });

    // Delete company
    document.getElementById('btn-delete-company').addEventListener('click', async (e) => {
      e.preventDefault();
      if (await confirmDialog(t('companies.deleteConfirm', { name: company.name }), { title: t('common.delete'), confirmText: t('common.delete') })) {
        await api.delete(`/companies/${uuid}`);
        navigate('/companies');
      }
    });

    // Logo upload (file input + drag & drop)
    const logoWrap = document.getElementById('company-logo-wrap');
    const uploadLogo = async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      const formData = new FormData();
      formData.append('logo', file);
      await api.upload(`/companies/${uuid}/logo`, formData);
      renderCompanyDetail(uuid);
    };

    document.getElementById('logo-upload')?.addEventListener('change', (e) => uploadLogo(e.target.files[0]));

    logoWrap?.addEventListener('dragover', (e) => { e.preventDefault(); logoWrap.classList.add('drop-active'); });
    logoWrap?.addEventListener('dragleave', () => logoWrap.classList.remove('drop-active'));
    logoWrap?.addEventListener('drop', (e) => {
      e.preventDefault();
      logoWrap.classList.remove('drop-active');
      uploadLogo(e.dataTransfer.files[0]);
    });

    // Map
    if (company.latitude && company.longitude) {
      const mapEl = document.getElementById('company-map');
      if (mapEl) {
        await loadLeaflet();
        const map = L.map(mapEl, { scrollWheelZoom: false }).setView([company.latitude, company.longitude], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
        L.marker([company.latitude, company.longitude]).addTo(map);
        setTimeout(() => map.invalidateSize(), 100);
      }
    }

  } catch (err) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${err.message}</div></div>`;
  }
}

async function showAddEmployeeDialog(companyUuid, onDone) {
  const id = 'add-emp-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('companies.addEmployee')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="${id}-search-area">
              <input type="text" class="form-control mb-2" id="${id}-search" placeholder="${t('relationships.searchContact')}" autofocus>
              <div id="${id}-results" class="contact-search-results"></div>
            </div>
            <div id="${id}-selected" class="d-none">
              <div class="d-flex align-items-center gap-2 mb-3">
                <span class="text-muted small">${t('relationships.contact')}:</span>
                <strong id="${id}-name"></strong>
                <button type="button" class="btn btn-link btn-sm p-0" id="${id}-clear"><i class="bi bi-x-lg"></i></button>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${id}-title" placeholder="${t('companies.jobTitlePlaceholder')}">
                <label>${t('companies.jobTitle')}</label>
              </div>
              <div class="form-floating">
                <input type="date" class="form-control" id="${id}-start">
                <label>${t('relationships.since')} <span class="text-muted">(${t('relationships.optional')})</span></label>
              </div>
            </div>
          </div>
          <div class="modal-footer d-none" id="${id}-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${id}-submit">${t('companies.addEmployee')}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);
  const searchInput = document.getElementById(`${id}-search`);
  const resultsEl = document.getElementById(`${id}-results`);
  let selectedContact = null;

  modalEl.addEventListener('shown.bs.modal', () => searchInput.focus());

  attachContactSearch(searchInput, {
    limit: 8,
    floating: false, // results area is already in modal
    onSelect: (c) => {
      selectedContact = { uuid: c.uuid, first_name: c.first_name, last_name: c.last_name };
      document.getElementById(`${id}-name`).textContent = `${c.first_name} ${c.last_name || ''}`;
      document.getElementById(`${id}-selected`).classList.remove('d-none');
      document.getElementById(`${id}-footer`).classList.remove('d-none');
      document.getElementById(`${id}-search-area`).classList.add('d-none');
      document.getElementById(`${id}-title`).focus();
    },
  });

  // Clear
  document.getElementById(`${id}-clear`).addEventListener('click', () => {
    selectedContact = null;
    document.getElementById(`${id}-selected`).classList.add('d-none');
    document.getElementById(`${id}-footer`).classList.add('d-none');
    document.getElementById(`${id}-search-area`).classList.remove('d-none');
    searchInput.value = '';
    resultsEl.innerHTML = '';
    searchInput.focus();
  });

  // Submit
  document.getElementById(`${id}-submit`).addEventListener('click', async () => {
    if (!selectedContact) return;
    try {
      await api.post(`/companies/${companyUuid}/employees`, {
        contact_uuid: selectedContact.uuid,
        title: document.getElementById(`${id}-title`).value.trim() || undefined,
        start_date: document.getElementById(`${id}-start`).value || undefined,
      });
      modal.hide();
      if (onDone) onDone();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function showEditCompanyDialog(uuid, company, onDone) {
  const id = 'edit-co-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('common.edit')} — ${escapeHtml(company.name)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${id}-form">
            <div class="modal-body">
              <div class="d-flex gap-2 mb-2">
                <div class="form-floating flex-grow-1"><input type="text" class="form-control" id="${id}-org" value="${escapeAttr(company.org_number || '')}" placeholder="123456789"><label>${t('companies.orgNumber')}</label></div>
                <button type="button" class="btn btn-outline-primary btn-sm align-self-center" id="${id}-brreg" title="${t('companies.brregLookup')}"><i class="bi bi-search"></i> Brreg</button>
              </div>
              <div id="${id}-brreg-status" class="small text-muted mb-2 d-none"></div>
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-name" value="${escapeAttr(company.name)}" required><label>${t('companies.name')}</label></div>
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-industry" value="${escapeAttr(company.industry || '')}"><label>${t('companies.industry')}</label></div>
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-address" value="${escapeAttr(company.address || '')}"><label>${t('addresses.address')}</label></div>
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-website" value="${escapeAttr(company.website || '')}" placeholder="example.com"><label>${t('companies.website')}</label></div>
              <div class="row g-2 mb-2">
                <div class="col"><div class="form-floating"><input type="text" class="form-control" id="${id}-phone" value="${escapeAttr(company.phone || '')}"><label>${t('companies.phone')}</label></div></div>
                <div class="col"><div class="form-floating"><input type="email" class="form-control" id="${id}-email" value="${escapeAttr(company.email || '')}"><label>${t('companies.email')}</label></div></div>
              </div>
              <div class="form-floating mb-2"><textarea class="form-control" id="${id}-notes" style="height:80px">${escapeHtml(company.notes || '')}</textarea><label>${t('contacts.notes')}</label></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('common.save')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);
  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);

  // Brreg lookup
  document.getElementById(`${id}-brreg`).addEventListener('click', async () => {
    const orgNr = document.getElementById(`${id}-org`).value.replace(/\s/g, '');
    if (!orgNr) return;
    const statusEl = document.getElementById(`${id}-brreg-status`);
    statusEl.textContent = t('companies.brregLooking');
    statusEl.classList.remove('d-none');
    try {
      const data = await api.get(`/companies/brreg/${orgNr}`);
      if (data.name) document.getElementById(`${id}-name`).value = data.name;
      if (data.industry) document.getElementById(`${id}-industry`).value = data.industry;
      if (data.address) document.getElementById(`${id}-address`).value = data.address;
      if (data.website) document.getElementById(`${id}-website`).value = data.website;
      if (data.org_number) document.getElementById(`${id}-org`).value = data.org_number;
      statusEl.textContent = t('companies.brregFound', { name: data.name });
      statusEl.className = 'small text-success mb-2';
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'small text-danger mb-2';
    }
  });

  // Submit
  document.getElementById(`${id}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const address = document.getElementById(`${id}-address`).value || null;

    // Geocode address if changed
    let latitude = company.latitude, longitude = company.longitude;
    if (address && address !== company.address) {
      try {
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
        const results = await geo.json();
        if (results[0]) { latitude = parseFloat(results[0].lat); longitude = parseFloat(results[0].lon); }
      } catch {}
    }

    await api.put(`/companies/${uuid}`, {
      name: document.getElementById(`${id}-name`).value,
      org_number: document.getElementById(`${id}-org`).value || null,
      industry: document.getElementById(`${id}-industry`).value || null,
      address,
      latitude, longitude,
      website: (() => { let w = document.getElementById(`${id}-website`).value.trim(); if (w && !w.match(/^https?:\/\//)) w = 'https://' + w; return w || null; })(),
      phone: document.getElementById(`${id}-phone`).value || null,
      email: document.getElementById(`${id}-email`).value || null,
      notes: document.getElementById(`${id}-notes`).value || null,
    });
    modal.hide();
    if (onDone) onDone();
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str) { return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

async function loadLeaflet() {
  if (window.L) return;
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
