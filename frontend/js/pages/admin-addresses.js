import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';

export async function renderAddressMerge() {
  const content = document.getElementById('app-content');

  if (state.user?.role !== 'admin') {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.accessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-geo-alt"></i> ${t('addresses.mergeDuplicates')}</h2>
        <div></div>
      </div>
      <div id="duplicates-list">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));
  await loadDuplicates();
}

async function loadDuplicates() {
  const el = document.getElementById('duplicates-list');
  if (!el) return;

  try {
    const { duplicates, total } = await api.get('/addresses/duplicates');

    if (total === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-check-circle"></i>
          <p>${t('addresses.noDuplicates')}</p>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <p class="text-muted mb-3">${t('addresses.duplicatesFound', { count: total })}</p>
      <button class="btn btn-primary btn-sm mb-3" id="btn-merge-all">
        <i class="bi bi-arrows-collapse me-1"></i>${t('addresses.mergeAll')}
      </button>
      ${duplicates.map((group, gi) => `
        <div class="settings-section glass-card mb-3 duplicate-group" data-group-index="${gi}">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h5 class="mb-1">${escapeHtml(group.street)}</h5>
              <span class="text-muted small">${[group.postal_code, group.city].filter(Boolean).join(' ')}</span>
            </div>
            <button class="btn btn-outline-primary btn-sm btn-merge-group" data-group-index="${gi}">
              <i class="bi bi-arrows-collapse me-1"></i>${t('addresses.merge')}
            </button>
          </div>
          <div class="mt-2">
            ${group.addresses.map(a => `
              <div class="d-flex align-items-center gap-2 py-1 ${a.has_coords ? '' : 'text-muted'}" style="font-size:0.85rem">
                <span class="badge bg-${a.has_coords ? 'success' : 'secondary'}" style="font-size:0.65rem">
                  ID ${a.id} ${a.has_coords ? '📍' : ''}
                </span>
                <span>
                  ${a.contacts.length
                    ? a.contacts.map(c => `${c.first_name} ${c.last_name || ''}${c.moved_out_at ? ' <span class="text-muted">(prev)</span>' : ''}`).join(', ')
                    : `<span class="text-muted">${t('addresses.noCurrentResidents')}</span>`
                  }
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;

    // Store data for merge
    const groupsData = duplicates;

    // Merge single group
    el.querySelectorAll('.btn-merge-group').forEach(btn => {
      btn.addEventListener('click', async () => {
        const group = groupsData[parseInt(btn.dataset.groupIndex)];
        await mergeGroup(group);
      });
    });

    // Merge all
    document.getElementById('btn-merge-all')?.addEventListener('click', async () => {
      if (!await confirmDialog(t('addresses.mergeAllConfirm', { count: total }), {
        title: t('addresses.mergeAll'),
        confirmText: t('addresses.mergeAll'),
        confirmClass: 'btn-primary',
      })) return;

      let merged = 0;
      for (const group of groupsData) {
        try {
          await mergeGroup(group, false);
          merged++;
        } catch {}
      }
      await confirmDialog(t('addresses.mergeComplete', { count: merged }), {
        title: t('addresses.mergeDuplicates'),
        confirmText: t('common.ok'),
        confirmClass: 'btn-primary',
      });
      loadDuplicates();
    });

  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function mergeGroup(group, reload = true) {
  // Keep the one with coordinates, or the first one
  const keepAddr = group.addresses.find(a => a.has_coords) || group.addresses[0];
  const mergeIds = group.addresses.filter(a => a.id !== keepAddr.id).map(a => a.id);

  await api.post('/addresses/merge', {
    keep_id: keepAddr.id,
    merge_ids: mergeIds,
  });

  if (reload) loadDuplicates();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
