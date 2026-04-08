# Database Schema

## Design Principles

- **Tenant isolation** — every data table has `tenant_id` (FK → tenants)
- **Soft deletes** — `deleted_at` timestamp (null = active)
- **Timestamps** — `created_at`, `updated_at` on most tables
- **UUIDs** — external-facing IDs are UUIDs; internal PKs are auto-increment integers
- **Visibility** — `shared` (all tenant members) or `private` (creator only) on contacts, posts, labels

## Core Tables

### tenants
Household/family unit. All data is scoped to a tenant.
- `id`, `uuid`, `name`, `portal_enabled`, `trusted_ip_ranges`

### users
Login accounts. Can be full members or household members without login.
- `email` — nullable (null for no-login members like children)
- `password_hash` — nullable
- `role` — `admin` or `member` (tenant-level)
- `is_system_admin` — global flag, can switch tenants
- `is_active` — false for deactivated or no-login members
- `linked_contact_id` — FK → contacts (links user to their own contact record)
- `totp_secret`, `totp_enabled`, `totp_backup_codes` — 2FA
- `reset_token_hash`, `reset_token_expires_at` — password reset

### contacts
People being tracked. Not login accounts.
- `first_name`, `last_name`, `nickname`
- `birth_day`, `birth_month`, `birth_year` — partial dates supported (e.g., day+month without year)
- `how_we_met`, `notes`
- `is_favorite`, `visibility`, `last_contacted_at`, `last_viewed_at`

### posts
Universal timeline entries (replaces Monica's notes/activities/diary).
- `contact_id` — "about" contact (profile post)
- `company_id` — "about" group (group timeline post)
- `body` — post text
- `post_date` — when the event happened
- `visibility` — shared/private
- `portal_guest_id` — set when created by portal guest

### post_media
Images, videos, documents attached to posts.
- `file_path`, `thumbnail_path` — web-accessible paths
- `file_type` — MIME type (`image/webp`, `video/mp4`, `application/pdf`, etc.)
- `original_name` — original filename for downloads
- `external_id` — e.g., `mg:12345` for MomentGarden imports (`:synced` suffix after sync)

### relationships
Bidirectional connections between contacts.
- `contact_id` → `related_contact_id` with `relationship_type_id`
- 21 system types: parent/child, spouse, sibling, grandparent, stepparent, godparent, partner, friend, colleague, owner/pet, etc.
- `start_date`, `end_date` — optional

### addresses
Shared address pool (contacts share addresses via `contact_addresses`).
- `street`, `city`, `postal_code`, `country`
- `latitude`, `longitude` — geocoded via Nominatim
- Move in/out history via `contact_addresses.moved_in_at`, `moved_out_at`

## Supporting Tables

| Table | Purpose |
|-------|---------|
| `contact_photos` | Multiple photos per contact, `is_primary` flag |
| `contact_fields` | Flexible fields (phone, email, social media) via `contact_field_types` |
| `contact_field_types` | System + custom field type definitions |
| `labels` | Tags with `category` (group/interest) |
| `contact_labels` | Contact ↔ label junction |
| `contact_addresses` | Contact ↔ address with move history |
| `post_contacts` | Tagged contacts in posts |
| `post_comments` | Comments on posts (user or portal guest) |
Note: `post_media` includes `taken_at`, `latitude`, `longitude` for EXIF metadata from uploaded images.
| `post_reactions` | Emoji reactions (default ❤️) |
| `companies` | Companies, schools, clubs, teams (groups). Fields: type, description, parent_id |
| `company_photos` | Group photos (same pattern as contact_photos) |
| `contact_companies` | Employment links with title and dates |
| `life_events` | 10 event types with optional annual reminders |
| `life_event_contacts` | Linked contacts per life event |
| `reminders` | Custom reminders with recurrence |
| `notifications` | In-app notification queue |
| `sessions` | Active login sessions with device/IP tracking |
| `passkeys` | WebAuthn credentials |
| `system_settings` | Key-value system config (SMTP, IP security, etc.) |
| `tenant_members` | User ↔ tenant membership (multi-tenant), `linked_contact_id` per tenant |
| `post_link_previews` | Cached og:image, og:title, og:description for URL previews |
| `dismissed_suggestions` | Dismissed relationship suggestions (per tenant) |
| `dismissed_duplicates` | Dismissed duplicate contact pairs (per tenant) |
| `audit_log` | Sensitive operation logging |
| `export_log` | Export audit trail (user, IP, country, type, status, encryption) |
| `ip_geo_cache` | IP → country cache (30-day TTL) |
| `book_jobs` | Photo book definitions (title, contacts, date range, layout options). See [todo.md](todo.md) book generation section. |

## Gift Tables

| Table | Purpose |
|-------|---------|
| `gift_events` | Events (Christmas, birthday, etc.) with auto-fill. `directions` enum (`both`/`incoming`/`outgoing`) controls which gift tabs the event shows — defaults to `incoming` for wedding/birthday and `both` for christmas/other. Legacy `honoree_contact_id` is kept in sync with the first row from `gift_event_honorees` for backwards compatibility. |
| `gift_event_honorees` | Junction table mapping events to one or more honoree contacts. Used for weddings (bride+groom), joint birthdays, anniversaries. `position` controls display order. |
| `gift_products` | Reusable product catalog with URL scraping |
| `gift_product_links` | Store links per product |
| `gift_orders` | Gift registrations (from → to, status lifecycle) |
| `gift_order_participants` | Multi-sender/receiver per gift. Each row has either `contact_id` OR `company_id` set (never both), so a gift can come from/go to a person or a group (e.g. "Fra jobben"). |
| `gift_wishlists` | Wishlists per family member |
| `gift_wishlist_items` | Items in wishlists |

## Portal Tables

| Table | Purpose |
|-------|---------|
| `portal_guests` | Guest accounts (separate from users) |
| `portal_guest_contacts` | Which contacts a guest can see |
| `portal_share_links` | Token-based shareable URLs |
| `portal_sessions` | Guest login sessions |

## Migration Conventions

- Files: `NNN_description.js` (sequential numbering)
- Each migration exports `up(knex)` and `down(knex)`
- Migrations run automatically on container start (`entrypoint.sh`)
- Currently 69 migrations

### Creating a New Migration
```bash
cd backend
npx knex migrate:make description_name
# Then edit the generated file in src/migrations/
```
