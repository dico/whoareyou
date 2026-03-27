import { api } from '../api/client.js';
import { state } from '../app.js';
import { t, getLocale, setLocale } from '../utils/i18n.js';
import { renderNavbar } from '../components/navbar.js';
import { confirmDialog } from '../components/dialogs.js';

export async function renderProfile() {
  const content = document.getElementById('app-content');
  const currentLocale = getLocale();

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2>${t('profile.title')}</h2>
      </div>

      <!-- Account -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-person-circle"></i> ${t('settings.account')}</h4>
        <div id="profile-view">
          <div class="settings-row">
            <span class="settings-label">${t('settings.name')}</span>
            <span>${state.user?.first_name} ${state.user?.last_name}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">${t('settings.email')}</span>
            <span>${state.user?.email}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">${t('settings.language')}</span>
            <select class="form-select form-select-sm" id="language-select" style="width:auto">
              <option value="en" ${currentLocale === 'en' ? 'selected' : ''}>English</option>
              <option value="nb" ${currentLocale === 'nb' ? 'selected' : ''}>Norsk bokmål</option>
            </select>
          </div>
          <div class="mt-3 d-flex gap-2">
            <button class="btn btn-outline-primary btn-sm" id="btn-edit-profile">
              <i class="bi bi-pencil me-1"></i>${t('settings.editProfile')}
            </button>
            <button class="btn btn-outline-secondary btn-sm" id="btn-change-password">
              <i class="bi bi-key me-1"></i>${t('settings.changePassword')}
            </button>
          </div>
        </div>

        <!-- Edit profile form (hidden) -->
        <form id="profile-edit-form" class="d-none">
          <div class="row g-2 mb-2">
            <div class="col">
              <div class="form-floating">
                <input type="text" class="form-control" id="edit-first-name" value="${escapeAttr(state.user?.first_name || '')}" required>
                <label>${t('auth.firstName')}</label>
              </div>
            </div>
            <div class="col">
              <div class="form-floating">
                <input type="text" class="form-control" id="edit-last-name" value="${escapeAttr(state.user?.last_name || '')}" required>
                <label>${t('auth.lastName')}</label>
              </div>
            </div>
          </div>
          <div class="form-floating mb-2">
            <input type="email" class="form-control" id="edit-email" value="${escapeAttr(state.user?.email || '')}" required>
            <label>${t('auth.email')}</label>
          </div>
          <div id="profile-edit-error" class="alert alert-danger d-none"></div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary btn-sm">${t('common.save')}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-cancel-edit">${t('common.cancel')}</button>
          </div>
        </form>

        <!-- Change password form (hidden) -->
        <form id="password-form" class="d-none">
          <div class="form-floating mb-2">
            <input type="password" class="form-control" id="current-password" required>
            <label>${t('settings.currentPassword')}</label>
          </div>
          <div class="form-floating mb-2">
            <input type="password" class="form-control" id="new-password" minlength="8" required>
            <label>${t('settings.newPassword')}</label>
          </div>
          <div id="password-error" class="alert alert-danger d-none"></div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary btn-sm">${t('settings.changePassword')}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-cancel-password">${t('common.cancel')}</button>
          </div>
        </form>
      </div>

      <!-- Two-factor authentication -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-shield-check"></i> ${t('settings.twoFactor')}</h4>
        <p class="text-muted small">${t('settings.twoFactorDesc')}</p>
        <div id="totp-status" class="mt-2">
          <div class="loading small">${t('app.loading')}</div>
        </div>
      </div>

      <!-- Passkeys -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-fingerprint"></i> ${t('settings.passkeys')}</h4>
        <p class="text-muted small">${t('settings.passkeysDesc')}</p>
        <div id="passkeys-list" class="mt-2">
          <div class="loading small">${t('app.loading')}</div>
        </div>
      </div>
    </div>
  `;

  // Language switcher
  document.getElementById('language-select').addEventListener('change', async (e) => {
    const locale = e.target.value;
    localStorage.setItem('locale', locale);
    try {
      await api.patch('/auth/language', { language: locale });
      if (state.user) state.user.language = locale;
    } catch {}
    await setLocale(locale);
    renderNavbar();
    renderProfile();
  });

  // Edit profile
  document.getElementById('btn-edit-profile').addEventListener('click', () => {
    document.getElementById('profile-view').classList.add('d-none');
    document.getElementById('profile-edit-form').classList.remove('d-none');
    document.getElementById('edit-first-name').focus();
  });

  document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    document.getElementById('profile-view').classList.remove('d-none');
    document.getElementById('profile-edit-form').classList.add('d-none');
  });

  document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('profile-edit-error');
    errorEl.classList.add('d-none');
    try {
      const { user } = await api.put('/auth/profile', {
        first_name: document.getElementById('edit-first-name').value,
        last_name: document.getElementById('edit-last-name').value,
        email: document.getElementById('edit-email').value,
      });
      state.user = { ...state.user, ...user };
      renderNavbar();
      renderProfile();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

  // Change password
  document.getElementById('btn-change-password').addEventListener('click', () => {
    document.getElementById('profile-view').classList.add('d-none');
    document.getElementById('password-form').classList.remove('d-none');
    document.getElementById('current-password').focus();
  });

  document.getElementById('btn-cancel-password').addEventListener('click', () => {
    document.getElementById('profile-view').classList.remove('d-none');
    document.getElementById('password-form').classList.add('d-none');
  });

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('password-error');
    errorEl.classList.add('d-none');
    try {
      await api.post('/auth/change-password', {
        current_password: document.getElementById('current-password').value,
        new_password: document.getElementById('new-password').value,
      });
      await confirmDialog(t('settings.passwordChanged'), {
        title: t('settings.changePassword'),
        confirmText: t('common.ok'),
        confirmClass: 'btn-primary',
      });
      renderProfile();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

  // ── 2FA ──
  load2faStatus();

  async function load2faStatus() {
    const el = document.getElementById('totp-status');
    try {
      const { enabled } = await api.get('/auth/2fa/status');

      if (enabled) {
        el.innerHTML = `
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>${t('settings.twoFactorEnabled')}</span>
          </div>
          <button class="btn btn-outline-danger btn-sm" id="btn-disable-2fa">
            <i class="bi bi-x-circle me-1"></i>${t('settings.disable2fa')}
          </button>
        `;

        document.getElementById('btn-disable-2fa').addEventListener('click', async () => {
          const password = await promptPassword();
          if (!password) return;
          try {
            await api.post('/auth/2fa/disable', { password });
            load2faStatus();
          } catch (err) {
            confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          }
        });
      } else {
        el.innerHTML = `
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="badge bg-secondary">${t('settings.twoFactorDisabled')}</span>
          </div>
          <button class="btn btn-outline-primary btn-sm" id="btn-enable-2fa">
            <i class="bi bi-key me-1"></i>${t('settings.enable2fa')}
          </button>
          <div id="totp-setup" class="d-none mt-3"></div>
        `;

        document.getElementById('btn-enable-2fa').addEventListener('click', async () => {
          try {
            const { qrCode, secret } = await api.post('/auth/2fa/setup', {});
            const setupEl = document.getElementById('totp-setup');
            setupEl.classList.remove('d-none');
            setupEl.innerHTML = `
              <p class="small">${t('settings.scanQrCode')}</p>
              <img src="${qrCode}" alt="QR Code" class="mb-2" style="border-radius:var(--radius-sm)">
              <p class="small">${t('settings.manualKey')} <code>${secret}</code></p>
              <div class="d-flex gap-2 align-items-center">
                <input type="text" class="form-control form-control-sm" id="totp-verify-code"
                  placeholder="${t('settings.enterCode')}" maxlength="8" style="max-width:180px" autofocus>
                <button class="btn btn-primary btn-sm" id="btn-verify-totp">${t('settings.verify')}</button>
              </div>
              <div id="totp-setup-error" class="text-danger small mt-1 d-none"></div>
            `;

            document.getElementById('btn-verify-totp').addEventListener('click', async () => {
              const code = document.getElementById('totp-verify-code').value.trim();
              const errEl = document.getElementById('totp-setup-error');
              errEl.classList.add('d-none');
              if (!code) return;
              try {
                const { backupCodes } = await api.post('/auth/2fa/enable', { code });
                setupEl.innerHTML = `
                  <div class="alert alert-warning">
                    <strong><i class="bi bi-exclamation-triangle me-1"></i>${t('settings.backupCodes')}</strong>
                    <p class="small mb-2">${t('settings.backupCodesDesc')}</p>
                    <div class="backup-codes">${backupCodes.map(c => `<code>${c}</code>`).join(' ')}</div>
                  </div>
                  <button class="btn btn-primary btn-sm" id="btn-backup-done">${t('settings.backupCodesSaved')}</button>
                `;
                document.getElementById('btn-backup-done').addEventListener('click', () => load2faStatus());
              } catch (err) {
                errEl.textContent = err.message;
                errEl.classList.remove('d-none');
              }
            });

            document.getElementById('totp-verify-code').addEventListener('keydown', (e) => {
              if (e.key === 'Enter') document.getElementById('btn-verify-totp').click();
            });
          } catch (err) {
            confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          }
        });
      }
    } catch {
      el.innerHTML = '';
    }
  }

  async function promptPassword() {
    return new Promise((resolve) => {
      const id = 'pwd-' + Date.now();
      const html = `
        <div class="modal fade" id="${id}" tabindex="-1">
          <div class="modal-dialog modal-sm modal-dialog-centered">
            <div class="modal-content glass-card">
              <div class="modal-header"><h5 class="modal-title">${t('settings.disable2faConfirm')}</h5></div>
              <div class="modal-body">
                <input type="password" class="form-control" id="${id}-pw" placeholder="${t('auth.password')}" autofocus>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
                <button type="button" class="btn btn-danger btn-sm" id="${id}-ok">${t('settings.disable2fa')}</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      const modalEl = document.getElementById(id);
      const modal = new bootstrap.Modal(modalEl);
      document.getElementById(`${id}-ok`).addEventListener('click', () => {
        const pw = document.getElementById(`${id}-pw`).value;
        modal.hide();
        resolve(pw || null);
      });
      modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); resolve(null); }, { once: true });
      modalEl.addEventListener('shown.bs.modal', () => document.getElementById(`${id}-pw`).focus());
      modal.show();
    });
  }

  // ── Passkeys ──
  loadPasskeys();

  async function loadPasskeys() {
    const el = document.getElementById('passkeys-list');
    const isHttps = location.protocol === 'https:' || location.hostname === 'localhost';

    if (!window.PublicKeyCredential) {
      el.innerHTML = `<p class="text-muted small">${t('settings.passkeyNotSupported')}</p>`;
      return;
    }

    if (!isHttps) {
      el.innerHTML = `<p class="text-muted small">${t('settings.passkeyRequiresHttps')}</p>`;
      return;
    }

    try {
      const { passkeys } = await api.get('/auth/passkeys');

      let html = '';
      if (passkeys.length) {
        html += passkeys.map(pk => `
          <div class="session-item">
            <div class="session-icon"><i class="bi bi-fingerprint"></i></div>
            <div class="session-info">
              <div class="session-device">${pk.device_name || 'Passkey'}</div>
              <div class="session-meta">${pk.last_used_at ? formatTimeAgo(pk.last_used_at) : t('settings.never')}</div>
            </div>
            <button class="btn btn-outline-danger btn-sm btn-delete-passkey" data-id="${pk.id}">${t('common.delete')}</button>
          </div>
        `).join('');
      } else {
        html += `<p class="text-muted small mb-2">${t('settings.noPasskeys')}</p>`;
      }

      html += `
        <button class="btn btn-outline-primary btn-sm mt-2" id="btn-add-passkey">
          <i class="bi bi-fingerprint me-1"></i>${t('settings.addPasskey')}
        </button>
      `;

      el.innerHTML = html;

      // Delete passkey
      el.querySelectorAll('.btn-delete-passkey').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (await confirmDialog(t('settings.deletePasskeyConfirm'), { title: t('settings.deletePasskey') })) {
            await api.delete(`/auth/passkeys/${btn.dataset.id}`);
            loadPasskeys();
          }
        });
      });

      // Register new passkey
      document.getElementById('btn-add-passkey').addEventListener('click', async () => {
        try {
          const options = await api.post('/auth/passkey/register-options', {});

          const { startRegistration } = SimpleWebAuthnBrowser;
          const credential = await startRegistration({ optionsJSON: options });

          const deviceName = prompt(t('settings.passkeyName')) || 'Passkey';

          await api.post('/auth/passkey/register', { credential, deviceName });

          await confirmDialog(t('settings.passkeyRegistered'), {
            title: t('settings.passkeys'),
            confirmText: t('common.ok'),
            confirmClass: 'btn-primary',
          });
          loadPasskeys();
        } catch (err) {
          if (err.name !== 'NotAllowedError') {
            confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          }
        }
      });
    } catch {
      el.innerHTML = '';
    }
  }
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

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
