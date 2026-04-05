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

### Performance: scale for 5000+ posts
**Status:** Not started — Chrome OOM crash observed at ~1900 posts in prod
**Why:** App must handle years of daily posts, photos, and comments without degradation.

**Backend optimizations:**
1. **Post API response size** — reactions currently include full name + avatar per person per post. With many reactions × many posts, response grows fast. Optimize: only send reaction count + reacted flag on list, fetch full reaction details on demand (when user clicks).
2. **N+1 avatar queries** — posts endpoint runs subqueries for profile photos. Use a single batch query instead.
3. **Pagination cursor** — current offset-based pagination gets slower as offset grows. Switch to cursor-based (WHERE id < lastId) for timeline.
4. **Database indexes** — verify indexes on posts(tenant_id, deleted_at, post_date), post_media(post_id), post_reactions(post_id), post_comments(post_id).

**Frontend optimizations:**
5. **Virtual scrolling** — timeline currently renders all loaded posts in DOM. With load-more, DOM grows unbounded. Consider virtual scrolling or unloading off-screen posts.
6. ~~**Image lazy loading**~~ — Done. All post media images have `loading="lazy"`.
7. ~~**Post edit markup**~~ — Done. Edit form built on demand when user clicks edit (was rendering for all 20 posts).
8. ~~**MutationObserver**~~ — Done. Debounced to 200ms. Documented in design guidelines #29.
9. ~~**Contacts page birth year filter**~~ — Done. New `GET /contacts/birth-years/list` endpoint returns only distinct years.

**Infrastructure:**
10. **CDN for static assets** — CSS, JS, vendor libraries. Reduces server load.
11. ~~**Response compression**~~ — Done. Added `gzip_proxied any` and `gzip_vary on` to nginx.
12. **Database connection pooling** — verify Knex pool settings are appropriate.

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
