import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t, getLocale, setLocale } from '../utils/i18n.js';
import { renderNavbar } from '../components/navbar.js';

export async function renderSettings() {
  const content = document.getElementById('app-content');
  const currentLocale = getLocale();

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2>${t('settings.title')}</h2>
      </div>

      <!-- Account -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-person-circle"></i> ${t('settings.account')}</h4>
        <div class="settings-row">
          <span class="settings-label">${t('settings.name')}</span>
          <span>${state.user?.first_name} ${state.user?.last_name}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">${t('settings.email')}</span>
          <span>${state.user?.email}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">${t('settings.role')}</span>
          <span class="badge bg-${state.user?.role === 'admin' ? 'primary' : 'secondary'}">${state.user?.role}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">${t('settings.language')}</span>
          <select class="form-select form-select-sm" id="language-select" style="width:auto">
            <option value="en" ${currentLocale === 'en' ? 'selected' : ''}>English</option>
            <option value="nb" ${currentLocale === 'nb' ? 'selected' : ''}>Norsk bokmål</option>
          </select>
        </div>
      </div>

      <!-- Tenant admin -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-people"></i> ${t('settings.familyHousehold')}</h4>
        <div class="settings-row">
          <span class="settings-label">${t('settings.tenant')}</span>
          <span>${state.user?.tenant_name || t('settings.unknown')}</span>
        </div>
        ${state.user?.role === 'admin' ? `
          <a href="/admin/tenant" data-link class="btn btn-outline-primary btn-sm mt-2">
            <i class="bi bi-gear me-1"></i>${t('settings.manageMembers')}
          </a>
        ` : ''}
      </div>

      <!-- System admin -->
      ${state.user?.is_system_admin ? `
      <div class="settings-section glass-card">
        <h4><i class="bi bi-shield-lock"></i> ${t('settings.systemAdmin')}</h4>
        <p class="text-muted small">${t('settings.systemAdminDesc')}</p>
        <a href="/admin/system" data-link class="btn btn-outline-primary btn-sm">
          <i class="bi bi-buildings me-1"></i>${t('settings.manageTenants')}
        </a>
      </div>
      ` : ''}
    </div>
  `;

  // Language switcher
  document.getElementById('language-select').addEventListener('change', async (e) => {
    const locale = e.target.value;
    localStorage.setItem('locale', locale);
    try {
      await api.patch('/auth/language', { language: locale });
      if (state.user) state.user.language = locale;
    } catch {}
    await setLocale(locale);
    // Re-render navbar and current page
    renderNavbar();
    renderSettings();
  });
}
