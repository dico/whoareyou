import { api } from './api/client.js';
import { setLocale } from './utils/i18n.js';
import './utils/datepicker.js'; // Auto-init flatpickr on all date inputs
import { renderLogin } from './pages/login.js';
import { renderContacts } from './pages/contacts.js';
import { renderContactDetail } from './pages/contact-detail.js';
import { renderTimeline } from './pages/timeline.js';
import { renderMap, destroyMap } from './pages/map.js';
import { renderProfile } from './pages/profile.js';
import { renderSettings } from './pages/settings.js';
import { renderTenantAdmin } from './pages/admin-tenant.js';
import { renderSecurityAdmin } from './pages/admin-security.js';
import { renderSystemAdmin } from './pages/admin-system.js';
import { renderAddressDetail } from './pages/address-detail.js';
import { renderDuplicates } from './pages/admin-duplicates.js';
import { renderConsistencyReport } from './pages/admin-consistency.js';
import { renderExportData } from './pages/admin-export.js';
import { renderTrash } from './pages/admin-trash.js';
import { renderAddressMerge } from './pages/admin-addresses.js';
import { renderCompanies } from './pages/companies.js';
import { renderCompanyDetail } from './pages/company-detail.js';
import { renderLabelAdmin } from './pages/admin-labels.js';
import { renderRelationshipSuggestions } from './pages/admin-relationships.js';
import { renderIntegrations } from './pages/admin-integrations.js';
import { renderMomentGarden } from './pages/admin-momentgarden.js';
import { renderGifts, renderGiftEvents } from './pages/gifts.js';
import { renderGiftEventDetail } from './pages/gift-event-detail.js';
import { renderGiftProducts } from './pages/gift-products.js';
import { renderGiftWishlists } from './pages/gift-wishlists.js';
import { renderGiftPlanning } from './pages/gift-planning.js';
import { renderGenerateBook } from './pages/generate-book.js';
import { renderMemories } from './pages/memories.js';
import { renderNotificationSettings } from './pages/settings-notifications.js';
import { registerServiceWorker } from './utils/push.js';
import { renderBookPreview } from './pages/book-preview.js';
import { renderSignage } from './pages/admin-signage.js';
import { renderNavbar } from './components/navbar.js';
import { renderPortalLogin, renderPortalTimeline, handleShareLink } from './pages/portal-timeline.js';

// Simple router
const routes = {
  '/': () => renderTimeline(),
  '/timeline': () => renderTimeline(),
  '/contacts': () => renderContacts(),
  '/contacts/:uuid': (params) => renderContactDetail(params.uuid),
  '/contacts/:uuid/posts': (params) => renderTimeline(params.uuid),
  '/map': () => renderMap(),
  '/groups': () => renderCompanies(),
  '/groups/:uuid': (params) => renderCompanyDetail(params.uuid),
  '/addresses/:id': (params) => renderAddressDetail(params.id),
  '/profile': () => renderProfile(),
  '/settings': () => renderSettings(),
  '/admin/tenant': () => renderTenantAdmin(),
  '/admin/security': () => renderSecurityAdmin(),
  '/admin/system': () => renderSystemAdmin(),
  '/admin/duplicates': () => renderDuplicates(),
  '/admin/consistency': () => renderConsistencyReport(),
  '/admin/export-data': () => renderExportData(),
  '/admin/signage': () => renderSignage(),
  '/admin/trash': () => renderTrash(),
  '/admin/addresses': () => renderAddressMerge(),
  '/admin/labels': () => renderLabelAdmin(),
  '/admin/relationships': () => renderRelationshipSuggestions(),
  '/admin/integrations': () => renderIntegrations(),
  '/admin/integrations/momentgarden': () => renderMomentGarden(),
  '/gifts': () => renderGifts(),
  '/gifts/events': () => renderGiftEvents(),
  '/gifts/events/:uuid': (params) => renderGiftEventDetail(params.uuid),
  '/gifts/products': () => renderGiftProducts(),
  '/gifts/wishlists': () => renderGiftWishlists(),
  '/gifts/planning': () => renderGiftPlanning(),
  '/settings/generate-book': () => renderGenerateBook(),
  '/memories': () => renderMemories(),
  '/settings/notifications': () => renderNotificationSettings(),
  '/books/:uuid/preview': (params) => renderBookPreview(params.uuid),
  '/login': () => renderLogin(),
  '/reset-password': () => renderLogin(),
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
      localStorage.removeItem('refreshToken');
    }
  }

  // Initialize i18n (user preference → localStorage → browser → default)
  const browserLocale = navigator.language?.split('-')[0];
  const locale = state.user?.language || localStorage.getItem('locale') || (['nb', 'nn', 'no'].includes(browserLocale) ? 'nb' : 'en');
  await setLocale(locale);

  // Portal routes — completely separate from main app auth
  if (path.startsWith('/portal')) {
    app.innerHTML = '<div id="portal-root"></div>';
    if (path === '/portal/login') {
      renderPortalLogin();
    } else if (path.startsWith('/portal/s/')) {
      const token = path.split('/portal/s/')[1];
      handleShareLink(token);
    } else {
      // Check portal auth — try localStorage, sessionStorage, then cookie refresh
      let portalToken = localStorage.getItem('portalToken') || sessionStorage.getItem('portalToken');
      if (!portalToken) {
        // Try refresh from cookie (iOS standalone mode)
        const refreshToken = document.cookie.split('; ').find(c => c.startsWith('portalRefreshToken='))?.split('=')[1];
        if (refreshToken) {
          try {
            const res = await fetch('/api/portal/auth/refresh', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            });
            if (res.ok) {
              const data = await res.json();
              localStorage.setItem('portalToken', data.token);
              portalToken = data.token;
            }
          } catch { /* fall through */ }
        }
      }
      if (!portalToken) {
        window.history.replaceState({}, '', '/portal/login');
        renderPortalLogin();
      } else {
        renderPortalTimeline();
      }
    }
    return;
  }

  // Redirect to login if not authenticated
  if (!state.token && path !== '/login' && path !== '/reset-password') {
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

// Register PWA service worker (handles web push + notification clicks).
// Fire-and-forget — failing to register should never break the app.
registerServiceWorker();
