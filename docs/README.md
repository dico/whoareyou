# WhoareYou Developer Documentation

> Developer reference for the WhoareYou Personal Relationship Manager. For end-user documentation, see the [project README](../README.md).

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | Tech stack, project structure, backend/frontend organization |
| [Database](database.md) | Schema overview, key tables, migration conventions |
| [API Reference](api.md) | All REST endpoints grouped by module |
| [Frontend Guide](frontend.md) | Components, pages, patterns, CSS architecture |
| [Design Guidelines](design-guidelines.md) | UI/UX rules, component standards, do's and don'ts |
| [Security](security.md) | Auth flow, tenant isolation, IP security, audit history |
| [Integrations](integrations.md) | MomentGarden import, ipgeolocation.io, SMTP |
| [Family Portal](portal.md) | Portal architecture, guest auth, share links |

## Quick Start for Contributors

### Prerequisites
- Node.js 22+
- MySQL 8+
- Docker (for deployment)

### Development Setup
```bash
# Clone
git clone git@github.com:dico/whoareyou.git
cd whoareyou

# Backend
cd backend && npm install
cp .env.example .env  # Configure database connection
npm run dev            # Starts with --watch

# Frontend
# No build step — served directly by Nginx or any static server
```

### Key Principles
1. **Vanilla JS** — no React, no build tools, no bundlers. ES6 modules loaded directly.
2. **Reuse components** — check `frontend/js/components/` before creating new UI patterns.
3. **Read the [Design Guidelines](design-guidelines.md)** — consistency is enforced.
4. **Tenant isolation** — every query MUST filter by `tenant_id`.
5. **i18n** — every user-facing string uses `t('key')`. Add keys to both `en.json` and `nb.json`.

### Project Structure
```
whoareyou/
├── backend/
│   └── src/
│       ├── index.js              # Express app entry point
│       ├── config/               # App configuration
│       ├── middleware/            # Auth, tenant scope, portal auth
│       ├── routes/               # 17 route modules
│       ├── services/             # Email, image, geocoding, geolocation
│       ├── utils/                # Errors, validation, sessions, IP, settings
│       └── migrations/           # 50 Knex migrations
├── frontend/
│   ├── index.html                # SPA entry point
│   ├── portal.html               # Portal entry point (planned)
│   ├── css/
│   │   ├── variables.css         # CSS custom properties (theme)
│   │   ├── base.css              # Base styles + utility classes
│   │   └── components/           # Per-feature CSS (10 files)
│   ├── js/
│   │   ├── app.js                # Router + state + init
│   │   ├── api/client.js         # API client (fetch wrapper)
│   │   ├── components/           # Reusable UI components (11 files)
│   │   ├── pages/                # Page renderers (24 files)
│   │   └── utils/                # i18n, auth-url, drop-zone, visibility
│   ├── locales/                  # en.json, nb.json
│   └── img/                      # Logo, icons, flags
├── docs/                         # This documentation
├── dev-tools/                    # AI-assisted debugging tools
├── nginx.conf                    # Nginx config (in-container)
├── Dockerfile                    # Multi-stage build
├── docker-compose.yml            # Development
└── docker-compose.prod.yml       # Production
```
