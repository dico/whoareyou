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

      <div class="settings-section glass-card">
        <h4><i class="bi bi-gear"></i> ${t('admin.systemSettings')}</h4>
        <div id="system-settings">
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

      <div class="settings-section glass-card">
        <h4><i class="bi bi-buildings"></i> ${t('admin.tenants')}</h4>
        <p class="text-muted small">${t('admin.tenantsDesc')}</p>
        <div id="tenants-list" class="mt-3">
          <div class="loading">${t('admin.loadingTenants')}</div>
        </div>
        <button class="btn btn-outline-primary btn-sm mt-3" id="btn-create-tenant">
          <i class="bi bi-plus-lg me-1"></i>${t('admin.createTenant')}
        </button>
      </div>

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
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));
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
          ${state.user.tenant_uuid === tn.uuid ? `<span class="badge bg-success ms-2">${t('admin.active')}</span>` : ''}
          <div class="text-muted small">
            ${tn.user_count} member${tn.user_count !== 1 ? 's' : ''} &middot;
            ${tn.contact_count} contact${tn.contact_count !== 1 ? 's' : ''}
          </div>
        </div>
        <div class="tenant-actions">
          <div class="dropdown">
            <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
              ${state.user.tenant_uuid !== tn.uuid ? `
                <li><a class="dropdown-item btn-switch-tenant" href="#" data-uuid="${tn.uuid}" data-name="${escapeHtml(tn.name)}"><i class="bi bi-arrow-left-right me-2"></i>${t('admin.switch')}</a></li>
              ` : ''}
              <li><a class="dropdown-item btn-reset-pw" href="#" data-uuid="${tn.uuid}" data-name="${escapeHtml(tn.name)}"><i class="bi bi-key me-2"></i>${t('admin.resetTenantPassword')}</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger btn-delete-tenant" href="#" data-uuid="${tn.uuid}" data-name="${escapeHtml(tn.name)}"><i class="bi bi-trash me-2"></i>${t('admin.deleteTenant')}</a></li>
            </ul>
          </div>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.btn-switch-tenant').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmed = await confirmDialog(
          t('admin.switchConfirm', { name: btn.dataset.name }),
          { title: t('admin.switchTenant'), confirmText: t('admin.switch') }
        );
        if (!confirmed) return;

        try {
          const { token } = await api.post('/auth/switch-tenant', { tenant_uuid: btn.dataset.uuid });
          localStorage.setItem('token', token);
          state.token = token;
          state.user = null;
          navigate('/');
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      });
    });

    // Reset tenant admin password
    el.querySelectorAll('.btn-reset-pw').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const mid = 'reset-pw-' + Date.now();
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal fade" id="${mid}" tabindex="-1">
            <div class="modal-dialog modal-sm modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">${t('admin.resetTenantPassword')}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                <form id="${mid}-form">
                  <div class="modal-body">
                    <p class="text-muted small">${t('admin.resetTenantPasswordDesc', { name: btn.dataset.name })}</p>
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
          try {
            const result = await api.post(`/system/tenants/${btn.dataset.uuid}/reset-password`, { new_password: document.getElementById(`${mid}-password`).value });
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
            <div class="modal-dialog modal-sm modal-dialog-centered">
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
