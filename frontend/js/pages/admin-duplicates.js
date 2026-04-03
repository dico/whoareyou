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
        </div>
        <div class="text-center mt-3">
          <button class="btn btn-link btn-sm text-muted" id="btn-show-dismissed-dup">${t('duplicates.showDismissed')}</button>
        </div>`;
      setupDismissedButton(el);
      return;
    }

    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted small">${t('duplicates.found', { count: duplicates.length })}</span>
        <button class="btn btn-link btn-sm text-muted" id="btn-show-dismissed-dup">${t('duplicates.showDismissed')}</button>
      </div>
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
              <button class="btn btn-outline-secondary btn-sm btn-dismiss-dup" data-c1="${d.contact1.uuid}" data-c2="${d.contact2.uuid}" title="${t('duplicates.notDuplicate')}">
                <i class="bi bi-x"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    `;

    const duplicatesData = duplicates;

    // Merge handlers
    el.querySelectorAll('.btn-merge').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog(t('duplicates.mergeConfirm'), {
          title: t('duplicates.merge'),
          confirmText: t('duplicates.merge'),
        });
        if (!ok) return;
        try {
          await api.post('/contacts/tools/merge', { keep_uuid: btn.dataset.keep, merge_uuid: btn.dataset.merge });
          btn.closest('.duplicate-card').remove();
          if (!el.querySelectorAll('.duplicate-card').length) loadDuplicates();
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      });
    });

    // Dismiss (persist to backend)
    el.querySelectorAll('.btn-dismiss-dup').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.post('/contacts/tools/dismiss-duplicate', {
            contact1_uuid: btn.dataset.c1,
            contact2_uuid: btn.dataset.c2,
          });
        } catch { /* ignore */ }
        btn.closest('.duplicate-card').remove();
        if (!el.querySelectorAll('.duplicate-card').length) loadDuplicates();
      });
    });

    setupDismissedButton(el);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function setupDismissedButton(el) {
  document.getElementById('btn-show-dismissed-dup')?.addEventListener('click', async () => {
    try {
      const { dismissed } = await api.get('/contacts/tools/dismissed-duplicates');
      if (!dismissed.length) {
        confirmDialog(t('duplicates.noDismissed'), { title: t('duplicates.dismissed'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        return;
      }
      const mid = 'dismissed-dup-' + Date.now();
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="${mid}" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content glass-card">
              <div class="modal-header">
                <h5 class="modal-title">${t('duplicates.dismissed')} (${dismissed.length})</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" style="max-height:400px;overflow-y:auto">
                ${dismissed.map(d => `
                  <div class="d-flex align-items-center flex-wrap gap-2 py-2 dismissed-dup-row">
                    <a href="/contacts/${d.contact1_uuid}" data-link class="contact-chip">
                      <span class="contact-chip-avatar">${d.contact1_avatar ? `<img src="${authUrl(d.contact1_avatar)}" alt="">` : `<span>${(d.contact1_first[0] || '')}${(d.contact1_last?.[0] || '')}</span>`}</span>
                      ${d.contact1_first} ${d.contact1_last || ''}
                    </a>
                    <span class="text-muted small">&</span>
                    <a href="/contacts/${d.contact2_uuid}" data-link class="contact-chip">
                      <span class="contact-chip-avatar">${d.contact2_avatar ? `<img src="${authUrl(d.contact2_avatar)}" alt="">` : `<span>${(d.contact2_first[0] || '')}${(d.contact2_last?.[0] || '')}</span>`}</span>
                      ${d.contact2_first} ${d.contact2_last || ''}
                    </a>
                    <button class="btn btn-outline-primary btn-sm ms-auto btn-restore-dup" data-c1="${d.contact1_uuid}" data-c2="${d.contact2_uuid}">
                      <i class="bi bi-arrow-counterclockwise me-1"></i>${t('duplicates.restore')}
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>`);
      const modalEl = document.getElementById(mid);
      const modal = new bootstrap.Modal(modalEl);
      modalEl.querySelectorAll('.btn-restore-dup').forEach(btn => {
        btn.addEventListener('click', async () => {
          await api.post('/contacts/tools/restore-duplicate', {
            contact1_uuid: btn.dataset.c1, contact2_uuid: btn.dataset.c2,
          });
          btn.closest('.dismissed-dup-row').remove();
          if (!modalEl.querySelectorAll('.dismissed-dup-row').length) { modal.hide(); loadDuplicates(); }
        });
      });
      modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); loadDuplicates(); }, { once: true });
      modal.show();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
    }
  });
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
