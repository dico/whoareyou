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
| **Relationships** | 17 relationship types (family, social, professional) with bidirectional linking and date tracking |
| **Addresses & Maps** | Geocoded addresses with Leaflet/OpenStreetMap maps, address history, and household views |
| **Photos** | Multiple profile photos per contact with client-side crop, WebP conversion, and drag-and-drop ordering |
| **Multi-tenant** | Each family/household gets isolated data — host for multiple families on one instance |
| **Multi-user** | Admin and member roles within each tenant, with private/shared visibility controls |
| **Internationalization** | English and Norwegian Bokmal out of the box, easy to add more languages |
| **Monica Import** | Migration script for contacts, relationships, labels, addresses, photos, and notes |

### Planned

- Labels/groups management UI
- Image attachments in timeline posts
- Reminders and notifications
- Tasks linked to contacts
- Family tree visualization
- Export functionality

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

*Last audited: 2026-03-27*

### Summary

| Area | Rating | Notes |
|------|--------|-------|
| Password Storage | Good | bcrypt with 12 salt rounds |
| SQL Injection | Good | All queries use Knex parameterized statements, no unsafe raw SQL |
| Tenant Isolation | Excellent | `tenant_id` enforced via middleware on every query, with visibility controls |
| Input Validation | Good | Required field checks, email validation, input trimming, pagination limits |
| File Uploads | Good | MIME type whitelist (images only), 10 MB limit, server-side re-encoding strips EXIF data |
| Authentication | Good | JWT with configurable expiry, refresh tokens, active-user checks |
| Security Headers | Good | Helmet.js enabled (CSP, X-Frame-Options, etc.) |
| Rate Limiting | Moderate | Applied to auth endpoints (20 req/15 min) — not yet on other endpoints |
| CORS | Moderate | Permissive in development — should be restricted for production |
| HTTPS/TLS | Not included | App serves HTTP only — **you must use a reverse proxy with TLS** (e.g., Caddy, Traefik, Nginx Proxy Manager) |
| Docker | Moderate | Alpine-based, minimal dependencies — runs as root (should be hardened for production) |

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