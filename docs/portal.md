# Family Portal

A separate, mobile-first view for extended family (grandparents, aunts, etc.) to view and interact with children's/pets' timelines.

## Concept

Grandparents receive a link (SMS/email), tap it, see their grandchildren growing up — photos, videos, milestones. Can like and comment. No app installation, no complex login.

## Architecture

### Isolation
- **Separate `portal_guests` table** — never in `users` table
- **Separate JWT type** (`type: 'portal'`) — rejected by main `authenticate` middleware
- **contactIds array** — every portal query filtered by allowed contact IDs
- **Separate sessions** — `portal_sessions` table

### Two Access Modes

**Guest Account** (email + password):
1. Admin creates guest in tenant settings → Portal tab
2. Guest logs in at `/portal/login`
3. JWT contains `portalGuestId` + `tenantId` + `contactIds`

**Share Link** (no login):
1. Admin creates link in tenant settings → Portal tab
2. Link format: `/portal/s/{48-byte-random-token}`
3. Token validated → ephemeral session created → JWT issued
4. Configurable expiry (7 days, 30 days, 1 year, permanent)

### Access Control
```
Admin configures:
  Guest "Grandma" → can see [Ailo, Enya]
  Share link "For Aunts" → can see [Ailo]

Portal middleware resolves:
  JWT → portalGuestId → portal_guest_contacts → contactIds = [870, 851]
  Every API query: WHERE contact_id IN (870, 851)
```

### Controls
- **Global toggle**: `system_settings.portal_enabled` — system admin
- **Tenant toggle**: `tenants.portal_enabled` — household admin
- **Per-guest deactivation**
- **Per-link deactivation/expiry**

## Backend

### Middleware (`middleware/portal-auth.js`)
- Validates portal JWT (`type: 'portal'`)
- Loads `contactIds` from `portal_guest_contacts` (always fresh from DB)
- Sets `req.portal = { guestId, tenantId, contactIds, displayName }`

### Routes

**Portal API** (`routes/portal.js`):
- `POST /auth/login` — guest login
- `POST /auth/link` — validate share link → session
- `POST /auth/refresh` — refresh portal session
- `GET /me` — guest profile + accessible contacts
- `GET /contacts` — list accessible contacts with avatars
- `GET /contacts/:uuid/timeline` — paginated timeline (shared posts only)
- `GET /posts/:uuid/comments` — comments on a post
- `POST /posts/:uuid/comments` — add comment
- `POST /posts/:uuid/reactions` — toggle reaction

**Portal Admin** (`routes/portal-admin.js`):
- Guest CRUD with contact access management
- Share link CRUD with expiry options
- Session oversight (view + revoke)

## Frontend

### Portal UI (separate from main app)
- Route: `/portal/*` in same SPA
- No navbar, no sidebar — minimal, photo-focused
- Contact selector: horizontal avatar row (Instagram Stories style)
- Timeline: large photo cards with text, likes, comments

### Admin UI (within main app)
- Tenant Admin → Portal tab
- Guest management: add/edit/delete, set contact access
- Share links: create with label + expiry, copy to clipboard
- Session overview: active portal sessions

## Database Tables

| Table | Key Columns |
|-------|-------------|
| `portal_guests` | uuid, tenant_id, display_name, email?, password_hash?, is_active |
| `portal_guest_contacts` | portal_guest_id, contact_id (junction) |
| `portal_share_links` | token_hash (SHA-256), portal_guest_id?, contact_ids (JSON), expires_at |
| `portal_sessions` | portal_guest_id, refresh_token_hash, device_label, ip_address |

### Existing Table Modifications
- `post_comments` — added `portal_guest_id` (nullable), `user_id` made nullable
- `post_reactions` — added `portal_guest_id` (nullable), `user_id` made nullable
- `tenants` — added `portal_enabled` (boolean)
