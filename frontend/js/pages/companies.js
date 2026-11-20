import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { openCreateGroupDialog, groupPathText, GROUP_TYPES as TYPES, GROUP_TYPE_ICONS as TYPE_ICONS } from '../components/group-picker.js';

export async function renderCompanies() {
  const content = document.getElementById('app-content');

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2><i class="bi bi-people-fill"></i> ${t('groups.title')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-add-company">
          <i class="bi bi-plus-lg"></i> ${t('groups.newGroup')}
        </button>
      </div>
      <div class="d-flex gap-2 mb-3">
        <select class="form-select form-select-sm" id="type-filter" style="width:auto">
          <option value="">${t('groups.allTypes')}</option>
          ${TYPES.map(tp => `<option value="${tp}" ${localStorage.getItem('groups.typeFilter') === tp ? 'selected' : ''}>${t('groups.types.' + tp)}</option>`).join('')}
        </select>
        <input type="text" class="form-control form-control-sm" id="group-search" placeholder="${t('common.search')}" style="max-width:250px">
      </div>
      <div id="companies-list">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>

  `;

  await loadCompanies();

  // Search (debounced)
  let searchTimeout;
  document.getElementById('group-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadCompanies(), 300);
  });

  document.getElementById('type-filter').addEventListener('change', (e) => {
    if (e.target.value) localStorage.setItem('groups.typeFilter', e.target.value);
    else localStorage.removeItem('groups.typeFilter');
    loadCompanies();
  });

  document.getElementById('btn-add-company').addEventListener('click', () => {
    openCreateGroupDialog({ type: document.getElementById('type-filter')?.value || null });
  });
}

async function loadCompanies() {
  const el = document.getElementById('companies-list');
  if (!el) return;

  try {
    const typeFilter = document.getElementById('type-filter')?.value;
    const searchFilter = document.getElementById('group-search')?.value.trim();
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (searchFilter) params.set('search', searchFilter);
    // Browsing shows top-level groups; search and type filter cover all levels
    // (with the path shown) so "9A" or every "Klasse" is still one step away.
    if (!typeFilter && !searchFilter) params.set('top_level', '1');
    const qs = params.toString() ? `?${params}` : '';
    const { companies } = await api.get(`/companies${qs}`);

    if (!companies.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-people"></i>
          <p>${t('companies.noCompanies')}</p>
        </div>
      `;
      return;
    }

    el.innerHTML = `<div class="contacts-list">${companies.map(c => {
      const icon = TYPE_ICONS[c.type] || 'bi-people';
      return `
      <a href="/groups/${c.uuid}" data-link class="contact-card">
        <div class="contact-avatar" style="background:var(--color-text-secondary)">
          ${c.logo_path
            ? `<img src="${authUrl(c.logo_path)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-full)">`
            : `<i class="bi ${icon}" style="color:#fff;font-size:1rem"></i>`}
        </div>
        <div class="contact-info">
          <div class="contact-name">${escapeHtml(c.name)}</div>
          ${groupPathText(c) ? `<div class="contact-meta"><i class="bi bi-arrow-return-right"></i> ${escapeHtml(groupPathText(c))}</div>` : ''}
          ${c.subgroup_count ? `<div class="contact-meta"><i class="bi bi-diagram-3"></i> ${t('groups.subgroupCount', { count: c.subgroup_count })}</div>` : ''}
          ${!groupPathText(c) && !c.subgroup_count && c.industry ? `<div class="contact-meta">${escapeHtml(c.industry)}</div>` : ''}
        </div>
        <div class="contact-badges">
          <span class="badge bg-light text-muted badge-sm">${c.total_member_count} <i class="bi bi-people"></i></span>
          <span class="badge bg-light text-muted badge-sm">${t('groups.types.' + (c.type || 'other'))}</span>
        </div>
      </a>`;
    }).join('')}</div>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
