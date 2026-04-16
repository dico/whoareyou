# API Reference

Base URL: `/api`

All endpoints require authentication unless noted. Responses are JSON.

## Auth (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Create tenant + admin user |
| POST | `/login` | No | Email + password login |
| POST | `/forgot-password` | No | Request password reset email |
| POST | `/reset-password` | No | Set new password with token |
| POST | `/2fa/verify` | No | Complete 2FA challenge |
| POST | `/passkey/login-options` | No | Start passkey auth |
| POST | `/passkey/login` | No | Verify passkey + create session |
| POST | `/refresh` | No | Exchange refresh token |
| POST | `/logout` | Yes | End session |
| GET | `/me` | Yes | Current user + avatar |
| PUT | `/profile` | Yes | Update name/email |
| POST | `/change-password` | Yes | Change password (revokes other sessions) |
| PATCH | `/language` | Yes | Set preferred language |
| GET | `/2fa/status` | Yes | 2FA enabled? |
| POST | `/2fa/setup` | Yes | Get QR code + secret |
| POST | `/2fa/enable` | Yes | Verify code + enable |
| POST | `/2fa/disable` | Yes | Disable (requires password) |
| GET | `/passkeys` | Yes | List registered passkeys |
| POST | `/passkey/register-options` | Yes | Start passkey registration |
| POST | `/passkey/register` | Yes | Store passkey |
| DELETE | `/passkeys/:id` | Yes | Remove passkey |
| GET | `/sessions` | Yes | Active sessions (with country) |
| DELETE | `/sessions/:uuid` | Yes | Revoke session |
| DELETE | `/sessions` | Yes | Revoke all other sessions |
| GET | `/members` | Admin | List tenant members |
| POST | `/invite` | Admin | Add member (with/without login) |
| PUT | `/members/:uuid` | Admin | Update member |
| GET | `/tenant/security` | Admin | Get trusted IP ranges |
| PUT | `/tenant/security` | Admin | Set trusted IP ranges |
| GET | `/my-tenants` | Yes | List user's tenant memberships |
| POST | `/switch-tenant` | Yes | Switch active tenant |
| PUT | `/tenant/name` | Admin | Rename tenant |

## Contacts (`/api/contacts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List contacts (search, filter, sort, paginate) |
| GET | `/:uuid` | Contact detail with photos, fields, labels, relationships, addresses |
| POST | `/` | Create contact |
| PUT | `/:uuid` | Update contact |
| DELETE | `/:uuid` | Soft delete |
| GET | `/search/global` | Search contacts + posts + companies |
| GET | `/upcoming-birthdays/list` | Next 30 days (works without birth year) |
| GET | `/field-types/list` | Available field types |
| POST | `/:uuid/fields` | Add contact field |
| PUT | `/:uuid/fields/:id` | Update field |
| DELETE | `/:uuid/fields/:id` | Delete field |
| GET | `/tools/trash` | List soft-deleted contacts |
| POST | `/tools/restore/:uuid` | Restore soft-deleted contact |
| DELETE | `/tools/permanent/:uuid` | Permanently delete contact and files |
| DELETE | `/tools/empty-trash` | Permanently delete all trashed contacts |
| GET | `/tools/duplicates` | Find potential duplicate contacts (filters dismissed) |
| POST | `/tools/merge` | Merge two contacts |
| POST | `/tools/dismiss-duplicate` | Dismiss a duplicate pair |
| POST | `/tools/restore-duplicate` | Restore a dismissed duplicate |
| GET | `/tools/dismissed-duplicates` | List dismissed duplicate pairs |

## Posts (`/api/posts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Timeline (filter by contact or company, paginate) |
| GET | `/memories` | Posts from the same MM-DD in previous years. Same shape as `/` plus `years_ago` per post and `today: { month, day }`. No pagination — returns all matching posts ordered by date desc. |
| GET | `/geo` | Photos with GPS coordinates for map |
| GET | `/trash` | List soft-deleted posts |
| POST | `/restore/:uuid` | Restore soft-deleted post |
| DELETE | `/permanent/:uuid` | Permanently delete post and files |
| GET | `/gallery` | Photo gallery for a contact |
| POST | `/` | Create post |
| PUT | `/:uuid` | Update post |
| DELETE | `/:uuid` | Delete post |
| GET | `/:uuid/comments` | List comments |
| POST | `/:uuid/comments` | Add comment |
| DELETE | `/:uuid/comments/:id` | Delete own comment |
| POST | `/:uuid/reactions` | Toggle reaction (❤️) |

