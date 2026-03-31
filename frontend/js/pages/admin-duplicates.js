import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { authUrl } from '../utils/auth-url.js';

export async function renderDuplicates() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-people"></i> ${t('duplicates.title')}</h2>
        <div></div>
      </div>
      <p class="text-muted small mb-3">${t('duplicates.desc')}</p>
      <div id="duplicates-list"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));
  await loadDuplicates();
}

async function loadDuplicates() {
  const el = document.getElementById('duplicates-list');
  if (!el) return;

  try {
    const { duplicates } = await api.get('/contacts/tools/duplicates');

    if (!duplicates.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-check-circle"></i>
          <p>${t('duplicates.none')}</p>
        </div>`;
      return;
    }

    el.innerHTML = `
      <p class="text-muted small mb-2">${t('duplicates.found', { count: duplicates.length })}</p>
      ${duplicates.map((d, i) => `
        <div class="settings-section glass-card mb-2 duplicate-card" data-index="${i}">
          <div class="d-flex align-items-center gap-3 flex-wrap">
            <div class="d-flex align-items-center gap-2 flex-fill">
              ${renderContactChip(d.contact1)}
              <div class="text-center">
                <span class="badge ${d.score >= 80 ? 'bg-danger' : d.score >= 60 ? 'bg-warning text-dark' : 'bg-secondary'} badge-sm">${d.score}%</span>
                <div class="text-muted" style="font-size:0.65rem">${d.reasons.map(r => t('duplicates.reason.' + r)).join(', ')}</div>
              </div>
              ${renderContactChip(d.contact2)}
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-primary btn-sm btn-merge" data-keep="${d.contact1.uuid}" data-merge="${d.contact2.uuid}" title="${t('duplicates.keepFirst')}">
                <i class="bi bi-arrow-left"></i> ${t('duplicates.keep')}
              </button>
              <button class="btn btn-outline-primary btn-sm btn-merge" data-keep="${d.contact2.uuid}" data-merge="${d.contact1.uuid}" title="${t('duplicates.keepSecond')}">
                ${t('duplicates.keep')} <i class="bi bi-arrow-right"></i>
              </button>
              <button class="btn btn-outline-secondary btn-sm btn-dismiss-dup" data-index="${i}" title="${t('duplicates.notDuplicate')}">
                <i class="bi bi-x"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    `;

    // Merge handlers
    el.querySelectorAll('.btn-merge').forEach(btn => {
      btn.addEventListener('click', async () => {
        const keepUuid = btn.dataset.keep;
        const mergeUuid = btn.dataset.merge;
        const ok = await confirmDialog(t('duplicates.mergeConfirm'), {
          title: t('duplicates.merge'),
          confirmText: t('duplicates.merge'),
        });
        if (!ok) return;
        try {
          await api.post('/contacts/tools/merge', { keep_uuid: keepUuid, merge_uuid: mergeUuid });
          btn.closest('.duplicate-card').remove();
          const remaining = el.querySelectorAll('.duplicate-card').length;
          if (!remaining) loadDuplicates();
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      });
    });

    // Dismiss
    el.querySelectorAll('.btn-dismiss-dup').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.duplicate-card').remove();
        const remaining = el.querySelectorAll('.duplicate-card').length;
        if (!remaining) loadDuplicates();
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderContactChip(c) {
  return `
    <a href="/contacts/${c.uuid}" data-link class="contact-chip">
      <span class="contact-chip-avatar">
        ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`}
      </span>
      ${c.first_name} ${c.last_name || ''}
      ${c.birth_year ? `<span class="text-muted small">(${c.birth_year})</span>` : ''}
    </a>`;
}
