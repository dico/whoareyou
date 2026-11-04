import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { openContactNotificationModal, NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_ICONS, NOTIFICATION_TYPE_COLORS } from '../components/contact-notification-modal.js';
import { authUrl } from '../utils/auth-url.js';
import { pushSupported, pushPermission, isSubscribed, subscribe, unsubscribe } from '../utils/push.js';

const TYPE_DESCRIPTIONS = {
  birthday: 'notifications.descriptions.birthday',
  anniversary: 'notifications.descriptions.anniversary',
  reminder: 'notifications.descriptions.reminder',
  memory: 'notifications.descriptions.memory',
  family_post: 'notifications.descriptions.familyPost',
  family_comment: 'notifications.descriptions.familyComment',
};

const TYPE_LABELS = NOTIFICATION_TYPE_LABELS;
const TYPE_ICONS = NOTIFICATION_TYPE_ICONS;
const TYPE_ICON_COLORS = NOTIFICATION_TYPE_COLORS;

export async function renderNotificationSettings() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2><i class="bi bi-bell"></i> ${t('notifications.settingsTitle')}</h2>
      </div>
      <p class="text-muted mb-4">${t('notifications.settingsIntro')}</p>

      <div class="glass-card p-3 mb-4" id="push-status-card">
        <div id="push-status-body"></div>
      </div>

      <div class="glass-card p-3 mb-4">
        <h5 class="mb-3">${t('notifications.globalRules')}</h5>
        <div id="prefs-list">
          <div class="loading small">${t('app.loading')}</div>
        </div>
      </div>

      <div class="glass-card p-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">${t('notifications.specificContacts')}</h5>
          <button class="btn btn-primary btn-sm" id="btn-add-override">
            <i class="bi bi-person-plus"></i> ${t('notifications.addOverride')}
          </button>
        </div>
        <p class="text-muted small">${t('notifications.overrideHint')}</p>
        <div id="overrides-list">
          <div class="loading small">${t('app.loading')}</div>
        </div>
      </div>
    </div>

  `;

  let currentState = { prefs: [], overrides: [], meta: {} };

  async function refreshAll() {
    const [prefsData, overridesData] = await Promise.all([
      api.get('/notifications/prefs'),
      api.get('/notifications/overrides'),
    ]);
    currentState = { prefs: prefsData.prefs, overrides: overridesData.overrides, meta: prefsData.meta };
    renderPrefs();
    renderOverrides();
  }

  function renderPrefs() {
    const el = document.getElementById('prefs-list');
    const header = `
      <div class="pref-row pref-header">
        <div class="pref-type"></div>
        <div class="pref-controls">
          <div class="pref-scope-spacer"></div>
          <div class="pref-channels pref-channels-header">
            <div class="pref-channel-head" title="${t('notifications.channelApp')}">
              <i class="bi bi-bell-fill"></i>
            </div>
            <div class="pref-channel-head" title="${t('notifications.channelPush')}">
              <i class="bi bi-phone-fill"></i>
            </div>
            <div class="pref-channel-head" title="${t('notifications.channelEmail')}">
              <i class="bi bi-envelope-fill"></i>
            </div>
          </div>
        </div>
      </div>
    `;
    const rows = currentState.prefs.map(p => {
      const scopes = currentState.meta[p.type] || ['none', 'all'];
      const labelKey = TYPE_LABELS[p.type];
      const descKey = TYPE_DESCRIPTIONS[p.type];
      const icon = TYPE_ICONS[p.type] || 'bell';
      const colors = TYPE_ICON_COLORS[p.type] || { bg: 'rgba(0,0,0,0.06)', fg: 'var(--color-text-secondary)' };
      return `
        <div class="pref-row" data-type="${p.type}">
          <div class="pref-type">
            <span class="pref-type-icon" style="background:${colors.bg};color:${colors.fg}">
              <i class="bi bi-${icon}"></i>
            </span>
            <div class="pref-info">
              <div class="pref-label">${t(labelKey)}</div>
              <div class="pref-desc text-muted small">${t(descKey)}</div>
            </div>
          </div>
          <div class="pref-controls">
            <select class="form-select form-select-sm pref-scope" data-type="${p.type}">
              ${scopes.map(s => `<option value="${s}" ${p.scope === s ? 'selected' : ''}>${t('notifications.scope.' + s)}</option>`).join('')}
            </select>
            <div class="pref-channels">
              <div class="form-check form-switch pref-switch mb-0" title="${t('notifications.channelApp')}">
                <input class="form-check-input pref-deliver-app" type="checkbox" role="switch" data-type="${p.type}" ${p.deliver_app ? 'checked' : ''}>
              </div>
              <div class="form-check form-switch pref-switch mb-0" title="${t('notifications.channelPush')}">
                <input class="form-check-input pref-deliver-push" type="checkbox" role="switch" data-type="${p.type}" ${p.deliver_push ? 'checked' : ''}>
              </div>
              <div class="form-check form-switch pref-switch mb-0" title="${t('notifications.channelEmail')}">
                <input class="form-check-input pref-deliver-email" type="checkbox" role="switch" data-type="${p.type}" ${p.deliver_email ? 'checked' : ''}>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    el.innerHTML = header + rows;

    el.querySelectorAll('.pref-scope').forEach(s => s.addEventListener('change', (e) => savePref(e.target.dataset.type, { scope: e.target.value })));
    el.querySelectorAll('.pref-deliver-app').forEach(c => c.addEventListener('change', (e) => savePref(e.target.dataset.type, { deliver_app: e.target.checked })));
    el.querySelectorAll('.pref-deliver-push').forEach(c => c.addEventListener('change', (e) => savePref(e.target.dataset.type, { deliver_push: e.target.checked })));
    el.querySelectorAll('.pref-deliver-email').forEach(c => c.addEventListener('change', (e) => savePref(e.target.dataset.type, { deliver_email: e.target.checked })));
  }

  async function renderPushStatus() {
    const el = document.getElementById('push-status-body');
    if (!pushSupported()) {
      el.innerHTML = `<div class="d-flex align-items-center gap-2 text-muted">
        <i class="bi bi-phone"></i> ${t('notifications.pushUnsupported')}
      </div>`;
      return;
    }
    const perm = pushPermission();
    const subscribed = await isSubscribed();
    if (perm === 'denied') {
      el.innerHTML = `<div class="d-flex align-items-center gap-2">
        <i class="bi bi-phone text-danger"></i>
        <div class="flex-fill"><strong>${t('notifications.pushBlocked')}</strong><div class="text-muted small">${t('notifications.pushBlockedHint')}</div></div>
      </div>`;
      return;
    }
    if (subscribed) {
      el.innerHTML = `<div class="d-flex align-items-center gap-2">
        <i class="bi bi-phone text-success"></i>
        <div class="flex-fill"><strong>${t('notifications.pushEnabled')}</strong><div class="text-muted small">${t('notifications.pushEnabledHint')}</div></div>
        <button class="btn btn-outline-primary btn-sm" id="btn-push-test">${t('notifications.pushTest')}</button>
        <button class="btn btn-outline-secondary btn-sm" id="btn-push-disable">${t('notifications.pushDisable')}</button>
      </div>`;
      document.getElementById('btn-push-test').addEventListener('click', async () => {
        try { await api.post('/notifications/push/test', {}); } catch {}
      });
      document.getElementById('btn-push-disable').addEventListener('click', async () => {
        await unsubscribe();
        await renderPushStatus();
      });
      return;
    }
    el.innerHTML = `<div class="d-flex align-items-center gap-2">
      <i class="bi bi-phone"></i>
      <div class="flex-fill"><strong>${t('notifications.pushOffered')}</strong><div class="text-muted small">${t('notifications.pushOfferedHint')}</div></div>
      <button class="btn btn-primary btn-sm" id="btn-push-enable">${t('notifications.pushEnable')}</button>
    </div>`;
    document.getElementById('btn-push-enable').addEventListener('click', async () => {
      try {
        await subscribe();
        await renderPushStatus();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  async function savePref(type, patch) {
    try {
      await api.put(`/notifications/prefs/${type}`, patch);
    } catch {}
  }

  function renderOverrides() {
    const el = document.getElementById('overrides-list');
    if (!currentState.overrides.length) {
      el.innerHTML = `<div class="text-muted small py-3 text-center">${t('notifications.noOverrides')}</div>`;
      return;
    }
    // Group by contact
    const byContact = new Map();
    for (const o of currentState.overrides) {
      const key = o.contact_uuid;
      if (!byContact.has(key)) byContact.set(key, { contact: o, rows: [] });
      byContact.get(key).rows.push(o);
    }
    el.innerHTML = [...byContact.values()].map(({ contact, rows }) => {
      const initials = (contact.first_name?.[0] || '') + (contact.last_name?.[0] || '');
      const summary = rows.map(r => {
        const colors = TYPE_ICON_COLORS[r.type];
        return `<span class="override-type-chip" style="background:${colors.bg};color:${colors.fg}" title="${t(TYPE_LABELS[r.type])}"><i class="bi bi-${TYPE_ICONS[r.type]}"></i></span>`;
      }).join('');
      return `
        <details class="override-group">
          <summary class="override-summary">
            <i class="bi bi-chevron-right override-chevron"></i>
            <a href="/contacts/${contact.contact_uuid}" data-link class="override-contact" onclick="event.stopPropagation()">
              <span class="contact-chip-avatar">
                ${contact.avatar ? `<img src="${authUrl(contact.avatar)}" alt="">` : `<span>${initials}</span>`}
              </span>
              <strong>${escapeHtml(contact.first_name)} ${escapeHtml(contact.last_name || '')}</strong>
            </a>
            <span class="override-summary-chips">${summary}</span>
            <span class="override-summary-count text-muted small">${rows.length}</span>
            <div class="override-summary-actions">
              <button class="btn btn-link btn-sm btn-edit-contact" data-uuid="${contact.contact_uuid}" title="${t('common.edit')}">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-link btn-sm text-danger btn-delete-contact" data-uuid="${contact.contact_uuid}" title="${t('common.delete')}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </summary>
          <div class="override-rows">
            ${rows.map(r => {
              const icon = TYPE_ICONS[r.type] || 'bell';
              const colors = TYPE_ICON_COLORS[r.type] || { bg: 'rgba(0,0,0,0.06)', fg: 'var(--color-text-secondary)' };
              return `
              <div class="override-row">
                <span class="override-type">
                  <span class="override-type-icon" style="background:${colors.bg};color:${colors.fg}">
                    <i class="bi bi-${icon}"></i>
                  </span>
                  ${t(TYPE_LABELS[r.type])}
                </span>
                <span class="override-mode-badge override-mode-${r.mode}">${t('notifications.mode' + (r.mode === 'always' ? 'Always' : 'Never'))}</span>
              </div>
            `;
            }).join('')}
          </div>
        </details>
      `;
    }).join('');

    el.querySelectorAll('.btn-edit-contact').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uuid = btn.dataset.uuid;
        const group = [...byContact.values()].find(g => g.contact.contact_uuid === uuid);
        if (!group) return;
        openContactNotificationModal({
          contact: {
            uuid: group.contact.contact_uuid,
            first_name: group.contact.first_name,
            last_name: group.contact.last_name,
            avatar: group.contact.avatar,
          },
          onSaved: refreshAll,
        });
      });
    });

    el.querySelectorAll('.btn-delete-contact').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uuid = btn.dataset.uuid;
        const group = [...byContact.values()].find(g => g.contact.contact_uuid === uuid);
        if (!group) return;
        if (!(await confirmDialog(t('notifications.removeAllOverridesConfirm', {
          name: `${group.contact.first_name} ${group.contact.last_name || ''}`.trim(),
        })))) return;
        await Promise.all(group.rows.map(r => api.delete(`/notifications/overrides/${r.id}`)));
        await refreshAll();
      });
    });
  }

  document.getElementById('btn-add-override').addEventListener('click', () => {
    openContactNotificationModal({ onSaved: refreshAll });
  });

  await refreshAll();
  await renderPushStatus();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
