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
| GET | `/tools/duplicates` | Find potential duplicate contacts (filters dismissed) |
| POST | `/tools/merge` | Merge two contacts |
| POST | `/tools/dismiss-duplicate` | Dismiss a duplicate pair |
| POST | `/tools/restore-duplicate` | Restore a dismissed duplicate |
| GET | `/tools/dismissed-duplicates` | List dismissed duplicate pairs |

## Posts (`/api/posts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Timeline (filter by contact, paginate) |
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
| POST | `/posts/:uuid/media` | Upload post media (images, videos, documents) |

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

### Companies (`/api/companies`)
CRUD, employee management with titles and dates. Brreg lookup (`GET /brreg/:orgNumber`).

### Life Events (`/api/life-events`)
CRUD, 10 types, annual reminder opt-in, linked contacts.

### Reminders (`/api/reminders`)
CRUD, recurring (yearly).

### Notifications (`/api/notifications`)
List, mark-read, generate (birthdays, anniversaries).

### Gifts (`/api/gifts`)
Products (CRUD, URL scraping, images), events (CRUD, auto-fill), orders (CRUD, status lifecycle), wishlists (CRUD, items).

### System Admin (`/api/system`)
System settings, SMTP config, tenant management, IP security.

### Import (`/api/import`)
MomentGarden ZIP import, loves/comments sync with user mapping.

### Portal (`/api/portal`)
Guest auth (login, share link), timeline, comments, reactions.

### Portal Admin (`/api/portal-admin`)
Guest CRUD, share link management, session oversight.
