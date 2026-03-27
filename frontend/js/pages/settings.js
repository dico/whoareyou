import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t, getLocale, setLocale } from '../utils/i18n.js';
import { renderNavbar } from '../components/navbar.js';
import { confirmDialog } from '../components/dialogs.js';

export async function renderSettings() {
  const content = document.getElementById('app-content');
  const currentLocale = getLocale();

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2>${t('settings.title')}</h2>
      </div>

      <!-- Profile -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-person-circle"></i> ${t('settings.account')}</h4>
        <div id="profile-view">
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
          <div class="mt-3 d-flex gap-2">
            <button class="btn btn-outline-primary btn-sm" id="btn-edit-profile">
              <i class="bi bi-pencil me-1"></i>${t('settings.editProfile')}
            </button>
            <button class="btn btn-outline-secondary btn-sm" id="btn-change-password">
              <i class="bi bi-key me-1"></i>${t('settings.changePassword')}
            </button>
          </div>
        </div>

        <!-- Edit profile form (hidden) -->
        <form id="profile-edit-form" class="d-none">
          <div class="row g-2 mb-2">
            <div class="col">
              <div class="form-floating">
                <input type="text" class="form-control" id="edit-first-name" value="${escapeAttr(state.user?.first_name || '')}" required>
                <label>${t('auth.firstName')}</label>
              </div>
            </div>
            <div class="col">
              <div class="form-floating">
                <input type="text" class="form-control" id="edit-last-name" value="${escapeAttr(state.user?.last_name || '')}" required>
                <label>${t('auth.lastName')}</label>
              </div>
            </div>
          </div>
          <div class="form-floating mb-2">
            <input type="email" class="form-control" id="edit-email" value="${escapeAttr(state.user?.email || '')}" required>
            <label>${t('auth.email')}</label>
          </div>
          <div id="profile-edit-error" class="alert alert-danger d-none"></div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary btn-sm">${t('common.save')}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-cancel-edit">${t('common.cancel')}</button>
          </div>
        </form>

        <!-- Change password form (hidden) -->
        <form id="password-form" class="d-none">
          <div class="form-floating mb-2">
            <input type="password" class="form-control" id="current-password" required>
            <label>${t('settings.currentPassword')}</label>
          </div>
          <div class="form-floating mb-2">
            <input type="password" class="form-control" id="new-password" minlength="8" required>
            <label>${t('settings.newPassword')}</label>
          </div>
          <div id="password-error" class="alert alert-danger d-none"></div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary btn-sm">${t('settings.changePassword')}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-cancel-password">${t('common.cancel')}</button>
          </div>
        </form>
      </div>

      <!-- Tenant admin -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-people"></i> ${t('settings.familyHousehold')}</h4>
        <div class="settings-row">
          <span class="settings-label">${t('settings.tenant')}</span>
          <span>${state.user?.tenant_name || t('settings.unknown')}</span>
        </div>
        ${state.user?.role === 'admin' ? `
          <div class="d-flex gap-2 mt-2">
            <a href="/admin/tenant" data-link class="btn btn-outline-primary btn-sm">
              <i class="bi bi-gear me-1"></i>${t('settings.manageMembers')}
            </a>
            <a href="/admin/addresses" data-link class="btn btn-outline-secondary btn-sm">
              <i class="bi bi-geo-alt me-1"></i>${t('addresses.mergeDuplicates')}
            </a>
            <a href="/admin/labels" data-link class="btn btn-outline-secondary btn-sm">
              <i class="bi bi-tags me-1"></i>${t('labels.manage')}
            </a>
          </div>
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
    renderNavbar();
    renderSettings();
  });

  // Edit profile toggle
  document.getElementById('btn-edit-profile').addEventListener('click', () => {
    document.getElementById('profile-view').classList.add('d-none');
    document.getElementById('profile-edit-form').classList.remove('d-none');
    document.getElementById('edit-first-name').focus();
  });

  document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    document.getElementById('profile-view').classList.remove('d-none');
    document.getElementById('profile-edit-form').classList.add('d-none');
  });

  // Save profile
  document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('profile-edit-error');
    errorEl.classList.add('d-none');
    try {
      const { user } = await api.put('/auth/profile', {
        first_name: document.getElementById('edit-first-name').value,
        last_name: document.getElementById('edit-last-name').value,
        email: document.getElementById('edit-email').value,
      });
      state.user = { ...state.user, ...user };
      renderNavbar();
      renderSettings();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

  // Change password toggle
  document.getElementById('btn-change-password').addEventListener('click', () => {
    document.getElementById('profile-view').classList.add('d-none');
    document.getElementById('password-form').classList.remove('d-none');
    document.getElementById('current-password').focus();
  });

  document.getElementById('btn-cancel-password').addEventListener('click', () => {
    document.getElementById('profile-view').classList.remove('d-none');
    document.getElementById('password-form').classList.add('d-none');
  });

  // Save password
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('password-error');
    errorEl.classList.add('d-none');
    try {
      await api.post('/auth/change-password', {
        current_password: document.getElementById('current-password').value,
        new_password: document.getElementById('new-password').value,
      });
      await confirmDialog(t('settings.passwordChanged'), {
        title: t('settings.changePassword'),
        confirmText: t('common.ok'),
        confirmClass: 'btn-primary',
      });
      renderSettings();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
