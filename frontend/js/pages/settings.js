import { state } from '../app.js';
import { t } from '../utils/i18n.js';

export async function renderSettings() {
  const content = document.getElementById('app-content');
  const isAdmin = state.user?.role === 'admin' || state.user?.is_system_admin;

  if (!isAdmin) {
    // Non-admins go to profile
    window.location.hash = '#/profile';
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2>${t('settings.administration')}</h2>
      </div>

      <div class="settings-grid">
        <a href="/admin/tenant" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(0,122,255,0.1);color:#007AFF"><i class="bi bi-people"></i></div>
          <div class="settings-card-label">${t('settings.familyHousehold')}</div>
          <div class="settings-card-desc">${t('settings.familyHouseholdDesc')}</div>
        </a>
        <a href="/admin/labels" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(255,149,0,0.1);color:#FF9500"><i class="bi bi-tags"></i></div>
          <div class="settings-card-label">${t('labels.manage')}</div>
          <div class="settings-card-desc">${t('settings.labelsCardDesc')}</div>
        </a>
        <a href="/admin/duplicates" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(255,149,0,0.1);color:#FF9500"><i class="bi bi-people"></i></div>
          <div class="settings-card-label">${t('duplicates.title')}</div>
          <div class="settings-card-desc">${t('duplicates.cardDesc')}</div>
        </a>
        <a href="/admin/consistency" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(255,59,48,0.1);color:#FF3B30"><i class="bi bi-exclamation-triangle"></i></div>
          <div class="settings-card-label">${t('consistency.title')}</div>
          <div class="settings-card-desc">${t('consistency.cardDesc')}</div>
        </a>
        <a href="/admin/addresses" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(52,199,89,0.1);color:#34C759"><i class="bi bi-geo-alt"></i></div>
          <div class="settings-card-label">${t('addresses.mergeDuplicates')}</div>
          <div class="settings-card-desc">${t('settings.addressesCardDesc')}</div>
        </a>
        <a href="/admin/relationships" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(175,82,222,0.1);color:#AF52DE"><i class="bi bi-diagram-3"></i></div>
          <div class="settings-card-label">${t('relationships.suggestions')}</div>
          <div class="settings-card-desc">${t('settings.relationshipsCardDesc')}</div>
        </a>
        <a href="/admin/integrations" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(0,199,190,0.1);color:#00C7BE"><i class="bi bi-cloud-arrow-down"></i></div>
          <div class="settings-card-label">${t('settings.integrations')}</div>
          <div class="settings-card-desc">${t('settings.integrationsDesc')}</div>
        </a>
        ${state.user?.is_system_admin ? `
        <a href="/admin/system" data-link class="settings-card glass-card">
          <div class="settings-card-icon" style="background:rgba(88,86,214,0.1);color:#5856D6"><i class="bi bi-buildings"></i></div>
          <div class="settings-card-label">${t('settings.manageTenants')}</div>
          <div class="settings-card-desc">${t('settings.systemAdminDesc')}</div>
        </a>
        ` : ''}
      </div>
    </div>
  `;
}
