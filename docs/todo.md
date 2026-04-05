# Development TODO

> Open tasks only. Completed work is documented in the relevant docs.

## High Priority

### Standardize contact search component
**Status:** In progress — 9/12 refactored (timeline tag search added)
**Why:** 12 inline contact search implementations across 9 files with inconsistent UX. Reusable component created (`components/contact-search.js`).

**Remaining (complex — custom selection flows):**
- [ ] `components/dialogs.js` — contactSearchDialog (full modal, used as standalone)
- [ ] `contact-detail.js` — relationship add (multi-step modal: search + type picker + create-and-link)
- [ ] `contact-detail.js` — life event linked contacts (multi-select with chips, filter already linked)
- [ ] `admin-momentgarden.js` — MG user mapping (per-row search with pre-filled alias)

---

## Medium Priority

### Multi-tenant: remove `users.linked_contact_id`
**Status:** Partially done
**Why:** `tenant_members.linked_contact_id` exists and utility function created, but some code paths still reference `users.linked_contact_id` as fallback. Remove column after all code paths migrated.

### Data export — Phase 3 (scheduled cloud backup)
**Status:** Not started — Phase 2 (in-app export) is done, documented in [export.md](export.md)

**Goal:** Automated scheduled backup to cloud storage with encryption.

**Recommended approach: Backblaze B2 + node-cron**
- Simplest auth (API key, no OAuth), fully unattended, lowest cost (~$6/TB/month)
- S3-compatible — can switch to AWS/MinIO/Wasabi later without code changes
- Use `@aws-sdk/client-s3` (official, well-maintained) for uploads
- Use `node-cron` for in-process scheduling (no extra containers)
- Encrypt ZIP with Node.js `crypto` (AES-256-GCM) before upload

**Alternative providers researched:**

| Provider | Auth | Unattended | Cost | Notes |
|----------|------|-----------|------|-------|
| Backblaze B2 | API key | Yes | ~$0.005/GB | S3-compatible, recommended |
| S3 (AWS/MinIO/Wasabi) | Access keys | Yes | $0.005-0.023/GB | Same SDK as B2 |
| OneDrive | OAuth2 + refresh token | Yes (after initial setup) | $2-5/mo | Refresh tokens don't expire |
| Google Drive | OAuth2 (personal) or Service Account (Shared Drive only) | Partial | Free (personal) | Service accounts can't access personal Drive since Apr 2025 |
| WebDAV | Basic auth | Yes | Variable | Nextcloud/ownCloud, slow for large files |
| SFTP | SSH keys | Yes | Variable | Any Linux server |

**Implementation plan:**
1. Settings UI: cloud backup config (provider, credentials, schedule, encryption key)
2. Store config in `system_settings` (encrypted credentials)
3. `node-cron` job: generate export ZIP → encrypt → upload → cleanup
4. Backup history log (date, size, status)
5. Manual "Backup now" button in Settings
6. Retention policy (keep last N backups, delete old ones)

---

## Low Priority

### Post edit: media management
**Status:** Not started
**Why:** When editing a post, users can't add or remove attached media (images, videos, documents). Currently only text, date, tags, and about-contact can be changed during edit.
**Needed:**
- Show existing media in edit mode with remove (X) button per item
- Allow adding new media via file picker or drag-and-drop
- Backend: endpoint to delete individual post_media items

### Date picker: locale-aware
**Status:** Not started
**Why:** Native `<input type="date">` uses browser/OS locale for display format (mm/dd/yyyy vs dd/mm/yyyy). Norwegian users expect dd.mm.yyyy. The browser locale setting doesn't always override this.
**Options:**
1. Replace with a lightweight JS date picker (e.g. flatpickr, ~5KB) configured with app locale
2. Use three separate selects (day/month/year) like we do for birth dates
3. Use `<input type="text">` with pattern validation and a calendar popup

**Recommendation:** flatpickr with locale config — minimal footprint, works everywhere, supports `nb` locale out of the box. When implemented, replace ALL `<input type="date">` across the app and document the component in `design-guidelines.md`.

### Gift module UX improvements
**Status:** Not started
**Issues:**
1. **New event defaults to Christmas** — select should show "Choose type..." as default, title should only auto-fill on type change
2. **Birthday/wedding events** — hide or de-emphasize "Giving" tab, default to "Receiving"
3. **Wedding: two honorees** — need second honoree field, display "Erik & Marte's wedding"
4. **Planning page dropdown z-index** — three-dots dropdown clips behind next card
5. **Planning page edit modal** — missing product picker, contact chips, status selector

### Standardize company search component
**Status:** Not started
**Why:** Company search in `contact-detail.js` has its own implementation. Should follow the same pattern as contact search.

### Portal: edit/delete own posts
**Status:** Not started
**Why:** Portal guests can create posts but cannot edit or delete them after creation.

### Performance: relationship suggestions at scale
**Status:** Monitoring — currently 38ms for 450 contacts / 308 suggestions
**Why:** Suggestions are computed on-the-fly. Algorithm is O(n*r). If it exceeds 1s with more contacts, consider caching or pagination.
