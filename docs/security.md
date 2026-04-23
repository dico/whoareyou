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

### Scope — global, not just login
System-level IP and country whitelists apply to **every** request that touches the app, not only the login form. That includes:

- Main-app authentication (`/api/auth/*`)
- Authenticated API calls (`/api/contacts`, `/api/posts`, etc.)
- Portal guest login and portal API (`/api/portal/*`)
- Signage token endpoints (`/api/signage/feed/:token`, `/api/signage/media/:token`)
- File serving (`/uploads/*`)

Enforcement happens in the `accessControl` middleware ([backend/src/middleware/access-control.js](../backend/src/middleware/access-control.js)), mounted globally on `/api` and `/uploads` in [backend/src/index.js](../backend/src/index.js). Health and info endpoints (`GET /api/health`, `GET /api`) are registered before the middleware so monitoring can verify uptime even when the whitelist would otherwise block.

### IP Whitelist (system-level)
- CIDR notation (e.g., `192.168.1.0/24, 85.164.32.0/24`)
- If configured, ONLY listed IPs can reach the app at all — no login, no portal, no signage feed, no file downloads
- Checked before auth, before rate limits (actually after rate limits, so DB is protected from probes)
- Blocked requests receive HTTP 403 with `reason: ip_blocked`
- Stored in `system_settings.login_ip_whitelist` (name retained for backwards compatibility; scope is now global)

### Country Whitelist (system-level, optional)
- Requires ipgeolocation.io API key (free tier: 1000 lookups/day)
- ISO country codes (e.g., `NO, SE, DK`)
- Results cached in `ip_geo_cache` table for 30 days
- Only checked if IP whitelist is NOT configured
- Local IPs (RFC 1918 / loopback) always pass — ensures the admin can recover from the same-server console if geolocation breaks
- **Fail-closed**: if the country whitelist is configured but the lookup fails (no API key, quota exceeded, network error), the request is **DENIED** with `reason: geo_lookup_failed`. The admin explicitly restricted access; silently allowing everyone would defeat the intent. The admin UI shows a warning before saving when an API key is missing.
- Stored in `system_settings.login_country_whitelist` (name retained for backwards compatibility)

### Trusted IP Ranges (tenant-level)
- Per-tenant configuration in `tenants.trusted_ip_ranges`
- Users on trusted IPs skip 2FA requirement
- Does NOT block login — only affects 2FA step
- Independent of IP/country whitelist — trusted-IP does not bypass whitelist enforcement

### Priority Order
1. IP whitelist (blocks entirely) → match = allowed, skip country check
2. Country whitelist (blocks entirely) → only if IP whitelist empty; fail-closed on lookup failure
3. Trusted IPs (skips 2FA only) → checked after successful password verify

### Recovery path (lockout)
If an admin saves a whitelist that excludes their own IP, access from the same LAN or loopback still works because local IPs always pass the country check. For IP whitelist: the admin must connect from a machine on the private network (or shell into the server directly) and clear `login_ip_whitelist` in the `system_settings` table.

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

## Sensitive Content Mode

A second axis, **orthogonal to visibility**, that lets the user mark individual posts and contacts as sensitive (e.g. health notes, a private therapist contact) and toggle them on/off per device. Designed for the "I want to show family photos to a guest without exposing my dad's medical history" case. Not a security boundary against network-level adversaries — see "Threat model" below.

### How it works
- **Two new columns**:
  - `posts.is_sensitive` BOOLEAN
  - `contacts.is_sensitive` BOOLEAN — cascades to all posts where the contact is the subject (`posts.contact_id`) or tagged (`post_contacts`)
- **Per-session toggle**: `sessions.show_sensitive_until TIMESTAMP NULL`. NULL or past = off, future = on. Stored on the session row, **not the user**, so each device (phone, work laptop, home browser) has independent state. New sessions always start with the mode off.
- **Auth middleware** reads `show_sensitive_until` from the session row on every request and exposes `req.showSensitive` (boolean) to route handlers.
- **Filtering helper** (`utils/sensitive.js`) provides `filterSensitivePosts(req)` and `filterSensitiveContacts(req)` Knex modifiers used on every relevant query.

