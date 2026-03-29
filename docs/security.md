# Security

## Authentication Flow

### Login
```
POST /api/auth/login (email + password)
  → IP security check (isLoginAllowed)
  → bcrypt verify
  → If 2FA enabled + not trusted IP → return challengeToken
  → Else → create session + return JWT + refresh token
```

### JWT Structure
```json
{
  "userId": 1,
  "tenantId": 1,
  "homeTenantId": 1,
  "isSystemAdmin": false,
  "sid": "session-uuid",
  "iat": 1234567890,
  "exp": 1234568790
}
```
- Access token: 15-minute expiry
- Refresh token: 30 days (365 days on trusted IPs), stored as SHA-256 hash in `sessions` table

### Session Management
- Max 10 sessions per user
- Sessions visible in profile (device, IP, country flag, last activity)
- Revoke individual or all sessions
- Password change revokes all other sessions
- Hourly cleanup of expired sessions

## IP Security

### Login IP Whitelist (system-level)
- CIDR notation (e.g., `192.168.1.0/24, 85.164.32.0/24`)
- If configured, ONLY listed IPs can attempt login
- Checked BEFORE password verification on all 7 unauthenticated routes:
  - `POST /auth/register`
  - `POST /auth/forgot-password`
  - `POST /auth/reset-password`
  - `POST /auth/login`
  - `POST /auth/2fa/verify`
  - `POST /auth/passkey/login-options`
  - `POST /auth/passkey/login`

### Country Whitelist (system-level, optional)
- Requires ipgeolocation.io API key (free tier: 1000 lookups/day)
- ISO country codes (e.g., `NO, SE, DK`)
- Results cached in `ip_geo_cache` table for 30 days
- Only checked if IP whitelist is NOT configured
- Local IPs always pass
- Geolocation failure = allow through (fail-open)

### Trusted IP Ranges (tenant-level)
- Per-tenant configuration in `tenants.trusted_ip_ranges`
- Users on trusted IPs skip 2FA requirement
- Does NOT block login — only affects 2FA step

### Priority Order
1. IP whitelist (blocks entirely) → match = allowed, skip country check
2. Country whitelist (blocks entirely) → only if IP whitelist empty
3. Trusted IPs (skips 2FA only) → checked after successful password verify

## Two-Factor Authentication
- TOTP with QR code setup (Google Authenticator, Authy, etc.)
- 8 backup codes (SHA-256 hashed, single use)
- Required for external login when trusted IPs are configured
- Disable requires password confirmation

## Passkeys (WebAuthn)
- Register in profile settings
- Login without password
- Bypasses 2FA (hardware auth is stronger)
- Requires HTTPS

## Tenant Isolation
- Every data table has `tenant_id`
- `tenantScope` middleware sets `req.tenantId` from JWT
- ALL queries MUST filter by `tenant_id`
- Cross-tenant access verified in security audits (3 rounds)

## Visibility (Three Levels)

| Level | Who sees | Icon | Default? |
|-------|----------|------|----------|
| `shared` | Family + portal guests | 🌐 globe | ✅ Yes |
| `family` | Family members only | 👥 people | |
| `private` | Only the creator | 🔒 lock | |

- Applies to: posts, contacts, labels, gift orders
- Main app queries: `WHERE visibility IN ('shared','family') OR created_by = userId`
- Portal queries: `WHERE visibility = 'shared'` (family and private are NEVER visible)
- Backend enforces valid values: `['shared','family','private']`

## Family Portal Security

### Architecture — defense in depth
- **Separate `portal_guests` table** — NOT in `users` table. Even with middleware bug, no user to escalate to.
- **Separate JWT type** (`type: 'portal'`) — main `authenticate` middleware rejects portal tokens.
- **contactIds loaded from DB** on every request via `portalAuthenticate` — never baked into JWT.
- **Separate rate limiting** — 200 req/15min (stricter than main app's 1000).

### Portal JWT
```json
{
  "portalGuestId": 3,
  "tenantId": 1,
  "type": "portal",
  "sid": "session-uuid"
}
```
- Access token: 15-minute expiry
- Refresh token: 365 days, stored as SHA-256 hash in `portal_sessions`

### Access Control
- All portal API queries filter by `contactIds` array (loaded from `portal_guest_contacts`)
- Tagged contacts in posts filtered to only those the guest has access to
- About-contact in posts filtered to only accessible contacts
- Media files validated against `contactIds` for contact photos and post media

### Share Links
- Token: 48 bytes random, stored as SHA-256 hash in DB
- Configurable expiry (30d, 90d, 1yr, permanent)
- Revocable by admin (`is_active = false`)
- Each use creates a fresh session (ephemeral guest linked to share link)

### Portal Toggles
- **Global**: `system_settings.portal_enabled` — system admin controls
- **Per-tenant**: `tenants.portal_enabled` — household admin controls
- Both checked in `portalAuthenticate` middleware on EVERY request

### Session Monitoring
- Admin can view all active portal sessions (IP, device, last activity)
- Admin can revoke individual sessions
- Guest deactivation revokes all sessions

### Accepted Risks
- localStorage for portal tokens (standard SPA pattern, CSP mitigates XSS)
- 15-minute window after session revocation (access token TTL)
- Query parameter tokens for media (needed for `<img src>`, short-lived tokens only)
- 365-day session expiry (designed for grandparents; admin can revoke)

## File Access Control
- `/uploads/` route requires authentication (main app OR portal tokens)
- Token can be passed as `?token=` query param (for embedded images)
- File paths validated against tenant ownership (contact UUID or post UUID)
- **Portal guests**: additional check that file belongs to an accessible contact

## Rate Limiting
- All API: 1000 req/15 min
- Auth endpoints: 20 req/15 min (login, register, 2FA, forgot-password, invite, member-edit)
- Portal API: 200 req/15 min
- Portal auth: 20 req/15 min (login, link validation)

## Password Reset
- Token: 32 bytes random, stored as SHA-256 hash in `users.reset_token_hash`
- Expires after 1 hour
- Single-use (cleared after successful reset)
- All sessions revoked on password reset
- Rate limited (20 req/15 min)
- Generic response prevents user enumeration
- Configurable toggle in system settings (`password_reset_enabled`)

## Security Audit History
- Round 1: Initial implementation review
- Round 2: Route-by-route review — fixed HIGH/MEDIUM issues (label-tenant injection, file-tenant bypass, type-validation)
- Round 3: Admin security — password validation, session revocation, rate limiting on admin routes, 2FA reset requires password
- Round 4: Portal security — contact leakage fix, rate limiting, ephemeral guest traceability, idempotent migrations
