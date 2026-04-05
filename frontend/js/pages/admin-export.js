import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

async function downloadWithAuth(url, filename, statusEl) {
  const token = localStorage.getItem('token');
  if (statusEl) statusEl.textContent = t('export.downloading');
  const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!response.ok) throw new Error('Download failed');
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function renderExportData() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-download"></i> ${t('export.title')}</h2>
        <div></div>
      </div>

      <!-- Encryption settings -->
      <div class="detail-card glass-card mb-3">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <h5 class="mb-1"><i class="bi bi-shield-lock me-2"></i>${t('export.encryption')}</h5>
            <p class="text-muted small mb-0" id="encryption-status"></p>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <div id="encryption-controls"></div>
          </div>
        </div>
      </div>

      <!-- Export cards -->
      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <div class="detail-card glass-card h-100">
            <h4><i class="bi bi-file-earmark-zip me-2"></i>${t('export.dataOnly')}</h4>
            <p class="text-muted small">${t('export.dataOnlyDesc')}</p>
            <button class="btn btn-primary btn-sm" id="btn-export-data">
              <i class="bi bi-download me-1"></i>${t('export.download')}
            </button>
            <p class="text-muted small mt-2 d-none" id="data-status"></p>
            <div class="form-check mt-2" id="data-skip-encrypt-wrap" style="display:none">
              <input class="form-check-input" type="checkbox" id="data-skip-encrypt">
              <label class="form-check-label small text-muted" for="data-skip-encrypt">${t('export.skipEncryption')}</label>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="detail-card glass-card h-100">
            <h4><i class="bi bi-archive me-2"></i>${t('export.fullBackup')}</h4>
            <p class="text-muted small">${t('export.fullBackupDesc')}</p>
            <div id="full-export-area">
              <button class="btn btn-primary btn-sm" id="btn-export-full">
                <i class="bi bi-download me-1"></i>${t('export.startExport')}
              </button>
              <div class="form-check mt-2" id="full-skip-encrypt-wrap" style="display:none">
                <input class="form-check-input" type="checkbox" id="full-skip-encrypt">
                <label class="form-check-label small text-muted" for="full-skip-encrypt">${t('export.skipEncryption')}</label>
              </div>
            </div>
            <div id="export-progress" class="d-none mt-3">
              <div class="progress" style="height:8px">
                <div class="progress-bar" id="export-progress-bar" role="progressbar" style="width:0%"></div>
              </div>
              <p class="text-muted small mt-1" id="export-progress-text"></p>
            </div>
          </div>
        </div>
      </div>

      <!-- Export log -->
      <div class="detail-card glass-card">
        <h5><i class="bi bi-journal-text me-2"></i>${t('export.log')}</h5>
        <div id="export-log"><div class="loading small">${t('app.loading')}</div></div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));

  // ── Encryption UI ──
  await loadEncryptionUI();

  // ── Export log ──
  await loadExportLog();

  // ── Data-only export ──
  let dataExporting = false;
  document.getElementById('btn-export-data').addEventListener('click', async () => {
    if (dataExporting) return;
    dataExporting = true;
    const btn = document.getElementById('btn-export-data');
    const status = document.getElementById('data-status');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('export.preparing')}`;
    status.classList.remove('d-none');
    status.textContent = t('export.preparing');
    try {
      const today = new Date().toISOString().split('T')[0];
      const skipEnc = document.getElementById('data-skip-encrypt')?.checked ? '?skip_encryption=true' : '';
      await downloadWithAuth(`/api/export/data${skipEnc}`, `whoareyou-export-${today}.zip`, status);
      status.textContent = t('export.complete');
      btn.innerHTML = `<i class="bi bi-check-lg me-1"></i>${t('export.complete')}`;
      await loadExportLog();
    } catch (err) {
      status.textContent = err.message;
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-download me-1"></i>${t('export.download')}`;
      status.classList.add('d-none');
      dataExporting = false;
    }, 3000);
  });

  // ── Full export ──
  let fullExporting = false;
  document.getElementById('btn-export-full').addEventListener('click', async () => {
    if (fullExporting) return;
    fullExporting = true;
    const btn = document.getElementById('btn-export-full');
    const progressEl = document.getElementById('export-progress');
    const progressBar = document.getElementById('export-progress-bar');
    const progressText = document.getElementById('export-progress-text');

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('export.preparing')}`;
    progressEl.classList.remove('d-none');
    progressBar.className = 'progress-bar';
    progressBar.style.width = '0%';

    try {
      const skipEnc = document.getElementById('full-skip-encrypt')?.checked;
      const { jobId } = await api.post('/export/full', { skip_encryption: skipEnc || false });
      let downloadStarted = false;

      const poll = setInterval(async () => {
        if (downloadStarted) return;
        try {
          const { status, progress, encrypted } = await api.get(`/export/status/${jobId}`);
          progressBar.style.width = `${progress}%`;
          progressText.textContent = t('export.progress', { percent: progress });

          if (status === 'complete') {
            if (downloadStarted) return;
            downloadStarted = true;
            clearInterval(poll);
            progressBar.classList.add('bg-success');
            progressText.textContent = t('export.complete');
            btn.classList.add('d-none');

            const today = new Date().toISOString().split('T')[0];
            const ext = encrypted ? 'zip.enc' : 'zip';
            const filename = `whoareyou-full-export-${today}.${ext}`;
            const area = document.getElementById('full-export-area');
            area.innerHTML = `
              <ul class="list-unstyled mb-2">
                <li class="d-flex align-items-center gap-2 py-1">
                  <a href="#" class="btn-download-file d-inline-flex align-items-center gap-1 text-decoration-none" data-job-id="${jobId}" data-filename="${filename}">
                    <i class="bi bi-file-earmark-zip"></i> ${filename}
                  </a>
                  ${encrypted ? `<span class="badge bg-success badge-sm"><i class="bi bi-shield-lock me-1"></i>AES-256</span>` : ''}
                </li>
              </ul>
              ${encrypted ? `<p class="text-muted small mb-2"><i class="bi bi-info-circle me-1"></i>${t('export.encryptedNote')}</p>` : ''}
              <button class="btn btn-outline-secondary btn-sm" id="btn-new-export">
                <i class="bi bi-arrow-counterclockwise me-1"></i>${t('export.startExport')}
              </button>
            `;

            area.querySelector('.btn-download-file').addEventListener('click', async (e) => {
              e.preventDefault();
              const link = e.currentTarget;
              if (link.dataset.downloading) return;
              link.dataset.downloading = 'true';
              const origHtml = link.innerHTML;
              link.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${t('export.downloading')}`;
              try {
                await downloadWithAuth(`/api/export/download/${jobId}`, filename, progressText);
                link.innerHTML = `<i class="bi bi-check-lg text-success"></i> ${filename}`;
                await loadExportLog();
              } catch (err) {
                link.innerHTML = origHtml;
                progressText.textContent = err.message;
              }
              delete link.dataset.downloading;
            });

            document.getElementById('btn-new-export')?.addEventListener('click', () => {
              fullExporting = false;
              renderExportData();
            });
          } else if (status === 'failed') {
            clearInterval(poll);
            progressText.textContent = t('export.failed');
            progressBar.classList.add('bg-danger');
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-download me-1"></i>${t('export.startExport')}`;
            fullExporting = false;
          }
        } catch {
          clearInterval(poll);
          progressText.textContent = t('export.failed');
          btn.disabled = false;
          fullExporting = false;
        }
      }, 2000);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-download me-1"></i>${t('export.startExport')}`;
      progressText.textContent = err.message;
      fullExporting = false;
    }
  });
}

