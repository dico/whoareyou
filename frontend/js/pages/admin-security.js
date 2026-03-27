import { api } from '../api/client.js';
import { state } from '../app.js';
import { confirmDialog } from '../components/dialogs.js';
import { t } from '../utils/i18n.js';

export async function renderSecurityAdmin() {
  const content = document.getElementById('app-content');

  if (state.user?.role !== 'admin' && !state.user?.is_system_admin) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.accessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2>${t('settings.security')}</h2>
      </div>

      <!-- Active sessions -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-laptop"></i> ${t('settings.activeSessions')}</h4>
        <p class="text-muted small">${t('settings.sessionsDesc')}</p>
        <div id="sessions-list" class="mt-2">
          <div class="loading small">${t('app.loading')}</div>
        </div>
        <button class="btn btn-outline-danger btn-sm mt-2 d-none" id="btn-revoke-all">
          <i class="bi bi-box-arrow-right me-1"></i>${t('settings.revokeAllSessions')}
        </button>
      </div>

      <!-- Trusted IP ranges -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-wifi"></i> ${t('admin.trustedIpRanges')}</h4>
        <p class="text-muted small">${t('admin.trustedIpDesc')}</p>
        <div class="d-flex gap-2 align-items-end">
          <div class="flex-grow-1">
            <input type="text" class="form-control form-control-sm" id="trusted-ip-input"
              placeholder="192.168.1.0/24, 10.0.0.0/8">
          </div>
          <button class="btn btn-primary btn-sm" id="btn-save-ip">${t('common.save')}</button>
        </div>
        <div id="ip-save-status" class="small mt-1"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => history.back());

  // Load sessions
  loadSessions();

  async function loadSessions() {
    try {
      const { sessions } = await api.get('/auth/sessions');
      const list = document.getElementById('sessions-list');

      if (!sessions.length) {
        list.innerHTML = `<p class="text-muted small">${t('settings.noSessions')}</p>`;
        return;
      }

      list.innerHTML = sessions.map(s => {
        const icon = s.device_label?.toLowerCase().includes('mobile') ? 'phone' :
                     s.device_label?.toLowerCase().includes('tablet') ? 'tablet' : 'laptop';
        const timeAgo = formatTimeAgo(s.last_activity_at);
        return `
          <div class="session-item ${s.is_current ? 'session-current' : ''}">
            <div class="session-icon"><i class="bi bi-${icon}"></i></div>
            <div class="session-info">
              <div class="session-device">${s.device_label || t('settings.unknownDevice')}</div>
              <div class="session-meta">${s.ip_address || ''} · ${timeAgo}</div>
            </div>
            ${s.is_current
              ? `<span class="badge bg-primary">${t('settings.thisDevice')}</span>`
              : `<button class="btn btn-outline-danger btn-sm btn-revoke-session" data-uuid="${s.uuid}">${t('settings.revoke')}</button>`
            }
          </div>
        `;
      }).join('');

      if (sessions.length > 1) {
        document.getElementById('btn-revoke-all').classList.remove('d-none');
      }

      list.querySelectorAll('.btn-revoke-session').forEach(btn => {
        btn.addEventListener('click', async () => {
          await api.delete(`/auth/sessions/${btn.dataset.uuid}`);
          loadSessions();
        });
      });
    } catch {
      document.getElementById('sessions-list').innerHTML = '';
    }
  }

  document.getElementById('btn-revoke-all')?.addEventListener('click', async () => {
    if (await confirmDialog(t('settings.revokeAllConfirm'), { title: t('settings.security'), confirmText: t('settings.revokeAllSessions') })) {
      await api.delete('/auth/sessions');
      loadSessions();
    }
  });

  // Load trusted IP ranges
  try {
    const { trusted_ip_ranges } = await api.get('/auth/tenant/security');
    document.getElementById('trusted-ip-input').value = trusted_ip_ranges || '';
  } catch {}

  document.getElementById('btn-save-ip')?.addEventListener('click', async () => {
    const value = document.getElementById('trusted-ip-input').value.trim();
    const statusEl = document.getElementById('ip-save-status');
    try {
      await api.put('/auth/tenant/security', { trusted_ip_ranges: value });
      statusEl.textContent = t('common.saved');
      statusEl.className = 'small mt-1 text-success';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'small mt-1 text-danger';
    }
  });
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
