# WhoareYou

**A modern, self-hosted Personal Relationship Manager for the whole family.**

WhoareYou helps you nurture your personal relationships by keeping track of the people in your life — their birthdays, addresses, how you met, what you talked about, and how they're all connected. Think of it as a private, family-friendly CRM that lives on your own server.

Inspired by the excellent [Monica](https://github.com/monicahq/monica), WhoareYou picks up where Monica left off — adding features like maps, household views, multi-user family accounts, and a modern glass-effect UI. With Monica's v4.x development stalled, WhoareYou was born to fill the gap.

## Why WhoareYou?

- **Your data, your server.** Self-hosted with Docker. No cloud, no tracking, no subscriptions.
- **Built for families.** Multi-tenant architecture lets you host separate accounts for friends and family on a single instance.
- **See connections.** Map your relationships visually — who lives where, who knows who, and how everyone is connected.
- **One timeline.** No more scattered notes, activities, and meetings. Everything lives in a single, searchable timeline with @-mentions.
- **Migrate from Monica.** Built-in migration script brings your contacts, relationships, notes, and photos over from Monica.

## Features

| Feature | Description |
|---------|-------------|
| **Contacts** | Full contact management with photos, custom fields, social media links, favorites, and soft delete |
| **Timeline** | Universal post system with @-mention tagging — replaces separate notes, activities, and meetings |
| **Relationships** | 19 relationship types (family, social, professional) with bidirectional linking and date tracking |
| **Addresses & Maps** | Geocoded addresses with Leaflet/OpenStreetMap maps, address history, and household views |
| **Photos** | Multiple profile photos per contact with client-side crop, WebP conversion, and drag-and-drop ordering |
| **Multi-tenant** | Each family/household gets isolated data — host for multiple families on one instance |
| **Multi-user** | Admin and member roles within each tenant, with private/shared visibility controls |
| **Internationalization** | English and Norwegian Bokmal out of the box, easy to add more languages |
| **Monica Import** | Migration script for contacts, relationships, labels, addresses, photos, and notes |

### Also Included

- **Labels/groups** — create, assign, filter, and manage labels with a split-view transfer tool
- **Image attachments** — add photos to timeline posts with grid gallery and lightbox viewer
- **Reminders & notifications** — birthday auto-reminders, custom reminders, in-app notification bell with unread count
- **Companies** — company directory with employees, job titles, and company detail pages
- **Life events** — 10 event types with icons, annual anniversary reminders, timeline integration with "together with" links
- **Family tree** — SVG visualization with pan/zoom, view modes (full family/direct lineage/ancestors/descendants), depth control, category filter, relationship labels, clickable nodes
- **Gifts** — gift events (christmas, birthday, wedding), product catalog with URL scraping, status lifecycle, wishlists per family member, planning list, visibility rules (hidden from recipients)
- **Interests** — reusable label system with group/interest categories
- **Birthdays** — upcoming birthdays dashboard widget
- **Address management** — address history (move in/out), household view, duplicate merge tool, share address with one click
- **Global search** — search contacts, posts, companies, and contact fields from the navbar
- **User management** — add members with or without login (household members like children), promote/demote, link to contact, auto-suggest contact linking, optional welcome email
- **Session management** — view active login sessions, revoke individual or all other sessions
- **Relationship suggestions** — auto-detect missing siblings, grandparents, uncle/aunt from existing data

- **Two-factor authentication** — TOTP with QR code setup, backup codes, trusted IP ranges skip 2FA on local network
- **Session-based auth** — short-lived JWT (15 min) with refresh tokens, automatic token renewal

- **Passkeys** — passwordless login with fingerprint, face recognition, or security keys (WebAuthn)
- **Email notifications** — SMTP config in admin, login alerts via nodemailer

### Planned

- Export functionality (JSON/CSV)
- Document attachments (PDF, files)
- Gift product images

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla ES6+ JavaScript, Bootstrap 5, Leaflet |
| Backend | Node.js, Express, Knex.js |
| Database | MySQL 8+ |
| Images | sharp (WebP, thumbnails, EXIF stripping) |
| Auth | bcrypt + JWT |
| Geocoding | Nominatim (OpenStreetMap) — no API key needed |
| Hosting | Docker (Alpine + Nginx reverse proxy) |

No build step. No framework lock-in. No external service dependencies.

## Getting Started

> **WhoareYou is under active development.** Docker images are not yet published. Setup instructions will be added once the project reaches a stable release. If you want to try it now, you'll need to clone the repo and build locally.

<!-- TODO: Add setup instructions when Docker image is published
## Installation

### Quick Start with Docker

```bash
docker pull whoareyou/whoareyou:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  whoareyou:
    image: whoareyou/whoareyou:latest
    ports:
      - "8080:80"
    environment:
      - DB_HOST=your-mysql-host
      - DB_NAME=whoareyou
      - DB_USER=whoareyou
      - DB_PASSWORD=your-secure-password
      - JWT_SECRET=your-secure-random-secret
    volumes:
      - uploads:/app/uploads

  mysql:
    image: mysql:8
    environment:
      MYSQL_DATABASE: whoareyou
      MYSQL_USER: whoareyou
      MYSQL_PASSWORD: your-secure-password
      MYSQL_ROOT_PASSWORD: your-root-password
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  uploads:
  mysql_data:
```

### First Run

1. Start the containers
2. Open `http://localhost:8080`
3. Register your first account — this user becomes the system administrator
4. Create a tenant (family/household) and invite members
-->

## AI-Developed Software

This project is built with [Claude Code](https://claude.ai/claude-code) (Anthropic's AI coding assistant). The developer has ~20 years of experience writing code and used AI to finally realize a long-standing idea for a personal relationship manager.

**What this means for you:**

- The code is functional and feature-rich, but has not undergone traditional peer code review.
- The primary focus has been on features and usability, not on production hardening.
- The developer hosts this locally and uses it daily — it works, but your mileage may vary.

**This software is provided as-is, without warranty or support.** You are welcome to use it, fork it, and modify it — but please do not expect bug fixes, feature requests, or support from the developer. Host it at your own risk.

## Security Audit

The following security assessment was performed by Claude (AI) based on a review of the actual source code. This is **not** a professional penetration test — it is an automated review to give potential users transparency into the security posture of the application.

*Last audited: 2026-03-27 (round 2 — full route-by-route review)*

### Summary

| Area | Rating | Notes |
|------|--------|-------|
| Password Storage | **Excellent** | bcrypt with 12 salt rounds |
| SQL Injection | **Excellent** | All queries use Knex parameterized statements, no raw SQL with user input |
| Tenant Isolation | **Excellent** | `tenant_id` enforced via middleware + validated on every query. Cross-tenant label/type injection fixed. File access tenant-validated. |
| Input Validation | **Good** | Required field checks, email validation, input trimming, pagination limits, language whitelist |
| File Uploads | **Good** | MIME type whitelist (images only), size limit, sharp re-encoding strips EXIF. Files require auth + tenant validation. |
| Authentication | **Excellent** | Short-lived JWT (15 min) + refresh tokens (30 days), session tracking in DB, 2FA (TOTP) |
| Security Headers | **Good** | Helmet.js enabled (CSP, X-Frame-Options, etc.) |
| Rate Limiting | **Good** | Auth: 20 req/15 min. All API: 300 req/15 min. |
| CORS | **Good** | Configurable via `CORS_ORIGIN` env var. Default permissive in development. |
| Session Management | **Good** | Active sessions visible in UI, revocable individually or all-at-once. Password change revokes all other sessions. Hourly cleanup of expired sessions. |
| 2FA | **Good** | TOTP with QR setup, backup codes (SHA-256 hashed), trusted IP ranges to skip 2FA on local network. |
| HTTPS/TLS | Not included | App serves HTTP only — **you must use a reverse proxy with TLS** |
| Docker | Moderate | Alpine-based, minimal dependencies — runs as root (should be hardened for production) |

### Issues Found and Fixed (this audit)

| Severity | Issue | Fix |
|----------|-------|-----|
| ~~HIGH~~ Fixed | Label IDs in contact create/update not validated against tenant | Added tenant validation before inserting `contact_labels` |
| ~~HIGH~~ Fixed | `/uploads/` file access not tenant-scoped (any auth user could access any tenant's files) | Added tenant validation by checking contact/post UUID ownership |
| ~~MEDIUM~~ Fixed | `relationship_type_id` not validated against tenant (custom types from other tenants could be referenced) | Added tenant_id/null check on type lookup |
| ~~MEDIUM~~ Fixed | `getPostWithDetails` fetched "about" contact without `tenant_id` filter | Added `tenant_id` to query |
| ~~LOW~~ Fixed | Language endpoint accepted arbitrary strings | Added whitelist (`en`, `nb`) |
| Low (accepted) | Access tokens valid until JWT expiry even after session revocation | Mitigated by 15-minute token TTL + auto-refresh |
| Low (accepted) | CORS reflects origin when set to `*` with credentials | Should be explicitly set in production via `CORS_ORIGIN` |

### Recommendations for Self-Hosters

1. **Always use HTTPS.** Place WhoareYou behind a reverse proxy with TLS (Let's Encrypt, Caddy, Nginx Proxy Manager, etc.). JWT tokens and personal data must not travel over plain HTTP.
2. **Set a strong JWT_SECRET.** Generate a random 64+ character secret. Do not use the default development value.
3. **Secure your database.** Use strong passwords, restrict network access, and consider running MySQL on a private network.
4. **Restrict CORS.** In production, set a `CORS_ORIGIN` environment variable to your specific domain.
5. **Back up your data.** The application uses soft deletes, but regular database and upload folder backups are still essential.
6. **Keep it updated.** Pull the latest image regularly for security patches in Node.js, Nginx, and dependencies.

### What This App Does NOT Do

- Does not phone home or send telemetry
- Does not require external API keys (geocoding uses free Nominatim)
- Does not store analytics or tracking data
- Does not include advertising or third-party scripts

## Screenshots

<!-- TODO: Add screenshots when UI is more polished -->

## License

<!-- TODO: Choose and add license -->

## Acknowledgments

- [Monica](https://github.com/monicahq/monica) — the original inspiration for this project
- [Claude Code](https://claude.ai/claude-code) — AI-assisted development by Anthropic
- [OpenStreetMap](https://www.openstreetmap.org/) & [Nominatim](https://nominatim.org/) — maps and geocoding
- [Leaflet](https://leafletjs.com/) — interactive map library
- [Bootstrap](https://getbootstrap.com/) — UI framework
- [sharp](https://sharp.pixelplumbing.com/) — image processing