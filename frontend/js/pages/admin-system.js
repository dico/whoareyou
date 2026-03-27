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
        <div class="settings-row">
          <span class="settings-label">${t('admin.emailStatus')}</span>
          <span class="badge bg-secondary">${t('admin.notConfigured')}</span>
        </div>
        <p class="text-muted small mt-2"><i class="bi bi-info-circle"></i> ${t('admin.emailConfigNote')}</p>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));
  await loadTenants();
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