async function loadEncryptionUI() {
  const controls = document.getElementById('encryption-controls');
  const status = document.getElementById('encryption-status');

  try {
    const { configured } = await api.get('/export/encryption');

    // Show/hide skip-encryption checkboxes
    const dataSkipWrap = document.getElementById('data-skip-encrypt-wrap');
    const fullSkipWrap = document.getElementById('full-skip-encrypt-wrap');
    if (dataSkipWrap) dataSkipWrap.style.display = configured ? '' : 'none';
    if (fullSkipWrap) fullSkipWrap.style.display = configured ? '' : 'none';

    if (configured) {
      status.textContent = t('export.encryptionEnabled');
      controls.innerHTML = `
        <button class="btn btn-outline-secondary btn-sm" id="btn-change-password">${t('export.changePassword')}</button>
        <button class="btn btn-outline-danger btn-sm" id="btn-disable-encryption">${t('export.disableEncryption')}</button>
      `;
      document.getElementById('btn-change-password').addEventListener('click', () => showPasswordInput(controls, status));
      document.getElementById('btn-disable-encryption').addEventListener('click', async () => {
        await api.put('/export/encryption', { password: '' });
        await loadEncryptionUI();
      });
    } else {
      status.textContent = t('export.encryptionDisabled');
      controls.innerHTML = `
        <button class="btn btn-outline-primary btn-sm" id="btn-enable-encryption">${t('export.enableEncryption')}</button>
      `;
      document.getElementById('btn-enable-encryption').addEventListener('click', () => showPasswordInput(controls, status));
    }
  } catch {}
}

