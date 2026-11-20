import { api } from '../api/client.js';
import { t, formatDateTime } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';

/**
 * Settings → AI access. Create short-lived API tokens for an AI agent
 * (e.g. Claude Code), see what each token did, and revoke them.
 * What a token may touch is decided in backend/src/utils/api-token-policy.js.
 */
export async function renderAiAccessSettings() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2><i class="bi bi-robot"></i> ${t('apiTokens.title')}</h2>
      </div>
      <p class="text-muted mb-4">${t('apiTokens.intro')}</p>

      <div class="glass-card p-3 mb-4">
        <h5 class="mb-3">${t('apiTokens.create')}</h5>
        <form id="ai-token-form" class="row g-2 align-items-end">
          <div class="col-12 col-md-4">
            <label class="form-label small" for="ai-token-name">${t('apiTokens.name')}</label>
            <input type="text" class="form-control form-control-sm" id="ai-token-name" maxlength="100" value="Claude" required>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small" for="ai-token-scope">${t('apiTokens.scope')}</label>
            <select class="form-select form-select-sm" id="ai-token-scope">
              <option value="write">${t('apiTokens.scopeWrite')}</option>
              <option value="read">${t('apiTokens.scopeRead')}</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small" for="ai-token-hours">${t('apiTokens.lifetime')}</label>
            <select class="form-select form-select-sm" id="ai-token-hours">
              <option value="1">${t('apiTokens.hours', { n: 1 })}</option>
              <option value="4">${t('apiTokens.hours', { n: 4 })}</option>
              <option value="24">${t('apiTokens.hours', { n: 24 })}</option>
              <option value="168">${t('apiTokens.days', { n: 7 })}</option>
            </select>
          </div>
          <div class="col-12 col-md-2">
            <button type="submit" class="btn btn-primary btn-sm w-100"><i class="bi bi-key"></i> ${t('apiTokens.createBtn')}</button>
          </div>
        </form>
        <div id="ai-token-created" class="mt-3"></div>
        <p class="text-muted small mt-3 mb-0"><i class="bi bi-shield-check"></i> ${t('apiTokens.limits')}</p>
      </div>

      <div class="glass-card p-3">
        <h5 class="mb-3">${t('apiTokens.list')}</h5>
        <div id="ai-token-list"><div class="loading small">${t('app.loading')}</div></div>
      </div>
    </div>
  `;

  const listEl = document.getElementById('ai-token-list');

  async function loadTokens() {
    try {
      const { tokens } = await api.get('/api-tokens');
      if (!tokens.length) {
        listEl.innerHTML = `<p class="text-muted small mb-0">${t('apiTokens.none')}</p>`;
        return;
      }
      listEl.innerHTML = tokens.map(tok => `
        <div class="d-flex align-items-center gap-2 py-2 border-bottom ai-token-row">
          <div class="flex-grow-1 min-w-0">
            <div class="fw-semibold text-truncate">
              ${escapeHtml(tok.name)}
              <span class="badge ${tok.scope === 'write' ? 'bg-warning-subtle text-warning-emphasis' : 'bg-info-subtle text-info-emphasis'} ms-1">${t(tok.scope === 'write' ? 'apiTokens.scopeWrite' : 'apiTokens.scopeRead')}</span>
              <span class="badge ${statusClass(tok.status)} ms-1">${t('apiTokens.status.' + tok.status)}</span>
            </div>
            <div class="small text-muted">
              <code>${escapeHtml(tok.token_prefix)}…</code>
              · ${tok.status === 'active' ? t('apiTokens.expires', { date: formatDateTime(tok.expires_at) }) : formatDateTime(tok.revoked_at || tok.expires_at)}
              · ${tok.last_used_at ? t('apiTokens.lastUsed', { date: formatDateTime(tok.last_used_at), n: tok.request_count }) : t('apiTokens.neverUsed')}
            </div>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm ai-token-activity" data-uuid="${tok.uuid}" data-name="${escapeHtml(tok.name)}">
            <i class="bi bi-list-check"></i> <span class="d-none d-md-inline">${t('apiTokens.activity')}</span>
          </button>
          ${tok.status === 'active' ? `
          <button type="button" class="btn btn-outline-danger btn-sm ai-token-revoke" data-uuid="${tok.uuid}">
            <i class="bi bi-x-circle"></i> <span class="d-none d-md-inline">${t('apiTokens.revoke')}</span>
          </button>` : ''}
        </div>
      `).join('');

      listEl.querySelectorAll('.ai-token-revoke').forEach(btn => btn.addEventListener('click', async () => {
        if (!await confirmDialog(t('apiTokens.revokeConfirm'), { title: t('apiTokens.revoke'), confirmText: t('apiTokens.revoke') })) return;
        try {
          await api.post(`/api-tokens/${btn.dataset.uuid}/revoke`);
          loadTokens();
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      }));
      listEl.querySelectorAll('.ai-token-activity').forEach(btn => btn.addEventListener('click', () => {
        openActivityModal(btn.dataset.uuid, btn.dataset.name);
      }));
    } catch (err) {
      listEl.innerHTML = `<p class="text-danger small mb-0">${escapeHtml(err.message)}</p>`;
    }
  }

  document.getElementById('ai-token-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const createdEl = document.getElementById('ai-token-created');
    try {
      const res = await api.post('/api-tokens', {
        name: document.getElementById('ai-token-name').value.trim(),
        scope: document.getElementById('ai-token-scope').value,
        hours: Number(document.getElementById('ai-token-hours').value),
      });
      const apiBase = `${location.origin}/api`;
      createdEl.innerHTML = `
        <div class="alert alert-success mb-0">
          <div class="fw-semibold mb-1"><i class="bi bi-check-circle"></i> ${t('apiTokens.createdTitle')}</div>
          <div class="small mb-2">${t('apiTokens.createdHint')}</div>
          <div class="input-group input-group-sm mb-2">
            <input type="text" class="form-control font-monospace" id="ai-token-value" readonly value="${escapeHtml(res.token)}">
            <button type="button" class="btn btn-outline-secondary" id="ai-token-copy"><i class="bi bi-clipboard"></i> ${t('apiTokens.copy')}</button>
          </div>
          <div class="small text-muted">${t('apiTokens.howTo', { base: escapeHtml(apiBase) })}</div>
        </div>
      `;
      document.getElementById('ai-token-copy').addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        const text = `API: ${apiBase}\nToken: ${res.token}`;
        try {
          await navigator.clipboard.writeText(text);
          btn.innerHTML = `<i class="bi bi-check"></i> ${t('apiTokens.copied')}`;
        } catch {
          document.getElementById('ai-token-value').select();
        }
      });
      loadTokens();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
    }
  });

  await loadTokens();
}

function statusClass(status) {
  if (status === 'active') return 'bg-success-subtle text-success-emphasis';
  if (status === 'revoked') return 'bg-danger-subtle text-danger-emphasis';
  return 'bg-secondary-subtle text-secondary-emphasis';
}

async function openActivityModal(uuid, name) {
  const mid = 'ai-token-activity-modal';
  document.getElementById(mid)?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('apiTokens.activity')} — ${escapeHtml(name)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${mid}-body"><div class="loading small">${t('app.loading')}</div></div>
        </div>
      </div>
    </div>
  `);
  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();

  const body = modalEl.querySelector(`#${mid}-body`);
  try {
    const { activity } = await api.get(`/api-tokens/${uuid}/activity`);
    if (!activity.length) {
      body.innerHTML = `<p class="text-muted small mb-0">${t('apiTokens.noActivity')}</p>`;
      return;
    }
    body.innerHTML = `
      <table class="table table-sm small mb-0">
        <tbody>
          ${activity.map(a => {
            const d = a.details || {};
            const kind = a.action.replace('api_token.', '');
            const cls = kind === 'write' ? 'text-warning-emphasis' : kind === 'denied' ? 'text-danger' : 'text-muted';
            return `<tr>
              <td class="text-nowrap text-muted">${formatDateTime(a.created_at)}</td>
              <td class="${cls} text-nowrap">${escapeHtml(kind)}</td>
              <td class="text-nowrap">${escapeHtml(d.method || '')}</td>
              <td class="text-break"><code>${escapeHtml(d.path || '')}</code>${d.reason ? `<div class="text-danger">${escapeHtml(d.reason)}</div>` : ''}</td>
              <td class="text-nowrap">${d.status ?? ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    body.innerHTML = `<p class="text-danger small mb-0">${escapeHtml(err.message)}</p>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML.replace(/"/g, '&quot;');
}
