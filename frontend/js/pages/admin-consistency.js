import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { authUrl } from '../utils/auth-url.js';

export async function renderConsistencyReport() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-exclamation-triangle"></i> ${t('consistency.title')}</h2>
        <div></div>
      </div>
      <p class="text-muted small mb-3">${t('consistency.desc')}</p>
      <div id="consistency-list"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));

  try {
    const { issues } = await api.get('/relationships/consistency');
    const el = document.getElementById('consistency-list');

    if (!issues.length) {
      el.innerHTML = `<div class="empty-state"><i class="bi bi-check-circle"></i><p>${t('consistency.noIssues')}</p></div>`;
      return;
    }

    el.innerHTML = `
      <p class="text-muted small mb-2">${t('consistency.found', { count: issues.length })}</p>
      ${issues.map((issue, i) => `
        <div class="settings-section glass-card mb-2 consistency-issue" data-rel-id="${issue.rel_id}">
          <div class="d-flex align-items-center flex-wrap gap-2">
            <span class="badge ${issue.severity === 'high' ? 'bg-danger' : issue.severity === 'medium' ? 'bg-warning text-dark' : 'bg-secondary'} badge-sm">${issue.severity}</span>
            <a href="/contacts/${issue.contact1.uuid}" data-link class="contact-chip">
              <span class="contact-chip-avatar">${issue.contact1.avatar ? `<img src="${authUrl(issue.contact1.avatar)}" alt="">` : `<span>${(issue.contact1.first_name[0] || '')}${(issue.contact1.last_name?.[0] || '')}</span>`}</span>
              ${issue.contact1.first_name} ${issue.contact1.last_name || ''}
            </a>
            <span class="text-muted small">${t('relationships.types.' + issue.rel_type) || issue.rel_type}</span>
            <a href="/contacts/${issue.contact2.uuid}" data-link class="contact-chip">
              <span class="contact-chip-avatar">${issue.contact2.avatar ? `<img src="${authUrl(issue.contact2.avatar)}" alt="">` : `<span>${(issue.contact2.first_name[0] || '')}${(issue.contact2.last_name?.[0] || '')}</span>`}</span>
              ${issue.contact2.first_name} ${issue.contact2.last_name || ''}
            </a>
            <span class="text-muted small flex-fill">${issue.message}</span>
            <div class="d-flex gap-1">
              <button class="btn btn-outline-warning btn-sm btn-swap" data-rel-id="${issue.rel_id}" title="${t('relationships.swap')}">
                <i class="bi bi-arrow-left-right"></i>
              </button>
              <button class="btn btn-outline-danger btn-sm btn-delete-rel" data-rel-id="${issue.rel_id}" title="${t('common.delete')}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    `;

    // Swap direction
    el.querySelectorAll('.btn-swap').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.put(`/relationships/${btn.dataset.relId}`, { swap: true });
        renderConsistencyReport();
      });
    });

    // Delete relationship
    el.querySelectorAll('.btn-delete-rel').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmDialog(t('relationships.deleteConfirm'))) return;
        await api.delete(`/relationships/${btn.dataset.relId}`);
        btn.closest('.consistency-issue').remove();
        if (!el.querySelectorAll('.consistency-issue').length) renderConsistencyReport();
      });
    });
  } catch (err) {
    document.getElementById('consistency-list').innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}
