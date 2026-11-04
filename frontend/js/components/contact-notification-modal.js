import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';
import { attachContactSearch } from './contact-search.js';
import { authUrl } from '../utils/auth-url.js';

/**
 * Per-contact notification overrides (user_notification_overrides) — one
 * modal used from /settings/notifications ("Spesifikke kontakter") and from
 * the contact profile's ⋯ menu. Each type is "follow rule" / "always" /
 * "never"; saving diffs against the stored overrides.
 */

export const NOTIFICATION_TYPE_LABELS = {
  birthday: 'notifications.types.birthday',
  anniversary: 'notifications.types.anniversary',
  reminder: 'notifications.types.reminder',
  memory: 'notifications.types.memory',
  family_post: 'notifications.types.familyPost',
  family_comment: 'notifications.types.familyComment',
};

// Same icon mapping as navbar, so a birthday means the same thing everywhere.
export const NOTIFICATION_TYPE_ICONS = {
  birthday: 'cake2',
  anniversary: 'calendar-heart',
  reminder: 'bell',
  memory: 'clock-history',
  family_post: 'chat-square-text',
  family_comment: 'chat-left-text',
};

export const NOTIFICATION_TYPE_COLORS = {
  birthday: { bg: 'rgba(255,149,0,0.12)', fg: '#FF9500' },
  anniversary: { bg: 'rgba(255,45,85,0.12)', fg: '#FF2D55' },
  reminder: { bg: 'rgba(0,122,255,0.12)', fg: '#007AFF' },
  memory: { bg: 'rgba(255,149,0,0.12)', fg: '#FF9500' },
  family_post: { bg: 'rgba(52,199,89,0.12)', fg: '#34C759' },
  family_comment: { bg: 'rgba(88,86,214,0.12)', fg: '#5856D6' },
};

/**
 * @param {object} [opts]
 * @param {object|null} [opts.contact] — { uuid, first_name, last_name, avatar }; null shows a contact search
 * @param {() => void} [opts.onSaved]
 */
