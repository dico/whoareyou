# Development TODO

> Open tasks only. Completed work is documented in the relevant docs.

## High Priority

### Memories / "this day in history" — Phase 2
**Status:** Phase 1 + notification + `/memories` page delivered ✅ — `GET /api/posts/memories` returns posts from the same MM-DD in previous years grouped by year. `memory` notification type fires only on **milestone anniversaries** ({1, 5, 10, 15, 20, 25, 30, 40, 50} years ago). `/memories` page live with year-group headers. `renderPostList` accepts `endpoint` parameter so memories reuses the shared component. The email digest expands the memory row into individual post cards with inline CID thumbnails.

**Remaining for Phase 2:**
- Promote to main wall (`/`) — highlighted "På denne dagen"-card at top of timeline when matches exist, with thumbnail + "for N år siden" (skipped until we see how the notification feels in real use).

### Medium-size image variant for inline post display
**Status:** Delivered ✅ — new uploads get `_medium.webp` (800px). Legacy rows have `medium_path = NULL` and fall back to `file_path` in the frontend.

**What was done:**
- `services/image.js`: generates `_medium.webp` at 800px alongside full + thumb on every upload
- Migration `078_add_medium_path`: nullable `medium_path` on `post_media` and `contact_photos`
- `routes/uploads.js`: stores `medium_path` in both tables
- `routes/posts.js` (`assemblePosts`): includes `medium_path` in SELECT + API response
- `post-list.js`: `src="${medium_path || file_path}"` — new images served at 800px, old at 1920px

**Remaining (nice-to-have):**
- Backfill script to generate `_medium.webp` for existing `post_media` rows (currently fall back to full-res)

### Notification filtering and coverage — Phase 1 delivered ✅
Three-layer model shipped: per-type global rule (scope + app/email channels) + per-contact `always`/`never` override + favorites-aware scope. Types: `birthday`, `anniversary`, `reminder`, `memory`, `family_post`, `family_comment`. Tables: `user_notification_prefs`, `user_notification_overrides`. Filter helper: [utils/notification-prefs.js](../backend/src/utils/notification-prefs.js). UI: [/settings/notifications](../frontend/js/pages/settings-notifications.js), link in navbar user dropdown.

**Phase 2 — open items:**
- **Cron-driven generation** — Delivered ✅. Generate logic extracted to `services/notification-generate.js`. `index.js` runs hourly for all tenants — birthday/reminder/anniversary/memory notifications are created server-side regardless of whether anyone opens the app. Route `POST /generate` calls the same service function. `family_post`/`family_comment` emails are unaffected (triggered directly from those routes).
- **Labels as scope source** — today `favorites` is the only "curated subset". Add label-based scope once we see whether favorites alone is enough.
- **Mute a post** — per-post override so a single chatty thread doesn't spam `family_comment` notifications.
- **Notifications for reactions** — currently no notification when someone likes your post.

**Also done in Phase 1 (portal side):** `notifyPortalPost()` + `notifyPortalComment()` added to `portal.js` — tenant users are notified when a portal guest posts or comments.

### Portal/guest notifications
**Status:** Phase 1 (email) delivered ✅ — guests can now receive email digests when posts/comments appear on contacts they have access to.

**What was done (Phase 1):**
- Migration `079_portal_guest_notifications`: `portal_guests.notifications_enabled` (boolean, default false) + `portal_guest_notification_prefs` table (guest_id, type, enabled)
- `services/portal-notification-email.js`: `sendPortalDigestsForTenant()` — finds eligible guests (notifications_enabled + email set + pref enabled for type), 6-hour throttle per guest, sends grouped digest email
- `routes/portal.js`: `POST /posts` and `POST /posts/:uuid/comments` trigger portal digests after response. Guest preferences endpoints: `GET /notifications/prefs`, `PUT /notifications/prefs/:type`
- `routes/portal-admin.js`: `notifications_enabled` field in guest CRUD (GET/PUT)
- Admin edit-guest modal: "Varsler aktivert"-toggle (off by default)
- Portal header: 🔔 bell icon opens preferences modal (new_post on by default, new_comment off)

#### Control model
Two layers — both must be "on" for a guest to receive notifications:

1. **Admin-side toggle** (per guest, in the edit-guest modal): "Varsler aktivert". Default **off** — admin enables it explicitly when the guest has been onboarded. Stored in `portal_guests.notifications_enabled`.
2. **Guest-side preferences** (in the portal, behind a 🔔 bell icon in the header): guest can turn off types they don't want. Stored in `portal_guest_notification_prefs`.

If `notifications_enabled = false` on the guest row, no notifications are sent regardless of guest prefs.