## Uploads (`/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/contacts/:uuid/photos` | Upload contact photo (image only, sharp processed) |
| PUT | `/contacts/:uuid/photos/:id/primary` | Set primary photo |
| DELETE | `/contacts/:uuid/photos/:id` | Delete photo |
| POST | `/posts/:uuid/media` | Upload post media (images, videos, documents). Returns `suggestedDate` from EXIF. |
| DELETE | `/posts/:uuid/media/:mediaId` | Delete individual media item and files |

## Relationships (`/api/relationships`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/types` | List relationship types |
| POST | `/` | Create relationship |
| PUT | `/:id` | Update relationship |
| DELETE | `/:id` | Delete relationship |
| GET | `/tree/:uuid` | Relationship graph (all types, hop-based depth) |
| GET | `/family-tree/:uuid` | Generation-based family tree (parent/child only) |
| GET | `/suggestions` | Auto-suggested missing relationships (9 rules) |
| POST | `/suggestions/dismiss` | Dismiss a suggestion |
| POST | `/suggestions/restore` | Restore dismissed suggestion |
| GET | `/suggestions/dismissed` | List dismissed suggestions |
| GET | `/consistency` | Relationship consistency report (age, direction, duplicates) |

## Other Modules

### Addresses (`/api/addresses`)
CRUD, geocoding, map data, merge duplicates, move in/out history.

### Labels (`/api/labels`)
CRUD, batch assign/remove contacts, category (group/interest).

### Companies / Groups (`/api/companies`)
CRUD with type (company/school/club/team/association/class/other), description, parent groups. Employee/member management with titles and dates. Brreg lookup (`GET /brreg/:orgNumber`). Photo CRUD (`GET/POST /:uuid/photos`, `PUT/DELETE /photos/:id`). Label import (`POST /import-from-label`). Frontend URL: `/groups`.

### Life Events (`/api/life-events`)
CRUD, 10 types, annual reminder opt-in, linked contacts.

### Reminders (`/api/reminders`)
CRUD, recurring (yearly).

### Notifications (`/api/notifications`)
List, mark-read, generate (birthdays, anniversaries, reminders, memories). Notification payloads beyond `title` put structured data in `body` as pipe-separated strings so the navbar can render a richer item:

| Type | `body` format |
|------|---------------|
| `birthday` | `{contact_uuid}` |
| `anniversary` | `{contact_uuid}\|{event_type}\|{years}` |
| `reminder` | `{contact_uuid?}` |
| `memory` | `{count}\|{thumbnail_path}\|{post_uuid}` — `title` = years ago |
| `family_post` | `{post_uuid}\|{thumbnail_path?}` |
| `family_comment` | `{post_uuid}\|{preview}` |

**Generation** (`POST /generate`) is idempotent — duplicates for the same day are suppressed. `memory` notifications only fire on **milestone anniversaries** to avoid annual repeats: years_ago ∈ {1, 5, 10, 15, 20, 25, 30, 40, 50}. The `/memories` page still lists every matching post regardless of milestone.

