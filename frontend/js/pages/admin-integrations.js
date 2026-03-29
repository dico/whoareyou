import { state, navigate } from '../app.js';
import { t } from '../utils/i18n.js';

export async function renderIntegrations() {
  const content = document.getElementById('app-content');

  if (state.user?.role !== 'admin' && !state.user?.is_system_admin) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.accessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2>${t('settings.integrations')}</h2>
      </div>

      <div class="settings-grid">
        <a href="/admin/integrations/momentgarden" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(255,149,0,0.1);color:#FF9500"><i class="bi bi-flower3"></i></div>
          <div class="settings-card-label">MomentGarden</div>
          <div class="settings-card-desc">${t('integrations.momentgardenCardDesc')}</div>
        </a>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));
}