#### Phase 2 — Push (PWA)
- Show "Legg til på hjemskjerm"-banner in portal after first login (dismissible, stored in localStorage). Platform-specific instructions (Safari: Del → Legg til; Chrome: Meny → Installer).
- Bell icon in portal header opens a simple preferences modal: email on/off per type + push opt-in button (shown only if PWA is detected via `window.matchMedia('(display-mode: standalone)')`).
- Reuse existing VAPID/web-push infrastructure from `services/notification-push.js`. New `portal_push_subscriptions` table (same shape as `push_subscriptions` but keyed to `portal_guest_id`).
- Push fires immediately on post/comment (same as tenant user push); email digest remains the fallback.

#### Out of scope
- SMS
- In-portal notification bell/unread count (portal UI stays minimal)
- Notifications about contacts the guest does not have access to

### Email delivery — Phase 1 delivered ✅
Hourly-throttled digest email implemented ([services/notification-email.js](../backend/src/services/notification-email.js)). `sendDigestsForTenant()` fires from `/notifications/generate`, family_post, and family_comment hooks. Throttle = 60 minutes per recipient, checked via `MAX(email_sent_at)` on their notifications. Defense-in-depth: `sendDigestFor()` verifies the recipient is an active member of the tenant before sending — never emails contacts, never emails outside the tenant.

### Web Push — Phase 1 delivered ✅
Immediate push via `web-push` library ([services/notification-push.js](../backend/src/services/notification-push.js)). Service worker at [frontend/sw.js](../frontend/sw.js) handles `push` + `notificationclick`. Subscribe/unsubscribe/test endpoints and a push-status card on `/settings/notifications`. VAPID keys auto-generated and stored in `system_settings`. Expired subscriptions (404/410) are pruned. Three-layer prefs extended with `deliver_push` (default on).

**Open items:**
- iOS PWA testing — push only works when installed from home screen (16.4+). **Tested 2026-04-16 — push works ✅.** Automatic background push (birthday/reminder via cron) not yet verified on real device — cron is now running server-side so this should work.
- Rich notifications (action buttons like "Open post" or "Dismiss") — web-push supports this but not in the MVP.
- Badge API for unread count on the PWA icon (Chrome desktop/Android only).

### Standardize contact search component
**Status:** In progress — 9/12 refactored
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
**Status:** In progress — 7 of 12 items done
**Remaining:**
3. **Pagination cursor** — switch from offset to cursor-based (WHERE id < lastId) for timeline
5. **Virtual scrolling** — unload off-screen posts to reduce DOM size
10. **CDN for static assets** — CSS, JS, vendor libraries
12. **Database connection pooling** — verify Knex pool settings

### Book generation (PDF photo book from timeline)
**Status:** Not started
**Goal:** Generate a printable PDF photo book from timeline posts — intended for physical print (Blurb/Lulu-style POD services that accept PDF upload). Primary use case: yearly family gift books.

**Design decisions (agreed):**
- **HTML/CSS preview first, PDF later.** The book is built as a real page in the SPA (`/books/:uuid/preview`) that the user can flip through. PDF output in MVP is done via `window.print()` + `@media print` CSS — the user saves to PDF from the browser. This avoids Puppeteer/Chromium in MVP entirely. Server-side PDF (Puppeteer) is deferred to Phase 3.
- PDF output targeting Blurb/Lulu spec (RGB, 300 DPI, 3mm bleed). No print-service API integration — user uploads the PDF manually.
- Layout engine runs **in the frontend** — takes posts in chronological order, picks a template per post, packs into fixed-size pages (CSS px mapped to mm). Enables WYSIWYG editing directly in the preview.
- Timeline order is always preserved — the layout engine never reorders posts, only chooses how much space each gets.
- Chapter grouping is a **user choice** (default: per year). Month-based grouping rejected because posts are sporadic and would leave empty chapters.
- Comments included by default, toggleable per book.
- Language selectable per book (follows app i18n — add `book.*` keys to `en.json` and `nb.json`).
- Book subject: either a single contact (title = contact name, subtitle = age range) or multiple contacts (title = user-edited, e.g. "Familie 2025"). Same wizard, subject-selection step decides.
- Cover auto-generated from hero image + title + subtitle + date range. User can edit title/subtitle before generation.
- Drafts persist in DB (`book_jobs.status = 'draft'`) so the user can return later.

**New tables (migration required):**
- `book_jobs` — uuid, tenant_id, user_id, title, subtitle, contact_ids (JSON), date_from, date_to, visibility_filter, excluded_post_ids (JSON), excluded_media_ids (JSON), layout_options (JSON), language, status (draft/queued/processing/ready/downloaded/failed), page_count, file_path, created_at, updated_at

