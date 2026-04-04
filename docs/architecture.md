# Architecture

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla ES6+, Bootstrap 5, Leaflet | No build step, no framework |
| Backend | Node.js 22, Express 5, Knex.js | ES modules (`"type": "module"`) |
| Database | MySQL 8+ | External server, Knex migrations |
| Images | sharp | WebP conversion, thumbnails, EXIF stripping |
| Auth | bcrypt + JWT + TOTP + Passkeys | 15-min access + 30-day refresh |
| Email | nodemailer | SMTP config stored in system_settings |
| Maps | Leaflet + OpenStreetMap/Nominatim | No API key required |
| Deployment | Docker (Alpine + Nginx) | Single container: Nginx + Node.js |
| Dev tools | FastAPI bridge | AI-assisted debugging (port 7601) |

## Backend Architecture

### Request Flow
```
Client → Nginx → Express
                    ├── Rate limiter (300 req/15min, 20 for auth)
                    ├── IP security check (login routes only)
                    ├── authenticate middleware (JWT verification)
                    ├── tenantScope middleware (sets req.tenantId)
                    └── Route handler
```

### Middleware Chain
1. **Helmet** — security headers (CSP, X-Frame-Options, etc.)
2. **CORS** — configurable via `CORS_ORIGIN` env var
3. **Rate limiting** — `express-rate-limit` on all API routes
4. **authenticate** (`middleware/auth.js`) — verifies JWT, loads user, checks `is_active`
5. **tenantScope** (`middleware/tenant.js`) — sets `req.tenantId` from JWT
6. **portalAuthenticate** (`middleware/portal-auth.js`) — separate chain for portal guests

### Route Modules (17 files)
| File | Prefix | Description |
|------|--------|-------------|
| `auth.js` | `/api/auth` | Login, register, 2FA, passkeys, sessions, members |
| `contacts.js` | `/api/contacts` | Contact CRUD, search, fields, birthdays |
| `posts.js` | `/api/posts` | Timeline posts, comments, reactions, gallery |
| `relationships.js` | `/api/relationships` | Relationship CRUD, tree, suggestions |
| `addresses.js` | `/api/addresses` | Address CRUD, geocoding, map, merge |
| `labels.js` | `/api/labels` | Label CRUD, batch assign/remove |
| `companies.js` | `/api/companies` | Company CRUD, employees |
| `life-events.js` | `/api/life-events` | Life event CRUD |
| `reminders.js` | `/api/reminders` | Reminder CRUD |
| `notifications.js` | `/api/notifications` | Notification list, generate, mark-read |
| `gifts.js` | `/api/gifts` | Products, events, orders, wishlists |
| `uploads.js` | `/api` | Photo/media upload + processing |
| `import.js` | `/api/import` | MomentGarden ZIP import + sync |
| `export.js` | `/api/export` | Data + media export (JSON ZIP, full backup) |
| `system.js` | `/api/system` | System admin, SMTP, IP security, tenants |
| `portal.js` | `/api/portal` | Portal guest timeline, comments, reactions |
| `portal-admin.js` | `/api/portal-admin` | Portal guest/link management |

### Services
| Service | File | Purpose |
|---------|------|---------|
| Image processing | `services/image.js` | `processImage()` — resize, WebP, thumbnail, EXIF strip |
| Email | `services/email.js` | `sendEmail()`, `sendLoginNotification()` via nodemailer |
| Geocoding | `services/geocoding.js` | Address → lat/lng via Nominatim |
| Geolocation | `services/geolocation.js` | IP → country via ipgeolocation.io, DB-cached 30 days |

### Configuration
All config in `config/index.js`, sourced from environment variables:
- `JWT_SECRET` — token signing key
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — database
- `CORS_ORIGIN` — allowed origins
- `UPLOADS_DIR` — file storage path
- `TRUSTED_IP_RANGES` — fallback trusted IPs
- `MAX_FILE_SIZE` — upload limit (default 100MB)

## Frontend Architecture

### SPA Routing (`app.js`)
Client-side router matching URL paths to page renderers:
```javascript
const routes = {
  '/': () => renderTimeline(),
  '/contacts': () => renderContacts(),
  '/contacts/:uuid': (params) => renderContactDetail(params.uuid),
  // ... 30+ routes
};
```

Navigation uses `history.pushState` — all links with `data-link` attribute are intercepted.

### Auth Flow
1. On load: check `localStorage.token`
2. If token exists: call `GET /api/auth/me` to validate
3. If invalid: clear storage, redirect to `/login`
4. Token auto-refresh via `401` interceptor in `api/client.js`

### State Management
Minimal global state in `app.js`:
```javascript
export const state = {
  user: null,       // Current user object from /auth/me
  token: localStorage.getItem('token'),
};
```

### File Organization Convention
- **Pages** (`pages/*.js`) — one file per route, exports `renderPageName()`
- **Components** (`components/*.js`) — reusable UI, exports functions
- **Utils** (`utils/*.js`) — pure helpers (i18n, auth-url, etc.)
- **API** (`api/client.js`) — single fetch wrapper

## Multi-Tenancy

Every data table includes `tenant_id`. The middleware chain ensures:
1. JWT contains `tenantId` (set at login)
2. `tenantScope` middleware sets `req.tenantId`
3. Every query filters `WHERE tenant_id = req.tenantId`

Users can be members of multiple tenants via `tenant_members` table. Switching requires explicit membership — system admins cannot bypass this. Auth middleware validates membership on every request for non-home tenants.

## Deployment

### Docker (Single Container)
```
Dockerfile → node:22-alpine
  ├── Backend: Node.js on port 3000
  ├── Frontend: static files in /app/frontend
  ├── Nginx: port 80 (reverse proxy + static)
  └── entrypoint.sh: runs migrations → starts Nginx → starts Node
```

### Environment
- **Development**: `docker-compose.yml` with bind mounts for hot-reload
- **Production**: `docker-compose.prod.yml` with image from registry
- Migrations run automatically on container start
