# Data Export

> **Important:** When adding new tables or fields to the schema, update this document and the export queries in `backend/src/routes/export.js`.

## Overview

Two export modes available from Settings → Export Data (`/admin/export-data`):

1. **Data only (JSON)** — instant ZIP download with all metadata as JSON files
2. **Full backup** — background job producing ZIP with JSON + all media files

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/export/data` | Instant JSON-only ZIP download |
| POST | `/api/export/full` | Start full export job (returns jobId) |
| GET | `/api/export/status/:jobId` | Poll job progress |
| GET | `/api/export/download/:jobId` | Download completed full export |

## Security

- All endpoints require authentication + tenant scope
- Jobs are tied to userId + tenantId — other users get 404
- Temp files use random UUIDs (not guessable)
- Files deleted after download (download-once)
- Rate limited: one active job per user
- Auto-cleanup of temp files older than 1 hour

## ZIP Structure

```
whoareyou-export-YYYY-MM-DD.zip
├── manifest.json
├── contacts.json
├── relationships.json
├── posts.json
├── companies.json
├── labels.json
├── addresses.json
├── life-events.json
├── reminders.json
├── gifts.json
└── media/                    (full export only)
    ├── contacts/{uuid}/      (profile photos)
    ├── posts/{uuid}/         (post media)
    └── companies/{uuid}/     (group photos + logos)
```

## JSON File Fields

### manifest.json
- `version` — export format version
- `exportDate` — ISO timestamp
- `format` — "data-only" or "full"
- `stats` — counts per entity type

### contacts.json
Each contact includes:
- `uuid`, `first_name`, `last_name`, `nickname`
- `birth_day`, `birth_month`, `birth_year`, `deceased_date`
- `how_we_met`, `notes`, `is_favorite`, `visibility`
- `last_contacted_at`, `created_at`, `updated_at`
- `photos[]` — file_path, thumbnail_path, is_primary, caption, taken_at, sort_order
- `fields[]` — type (email/phone/etc), value, label

### relationships.json
- `contact_uuid`, `related_contact_uuid`
- `type`, `inverse_name`
- `start_date`, `end_date`, `notes`

### posts.json
Each post includes:
- `uuid`, `body`, `post_date`, `visibility`, `created_at`
- `contact_uuid` — profile post target (nullable)
- `company_uuid` — group post target (nullable)
- `media[]` — file_path, thumbnail_path, file_type, original_name
- `comments[]` — body, contact_uuid, created_at
- `reactions[]` — emoji, contact_uuid
- `tagged_contacts[]` — array of contact UUIDs
- `link_preview` — url, title, description, image_url, site_name

### companies.json
Each company/group includes:
- `uuid`, `name`, `type`, `description`
- `industry`, `website`, `phone`, `email`, `notes`
- `org_number`, `logo_path`, `address`, `latitude`, `longitude`
- `parent_uuid` — parent group (nullable)
- `created_at`
- `photos[]` — file_path, thumbnail_path, is_primary, caption, taken_at
- `members[]` — contact_uuid, title, start_date, end_date

### labels.json
- `name`, `color`, `category`
- `contacts[]` — array of contact UUIDs

### addresses.json
- `id`, `street`, `city`, `postal_code`, `country`
- `latitude`, `longitude`, `created_at`
- `residents[]` — contact_uuid, label, is_primary, moved_in_at, moved_out_at

### life-events.json
- `type`, `event_date`, `description`, `remind_annually`
- `contact_uuid` — primary contact
- `linked_contacts[]` — array of contact UUIDs

### reminders.json
- `contact_uuid`, `title`, `reminder_date`
- `is_recurring`, `is_completed`, `created_at`

### gifts.json
Nested structure:
- `events[]` — uuid, name, event_type, event_date, honoree_contact_uuid, notes
- `products[]` — uuid, name, description, url, image_url, default_price, currency_code, links[]
- `orders[]` — uuid, event_uuid, product_uuid, title, status, order_type, price, currency_code, notes, visibility, participants[]
- `wishlists[]` — uuid, contact_uuid, name, is_default, visibility, items[]

## Tables NOT Exported

These tables are excluded from export (system/transient data):
- `tenants`, `users`, `sessions`, `passkeys` — auth/system
- `system_settings` — system configuration
- `notifications` — transient queue
- `portal_*` tables — portal guest data
- `audit_log` — security logs
- `dismissed_suggestions`, `dismissed_duplicates` — UI state
- `ip_geo_cache` — transient cache
- `tenant_members` — membership state
