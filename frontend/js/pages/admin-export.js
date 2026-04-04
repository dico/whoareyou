import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

export async function renderExportData() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-download"></i> ${t('export.title')}</h2>
        <div></div>
      </div>

      <div class="row g-3">
        <div class="col-md-6">
          <div class="detail-card glass-card h-100">
            <h4><i class="bi bi-file-earmark-zip me-2"></i>${t('export.dataOnly')}</h4>
            <p class="text-muted small">${t('export.dataOnlyDesc')}</p>
            <button class="btn btn-primary btn-sm" id="btn-export-data">
              <i class="bi bi-download me-1"></i>${t('export.download')}
            </button>
          </div>
        </div>
        <div class="col-md-6">
          <div class="detail-card glass-card h-100">
            <h4><i class="bi bi-archive me-2"></i>${t('export.fullBackup')}</h4>
            <p class="text-muted small">${t('export.fullBackupDesc')}</p>
            <button class="btn btn-primary btn-sm" id="btn-export-full">
              <i class="bi bi-download me-1"></i>${t('export.startExport')}
            </button>
            <div id="export-progress" class="d-none mt-3">
              <div class="progress" style="height:8px">
                <div class="progress-bar" id="export-progress-bar" role="progressbar" style="width:0%"></div>
              </div>
              <p class="text-muted small mt-1" id="export-progress-text"></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));

  // Data-only export (instant download)
  document.getElementById('btn-export-data').addEventListener('click', () => {
    window.location.href = authUrl('/api/export/data');
  });

  // Full export with progress
  document.getElementById('btn-export-full').addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-full');
    const progressEl = document.getElementById('export-progress');
    const progressBar = document.getElementById('export-progress-bar');
    const progressText = document.getElementById('export-progress-text');

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('export.preparing')}`;
    progressEl.classList.remove('d-none');

    try {
      const { jobId } = await api.post('/export/full');

      // Poll for progress
      const poll = setInterval(async () => {
        try {
          const { status, progress } = await api.get(`/export/status/${jobId}`);
          progressBar.style.width = `${progress}%`;
          progressText.textContent = t('export.progress', { percent: progress });

          if (status === 'complete') {
            clearInterval(poll);
            progressText.textContent = t('export.complete');
            progressBar.classList.add('bg-success');
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-download me-1"></i>${t('export.download')}`;
            btn.onclick = () => { window.location.href = authUrl(`/api/export/download/${jobId}`); };
          } else if (status === 'failed') {
            clearInterval(poll);
            progressText.textContent = t('export.failed');
            progressBar.classList.add('bg-danger');
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-download me-1"></i>${t('export.startExport')}`;
          }
        } catch {
          clearInterval(poll);
          progressText.textContent = t('export.failed');
          btn.disabled = false;
        }
      }, 2000);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-download me-1"></i>${t('export.startExport')}`;
      progressText.textContent = err.message;
    }
  });
}