function showPasswordInput(controls, status) {
  controls.innerHTML = `
    <input type="password" class="form-control form-control-sm" id="enc-password-input" placeholder="${t('export.encryptionPlaceholder')}" style="width:200px" autofocus>
    <button class="btn btn-primary btn-sm" id="btn-save-enc">${t('common.save')}</button>
    <button class="btn btn-outline-secondary btn-sm" id="btn-cancel-enc">${t('common.cancel')}</button>
  `;
  document.getElementById('enc-password-input').focus();
  document.getElementById('btn-save-enc').addEventListener('click', async () => {
    const pass = document.getElementById('enc-password-input').value;
    if (!pass) return;
    await api.put('/export/encryption', { password: pass });
    await loadEncryptionUI();
  });
  document.getElementById('btn-cancel-enc').addEventListener('click', () => loadEncryptionUI());
}

async function loadExportLog() {
  const el = document.getElementById('export-log');
  if (!el) return;
  try {
    const { logs } = await api.get('/export/log');
    if (!logs.length) {
      el.innerHTML = `<p class="text-muted small">${t('export.noLogs')}</p>`;
      return;
    }
    const statusIcons = {
      started: '<i class="bi bi-hourglass text-warning" title="Started"></i>',
      ready: '<i class="bi bi-check-circle text-info" title="Ready"></i>',
      downloaded: '<i class="bi bi-check-circle-fill text-success" title="Downloaded"></i>',
      failed: '<i class="bi bi-x-circle text-danger" title="Failed"></i>',
    };
    el.innerHTML = `
      <table class="table table-sm small mb-0">
        <thead><tr>
          <th>${t('export.logDate')}</th>
          <th>${t('export.logUser')}</th>
          <th>${t('export.logType')}</th>
          <th></th>
          <th>${t('export.logSize')}</th>
          <th>IP</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td>${formatDate(l.created_at)}</td>
              <td>${l.user_first} ${l.user_last || ''}</td>
              <td>${l.export_type}${l.encrypted ? ' <i class="bi bi-shield-lock text-success" title="AES-256"></i>' : ''}</td>
              <td>${statusIcons[l.status] || l.status}</td>
              <td>${formatSize(l.file_size)}</td>
              <td>${l.ip_address || ''}</td>
              <td>${l.country_code && /^[A-Z]{2}$/i.test(l.country_code) ? `<img src="/img/flags/${l.country_code.toLowerCase()}.svg" alt="${l.country_code.toUpperCase()}" style="width:16px;height:12px">` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    el.innerHTML = '';
  }
}
