# Integrations

## MomentGarden Import

Import photos, videos, and captions from MomentGarden (Minnehagen) ZIP exports.

### How It Works
1. User exports from MomentGarden (requires paid Star subscription)
2. ZIP files contain media files + `captions.txt`
3. `captions.txt` format: `YYYY-MM-DD HH:MM:SS : filename.JPEG : Caption text`
4. Each line becomes a post on the selected contact's timeline

### Import Flow (Settings → Integrations → MomentGarden)
1. Select target contact (inline search with contact chips)
2. Upload ZIP file (one at a time, up to 1GB)
3. Preview: client-side parsing of `captions.txt` via JSZip
4. Server processes: sharp for images, as-is for videos
5. Duplicate detection via `original_name` in `post_media`

### Sync Loves & Comments
After import, optionally sync from MomentGarden's API:
1. Paste `CakeCookie[Auth][User]` value from browser DevTools
2. "Fetch loves & comments" — scans all imported moments (batch-controlled)
3. User mapping: MG nicknames → WhoareYou contacts (auto-matched by name, manual override)
4. "Sync" — saves comments as `[Nickname] text`, reactions as ❤️
5. Synced moments marked with `:synced` suffix in `external_id`
6. Re-sync toggle for updating with new comments

### Technical Details
- Backend: `routes/import.js` with `adm-zip` for extraction
- Moment ID extracted from filename prefix (e.g., `21483371_abc.JPEG` → `mg:21483371`)
- API calls to `momentgarden.com/api/loves/` and `/comments/slideshow/`
- 200ms delay between API calls to avoid rate limiting

## ipgeolocation.io

Optional IP-to-country lookup for security features.

### Setup
1. Register at [ipgeolocation.io](https://ipgeolocation.io) (free: 1000 lookups/day)
2. System Admin → IP Security → paste API key
3. Test button verifies the key works

### How It's Used
- **Login security**: block login from non-whitelisted countries
- **Session display**: show country flag on active sessions in profile
- **Cache**: results stored in `ip_geo_cache` table for 30 days
- **Local IPs**: always return `LOCAL` (no API call)

### Files
- `services/geolocation.js` — `getCountryForIp()`, `lookupIp()`
- `utils/ip.js` — `isLoginAllowed()` integrates geolocation
- `routes/system.js` — `/ip-security` settings + test endpoint
- Flag SVGs in `frontend/img/flags/` (271 countries, 4x3 format)

## SMTP (Email)

Configurable SMTP for email features.

### Setup
System Admin → Email tab → configure host, port, user, password, from address.

### Used For
- **Login notifications**: email on new device/IP login
- **Welcome email**: optional when adding household members
- **Password reset**: forgot-password flow
- **Test email**: verify SMTP config works

### Files
- `services/email.js` — `sendEmail()`, `sendLoginNotification()`, `verifySmtp()`
- `utils/settings.js` — `getSetting('smtp_*')` reads from `system_settings` table

## Brønnøysundregistrene (Brreg)

Norwegian Business Register lookup for auto-populating company data.

### How It Works
1. On company detail page, enter org number and click "Brreg lookup"
2. Backend calls `data.brreg.no/enhetsregisteret/api/enheter/{orgNumber}`
3. Returns: company name, address, org form, industry codes
4. Auto-fills company fields (user confirms before saving)

### Endpoint
- `GET /api/companies/brreg/:orgNumber` — proxy to Brreg API, returns formatted company data

### Files
- `routes/companies.js` — Brreg lookup endpoint with SSRF protection
- `frontend/js/pages/company-detail.js` — UI button and auto-fill logic

## MomentGarden — Manual Post Insert

For posts that weren't included in the ZIP export (text-only posts, corrupted images), use these SQL templates via dev-tools database or container exec.

### 1. Find contact and author IDs

```sql
-- Find the contact (whose wall the post goes on)
SELECT id, uuid, first_name, last_name FROM contacts
WHERE tenant_id = 1 AND first_name = 'Ailo';

-- Find the author contact (who posted it)
SELECT id, uuid, first_name, last_name FROM contacts
WHERE tenant_id = 1 AND first_name = 'Christine';
```

### 2. Insert a post

```sql
INSERT INTO posts (uuid, tenant_id, body, post_date, contact_id, author_contact_id, visibility, created_at, updated_at)
VALUES (
  UUID(),                          -- auto-generated UUID
  1,                               -- tenant_id
  'Post text here',                -- body
  '2020-03-08',                    -- post_date (YYYY-MM-DD)
  870,                             -- contact_id (whose wall — from step 1)
  425,                             -- author_contact_id (who posted — from step 1)
  'shared',                        -- visibility
  NOW(), NOW()
);
```

To include in MG author management and sync, add an external_id marker:
```sql
-- Get the post ID just inserted
SET @post_id = LAST_INSERT_ID();

-- Add a dummy media entry so MG-authors page shows it (optional)
-- Only needed if you want the post to appear in MG sync flow
INSERT INTO post_media (post_id, tenant_id, file_path, file_type, external_id, sort_order)
VALUES (@post_id, 1, '', 'text/plain', 'mg:MOMENT_ID', 0);
```

### 3. Add likes (reactions)

```sql
-- Find post_id first
SELECT id FROM posts WHERE tenant_id = 1 AND body LIKE '%text fragment%' LIMIT 1;

-- Add a like from a specific contact
INSERT INTO post_reactions (post_id, tenant_id, emoji, contact_id, created_at)
VALUES (
  POST_ID,                         -- post_id from above
  1,                               -- tenant_id
  '❤️',                            -- emoji
  CONTACT_ID,                      -- contact_id of the person who liked
  '2020-03-08 10:18:20'            -- created_at (from MG loves API)
);
```

### 4. Add comments

```sql
INSERT INTO post_comments (post_id, tenant_id, body, contact_id, created_at, updated_at)
VALUES (
  POST_ID,                         -- post_id
  1,                               -- tenant_id
  'Comment text here',             -- body
  CONTACT_ID,                      -- contact_id of commenter
  '2020-03-08 19:43:33',           -- created_at
  '2020-03-08 19:43:33'            -- updated_at
);
```

### Notes
- `author_contact_id` is the display author — use this instead of `created_by`
- `contact_id` on posts is the "about" contact (whose wall), not the author
- All IDs are internal integer IDs, not UUIDs (use the SELECT queries to find them)
- `tenant_id` must match across all tables

## Monica CRM Import

One-time migration script for users coming from Monica.

### What Migrates
- Contacts (422), labels (14), contact fields (114), addresses (107)
- Relationships (433), posts from notes (76) and activities (36)
- Reminders (41)

### What Doesn't Migrate
- Profile photos (manual re-upload needed)
- Pets, journal entries, documents, gifts, conversations, debts

### How to Run
```bash
# From inside the container:
node src/migrate-monica.js

# Or via dev-tools API:
curl -X POST "http://SERVER:PORT/containers/whoareyou-app/exec" \
  -H "Content-Type: application/json" \
  -d '{"command": "node src/migrate-monica.js"}'
```

Configure `TARGET_TENANT_ID` and `TARGET_USER_ID` at the top of the script.
