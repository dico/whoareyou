# Security

## Overview

WhoareYou is designed for self-hosting on private networks. Security is layered:

1. **Authentication** — bcrypt passwords, short-lived JWTs (15 min), refresh tokens (30 days)
2. **Two-factor** — TOTP with backup codes, or passwordless passkeys (WebAuthn)
3. **IP security** — login IP whitelist, country whitelist via ipgeolocation.io
4. **Tenant isolation** — every query scoped by `tenant_id` via middleware
5. **Portal isolation** — guest users in separate table with contactIds-only access

## Security Audit

The following assessment was performed by Claude (AI) based on a review of the actual source code. This is **not** a professional penetration test — it is an automated review for transparency.

*Last audited: 2026-03-29 (round 4)*

### Summary

| Area | Rating | Notes |
|------|--------|-------|
| Password Storage | **Excellent** | bcrypt with 12 salt rounds |
| SQL Injection | **Excellent** | All queries use Knex parameterized statements |
| Tenant Isolation | **Excellent** | `tenant_id` enforced via middleware on every query. File access tenant-validated. |
| Input Validation | **Good** | Required field checks, email validation, input trimming, pagination limits |
| File Uploads | **Good** | MIME type whitelist (images, video, documents), 100MB limit, sharp strips EXIF |
| Authentication | **Excellent** | JWT + refresh tokens + session tracking + 2FA + Passkeys |
| IP Security | **Good** | IP whitelist (CIDR) + country whitelist, checked on all 7 unauthenticated auth routes |
| Security Headers | **Good** | Helmet.js (CSP, X-Frame-Options, etc.) |
| Rate Limiting | **Good** | Auth: 20 req/15 min. API: 1000 req/15 min. |
| CORS | **Good** | Configurable via `CORS_ORIGIN` env var |
| Session Management | **Good** | Device/IP/country tracking, revocable, password change revokes all |
| Portal Isolation | **Excellent** | Separate table, separate JWT type, contactIds-only access |
| HTTPS/TLS | Not included | **You must use a reverse proxy with TLS** |

### Audit History

| Round | Focus | Key Findings |
|-------|-------|-------------|
| 1 | Initial review | Architecture validated |
| 2 | Route-by-route | Fixed: cross-tenant label injection (HIGH), file access bypass (HIGH), type validation (MEDIUM) |
| 3 | Admin security | Added: password validation on admin reset, session revocation on password change, rate limiting on admin routes, 2FA reset requires password |
| 4 | IP security + portal | Verified: all 7 auth routes check IP whitelist, portal guest isolation complete |

### Accepted Risks

| Risk | Mitigation |
|------|-----------|
| Access tokens valid until JWT expiry after session revocation | 15-minute token TTL + auto-refresh |
| CORS permissive in development | Set `CORS_ORIGIN` in production |
| Docker runs as root | Use non-root user for production hardening |

## Recommendations for Self-Hosters

1. **Always use HTTPS.** Place WhoareYou behind a reverse proxy with TLS (Let's Encrypt, Caddy, Nginx Proxy Manager). JWT tokens and personal data must not travel over plain HTTP.
2. **Set a strong JWT_SECRET.** Generate a random 64+ character secret.
3. **Secure your database.** Strong passwords, restricted network access, private network.
4. **Restrict CORS.** Set `CORS_ORIGIN` to your specific domain in production.
5. **Back up your data.** Regular database and upload folder backups.
6. **Enable IP security.** Whitelist your IP ranges and/or country in System Admin → IP Security.
7. **Enable 2FA.** Require two-factor authentication for all users, especially on public-facing instances.

## Privacy

- Does not phone home or send telemetry
- Does not require external API keys (geocoding uses free Nominatim)
- ipgeolocation.io integration is optional (requires user-provided API key)
- Does not store analytics or tracking data
- Does not include advertising or third-party scripts

## Reporting Vulnerabilities

If you find a security issue, please open a GitHub issue or contact the maintainer directly.
