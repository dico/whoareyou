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
        <h4><i class="bi bi-buildings"></i> ${t('admin.tenants')}</h4>
        <p class="text-muted small">${t('admin.tenantsDesc')}</p>
        <div id="tenants-list" class="mt-3">
          <div class="loading">${t('admin.loadingTenants')}</div>
        </div>
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
  await Promise.all([loadTenants(), loadSmtp()]);
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
          ${state.user.tenant_uuid === tn.uuid
            ? `<span class="badge bg-success">${t('admin.active')}</span>`
            : `<button class="btn btn-outline-primary btn-sm btn-switch-tenant" data-uuid="${tn.uuid}" data-name="${escapeHtml(tn.name)}">
                <i class="bi bi-arrow-left-right"></i> ${t('admin.switch')}
              </button>`
          }
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
