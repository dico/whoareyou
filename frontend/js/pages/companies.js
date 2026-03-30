import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { authUrl } from '../utils/auth-url.js';

export async function renderCompanies() {
  const content = document.getElementById('app-content');

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2><i class="bi bi-building"></i> ${t('companies.title')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-add-company">
          <i class="bi bi-plus-lg"></i> ${t('contacts.new')}
        </button>
      </div>
      <div id="companies-list">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>

    <!-- Add company modal -->
    <div class="modal fade" id="add-company-modal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('companies.newCompany')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="add-company-form">
            <div class="modal-body">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="new-company-name" required>
                <label>${t('companies.name')}</label>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="new-company-industry">
                <label>${t('companies.industry')}</label>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="new-company-website" placeholder="example.com">
                <label>${t('companies.website')}</label>
              </div>
              <div id="add-company-error" class="alert alert-danger d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('contacts.create')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  await loadCompanies();

  document.getElementById('btn-add-company').addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('add-company-modal')).show();
  });

  document.getElementById('add-company-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-company-error');
    errorEl.classList.add('d-none');
    try {
      const { company } = await api.post('/companies', {
        name: document.getElementById('new-company-name').value,
        industry: document.getElementById('new-company-industry').value || undefined,
        website: (() => { let w = document.getElementById('new-company-website').value.trim(); if (w && !w.match(/^https?:\/\//)) w = 'https://' + w; return w || undefined; })(),
      });
      bootstrap.Modal.getInstance(document.getElementById('add-company-modal')).hide();
      navigate(`/companies/${company.uuid}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}

async function loadCompanies() {
  const el = document.getElementById('companies-list');
  if (!el) return;

  try {
    const { companies } = await api.get('/companies');

    if (!companies.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-building"></i>
          <p>${t('companies.noCompanies')}</p>
        </div>
      `;
      return;
    }

    el.innerHTML = `<div class="contacts-list">${companies.map(c => `
      <a href="/companies/${c.uuid}" data-link class="contact-card">
        <div class="contact-avatar" style="background:var(--color-text-secondary)">
          ${c.logo_path
            ? `<img src="${authUrl(c.logo_path)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:var(--radius-full)">`
            : `<i class="bi bi-building" style="color:#fff;font-size:1rem"></i>`}
        </div>
        <div class="contact-info">
          <div class="contact-name">${escapeHtml(c.name)}</div>
          ${c.industry ? `<div class="contact-meta">${escapeHtml(c.industry)}</div>` : ''}
        </div>
        <div class="contact-badges">
          <span class="badge bg-light text-muted badge-sm">${c.employee_count} <i class="bi bi-people"></i></span>
        </div>
      </a>
    `).join('')}</div>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
