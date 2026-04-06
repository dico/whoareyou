# Development TODO

> Open tasks only. Completed work is documented in the relevant docs.

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

#### Phase 2 — Curation + more layouts — PARTIAL
**Scope:** Improve layout quality and give deeper control over the output.

**Done:**
- Multiple layout templates (hero-top, full-bleed, grid-2, grid-3, grid-4, text-heavy)
- Auto template selection from image count + body length + post weight
- Grouped view modes (Flip / Grid / Editor segmented control)
- Per-page pencil-on-hover in flip view (replaces toolbar curate toggle)
- Inline metadata edit modal (replaces navigate-to-wizard pattern)
- Ellipsis dropdown for book-level actions (edit info / print / delete)
- Per-row ellipsis in book list
- **Weight-based packing** — posts have importance `big | normal | small | hidden`. Auto-weight scored from likes + comments + body length + media count. Small posts pack into shared 4-up pages. Hidden posts remain in editor for recovery. Live page count in editor.
- Per-image exclusion within posts
- Focal-point picker (click image in curate mode)
- URL hash for current page

**Still missing:**
- **More layout templates** — currently 6 templates. Add:
  - Collage (varied image sizes)
  - Per-template landscape/portrait crop modes
  - Mixed post+text batch layout (for "small" weight runs where one post has more interesting text)
- **Custom per-page text** — user-editable caption/body that overrides `post.body` for book output only (never mutates the original post). Stored in `overrides.customText[postUuid]`.
- **Comment placement option** — let user choose where comments appear per book or per page: below image (current), as a sidebar to the left/right of the image (more compact when there are many comments), or hidden. Sidebar layout would be a new template variant.
- **Theming per book** — color scheme (cover background, accent color), font family, cover layout template. Store in `layout_options.theme = { coverBg, accent, fontFamily, coverTemplate }`. Scoped only to `.book-viewer` so the main app theme isn't affected.
- **Custom cover** — upload own cover image, editable title placement, optional back-cover text/photo.
- **Multi-contact books** ("family year book") — wizard accepts multiple contacts, title/subtitle user-defined
- **Per-contact chapter grouping** option (in addition to per year / none)
- **Timeline gap handling** — long periods without posts should show a "X months later" divider rather than jumping silently
- **Page count / price estimate** — show live count in wizard + estimated Blurb price based on format

#### Phase 2.5 — Small polish (nice-to-have, not blocking)
- Back-cover custom text (currently hardcoded "Laget med WhoareYou")
- Swipe gestures on mobile for page turn
- Loading skeleton while `/data` fetches (large books can be slow)
- Pagination/lazy loading of media in the grid view for very large books
- Better empty-state messaging when filters yield zero posts
- Keyboard shortcut hints (arrow keys, G for grid, etc.)
- Undo last exclusion in curate mode

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