**Security considerations:**
- Tenant isolation on every query (same as export).
- Respect visibility filter: never include `private` posts from other users. `family` posts only if user is a tenant member (always true for authenticated users).
- Rate limit: max 3 active jobs per user, max 10 generations per hour.
- Temp files in random-UUID paths, auto-deleted 1h after completion.
- Log to `export_log` (or new `book_log`) for audit trail — these exports contain a lot of personal data.
- SSRF not applicable (no external fetches during generation).

**Reuse checklist:**
- Background job infrastructure from `routes/export.js` — extract shared helper if pattern diverges.
- `processImage()` from `services/image.js` for generating 300 DPI variants.
- `contactRowHtml` styling principles for author/comment attribution in book.
- `t()` i18n for all book text (chapter headings, "Age X", "Comments", etc.).
- `detail-header` pattern on the wizard page.
- `confirmDialog`, `visibility-pill`, existing modal/form components in the wizard.
- CSS variables from `variables.css` for book theme (but book.css is separate since it targets print).

---

#### Phase 1 — MVP (HTML book with browser-PDF) ✅ DONE
Flippable HTML book preview, single-contact, one template per post, browser-based PDF export. Delivered:
- `book_jobs` migration, `routes/books.js` CRUD + `/data` endpoint, tenant + visibility enforcement
- Wizard at `/settings/generate-book` with list of existing books, create and edit (metadata PATCH)
- Flip reader at `/books/:uuid/preview` with single-page + two-page spread view, keyboard navigation, URL hash for current page
- Grid view of all pages, exclude/include per post, focal point picker in curate mode (click image to set `object-position`)
- Debounced auto-save of overrides via PATCH
- Dynamic viewport scaling (JS-computed `--book-scale`, resizes on window resize)
- `@media print` rules for browser "Save as PDF"
- i18n `book.*` in en/nb, docs updated
- **No Puppeteer, no Chromium, no Dockerfile changes.**

#### Phase 2 — Curation + more layouts — DONE ✅

See [docs/frontend.md](frontend.md) and [docs/api.md](api.md) for the full feature set. Highlights:

- 7 layout templates with auto-selection by content + engagement score
- Two view modes (Flip / Grid) + dedicated sub-editors (page / batch / cover)
- 3-state weight model (full / small / hidden) with adaptive batch layouts
- Multi-contact books with per-contact chapter grouping
- Custom cover (upload + media picker + position + colors + font)
- Per-book theming via CSS variables
- Page-size picker (Bokfabrikken + Blurb formats)
- Wizard live page-count preview
- Page numbers, custom back-cover text, body text size
- Comment bubbles with author avatars

#### Phase 2.6 — Stability + workflow rework — DONE ✅

Targeted refactor in response to real-world testing on a ~200-post production book:

- **iOS Safari PWA crash fix**: book preview no longer mounts every page in the DOM. The flip view now keeps only `currentPage ± 2` (5 pages) live, and serves `thumbnail_path` for everything except the cover background and full-bleed templates. Decoded image memory was the killer — full-resolution × hundreds of pages blew past iOS's hard ceiling and got the PWA process killed silently.
- **Snapshot model**: a book's post list is frozen at creation time (`layout_options.snapshot.postUuids`). New timeline activity no longer silently changes finished books. New endpoints: `POST /api/books/:uuid/regenerate` (commits a fresh snapshot, prunes orphaned overrides) and `GET /api/books/:uuid/regenerate-preview` (diff probe). The toolbar shows a yellow `+N −M` badge when new posts are detected. Backwards-compatible: legacy books without a snapshot fall back to dynamic queries.
- **Editor view removed**: the dedicated vertical-list editor was killed. Per-post weight is now edited directly in the page-edit sub-view (3-button selector), and "promote to full page" is a button in the batch-edit sub-view. Editing happens *in context* with the actual page rendering, not in a parallel list.
- **Weight rebalanced**: default is now `small` for almost everything. Score formula reformulated to `likes × 4 + comments × 6 + bodyLen / 40` with threshold ≥ 18 (was `likes × 3 + comments × 4 + bodyLen / 20 + media × 2` with threshold ≥ 8). Having an image is no longer poenggivende — engagement is the only signal that earns a full page. The same formula now lives in both `frontend/js/pages/book-preview.js` and `backend/src/routes/books.js` (`scorePostRow` / `FULL_PAGE_THRESHOLD`).
- **Image rotation**: new `overrides.mediaRotation` (90/180/270). Rotate buttons in both the page editor (per image in the image grid) and the batch editor (per row, on the primary image).
- **Engagement on shared pages**: batch cells now show `❤ N` / `💬 N` badges so the social signal isn't lost when a post lands on a compact page.

