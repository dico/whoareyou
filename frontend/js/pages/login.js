import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t } from '../utils/i18n.js';

export function renderLogin() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card glass-card">
        <div class="auth-header">
          <h1><i class="bi bi-people-fill"></i> ${t('app.name')}</h1>
          <p>${t('app.tagline')}</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">${t('auth.login')}</button>
          <button class="auth-tab" data-tab="register">${t('auth.register')}</button>
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
      </div>
    </div>
  `;

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

      localStorage.setItem('token', data.token);
      state.token = data.token;
      state.user = data.user;
      navigate('/');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

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
      state.token = data.token;
      state.user = data.user;
      navigate('/');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}