**Per-user preferences and per-contact overrides** (`utils/notification-prefs.js`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/prefs` | List of per-type rules + valid scopes (`meta`) for UI rendering |
| PUT | `/prefs/:type` | Upsert `{ scope, deliver_app, deliver_email }` for a type. Validates scope per type. |
| GET | `/overrides` | Per-contact overrides for current user (joined with contact name + avatar) |
| POST | `/overrides` | Create/update override `{ contact_uuid, type, mode }` where `mode ∈ {'always','never'}` |
| DELETE | `/overrides/:id` | Remove an override |

**Filter logic** (`shouldNotify`): override (always/never) → global type scope → channel toggles. Never notifies the actor about their own actions. `family_post` scope filters by `authorIsGuest`; `family_comment` scope filters by whether the post is the viewer's own.

**New hooks:** `POST /api/posts` and `POST /api/portal/posts` fire `family_post` notifications to every other active tenant user. `POST /api/posts/:uuid/comments` and `POST /api/portal/posts/:uuid/comments` fire `family_comment`. All hooks are fire-and-forget after the response is sent.

**Email digest** ([services/notification-email.js](../backend/src/services/notification-email.js)): the `deliver_email=true` toggle triggers an hourly-throttled digest email. `sendDigestsForTenant(tenantId)` is called from `/generate` and from the post/comment hooks. Per-recipient throttle: 60 minutes, implemented as `MAX(notifications.email_sent_at) < now - 1h OR IS NULL`. Digest renders all unsent email-flagged notifications for the user as one email grouped by type. Defense-in-depth: `sendDigestFor(userId, tenantId)` only emails users that are active `tenant_members` with a non-null `users.email` — never contacts, never portal guests, never users outside the tenant.

**Web Push** ([services/notification-push.js](../backend/src/services/notification-push.js)): the `deliver_push=true` toggle (on by default) sends an immediate web push from `tryCreateNotification`. VAPID keys are auto-generated on first use and stored in `system_settings`. Expired subscriptions (HTTP 404/410 from the push service) are pruned automatically.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/push/vapid-key` | Returns the public VAPID key for the browser to subscribe |
| POST | `/push/subscribe` | Register a `PushSubscription` payload — upserts on (user, endpoint) |
| POST | `/push/unsubscribe` | Remove a subscription by endpoint |
| POST | `/push/test` | Send a test push to the current user's active subscriptions |

Frontend: [frontend/sw.js](../frontend/sw.js) is registered from [app.js](../frontend/js/app.js) on boot. It handles `push` (showNotification) and `notificationclick` (open/focus URL). [utils/push.js](../frontend/js/utils/push.js) provides `subscribe()`, `unsubscribe()`, `isSubscribed()`, `pushPermission()`. iOS note: Web Push only works in PWAs installed to the home screen (iOS 16.4+) — in a regular Safari tab, `Notification.requestPermission` resolves to `denied`.

### Gifts (`/api/gifts`)
Products (CRUD, URL scraping, images), events (CRUD, auto-fill), orders (CRUD, status lifecycle), wishlists (CRUD, items).

### Books (`/api/books`)
Photo book generation. Books are definitions stored in `book_jobs`; the HTML preview is rendered client-side from `/data`, and PDF is produced via browser print (`window.print()` with `@media print` CSS). No server-side PDF generation.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List current user's books |
| POST | `/` | Create a book (title, contact_uuids, date_from/to, layout_options) |
| POST | `/preview` | Estimate post + page count for a set of params without creating a book. Returns `{ postCount, estimatedPages }`. Used by the wizard for live page-count feedback. |
| GET | `/:uuid` | Book metadata |
| PATCH | `/:uuid` | Update title/subtitle/layout_options (including `layout_options.overrides` for per-post weight, template, focal point, media/post exclusion, custom text, comment visibility, batch order/variant) |
| DELETE | `/:uuid` | Delete book |
| GET | `/:uuid/data` | Full rendered content: contacts + posts (with media, comments, reactions). Posts come from the saved **snapshot** (`layout_options.snapshot.postUuids`) — falls back to a dynamic query for legacy books without one. **Never includes `private` posts from any user** — enforces `WHERE visibility IN ('shared','family')`. Comment rows include `author_avatar` (thumbnail_path) for bubble rendering. |
| GET | `/:uuid/regenerate-preview` | Returns `{ added, removed, total, currentTotal, generatedAt }` describing what a regenerate would change. Used by the frontend on book load to show a "new posts available" badge. No mutation. |
| POST | `/:uuid/regenerate` | Re-runs the post query for the book's current contacts/dates/visibility, replaces `layout_options.snapshot`, and prunes per-post overrides (`postWeight`, `templates`, `customText`, `hideComments`) that reference posts no longer in the book. Returns `{ added, removed, total, generatedAt }`. |
| POST | `/:uuid/cover` | Upload a custom cover image (multipart `cover` field, image only). Processed via sharp, stored under `/uploads/books/{uuid}/cover_*.webp`, replaces previous cover file. Updates `layout_options.theme.coverImage`. |
| DELETE | `/:uuid/cover` | Remove the custom cover image, reverting to the default gradient or theme color. |

**`layout_options` shape:**
```
{
  language: 'nb' | 'en',
  chapterGrouping: 'year' | 'contact' | 'none',
  includeComments: boolean,
  includeReactions: boolean,
  showPageNumbers: boolean,
  pageSize: 'bf-170x240' | 'bf-a5' | 'bf-a4' | 'small-square' | 'large-square' | ...,
  theme: {
    coverImage: '/uploads/books/{uuid}/cover_*.webp' | null,
    coverBg: '#hexcolor' | null,
    titlePosition: 'center' | 'top' | 'bottom' | 'bottom-left',
    accent: '#hexcolor',
    fontFamily: 'CSS font-family value',
    fontSize: 'small' | 'normal' | 'large',
    backText: 'custom back cover text' | null,
  },
  overrides: {
    postWeight:    { [postUuid]: 'full' | 'small' | 'hidden' },
    excludedMedia: [file_path, ...],
    mediaFocal:    { [file_path]: 'X% Y%' },
    mediaRotation: { [file_path]: 90 | 180 | 270 },
    templates:     { [postUuid]: 'hero-top'|'full-bleed'|'grid-2'|'grid-3'|'grid-4'|'text-heavy'|'image-side' },
    customText:    { [postUuid]: 'overrides post.body in book' },
    hideComments:  { [postUuid]: true },
    batchOrder:    { [batchKey]: [postUuid, ...] },
    batchVariant:  { [batchKey]: 'horizontal'|'vertical'|'big-left'|'big-top'|'grid'|'rows'|'columns' },
  },
  snapshot: {
    generatedAt: ISO timestamp,
    postUuids:   [post_uuid, ...]   // frozen list — see /regenerate
  }
}
```

`pageSize` selects the physical book dimensions in mm. Two groups: Bokfabrikken (Norwegian, much cheaper for Norwegian customers — 130×210, A5, 170×240, A4) and Blurb ImageWrap Hardcover (mini/small/large square + standard portrait/landscape + large landscape).

**Security notes:**
- All override values are validated frontend-side against allow-lists/regex before rendering to prevent CSS or class injection from saved JSON.
- Cover files at `/uploads/books/{uuid}/` are scoped to the book owner only (never readable by other tenant members or portal guests). Validated in the `/uploads/` route handler in `index.js`.
- `/preview` enforces tenant isolation and visibility filtering (same rules as `/data`).

### Signage (`/api/signage`)
Token-based, read-only display of timeline posts on TVs / digital signage.

**Admin (authenticated):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List screens for this tenant |
| POST | `/` | Create screen (returns URL with token) |
| PATCH | `/:uuid` | Update screen configuration |
| DELETE | `/:uuid` | Delete screen |
| POST | `/:uuid/regenerate-token` | Issue a new token (invalidates old URL) |

**Public (token-based, no auth):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/feed/:token` | Fetch posts for display, respects all screen config (contacts, visibility, days_back, sensitive, display_mode). Rate limited 60 req/min/IP. |
| GET | `/media/:token?path=...` | Serve an image file. Path traversal hardened (reject `..`, absolute paths, null bytes; `path.join` + trailing-sep `startsWith` guard). |

Screen configuration options: `display_mode` (slideshow/feed), `slide_interval`, `visibility_filter`, `days_back`, `shuffle`, `show_body/contact_name/date/reactions/comments`, `max_posts`, `feed_layout` (horizontal/vertical), `multi_image` (collage/first), `image_fit` (contain/cover), `include_sensitive`.

### Export (`/api/export`)
Data export with two modes: instant JSON ZIP (`GET /data`) and full backup with media (`POST /full`, `GET /status/:jobId`, `GET /download/:jobId`). See [export.md](export.md) for field documentation.

### System Admin (`/api/system`)
System settings, SMTP config, tenant management, IP security.

### Import (`/api/import`)
MomentGarden ZIP import, loves/comments sync with user mapping.

### Portal (`/api/portal`)
Guest auth (login, share link), timeline, comments, reactions.

### Portal Admin (`/api/portal-admin`)
Guest CRUD, share link management, session oversight.
