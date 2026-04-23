import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { confirmDialog } from '../components/dialogs.js';
import { t } from '../utils/i18n.js';

export async function renderSystemAdmin() {
  const content = document.getElementById('app-content');

  if (!state.user?.is_system_admin) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.systemAccessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2>${t('settings.systemAdmin')}</h2>
        <div></div>
      </div>

      <div class="filter-tabs mb-3" id="system-tabs">
        <button class="filter-tab active" data-tab="tenants"><i class="bi bi-buildings me-1"></i>${t('admin.tenants')}</button>
        <button class="filter-tab" data-tab="settings"><i class="bi bi-gear me-1"></i>${t('admin.systemSettings')}</button>
        <button class="filter-tab" data-tab="email"><i class="bi bi-envelope me-1"></i>${t('admin.emailConfig')}</button>
        <button class="filter-tab" data-tab="ip-security"><i class="bi bi-shield-lock me-1"></i>${t('admin.ipSecurity')}</button>
      </div>

      <!-- Tenants tab -->
      <div id="tab-tenants">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <p class="text-muted small mb-0">${t('admin.tenantsDesc')}</p>
          <button class="btn btn-primary btn-sm" id="btn-create-tenant">
            <i class="bi bi-plus-lg me-1"></i>${t('admin.createTenant')}
          </button>
        </div>
        <div id="tenants-list" class="glass-card settings-section">
          <div class="loading">${t('admin.loadingTenants')}</div>
        </div>
      </div>

      </div>

      <!-- Settings tab -->
      <div id="tab-settings" class="d-none">
        <div class="settings-section glass-card">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="setting-registration" checked>
            <label class="form-check-label" for="setting-registration">${t('admin.allowRegistration')}</label>
            <div class="form-text">${t('admin.allowRegistrationHint')}</div>
          </div>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="setting-password-reset">
            <label class="form-check-label" for="setting-password-reset">${t('admin.allowPasswordReset')}</label>
            <div class="form-text">${t('admin.allowPasswordResetHint')}</div>
          </div>
          <div id="settings-feedback" class="mt-2"></div>
        </div>
      </div>

      <!-- Email tab -->
      <div id="tab-email" class="d-none">
      <div class="settings-section glass-card">
        <h4><i class="bi bi-envelope"></i> ${t('admin.emailConfig')}</h4>
        <p class="text-muted small">${t('admin.emailConfigDesc')}</p>
        <div id="smtp-status" class="mb-3">
          <div class="settings-row">
            <span class="settings-label">${t('admin.emailStatus')}</span>
            <span class="badge bg-secondary">${t('admin.notConfigured')}</span>
          </div>
        </div>
        <form id="smtp-form">
          <div class="row g-2 mb-2">
            <div class="col-8">
              <label class="form-label small">${t('admin.smtpHost')}</label>
              <input type="text" class="form-control form-control-sm" id="smtp-host" placeholder="smtp.gmail.com">
            </div>
            <div class="col-4">
              <label class="form-label small">${t('admin.smtpPort')}</label>
              <input type="number" class="form-control form-control-sm" id="smtp-port" value="587">
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small">${t('admin.smtpUser')}</label>
              <input type="text" class="form-control form-control-sm" id="smtp-user" autocomplete="off">
            </div>
            <div class="col-6">
              <label class="form-label small">${t('admin.smtpPass')}</label>
              <input type="password" class="form-control form-control-sm" id="smtp-pass" autocomplete="new-password">
            </div>
          </div>
          <div class="mb-2">
            <label class="form-label small">${t('admin.smtpFrom')}</label>
            <input type="text" class="form-control form-control-sm" id="smtp-from" placeholder="${t('admin.smtpFromPlaceholder')}">
          </div>
          <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input" id="smtp-secure">
            <label class="form-check-label small" for="smtp-secure">${t('admin.smtpSecure')}</label>
          </div>
          <div class="form-check mb-3">
            <input type="checkbox" class="form-check-input" id="smtp-login-notify" checked>
            <label class="form-check-label small" for="smtp-login-notify">${t('admin.loginNotify')}</label>
            <div class="form-text">${t('admin.loginNotifyDesc')}</div>
          </div>
          <p class="text-muted small"><i class="bi bi-info-circle"></i> ${t('admin.emailConfigNote')}</p>
          <div class="d-flex gap-2 flex-wrap">
            <button type="submit" class="btn btn-primary btn-sm">${t('admin.smtpSave')}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="smtp-test">${t('admin.smtpTest')}</button>
            <button type="button" class="btn btn-outline-danger btn-sm" id="smtp-clear">${t('admin.smtpClear')}</button>
          </div>
          <div id="smtp-feedback" class="mt-2"></div>
        </form>
      </div>
      </div>
    </div>

      <!-- IP Security tab -->
      <div id="tab-ip-security" class="d-none">
        <div class="settings-section glass-card">
          <h4><i class="bi bi-shield-lock me-2"></i>${t('admin.ipSecurity')}</h4>
          <p class="text-muted small">${t('admin.ipSecurityDesc')}</p>

          <!-- Login IP whitelist -->
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="ip-whitelist-enabled">
            <label class="form-check-label" for="ip-whitelist-enabled"><strong>${t('admin.loginIpWhitelist')}</strong></label>
            <div class="form-text">${t('admin.loginIpWhitelistHint')}</div>
          </div>
          <div id="ip-whitelist-fields" class="mb-3 d-none">
            <textarea class="form-control form-control-sm" id="ip-login-whitelist" rows="2" placeholder="${t('admin.loginIpWhitelistPlaceholder')}"></textarea>
            <div class="mt-1">
              <span class="small text-muted" id="ip-current-ip"></span>
              <button class="btn btn-outline-secondary btn-sm ms-2" id="ip-add-current" type="button">${t('admin.addCurrentIp')}</button>
              <button class="btn btn-outline-secondary btn-sm" id="ip-add-range" type="button">${t('admin.addCurrentRange')}</button>
            </div>
          </div>

          <hr>

          <!-- Country whitelist -->
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="ip-country-enabled">
            <label class="form-check-label" for="ip-country-enabled"><strong>${t('admin.countryWhitelist')}</strong></label>
            <div class="form-text">${t('admin.countryWhitelistHint')}</div>
          </div>
          <div id="ip-country-fields" class="mb-3 d-none">
            <div id="ip-country-no-key-warn" class="alert alert-warning small py-2 px-3 d-none mb-2">
              <i class="bi bi-exclamation-triangle me-1"></i>${t('admin.countryWhitelistWarnNoKey')}
            </div>
            <div class="mb-2">
              <label class="form-label small">${t('admin.ipgeoApiKey')}</label>
              <div class="d-flex gap-2">
                <input type="text" class="form-control form-control-sm" id="ip-geo-key" placeholder="${t('admin.ipgeoApiKeyPlaceholder')}">
                <button class="btn btn-outline-secondary btn-sm" id="ip-geo-test" type="button">${t('admin.testGeo')}</button>
              </div>
              <div class="form-text">${t('admin.ipgeoApiKeyHint')}</div>
            </div>
            <div class="mb-2">
              <label class="form-label small">${t('admin.countryWhitelist')}</label>
              <div class="d-flex gap-2">
                <input type="text" class="form-control form-control-sm" id="ip-country-whitelist" placeholder="${t('admin.countryWhitelistPlaceholder')}" readonly>
                <button class="btn btn-outline-secondary btn-sm" id="ip-country-picker-btn" type="button">${t('admin.selectCountries')}</button>
              </div>
              <div id="ip-country-tags" class="mt-1 d-flex flex-wrap gap-1"></div>
            </div>
            <div id="ip-country-picker" class="d-none mb-2" style="position:relative">
              <input type="text" class="form-control form-control-sm" id="ip-country-search" placeholder="${t('common.search')}">
              <div id="ip-country-list" class="mt-1" style="max-height:200px;overflow-y:auto;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface)"></div>
            </div>
          </div>

          <button class="btn btn-primary btn-sm" id="ip-save">${t('common.save')}</button>
          <span id="ip-feedback" class="ms-2"></span>
        </div>
      </div>

    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));

  // Tab switching
  document.getElementById('system-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#system-tabs .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['tenants', 'settings', 'email', 'ip-security'].forEach(id => {
      document.getElementById(`tab-${id}`)?.classList.toggle('d-none', id !== tab.dataset.tab);
    });
    if (tab.dataset.tab === 'ip-security') loadIpSecurity();
  });

  await Promise.all([loadSettings(), loadTenants(), loadSmtp()]);
}

