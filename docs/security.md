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

## File Access Control
- `/uploads/` route requires authentication
- Token can be passed as `?token=` query param (for embedded images)
- File paths validated against tenant ownership (contact UUID or post UUID)

## Rate Limiting
- All API: 1000 req/15 min
- Auth endpoints: 20 req/15 min
- Login: checked via `loginLimiter` middleware

## Security Audit History
- Round 1: Initial implementation review
- Round 2: Route-by-route review — fixed HIGH/MEDIUM issues (label-tenant injection, file-tenant bypass, type-validation)
- Round 3: Admin security — password validation, session revocation, rate limiting on admin routes, 2FA reset requires password