export function openContactNotificationModal({ contact = null, onSaved } = {}) {
  const mid = 'contact-notif-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${t('notifications.contactModalTitle')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${t('common.close')}"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <div class="position-relative">
                <input type="text" class="form-control d-none" id="${mid}-search" placeholder="${t('common.search')}" autocomplete="off">
              </div>
              <div id="${mid}-picked" class="d-none"></div>
            </div>
            <div id="${mid}-types-wrap" class="d-none">
              <div class="d-flex flex-wrap gap-2 mb-3">
                <button type="button" class="btn btn-outline-danger btn-sm" data-set-all="never">
                  <i class="bi bi-bell-slash me-1"></i>${t('notifications.muteContact')}
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-set-all="default">
                  ${t('notifications.resetContact')}
                </button>
              </div>
              <p class="text-muted small mb-2">${t('notifications.overridesPerType')}</p>
              <div id="${mid}-types" class="override-type-list"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${mid}-save" disabled>${t('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  const searchInput = document.getElementById(`${mid}-search`);
  const pickedEl = document.getElementById(`${mid}-picked`);
  const typesWrap = document.getElementById(`${mid}-types-wrap`);
  const typeListEl = document.getElementById(`${mid}-types`);
  const saveBtn = document.getElementById(`${mid}-save`);

  let picked = null;
  let existingByType = new Map();
  let search = null;

  modalEl.addEventListener('hidden.bs.modal', () => {
    search?.destroy?.();
    modalEl.remove();
  }, { once: true });

  function renderTypeList(modes) {
    typeListEl.innerHTML = Object.keys(NOTIFICATION_TYPE_LABELS).map(key => {
      const colors = NOTIFICATION_TYPE_COLORS[key];
      const mode = modes[key] || 'default';
      return `
        <div class="override-type-pick" data-type="${key}">
          <div class="override-type-pick-label">
            <span class="override-type-icon" style="background:${colors.bg};color:${colors.fg}">
              <i class="bi bi-${NOTIFICATION_TYPE_ICONS[key]}"></i>
            </span>
            <span>${t(NOTIFICATION_TYPE_LABELS[key])}</span>
          </div>
          <div class="override-mode-pill" data-mode="${mode}">
            <span class="override-mode-option ${mode === 'default' ? 'active' : ''}" data-val="default">${t('notifications.modeDefault')}</span>
            <span class="override-mode-option override-mode-always-option ${mode === 'always' ? 'active' : ''}" data-val="always"><i class="bi bi-check-circle"></i> ${t('notifications.modeAlways')}</span>
            <span class="override-mode-option override-mode-never-option ${mode === 'never' ? 'active' : ''}" data-val="never"><i class="bi bi-slash-circle"></i> ${t('notifications.modeNever')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  typeListEl.addEventListener('click', (e) => {
    const opt = e.target.closest('.override-mode-option');
    if (!opt) return;
    const pill = opt.closest('.override-mode-pill');
    pill.querySelectorAll('.override-mode-option').forEach(o => o.classList.toggle('active', o === opt));
    pill.dataset.mode = opt.dataset.val;
  });

  typesWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-set-all]');
    if (!btn) return;
    renderTypeList(Object.fromEntries(Object.keys(NOTIFICATION_TYPE_LABELS).map(k => [k, btn.dataset.setAll])));
  });

  async function pick(c) {
    picked = c;
    const initials = (c.first_name?.[0] || '') + (c.last_name?.[0] || '');
    pickedEl.innerHTML = `
      <span class="contact-chip">
        <span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${escapeHtml(initials)}</span>`}</span>
        ${escapeHtml(c.first_name)} ${escapeHtml(c.last_name || '')}
        ${contact ? '' : '<button type="button" class="contact-chip-remove">×</button>'}
      </span>
    `;
    pickedEl.classList.remove('d-none');
    searchInput.classList.add('d-none');
    pickedEl.querySelector('.contact-chip-remove')?.addEventListener('click', unpick);

    const { overrides } = await api.get('/notifications/overrides');
    existingByType = new Map(overrides.filter(o => o.contact_uuid === c.uuid).map(o => [o.type, o]));
    renderTypeList(Object.fromEntries([...existingByType].map(([type, o]) => [type, o.mode])));
    typesWrap.classList.remove('d-none');
    saveBtn.disabled = false;
  }

  function unpick() {
    picked = null;
    pickedEl.classList.add('d-none');
    typesWrap.classList.add('d-none');
    saveBtn.disabled = true;
    searchInput.value = '';
    searchInput.classList.remove('d-none');
    searchInput.focus();
  }

  saveBtn.addEventListener('click', async () => {
    if (!picked) return;
    const calls = [];
    typeListEl.querySelectorAll('.override-type-pick').forEach(row => {
      const type = row.dataset.type;
      const mode = row.querySelector('.override-mode-pill').dataset.mode;
      const existing = existingByType.get(type);
      if (mode === 'default') {
        if (existing) calls.push(api.delete(`/notifications/overrides/${existing.id}`));
      } else if (!existing || existing.mode !== mode) {
        calls.push(api.post('/notifications/overrides', { contact_uuid: picked.uuid, type, mode }));
      }
    });
    saveBtn.disabled = true;
    try {
      await Promise.all(calls);
      modal.hide();
      onSaved?.();
    } catch (err) {
      saveBtn.disabled = false;
      const { confirmDialog } = await import('./dialogs.js');
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  if (contact) {
    pick(contact).catch(() => {});
  } else {
    searchInput.classList.remove('d-none');
    search = attachContactSearch(searchInput, {
      onSelect: (c) => { search.clear(); pick(c); },
    });
    modalEl.addEventListener('shown.bs.modal', () => searchInput.focus(), { once: true });
  }

  modal.show();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
