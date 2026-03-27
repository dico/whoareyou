import { api } from './api/client.js';
import { setLocale } from './utils/i18n.js';
import { renderLogin } from './pages/login.js';
import { renderContacts } from './pages/contacts.js';
import { renderContactDetail } from './pages/contact-detail.js';
import { renderTimeline } from './pages/timeline.js';
import { renderMap, destroyMap } from './pages/map.js';
import { renderSettings } from './pages/settings.js';
import { renderTenantAdmin } from './pages/admin-tenant.js';
import { renderSystemAdmin } from './pages/admin-system.js';
import { renderNavbar } from './components/navbar.js';

// Simple router
const routes = {
  '/': () => renderTimeline(),
  '/timeline': () => renderTimeline(),
  '/contacts': () => renderContacts(),
  '/contacts/:uuid': (params) => renderContactDetail(params.uuid),
  '/contacts/:uuid/posts': (params) => renderTimeline(params.uuid),
  '/map': () => renderMap(),
  '/settings': () => renderSettings(),
  '/admin/tenant': () => renderTenantAdmin(),
  '/admin/system': () => renderSystemAdmin(),
  '/login': () => renderLogin(),
};

// App state
export const state = {
  user: null,
  token: localStorage.getItem('token'),
};

// Navigate to a route
export function navigate(path) {
  // Cleanup map if navigating away
  if (window.location.pathname === '/map' && path !== '/map') {
    destroyMap();
  }
  window.history.pushState({}, '', path);
  render();
}

// Match route with params
function matchRoute(path) {
  for (const [pattern, handler] of Object.entries(routes)) {
    const paramNames = [];
    const regex = pattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    const match = path.match(new RegExp(`^${regex}$`));
    if (match) {
      const params = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler, params };
    }
  }
  return null;
}

// Main render
async function render() {
  const app = document.getElementById('app');
  const path = window.location.pathname;

  // Check auth
  if (state.token && !state.user) {
    try {
      const data = await api.get('/auth/me');
      state.user = data.user;
    } catch {
      // Invalid token
      state.token = null;
      state.user = null;
      localStorage.removeItem('token');
    }
  }

  // Initialize i18n (user preference → localStorage → browser → default)
  const browserLocale = navigator.language?.split('-')[0];
  const locale = state.user?.language || localStorage.getItem('locale') || (['nb', 'nn', 'no'].includes(browserLocale) ? 'nb' : 'en');
  await setLocale(locale);

  // Redirect to login if not authenticated
  if (!state.token && path !== '/login') {
    window.history.replaceState({}, '', '/login');
    app.innerHTML = '';
    renderLogin();
    return;
  }

  // Redirect to home if authenticated and on login page
  if (state.token && path === '/login') {
    window.history.replaceState({}, '', '/');
    renderApp();
    return;
  }

  if (path === '/login') {
    app.innerHTML = '';
    renderLogin();
    return;
  }

  renderApp();
}

function renderApp() {
  const app = document.getElementById('app');
  const path = window.location.pathname;

  // Render shell if not present
  if (!document.getElementById('app-navbar')) {
    app.innerHTML = `
      <nav id="app-navbar"></nav>
      <main id="app-content" class="app-content"></main>
    `;
    renderNavbar();
  }

  // Route to page
  const route = matchRoute(path) || matchRoute('/');
  if (route) {
    route.handler(route.params);
  }
}

// Handle browser back/forward
window.addEventListener('popstate', render);

// Handle link clicks (SPA navigation)
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-link]');
  if (link) {
    e.preventDefault();
    navigate(link.getAttribute('href'));
  }
});

// Initial render
render();