async function loadSettings() {
  try {
    const data = await api.get('/system/settings');
    document.getElementById('setting-registration').checked = data.registration_enabled;
    document.getElementById('setting-password-reset').checked = data.password_reset_enabled;
  } catch { /* ignore */ }

  // Save on change
  for (const id of ['setting-registration', 'setting-password-reset']) {
    document.getElementById(id).addEventListener('change', async () => {
      const feedback = document.getElementById('settings-feedback');
      try {
        await api.put('/system/settings', {
          registration_enabled: document.getElementById('setting-registration').checked,
          password_reset_enabled: document.getElementById('setting-password-reset').checked,
        });
        feedback.innerHTML = `<span class="text-success small">${t('common.saved')}</span>`;
        setTimeout(() => { feedback.innerHTML = ''; }, 2000);
      } catch (err) {
        feedback.innerHTML = `<span class="text-danger small">${err.message}</span>`;
      }
    });
  }

  // Create tenant
  document.getElementById('btn-create-tenant').addEventListener('click', () => showCreateTenantModal());
}

function showCreateTenantModal() {
  const mid = 'create-tenant-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('admin.createTenant')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${mid}-form">
            <div class="modal-body">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-name" required>
                <label>${t('admin.tenantName')}</label>
              </div>
              <hr>
              <p class="text-muted small">${t('admin.tenantAdminDesc')}</p>
              <div class="row g-2 mb-3">
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="${mid}-first" required>
                    <label>${t('auth.firstName')}</label>
                  </div>
                </div>
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="${mid}-last">
                    <label>${t('auth.lastName')}</label>
                  </div>
                </div>
              </div>
              <div class="form-floating mb-3">
                <input type="email" class="form-control" id="${mid}-email">
                <label>${t('auth.email')}</label>
              </div>
              <div class="form-floating mb-3">
                <input type="password" class="form-control" id="${mid}-password">
                <label>${t('auth.password')}</label>
              </div>
              <div id="${mid}-error" class="alert alert-danger d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('contacts.create')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);
  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById(`${mid}-error`);
    errorEl.classList.add('d-none');
    try {
      await api.post('/system/tenants', {
        tenant_name: document.getElementById(`${mid}-name`).value.trim(),
        admin_first_name: document.getElementById(`${mid}-first`).value.trim(),
        admin_last_name: document.getElementById(`${mid}-last`).value.trim(),
        admin_email: document.getElementById(`${mid}-email`).value.trim() || null,
        admin_password: document.getElementById(`${mid}-password`).value || null,
      });
      modal.hide();
      loadTenants();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

async function loadTenants() {
  const el = document.getElementById('tenants-list');
  if (!el) return;

  try {
    const { tenants } = await api.get('/auth/tenants');

    if (tenants.length === 0) {
      el.innerHTML = `<p class="text-muted">${t('admin.noTenants')}</p>`;
      return;
    }

    el.innerHTML = tenants.map((tn) => `
      <div class="tenant-row">
        <div class="tenant-info">
          <strong>${escapeHtml(tn.name)}</strong>
          <div class="text-muted small">
            ${tn.user_count} member${tn.user_count !== 1 ? 's' : ''} &middot;
            ${tn.contact_count} contact${tn.contact_count !== 1 ? 's' : ''}
          </div>
        </div>
        <div class="tenant-actions">
          <div class="dropdown">
            <button class="btn btn-link btn-sm" data-bs-toggle="dropdown" data-bs-display="static"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end glass-dropdown" style="position:absolute;z-index:1050">
              <li><a class="dropdown-item btn-reset-pw" href="#" data-uuid="${tn.uuid}" data-name="${escapeHtml(tn.name)}"><i class="bi bi-key me-2"></i>${t('admin.resetTenantPassword')}</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger btn-delete-tenant" href="#" data-uuid="${tn.uuid}" data-name="${escapeHtml(tn.name)}"><i class="bi bi-trash me-2"></i>${t('admin.deleteTenant')}</a></li>
            </ul>
          </div>
        </div>
      </div>
    `).join('');


    // Reset tenant member password
    el.querySelectorAll('.btn-reset-pw').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const mid = 'reset-pw-' + Date.now();

        // Fetch members in this tenant
        let members = [];
        try {
          const data = await api.get(`/system/tenants/${btn.dataset.uuid}/members`);
          members = data.members.filter(m => m.email);
        } catch { /* ignore */ }

        if (!members.length) {
          confirmDialog(t('admin.noActiveMembers'), { title: t('admin.resetTenantPassword'), confirmText: 'OK', confirmClass: 'btn-primary' });
          return;
        }

        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal fade" id="${mid}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">${t('admin.resetTenantPassword')}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                <form id="${mid}-form">
                  <div class="modal-body">
                    <div class="mb-3">
                      <label class="form-label small">${t('admin.selectMember')}</label>
                      <select class="form-select form-select-sm" id="${mid}-user">
                        ${members.map(m => `<option value="${m.uuid}">${m.first_name} ${m.last_name || ''} ${m.role === 'admin' ? `(${t('admin.roleAdmin')})` : ''} — ${m.email}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-floating mb-3">
                      <input type="text" class="form-control" id="${mid}-password" required>
                      <label>${t('admin.newPassword')}</label>
                    </div>
                    <div id="${mid}-error" class="alert alert-danger d-none"></div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
                    <button type="submit" class="btn btn-warning btn-sm">${t('admin.resetPassword')}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        `);
        const modalEl = document.getElementById(mid);
        const modal = new bootstrap.Modal(modalEl);
        document.getElementById(`${mid}-form`).addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const errorEl = document.getElementById(`${mid}-error`);
          errorEl.classList.add('d-none');
          try {
            const result = await api.post(`/system/tenants/${btn.dataset.uuid}/reset-password`, {
              user_uuid: document.getElementById(`${mid}-user`).value,
              new_password: document.getElementById(`${mid}-password`).value,
            });
            modal.hide();
            confirmDialog(result.message, { title: t('admin.resetTenantPassword'), confirmText: 'OK', confirmClass: 'btn-primary' });
          } catch (err) { errorEl.textContent = err.message; errorEl.classList.remove('d-none'); }
        });
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
        modal.show();
      });
    });

    // Delete tenant
    el.querySelectorAll('.btn-delete-tenant').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const mid = 'delete-tenant-' + Date.now();
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal fade" id="${mid}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header"><h5 class="modal-title text-danger">${t('admin.deleteTenant')}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                <form id="${mid}-form">
                  <div class="modal-body">
                    <p class="text-danger small">${t('admin.deleteTenantWarning', { name: btn.dataset.name })}</p>
                    <div class="form-floating mb-3">
                      <input type="text" class="form-control" id="${mid}-name" required>
                      <label>${t('admin.typeTenantName')}</label>
                    </div>
                    <div class="form-floating mb-3">
                      <input type="password" class="form-control" id="${mid}-password" required>
                      <label>${t('admin.yourPassword')}</label>
                    </div>
                    <div id="${mid}-error" class="alert alert-danger d-none"></div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
                    <button type="submit" class="btn btn-danger btn-sm">${t('admin.deleteTenant')}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        `);
        const modalEl = document.getElementById(mid);
        const modal = new bootstrap.Modal(modalEl);
        document.getElementById(`${mid}-form`).addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const errorEl = document.getElementById(`${mid}-error`);
          const typedName = document.getElementById(`${mid}-name`).value.trim();
          if (typedName !== btn.dataset.name) {
            errorEl.textContent = t('admin.tenantNameMismatch');
            errorEl.classList.remove('d-none');
            return;
          }
          try {
            await api.post(`/system/tenants/${btn.dataset.uuid}/delete`, { admin_password: document.getElementById(`${mid}-password`).value });
            modal.hide();
            loadTenants();
          } catch (err) { errorEl.textContent = err.message; errorEl.classList.remove('d-none'); }
        });
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
        modal.show();
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function loadSmtp() {
  try {
    const data = await api.get('/system/smtp');
    const statusEl = document.getElementById('smtp-status');

    if (data.configured) {
      statusEl.innerHTML = `
        <div class="settings-row">
          <span class="settings-label">${t('admin.emailStatus')}</span>
          <span class="badge bg-success">${t('admin.configured')}</span>
        </div>
      `;
      document.getElementById('smtp-host').value = data.host || '';
      document.getElementById('smtp-port').value = data.port || 587;
      document.getElementById('smtp-user').value = data.user || '';
      document.getElementById('smtp-pass').value = data.pass || '';
      document.getElementById('smtp-from').value = data.from || '';
      document.getElementById('smtp-secure').checked = !!data.secure;
      document.getElementById('smtp-login-notify').checked = data.login_notify !== false;
    }
  } catch (err) {
    console.error('Failed to load SMTP config:', err);
  }

  // Save handler
  document.getElementById('smtp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = document.getElementById('smtp-feedback');
    try {
      await api.put('/system/smtp', {
        host: document.getElementById('smtp-host').value.trim(),
        port: parseInt(document.getElementById('smtp-port').value) || 587,
        secure: document.getElementById('smtp-secure').checked,
        user: document.getElementById('smtp-user').value.trim(),
        pass: document.getElementById('smtp-pass').value,
        from: document.getElementById('smtp-from').value.trim(),
        login_notify: document.getElementById('smtp-login-notify').checked,
      });
      feedback.innerHTML = `<span class="text-success small">${t('admin.smtpSaved')}</span>`;
      // Update status badge
      document.querySelector('#smtp-status .badge').className = 'badge bg-success';
      document.querySelector('#smtp-status .badge').textContent = t('admin.configured');
    } catch (err) {
      feedback.innerHTML = `<span class="text-danger small">${err.message}</span>`;
    }
  });

  // Test handler
  document.getElementById('smtp-test').addEventListener('click', async () => {
    const feedback = document.getElementById('smtp-feedback');
    const btn = document.getElementById('smtp-test');
    btn.disabled = true;
    btn.textContent = t('admin.smtpTesting');
    try {
      const result = await api.post('/system/smtp/test');
      if (result.ok) {
        feedback.innerHTML = `<span class="text-success small">${t('admin.smtpTestSuccess', { email: result.message.split(' to ')[1] || '' })}</span>`;
      } else {
        feedback.innerHTML = `<span class="text-danger small">${t('admin.smtpTestFailed', { error: result.error })}</span>`;
      }
    } catch (err) {
      feedback.innerHTML = `<span class="text-danger small">${t('admin.smtpTestFailed', { error: err.message })}</span>`;
    }
    btn.disabled = false;
    btn.textContent = t('admin.smtpTest');
  });

  // Clear handler
  document.getElementById('smtp-clear').addEventListener('click', async () => {
    const confirmed = await confirmDialog(t('admin.smtpClear') + '?', { title: t('admin.emailConfig'), confirmText: t('admin.smtpClear') });
    if (!confirmed) return;
    const feedback = document.getElementById('smtp-feedback');
    try {
      await api.put('/system/smtp', { host: '' });
      document.getElementById('smtp-host').value = '';
      document.getElementById('smtp-port').value = 587;
      document.getElementById('smtp-user').value = '';
      document.getElementById('smtp-pass').value = '';
      document.getElementById('smtp-from').value = '';
      document.getElementById('smtp-secure').checked = false;
      document.querySelector('#smtp-status .badge').className = 'badge bg-secondary';
      document.querySelector('#smtp-status .badge').textContent = t('admin.notConfigured');
      feedback.innerHTML = `<span class="text-success small">${t('admin.smtpCleared')}</span>`;
    } catch (err) {
      feedback.innerHTML = `<span class="text-danger small">${err.message}</span>`;
    }
  });
}

const COUNTRIES = [
  ['AF','Afghanistan'],['AL','Albania'],['DZ','Algeria'],['AD','Andorra'],['AO','Angola'],['AR','Argentina'],['AM','Armenia'],['AU','Australia'],['AT','Austria'],['AZ','Azerbaijan'],
  ['BS','Bahamas'],['BH','Bahrain'],['BD','Bangladesh'],['BY','Belarus'],['BE','Belgium'],['BO','Bolivia'],['BA','Bosnia'],['BR','Brazil'],['BG','Bulgaria'],['CA','Canada'],
  ['CL','Chile'],['CN','China'],['CO','Colombia'],['HR','Croatia'],['CU','Cuba'],['CY','Cyprus'],['CZ','Czechia'],['DK','Denmark'],['DO','Dominican Republic'],['EC','Ecuador'],
  ['EG','Egypt'],['EE','Estonia'],['ET','Ethiopia'],['FI','Finland'],['FR','France'],['GE','Georgia'],['DE','Germany'],['GH','Ghana'],['GR','Greece'],['GT','Guatemala'],
  ['HK','Hong Kong'],['HU','Hungary'],['IS','Iceland'],['IN','India'],['ID','Indonesia'],['IR','Iran'],['IQ','Iraq'],['IE','Ireland'],['IL','Israel'],['IT','Italy'],
  ['JP','Japan'],['JO','Jordan'],['KZ','Kazakhstan'],['KE','Kenya'],['KR','South Korea'],['KW','Kuwait'],['LV','Latvia'],['LB','Lebanon'],['LT','Lithuania'],['LU','Luxembourg'],
  ['MY','Malaysia'],['MX','Mexico'],['MD','Moldova'],['MC','Monaco'],['MA','Morocco'],['NL','Netherlands'],['NZ','New Zealand'],['NG','Nigeria'],['NO','Norway'],['PK','Pakistan'],
  ['PA','Panama'],['PE','Peru'],['PH','Philippines'],['PL','Poland'],['PT','Portugal'],['QA','Qatar'],['RO','Romania'],['RU','Russia'],['SA','Saudi Arabia'],['RS','Serbia'],
  ['SG','Singapore'],['SK','Slovakia'],['SI','Slovenia'],['ZA','South Africa'],['ES','Spain'],['SE','Sweden'],['CH','Switzerland'],['TW','Taiwan'],['TH','Thailand'],['TR','Turkey'],
  ['UA','Ukraine'],['AE','UAE'],['GB','United Kingdom'],['US','United States'],['UY','Uruguay'],['VN','Vietnam'],
];

async function loadIpSecurity() {
  try {
    const data = await api.get('/system/ip-security');
    const ipWhitelistEl = document.getElementById('ip-login-whitelist');
    const countryWhitelistEl = document.getElementById('ip-country-whitelist');

    document.getElementById('ip-geo-key').value = data.ipgeo_api_key || '';
    countryWhitelistEl.value = data.login_country_whitelist || '';
    ipWhitelistEl.value = data.login_ip_whitelist || '';
    document.getElementById('ip-current-ip').textContent = `${t('admin.yourIp')}: ${data.client_ip}`;

    // Toggle states
    const ipEnabled = document.getElementById('ip-whitelist-enabled');
    const countryEnabled = document.getElementById('ip-country-enabled');

    ipEnabled.checked = !!(data.login_ip_whitelist?.trim());
    countryEnabled.checked = !!(data.login_country_whitelist?.trim());
    document.getElementById('ip-whitelist-fields').classList.toggle('d-none', !ipEnabled.checked);
    document.getElementById('ip-country-fields').classList.toggle('d-none', !countryEnabled.checked);

    // The country check fails closed — if an admin enables the country
    // whitelist without an API key, the app will block every non-local
    // request. Surface that before they save.
    const apiKeyEl = document.getElementById('ip-geo-key');
    const noKeyWarn = document.getElementById('ip-country-no-key-warn');
    function refreshNoKeyWarn() {
      const needsKey = countryEnabled.checked && !apiKeyEl.value.trim();
      noKeyWarn.classList.toggle('d-none', !needsKey);
    }
    refreshNoKeyWarn();
    apiKeyEl.addEventListener('input', refreshNoKeyWarn);

    ipEnabled.addEventListener('change', () => {
      document.getElementById('ip-whitelist-fields').classList.toggle('d-none', !ipEnabled.checked);
      if (!ipEnabled.checked) ipWhitelistEl.value = '';
    });
    countryEnabled.addEventListener('change', () => {
      document.getElementById('ip-country-fields').classList.toggle('d-none', !countryEnabled.checked);
      if (!countryEnabled.checked) countryWhitelistEl.value = '';
      refreshNoKeyWarn();
    });

    // Country tags
    function renderCountryTags() {
      const codes = countryWhitelistEl.value.split(',').map(c => c.trim()).filter(Boolean);
      const tagsEl = document.getElementById('ip-country-tags');
      tagsEl.innerHTML = codes.map(code => {
        const name = COUNTRIES.find(c => c[0] === code)?.[1] || code;
        return `<span class="contact-chip">
          <span class="contact-chip-avatar"><img src="/img/flags/${code.toLowerCase()}.svg" alt="${code}" style="width:100%;height:100%;object-fit:cover"></span>
          ${name}
          <button class="contact-chip-remove ip-rm-country" data-code="${code}" type="button"><i class="bi bi-x"></i></button>
        </span>`;
      }).join('');
      tagsEl.querySelectorAll('.ip-rm-country').forEach(btn => {
        btn.addEventListener('click', () => {
          countryWhitelistEl.value = countryWhitelistEl.value.split(',').map(c => c.trim()).filter(c => c && c !== btn.dataset.code).join(', ');
          renderCountryTags();
        });
      });
    }
    renderCountryTags();

    // Country picker
    document.getElementById('ip-country-picker-btn').addEventListener('click', () => {
      const picker = document.getElementById('ip-country-picker');
      picker.classList.toggle('d-none');
      if (!picker.classList.contains('d-none')) {
        document.getElementById('ip-country-search').value = '';
        renderCountryList('');
        document.getElementById('ip-country-search').focus();
      }
    });

    document.getElementById('ip-country-search').addEventListener('input', (e) => renderCountryList(e.target.value.trim().toLowerCase()));

    function renderCountryList(filter) {
      const selected = countryWhitelistEl.value.split(',').map(c => c.trim()).filter(Boolean);
      const filtered = COUNTRIES.filter(([code, name]) => !selected.includes(code) && (name.toLowerCase().includes(filter) || code.toLowerCase().includes(filter))).slice(0, 15);
      const listEl = document.getElementById('ip-country-list');
      listEl.innerHTML = filtered.map(([code, name]) =>
        `<div class="px-2 py-1 d-flex align-items-center gap-2" style="cursor:pointer" data-code="${code}">
          <img src="/img/flags/${code.toLowerCase()}.svg" alt="${code}" style="width:20px;height:15px">
          ${name} <span class="text-muted">(${code})</span>
        </div>`
      ).join('') || `<div class="px-2 py-1 text-muted">${t('common.noResults')}</div>`;
      listEl.querySelectorAll('[data-code]').forEach(item => {
        item.addEventListener('click', () => {
          const current = countryWhitelistEl.value.trim();
          countryWhitelistEl.value = current ? `${current}, ${item.dataset.code}` : item.dataset.code;
          renderCountryTags();
          document.getElementById('ip-country-picker').classList.add('d-none');
        });
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(0,0,0,0.04)');
        item.addEventListener('mouseleave', () => item.style.background = '');
      });
    }

    // Test geolocation
    document.getElementById('ip-geo-test').addEventListener('click', async () => {
      const btn = document.getElementById('ip-geo-test');
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const result = await api.post('/system/ip-security/test', {
          api_key: document.getElementById('ip-geo-key').value.trim(),
        });

        const flag = result.country_code && result.country_code !== 'LOCAL'
          ? `<img src="/img/flags/${result.country_code.toLowerCase()}.svg" alt="" style="width:48px;height:36px;border-radius:4px;margin-bottom:8px"><br>` : '';

        let html = '';
        if (result.is_local_network) {
          html += `<div class="alert alert-info small mb-2">${t('admin.geoLocalInfo')}</div>`;
        }
        html += `${flag}<strong>${result.country_name || result.country_code}</strong><br>`;
        html += `<span class="text-muted">IP: ${result.tested_ip}</span><br>`;
        if (result.city) html += `<span class="text-muted">${t('admin.geoCity')}: ${result.city}</span><br>`;
        if (result.isp) html += `<span class="text-muted">ISP: ${result.isp}</span><br>`;
        html += `<span class="badge bg-success mt-1">${t('admin.geoKeyValid')}</span>`;

        await confirmDialog(html, { title: t('admin.testGeoResult'), confirmText: t('common.ok'), confirmClass: 'btn-primary', size: '' });
      } catch (err) {
        await confirmDialog(`<div class="alert alert-danger mb-0">${t('admin.geoKeyInvalid')}</div><p class="small text-muted mt-2">${err.message}</p>`,
          { title: t('admin.testGeoResult'), confirmText: t('common.ok'), confirmClass: 'btn-primary', size: '' });
      }
      btn.disabled = false;
      btn.textContent = t('admin.testGeo');
    });

    // Add current IP buttons
    document.getElementById('ip-add-current').addEventListener('click', () => {
      const current = ipWhitelistEl.value.trim();
      if (!current.includes(data.client_ip)) ipWhitelistEl.value = current ? `${current}, ${data.client_ip}` : data.client_ip;
    });
    document.getElementById('ip-add-range').addEventListener('click', () => {
      const current = ipWhitelistEl.value.trim();
      const parts = data.client_ip.split('.');
      if (parts.length === 4) {
        const range = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        if (!current.includes(range)) ipWhitelistEl.value = current ? `${current}, ${range}` : range;
      }
    });

    // Save button
    document.getElementById('ip-save').addEventListener('click', async () => {
      const feedbackEl = document.getElementById('ip-feedback');
      try {
        // Safety check: verify current IP would still be allowed
        const newIpWhitelist = ipEnabled.checked ? ipWhitelistEl.value.trim() : '';
        const newCountryWhitelist = countryEnabled.checked ? countryWhitelistEl.value.trim() : '';
        const apiKey = document.getElementById('ip-geo-key').value.trim();

        if (newIpWhitelist && !newIpWhitelist.includes(data.client_ip)) {
          // Check if current IP is in any of the ranges
          const inRange = newIpWhitelist.split(',').some(range => {
            const r = range.trim();
            if (!r.includes('/')) return r === data.client_ip;
            const [rangeIp, bits] = r.split('/');
            const mask = ~(2 ** (32 - parseInt(bits)) - 1);
            const ipToInt = ip => ip.split('.').reduce((s, o) => (s << 8) + parseInt(o), 0) >>> 0;
            return (ipToInt(data.client_ip) & mask) === (ipToInt(rangeIp) & mask);
          });
          if (!inRange) {
            const proceed = await confirmDialog(t('admin.ipLockoutWarning', { ip: data.client_ip }), {
              title: t('admin.ipSecurity'), confirmText: t('admin.saveAnyway'),
            });
            if (!proceed) return;
          }
        }

        if (newCountryWhitelist && apiKey) {
          // Test current IP against country whitelist
          feedbackEl.innerHTML = `<span class="text-muted small">${t('admin.verifyingCountry')}</span>`;
          try {
            const result = await api.post('/system/ip-security/test', { api_key: apiKey });
            if (result.country_code && result.country_code !== 'LOCAL') {
              const allowed = newCountryWhitelist.split(',').map(c => c.trim().toUpperCase());
              if (!allowed.includes(result.country_code.toUpperCase())) {
                const countryName = COUNTRIES.find(c => c[0] === result.country_code)?.[1] || result.country_code;
                const proceed = await confirmDialog(t('admin.countryLockoutWarning', { country: countryName, code: result.country_code }), {
                  title: t('admin.ipSecurity'), confirmText: t('admin.saveAnyway'),
                });
                if (!proceed) { feedbackEl.innerHTML = ''; return; }
              }
            }
          } catch {}
        }

        await api.put('/system/ip-security', {
          ipgeo_api_key: apiKey,
          login_country_whitelist: newCountryWhitelist,
          login_ip_whitelist: newIpWhitelist,
        });
        feedbackEl.innerHTML = `<span class="text-success small">${t('common.saved')}</span>`;
        setTimeout(() => { feedbackEl.innerHTML = ''; }, 3000);
      } catch (err) {
        feedbackEl.innerHTML = `<span class="text-danger small">${err.message}</span>`;
      }
    });
  } catch {}
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
