import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { confirmDialog } from '../components/dialogs.js';
import { t } from '../utils/i18n.js';

export async function renderTenantAdmin() {
  const content = document.getElementById('app-content');

  if (state.user?.role !== 'admin') {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.accessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2>${t('admin.manageMembers')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-invite" disabled title="${t('admin.comingSoon')}">
          <i class="bi bi-person-plus-fill"></i> ${t('admin.invite')}
        </button>
      </div>

      <div class="settings-section glass-card">
        <h4><i class="bi bi-people"></i> ${state.user?.tenant_name || t('settings.familyHousehold')}</h4>
        <p class="text-muted small">${t('admin.householdDesc')}</p>
        <div id="members-list" class="mt-3">
          <div class="loading">${t('admin.loadingMembers')}</div>
        </div>
      </div>

      <div class="settings-section glass-card">
        <h4><i class="bi bi-info-circle"></i> ${t('admin.plannedFeatures')}</h4>
        <p class="text-muted small">${t('admin.memberListNote')}</p>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));
  await loadMembers();
}

async function loadMembers() {
  const el = document.getElementById('members-list');
  if (!el) return;

  el.innerHTML = `
    <div class="member-row">
      <div class="member-avatar">
        <span>${state.user.first_name[0]}${state.user.last_name[0]}</span>
      </div>
      <div class="member-info">
        <strong>${state.user.first_name} ${state.user.last_name}</strong>
        <span class="text-muted small">${state.user.email}</span>
      </div>
      <span class="badge bg-primary">${state.user.role}</span>
      ${state.user.is_system_admin ? `<span class="badge bg-dark ms-1">${t('nav.systemAdmin')}</span>` : ''}
    </div>
  `;
}
