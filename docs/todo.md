# Development TODO

> Open tasks only. Completed work is documented in the relevant docs.

## Migrations awaiting production deploy

Once these migrations have run in production, the lines below can be removed.

- `068_add_company_id_to_gift_order_participants.js` — nullable `company_id` FK on gift_order_participants, contact_id made nullable. Allows gifts from/to groups. (Dev batch 47.)
- `069_create_gift_event_honorees.js` — junction table for multi-honoree events (wedding bride+groom, joint birthdays). Backfills from legacy `gift_events.honoree_contact_id`, which stays in place for backwards compatibility until a follow-up migration removes it. (Dev batch 48.)
- `070_add_directions_to_gift_events.js` — adds `directions` enum (`both`/`incoming`/`outgoing`) to control which gift tabs an event shows. Backfills wedding/birthday rows to `incoming`. (Dev batch 49.)

## High Priority

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

## Low Priority

### Gift module UX improvements
**Status:** In progress
**Remaining:**
- **Wedding: two honorees** — second honoree field (requires migration)

### admin-tenant.js misuses `.product-picker-dropdown` class
**Status:** Not started
**Why:** `admin-tenant.js` reuses `.product-picker-dropdown` CSS class for contact search dropdowns (member invite, MG mapping, etc.). Should use `.contact-search-dropdown` / `attachContactSearch()` from `components/contact-search.js` for consistency. See [admin-tenant.js:879,893,1000,1084](../frontend/js/pages/admin-tenant.js).

### Standardize company search component
**Status:** Not started
**Why:** Company search in `contact-detail.js` has its own implementation. Should follow the same pattern as contact search.

### Performance: relationship suggestions at scale
**Status:** Monitoring — currently 38ms for 450 contacts / 308 suggestions
**Why:** Suggestions are computed on-the-fly. Algorithm is O(n*r). If it exceeds 1s with more contacts, consider caching or pagination.
