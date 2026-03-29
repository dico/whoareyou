import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t } from '../utils/i18n.js';

export function renderLogin() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card glass-card">
        <div class="auth-header">
          <img src="/img/logo-v3-people-circle.svg" alt="WhoareYou" class="auth-logo">
          <h1>${t('app.name')}</h1>
          <p>${t('app.tagline')}</p>
        </div>

        <div class="auth-tabs" id="auth-tabs">
          <button class="auth-tab active" data-tab="login">${t('auth.login')}</button>
          <button class="auth-tab" data-tab="register" id="register-tab">${t('auth.register')}</button>
        </div>

        <!-- Login form -->
        <form id="login-form" class="auth-form">
          <div class="form-floating mb-3">
            <input type="email" class="form-control" id="login-email" placeholder="${t('auth.email')}" required>
            <label for="login-email">${t('auth.email')}</label>
          </div>
          <div class="form-floating mb-3">
            <input type="password" class="form-control" id="login-password" placeholder="${t('auth.password')}" required>
            <label for="login-password">${t('auth.password')}</label>
          </div>
          <div id="login-error" class="alert alert-danger d-none"></div>
          <button type="submit" class="btn btn-primary w-100">${t('auth.login')}</button>
          <a href="#" class="d-none subtle-link small text-center d-block mt-2" id="forgot-password-link">${t('auth.forgotPassword')}</a>
          ${window.PublicKeyCredential && location.protocol === 'https:' ? `
            <div class="auth-divider"><span>or</span></div>
            <button type="button" class="btn btn-outline-secondary w-100" id="btn-passkey-login">
              <i class="bi bi-fingerprint me-2"></i>${t('settings.signInWithPasskey')}
            </button>
          ` : ''}
        </form>

        <!-- Register form -->
        <form id="register-form" class="auth-form d-none">
          <div class="row g-2 mb-3">
            <div class="col">
              <div class="form-floating">
                <input type="text" class="form-control" id="reg-first-name" placeholder="${t('auth.firstName')}" required>
                <label for="reg-first-name">${t('auth.firstName')}</label>
              </div>
            </div>
            <div class="col">
              <div class="form-floating">
                <input type="text" class="form-control" id="reg-last-name" placeholder="${t('auth.lastName')}" required>
                <label for="reg-last-name">${t('auth.lastName')}</label>
              </div>
            </div>
          </div>
          <div class="form-floating mb-3">
            <input type="email" class="form-control" id="reg-email" placeholder="${t('auth.email')}" required>
            <label for="reg-email">${t('auth.email')}</label>
          </div>
          <div class="form-floating mb-3">
            <input type="password" class="form-control" id="reg-password" placeholder="${t('auth.password')}" minlength="8" required>
            <label for="reg-password">${t('auth.passwordHint')}</label>
          </div>
          <div class="form-floating mb-3">
            <input type="text" class="form-control" id="reg-tenant" placeholder="${t('auth.tenantName')}">
            <label for="reg-tenant">${t('auth.tenantName')}</label>
          </div>
          <div id="register-error" class="alert alert-danger d-none"></div>
          <button type="submit" class="btn btn-primary w-100">${t('auth.createAccount')}</button>
        </form>

        <!-- Forgot password form -->
        <form id="forgot-form" class="auth-form d-none">
          <p class="text-muted small">${t('auth.forgotDesc')}</p>
          <div class="form-floating mb-3">
            <input type="email" class="form-control" id="forgot-email" placeholder="${t('auth.email')}" required>
            <label>${t('auth.email')}</label>
          </div>
          <div id="forgot-message" class="d-none mb-3"></div>
          <button type="submit" class="btn btn-primary w-100">${t('auth.sendResetLink')}</button>
          <a href="#" class="subtle-link small text-center d-block mt-2" id="forgot-back">${t('auth.backToLogin')}</a>
        </form>

        <!-- Reset password form (via URL token) -->
        <form id="reset-form" class="auth-form d-none">
          <p class="text-muted small">${t('auth.resetDesc')}</p>
          <div class="form-floating mb-3">
            <input type="password" class="form-control" id="reset-password" placeholder="${t('auth.passwordHint')}" required>
            <label>${t('auth.passwordHint')}</label>
          </div>
          <div id="reset-message" class="d-none mb-3"></div>
          <button type="submit" class="btn btn-primary w-100">${t('auth.resetPassword')}</button>
        </form>
      </div>
    </div>
  `;

  // Check for reset token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('token');
  if (resetToken && window.location.pathname === '/reset-password') {
    document.getElementById('auth-tabs')?.classList.add('d-none');
    document.getElementById('login-form')?.classList.add('d-none');
    document.getElementById('reset-form')?.classList.remove('d-none');
  }

  // Check registration + password reset status
  fetch('/api/system/registration-status').then(r => r.json()).then(({ enabled, password_reset }) => {
    if (password_reset) {
      document.getElementById('forgot-password-link')?.classList.remove('d-none');
    }
    if (!enabled) {
      document.getElementById('register-tab')?.remove();
      document.getElementById('register-form')?.remove();
    }
  }).catch(() => {});

  // Tab switching
  app.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      app.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('login-form').classList.toggle('d-none', target !== 'login');
      document.getElementById('register-form').classList.toggle('d-none', target !== 'register');
    });
  });

  // Forgot password link
  document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('auth-tabs')?.classList.add('d-none');
    document.getElementById('login-form')?.classList.add('d-none');
    document.getElementById('forgot-form')?.classList.remove('d-none');
  });

  // Back to login from forgot
  document.getElementById('forgot-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('auth-tabs')?.classList.remove('d-none');
    document.getElementById('forgot-form')?.classList.add('d-none');
    document.getElementById('login-form')?.classList.remove('d-none');
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="login"]')?.classList.add('active');
  });

  // Forgot password submit
  document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('forgot-message');
    try {
      const result = await api.post('/auth/forgot-password', { email: document.getElementById('forgot-email').value.trim() });
      msgEl.className = 'alert alert-success small mb-3';
      msgEl.textContent = result.message;
    } catch (err) {
      msgEl.className = 'alert alert-danger small mb-3';
      msgEl.textContent = err.message;
    }
  });

  // Reset password submit (token from URL)
  document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('reset-message');
    try {
      const result = await api.post('/auth/reset-password', {
        token: resetToken,
        password: document.getElementById('reset-password').value,
      });
      msgEl.className = 'alert alert-success small mb-3';
      msgEl.textContent = result.message;
      setTimeout(() => { window.location.href = '/login'; }, 2000);
    } catch (err) {
      msgEl.className = 'alert alert-danger small mb-3';
      msgEl.textContent = err.message;
    }
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('d-none');

    try {
      const data = await api.post('/auth/login', {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
      });

      if (data.requires_2fa) {
        show2faPrompt(data.challengeToken, errorEl);
        return;
      }

      if (data.requires_2fa_setup) {
        errorEl.textContent = t('settings.twoFactorSetupRequired');
        errorEl.classList.remove('d-none');
        return;
      }

      localStorage.setItem('token', data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      state.token = data.token;
      state.user = data.user;
      navigate('/');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

  function show2faPrompt(challengeToken, errorEl) {
    const form = document.getElementById('login-form');
    form.innerHTML = `
      <p class="text-center mb-3"><i class="bi bi-shield-lock" style="font-size:2rem;color:var(--color-primary)"></i></p>
      <p class="small text-center mb-3">${t('settings.twoFactorRequired')}</p>
      <input type="text" class="form-control mb-3" id="totp-code" placeholder="${t('settings.enterCode')}" maxlength="8" autofocus autocomplete="one-time-code">
      <div id="login-error" class="alert alert-danger d-none"></div>
      <button type="submit" class="btn btn-primary w-100">${t('settings.verify')}</button>
    `;

    const newErrorEl = document.getElementById('login-error');
    setTimeout(() => document.getElementById('totp-code')?.focus(), 100);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      newErrorEl.classList.add('d-none');
      const code = document.getElementById('totp-code').value.trim();
      if (!code) return;

      try {
        const data = await api.post('/auth/2fa/verify', { challengeToken, code });
        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        state.token = data.token;
        state.user = data.user;
        navigate('/');
      } catch (err) {
        newErrorEl.textContent = err.message;
        newErrorEl.classList.remove('d-none');
      }
    });
  }

  // Register
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('register-error');
    errorEl.classList.add('d-none');

    try {
      const data = await api.post('/auth/register', {
        first_name: document.getElementById('reg-first-name').value,
        last_name: document.getElementById('reg-last-name').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value,
        tenant_name: document.getElementById('reg-tenant').value || undefined,
      });

      localStorage.setItem('token', data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      state.token = data.token;
      state.user = data.user;
      navigate('/');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

  // Passkey login
  document.getElementById('btn-passkey-login')?.addEventListener('click', async () => {
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('d-none');
    try {
      const options = await api.post('/auth/passkey/login-options', {});
      const { startAuthentication } = SimpleWebAuthnBrowser;
      const credential = await startAuthentication({ optionsJSON: options });

      const data = await api.post('/auth/passkey/login', { credential, challenge: options.challenge });
      localStorage.setItem('token', data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      state.token = data.token;
      state.user = data.user;
      navigate('/');
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        errorEl.textContent = err.message;
        errorEl.classList.remove('d-none');
      }
    }
  });
}