### Backend-enforced (not just UI)
The whole point is that sensitive items are *missing from the response payload* when the mode is off. A guest pulling DevTools out of the user's hand and inspecting network traffic still sees nothing. The filter is applied to:

- `GET /api/posts` (timeline + contact/company filter), `/posts/geo`, `/posts/gallery`, `/posts/:uuid/comments`
- `GET /api/contacts`, `/contacts/:uuid` (returns 404 for sensitive contacts), `/contacts/upcoming-birthdays/list`, `/contacts/search/global` (both contacts and posts results)
- `GET /api/relationships/family-tree/:uuid` and `/relationships/tree/:uuid` — sensitive contacts are pruned from the tree, orphaned edges dropped
- `GET /api/books/:uuid/data` — book preview respects the same filter

### Toggle endpoint
`POST /api/auth/sensitive-mode { enabled, durationMinutes }` updates `show_sensitive_until` on the current session only. Predefined durations in the UI: 4 hours (default), until midnight, 1 week, "until I turn it off" (50 years sentinel).

### UI cues
- A small dot is always visible on the navbar avatar — neutral grey when off, amber when on. Always visible (even off) so the user is reminded that the mode exists.
- Sensitive items get a `bi-eye-slash` icon next to their visibility icon when mode is on, so the user knows what *would* be hidden from a guest.
- The toggle lives in `/profile` → Account → "Sensitive content" section, with the duration picker.

### Default-off semantics
- Every new session starts with the mode off. Logging in on a new device → safe by default.
- The mode does NOT auto-propagate across devices. Turning it on at home leaves it off on the work laptop.
- The user must actively turn it on each time they want to see sensitive content. Auto-expiry (4h default) ensures it doesn't accidentally stay on indefinitely.