The flip-view slide animation was dropped along with the lazy-mount rewrite — pages snap instead of sliding. Re-introducing it would require either keeping the old wrap mounted across remount or rebuilding the window incrementally; not worth the complexity for now.

#### Phase 2.5 — Nice-to-have polish (not blocking)
- Pagination/lazy loading of media in the grid view for very large books
- Better empty-state messaging when filters yield zero posts
- Keyboard shortcut hints (arrow keys, G for grid, etc.)
- Undo last action in editor (e.g. accidental "Hide page")
- Custom dimensions option (numeric mm input) for printers not in our preset list
- Copy cover image to `/uploads/books/{uuid}/` when picked from media-picker (currently a reference; would survive source post deletion)
- Collage template + landscape-aware crop variants for portrait/landscape page sizes
- Timeline gap dividers ("3 months later") between posts with long gaps

#### Phase 3 — Server-side PDF
**Scope:** Automated, high-quality PDF generation.

- Add Puppeteer + Chromium to Dockerfile (alpine chromium package)
- Background job pattern (like full export): `POST /api/books/:uuid/pdf` → polling → download
- Book template rendered headless via Puppeteer loading `/books/:uuid/preview?print=1`
- Low-res preview PDF before full generation
- Cover editor with title/subtitle, hero image picker from included media
- Dedicated `book_log` for audit trail

#### Phase 4 — Print-ready polish
**Scope:** Tighten for real-world printing and distribution.

- Blurb-specific PDF profile (trade sizes, exact bleed, PDF/X-3 if feasible)
- Page-count → price estimate (static pricing table, link to Blurb upload)
- Cleanup cron for old book jobs and temp PDFs
- Optional: simple dedication page, table of contents

---

### Data export — Phase 3 (scheduled cloud backup)
**Status:** Not started — Phase 2 (in-app export) is done, documented in [export.md](export.md)
**Plan:** Backblaze B2 + node-cron, S3-compatible, AES-256 encryption. See [export.md](export.md).

---

### Signage: access logging and online monitoring
**Status:** Not started
**Why:** A signage token grants unauthenticated read access to family posts/photos. If the token leaks, there's currently no way to know. Need:
- **Access log table** (`signage_access_log`): screen_id, ip_address, country (via ipgeolocation), user_agent, timestamp. Logged on every `/feed/:token` call (throttled to at most 1 row per IP per 5 minutes to avoid DB spam from polling).
- **Admin UI**: per-screen "Activity" tab showing recent IPs, countries, devices. Flag unknown IPs.
- **Online indicator**: `last_accessed_at` already exists — show green/grey dot on the screen list (green if < 2 min ago). Already have `last_accessed_at` update on each feed fetch.
- **Alert on new IP**: optional notification when a previously unseen IP accesses the feed.

---

## Low Priority

### Wishlist sharing via portal
**Status:** Not started
**Why:** Portal guests (grandparents, aunts, etc.) should be able to view wishlists for the children they have access to. Reuses existing portal infrastructure (`portal_guest_contacts` for access control, `portalAuthenticate` middleware). No write access — guests can only browse.
**Plan:**
- New portal endpoint: `GET /api/portal/wishlists` — returns wishlists for accessible contacts
- Portal frontend: wishlist section on the portal timeline or a dedicated tab
- Respect `visibility` on wishlists (only `shared` visible to portal guests)
- Product images via existing portal file-access path (token-based `?token=` on uploads)

### admin-tenant.js misuses `.product-picker-dropdown` class
**Status:** Not started
**Why:** `admin-tenant.js` reuses `.product-picker-dropdown` CSS class for contact search dropdowns (member invite, MG mapping, etc.). Should use `.contact-search-dropdown` / `attachContactSearch()` from `components/contact-search.js` for consistency. See [admin-tenant.js:879,893,1000,1084](../frontend/js/pages/admin-tenant.js).

### Standardize company search component
**Status:** Partially done — `groupSearchDialog()` added to `dialogs.js` (used by post move). `contact-detail.js` still has its own inline company search implementation.
**Why:** Company search in `contact-detail.js` has its own implementation. Should use `groupSearchDialog()` or a shared inline pattern.

### Performance: relationship suggestions at scale
**Status:** Monitoring — currently 38ms for 450 contacts / 308 suggestions
**Why:** Suggestions are computed on-the-fly. Algorithm is O(n*r). If it exceeds 1s with more contacts, consider caching or pagination.