### Threat model
This is **not** a security boundary against network-level adversaries (you can't protect against someone with a TLS-stripping proxy, a compromised browser, or a malicious browser extension — they have your entire app already). It IS a meaningful boundary against:
- A guest who borrows your phone to look at family photos
- A coworker glancing at your screen
- Showing the app on a projector during a demo

The threat model is **physical proximity, short window**. The implementation is robust against that: the data isn't in the response payload at all when the mode is off.

### Out of scope (deliberate)
- Re-auth prompt to enable (deliberate — friction undermines the use case)
- Field-level sensitivity (e.g. a single field on a contact). All-or-nothing per contact in v1.
- Sensitive `life_events`, `reminders`, `contact_fields`. Easy to add later if needed; not in v1.
- Portal guest visibility: portal already only sees `shared` posts; sensitive flag is also enforced on portal queries to be safe.

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

## Web Push

- **VAPID keys** auto-generated on first use and stored in `system_settings` (`vapid_public_key`, `vapid_private_key`). The private key is never exposed via any endpoint — only signing happens server-side.
- **Subscriptions** are per (user, endpoint) in `push_subscriptions`. The `endpoint` URL points at the browser vendor's push service (Google, Mozilla, Apple, Microsoft) and is not sensitive on its own; `p256dh` + `auth` are the per-subscription keys used for payload encryption.
- **Payloads are encrypted** end-to-end by the web-push library with the subscription's keys. The push service only forwards the ciphertext.
- **Subscription cleanup** — the push service returns 404/410 for expired subscriptions; we delete those rows on the next send attempt so we don't retain stale data.
- **Unsubscribe** on the server requires the endpoint string and is scoped to the current user's rows only — one user cannot unsubscribe another's device.
- **Tenant isolation** — `sendPushToUser(userId, tenantId, ...)` queries by both; a subscription from one tenant is never sent to on behalf of another.
- **Defense against payload injection** — payloads are constructed server-side from the notification row. User-provided strings (post bodies, contact names) pass through the same renderer as the in-app bell.

## File Access Control
- `/uploads/` route requires authentication (main app OR portal tokens)
- Token can be passed as `?token=` query param (for embedded images)
- File paths validated against tenant ownership (contact UUID or post UUID)
- **Portal guests**: additional check that file belongs to an accessible contact
- **Portal thumbnail exception**: Thumbnail avatars (`photo_*_thumb.*`) are accessible to all portal guests within the same tenant — needed for comment/reaction avatars from users outside the guest's contactIds. Full-size contact photos remain restricted to contactIds.

## Signage Security

Token-based, read-only display for TVs — conceptually similar to portal share links but entirely passive (no write operations, no login).

### Token
- 48 bytes `crypto.randomBytes`, stored as SHA-256 hash in `signage_screens.token_hash`.
- URL: `/signage/{token}`. Token IS the authentication — no cookies, no headers.
- `POST /:uuid/regenerate-token` issues a new token and invalidates the old URL.

### Data exposure
- Only returns posts matching the screen's configured contacts, visibility filter, and date range.
- Respects `is_sensitive` filter (default: exclude sensitive content).
- Response contains only: post body (if configured), post_date (if configured), contact first names (if configured), image file paths, reaction counts, last 3 comments. No UUIDs, no user IDs, no metadata.
- `Cache-Control: private` — shared CDN edge nodes won't cache family data.

### Media proxy
- `/api/signage/media/:token?path=...` — serves images without requiring a JWT.
- Path traversal hardened: rejects `..`, absolute paths (`/`, `\`), null bytes. Uses `path.join` (not `path.resolve`) and `startsWith(uploadsDir + path.sep)` to prevent both directory escape and prefix-collision attacks (`/app/uploads-secret/` cannot match `/app/uploads`).

### Rate limiting
- Dedicated signage limiter: 60 req/min per IP (stricter than the general 1000/15min API limiter).
- Public path matching uses anchored regex (`/^\/(?:feed|media)\/[^/]+$/`) to prevent accidental auth bypass on future routes.

### Deactivation
- `is_active = false` immediately blocks all feed and media requests.
- Delete removes the screen row entirely — token becomes permanently invalid.

## URL Scraping (SSRF Protection)
- Link preview and product scrape endpoints fetch external URLs server-side
- **Protocol whitelist**: only `http:` and `https:` allowed
- **Host blocklist**: localhost, 127.0.0.1, ::1, 169.254.169.254, *.local, *.internal
- **Private IP ranges blocked**: 10.x, 172.16-31.x, 192.168.x
- **Timeout**: 8 seconds with AbortController
- **Bot-detection**: discards results from Cloudflare/captcha pages

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

## Multi-Tenant Access
- Users can be members of multiple tenants/households via `tenant_members` table
- Switching tenant requires explicit membership — no exceptions, not even for system admins
- **Auth middleware validates membership on every request** — if user is on a non-home tenant, `tenant_members` is checked. Revoked memberships immediately block access (403)
- System admins can manage tenants (reset passwords, delete) but NOT access their data
- Tenant switching generates a new JWT with the target `tenantId`
- `homeTenantId` in JWT preserves the user's original tenant
- `linked_contact_id` is stored per-tenant in `tenant_members`, NOT on the user — prevents cross-tenant data leakage
- All data queries filter by `req.tenantId` from JWT — switching tenant switches all data context
- Auto-created contact when user is invited to a new tenant
- Membership is managed by tenant admins (invite) or system seed (migration)

## Member Invitation
- Admin creates member via `/api/auth/invite` (admin role required)
- Password auto-generated (12-byte base64url) if not provided
- `must_change_password` flag set when welcome email sent with credentials
- On login, user is redirected to profile with forced password change prompt
- Flag cleared after successful password change
- Password sent in email only once (initial invite) — no resend option
- All login paths (direct, 2FA, passkey) check and enforce the flag

## Audit Logging

Security-relevant events are persisted to the `audit_log` table via [utils/audit.js](../backend/src/utils/audit.js). Write path is fire-and-forget so audit failures cannot break the user's action; errors still go to stderr so silent breakage is detectable.

### Events logged today

| Action | Trigger |
|--------|---------|
| `login.success` | User completed password auth (2FA-complete path logs separately if needed) |
| `login.fail` | Wrong email (user_id null) or wrong password |
| `access.blocked` | `accessControl` middleware rejected by IP or country whitelist |
| `session.revoke` | Admin revoked a tenant member's session |
| `tenant.switch` | User switched active tenant |
| `member.invite` | Admin added a new member (stores role, email, login_enabled) |
| `member.update` | Admin changed another member's fields (stores the list of changed keys, never the new password) |

Rows capture `tenant_id`, `user_id`, `portal_guest_id`, `action`, `entity_type`, `entity_id`, structured `details` (JSON), `ip_address`, and `user_agent`. Pre-auth events (blocked IPs, failed logins without a matched user) have null `tenant_id` and `user_id` — migration 081 relaxed the schema so this works.

### Not logged yet (planned)
- 2FA enable/disable, passkey register/remove
- Password change (self-service via `/auth/change-password`)
- Tenant-IP-security setting changes
- Export start/download
- Portal guest actions
- Signage token usage

Guidance for future code: prefer a single `logAuditFromReq(req, { action, ... })` call at the point where the event completes; do NOT wrap it in `await` (fire-and-forget). Action names are in [utils/audit.js](../backend/src/utils/audit.js) — extend that vocabulary rather than inventing ad-hoc strings.

## Security Audit History
- Round 1: Initial implementation review
- Round 2: Route-by-route review — fixed HIGH/MEDIUM issues (label-tenant injection, file-tenant bypass, type-validation)
- Round 3: Admin security — password validation, session revocation, rate limiting on admin routes, 2FA reset requires password
- Round 4: Portal security — contact leakage fix, rate limiting, ephemeral guest traceability, idempotent migrations
- Round 5: Comments/reactions overhaul — XSS fix in data-people attribute (JSON in HTML), tenant_id check on portal comment deletion, thumbnail regex tightened to match only photo files (not arbitrary paths with `_thumb`)
- Round 6: Portal posts + link preview — SSRF protection on URL scrape endpoints (blocklist for internal hosts/IPs, protocol whitelist), post_date validation (reject non-date values), portal post creation enforces tenant_id + contactIds access, portal media upload restricted to own posts
- Round 7: Member invitation — forced password change on first login when credentials sent via email, must_change_password flag on all login paths (direct, 2FA, passkey)
- Round 8: Multi-tenant — tenant_members junction table, switch-tenant requires membership (no system admin bypass), auth middleware validates membership on every request (revoked members blocked immediately), system.js tenant creation adds to tenant_members, idempotent migration, tenant switcher on profile page. Verified with API tests: forged JWT for non-member tenant returns 403.
- Round 9: Author model — `author_contact_id` replaces `created_by` → `tenant_members` → `contacts` join chain for author display. Direct FK to contacts table — survives user/guest/membership deletion. All contact lookups in mg-imported endpoint defensively filter by tenant_id. PUT /posts/:uuid/author validates contact, user, and guest against tenant_id. Image rotation endpoint validates post ownership + tenant scope.
- Round 10: Global access control + broad review — triggered by the discovery that the system-level IP/country whitelist only fired on login routes. Scope changed to global (`accessControl` middleware on every `/api` and `/uploads` request). Fail-closed on geolocation when a country whitelist is configured. Follow-up review uncovered several MEDIUM/HIGH issues also fixed in this round:
  - `DELETE /api/auth/tenant-sessions/:uuid` now scoped by `tenant_members` — previously an admin in tenant A could revoke any session in tenant B by UUID
  - `POST /api/posts/:uuid/comments` and `/reactions` now require the same visibility filter the GET-side uses — previously any tenant member with a private post's UUID could attach comments or reactions the post author would not expect
  - `GET /api/posts/:uuid/reactions` likewise enforces visibility
  - MomentGarden sync (`user_map` lookups) now filters contact UUID by `tenant_id` — previously a user-supplied map could reference a contact from another tenant
  - `req.user.is_system_admin` → `req.user.isSystemAdmin` in 4 places where the snake_case name never existed (middleware sets camelCase). Fixed silently-broken admin gate on MG-admin endpoints
  - `JWT_SECRET` + `CORS_ORIGIN` now fail-fast at startup in production — previously `JWT_SECRET` would fall back to `'change-me-in-production'` and CORS would default to `*` if env vars were missing
  - `audit_log` table was created in migration 019 but never used; wired up via `utils/audit.js` for login/session/tenant/member events and the `access.blocked` middleware
