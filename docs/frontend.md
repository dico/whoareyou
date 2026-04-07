# Frontend Guide

## Components (12 files)

Reusable UI building blocks. Check here before creating new patterns.

| Component | File | Usage |
|-----------|------|-------|
| `contactRowHtml()` | `contact-row.js` | Standardized contact row: avatar + name + meta. Used in search, sidebar, dialogs. |
| `confirmDialog()` | `dialogs.js` | Replaces `window.confirm()`. Returns Promise\<boolean\>. Options: `title`, `confirmText`, `confirmClass`, `size`. |
| `contactSearchDialog()` | `dialogs.js` | Modal contact search. **Never call from inside another modal** — use inline search instead. |
| `renderPostList()` | `post-list.js` | Timeline post list with edit, delete, comments, reactions, media lightbox. Supports `portalMode`. |
| `addContactModalHtml()` / `initAddContactModal()` / `showAddContactModal()` | `add-contact-modal.js` | Reusable new-contact modal. Used on timeline and contacts page. |
| `renderNavbar()` | `navbar.js` | Main navigation bar with search, notifications, user dropdown. |
| `showPhotoViewer()` | `photo-viewer.js` | Lightbox for contact photos. Navigate, set primary, delete, drag-and-drop upload. |
| `showCropper()` | `image-cropper.js` | Pan+zoom image cropper for profile photos. Square viewport, "Upload original" option. |
| `attachMention()` | `mention.js` | @-mention autocomplete for textareas. |
| `createProductPicker()` | `product-picker.js` | Inline product search/create for gift forms. Dropdown shows 32px thumbnail + name + price. URL-paste auto-fetch. |
| `productChipHtml()` | `product-chip.js` | Visual mirror of `contactRowHtml` / `.contact-chip` for products: rounded thumbnail + title in a pill. Global click delegate opens the product detail modal when `product_uuid` is set. Used in gift list rows and gift add modal drafts. |
| `showProductDetailModal()` | `product-detail-modal.js` | Product detail modal with links, image, gift history. |
| `openContactGiftModal()` / `giftContactLinkAttrs()` | `contact-gift-modal.js` | Modal shown when clicking a contact name anywhere in the gift app. Shows avatar, name, "open profile" button, and the contact's received/given gift history. Pages mark contact links with `giftContactLinkAttrs(contact)` — a global click delegate handles every link. |
| `attachContactSearch()` | `contact-search.js` | Reusable inline contact search dropdown. Floating dropdown, keyboard navigation, modal-aware. |
| `showMediaPicker()` | `media-picker.js` | Modal picker for selecting one or more existing images. Source-agnostic — currently supports `{ contactUuid }` (combines profile photos + post gallery) and `{ items }` (preloaded). Returns a Promise of selected items. Uses `.contact-gallery-grid` styling. New sources (groups, multi-contact, books) can be added in `loadFromSource`. |
| `renderContactFields()` | `contact-fields.js` | Contact info fields grouped by category (contact, web, social). |

## Pages (28 files)

Each page exports a `render*()` function called by the router in `app.js`.

### Main Pages
| Page | Route | Function |
|------|-------|----------|
| Timeline | `/`, `/timeline` | `renderTimeline(contactUuid?)` |
| Contacts | `/contacts` | `renderContacts()` |
| Contact Detail | `/contacts/:uuid` | `renderContactDetail(uuid)`. Also exports `loadGalleryInto()` for reusable photo gallery. |
| Map | `/map` | `renderMap()` |
| Address Detail | `/contacts/:uuid/addresses/:id` | `renderAddressDetail(uuid, id)` |
| Groups | `/groups` | `renderCompanies()` — companies, schools, clubs, teams |
| Group Detail | `/groups/:uuid` | `renderCompanyDetail(uuid)` — members, info/timeline, photos |

### Gift Pages
| Page | Route | Function |
|------|-------|----------|
| Gifts Dashboard | `/gifts` | `renderGifts()` |
| Gift Events | `/gifts/events` | `renderGiftEvents()` |
| Event Detail | `/gifts/events/:uuid` | `renderGiftEventDetail(uuid)` |
| Products | `/gifts/products` | `renderGiftProducts()` |
| Wishlists | `/gifts/wishlists` | `renderGiftWishlists()` |
| Planning | `/gifts/planning` | `renderGiftPlanning()` |

### Book Pages
| Page | Route | Function |
|------|-------|----------|
| Book list + wizard | `/settings/generate-book` | `renderGenerateBook()` — list of existing books with inline create wizard. Per-row ellipsis menu (edit info, delete) reuses `showEditInfoModal` from [book-preview.js](../frontend/js/pages/book-preview.js). |
| Book Preview | `/books/:uuid/preview` | `renderBookPreview(uuid)` — HTML book reader with three view modes, printable via browser (`window.print()` + `@media print` rules in [book.css](../frontend/css/components/book.css)). |

**Book preview view modes** (selected via segmented control in toolbar; persisted in URL hash as `#view=flip|grid|editor`):
- **Flip** (default) — one page at a time, keyboard arrow navigation + swipe gestures on mobile, URL hash `#view=flip&p=N` preserves position across refresh. Direction-aware slide animation between pages. Optional "spread" sub-mode shows two pages side by side. Pencil on hover opens the dedicated editor for that page (page editor / batch editor / cover editor depending on page type).
- **Grid** — thumbnail grid of every packed page. Click to jump to that page in flip view; pencil on hover opens the right editor. Pure navigation/overview — no exclusion or weight changes here (those belong in Editor view).
- **Editor** — vertical list of every post with a 416×416px scaled preview on the left and a side panel on the right. Primary control is a 3-button weight selector: Full page / Shared / Hidden. Auto-weight is scored from `likes × 3 + comments × 4 + bodyLen/20 + mediaCount × 2` and shown as a hint. Live page-count total at the top. Updates on weight change are scoped to the affected row (no full re-render) so editing 800-post books stays snappy.

**Sub-editors** (each takes over the stage with its own preview + side panel; "Done" or back returns to the previous view):
- **Page editor** (`renderPageEditView`) — opened from the pencil on a post page in flip or grid. Side panel: template picker (only shows variants that make sense for the image count), custom text override (auto-saved, debounced), per-image exclude (only when ≥2 images), comment visibility toggle, hide-page button. Click images in the preview to set focal point.
- **Batch editor** (`renderBatchEditView`) — opened from the pencil on a shared/batch page. Side panel: layout variant picker (per post-count: horizontal/vertical for 2, big-left/big-top for 3, grid/rows/columns for 4), reorder posts within the batch with up/down arrows, per-post caption modal (`showCaptionModal`). Focal point on click. Structural changes (promote/hide) intentionally NOT here — those belong in Editor view.
- **Cover editor** (`renderCoverEditView`) — opened from the pencil on the cover page. Inline title/subtitle edit, "Pick from book" (uses `showMediaPicker`) and upload buttons for the cover image, solid color picker, title position (4 variants), accent color, font family dropdown, body text size, custom back-cover text. All fields auto-save.

**Weight-based packing** (`buildPages()`): posts have a 3-state importance weight (`full | small | hidden`). Auto-weight is computed from the engagement score above; override per post in Editor view. `small` posts pack into shared 2/3/4-up batch pages adaptively (1-post batches are promoted to full pages to avoid wasted space). The same score also influences template selection — high-engagement posts with a single image use `full-bleed` for impact, others get `hero-top`. `hidden` posts are excluded from the book but remain visible in Editor view for recovery.

**Templates** (7 total): `hero-top` (default 1-image), `full-bleed` (high-impact 1-image), `grid-2`/`grid-3`/`grid-4` (multi-image), `text-heavy` (long body), `image-side` (image left + comment sidebar right — auto-picked when comments ≥ 4 with 1-2 images). Templates adapt to actual image count: requesting `grid-4` on a 1-image post falls through to `full-bleed` so empty slots are never shown.

**Overrides** (stored in `book.layout_options.overrides`, auto-saved via debounced PATCH): `postWeight`, `excludedMedia`, `mediaFocal`, `templates`, `customText`, `hideComments`, `batchOrder`, `batchVariant`. All validated against allow-lists/regex before rendering.

**Theme** (stored in `book.layout_options.theme`, set in cover editor): `coverImage`, `coverBg`, `titlePosition`, `accent`, `fontFamily`, `fontSize`, `backText`. Applied via CSS custom properties (`--book-accent`, `--book-font`, `--book-text-scale`, `--book-page-width`, `--book-page-height`) on `.book-viewer`, scoped so the main app theme is not affected.

**Page sizes** — `layout_options.pageSize` selects from a registry in `book-preview.js` with two groups: Bokfabrikken (Norwegian printer, default — 130×210, A5, 170×240, A4) and Blurb ImageWrap Hardcover (mini/small/large square + standard portrait/landscape + large landscape). The wizard and edit-info modal share `pageSizeOptionsHtml()` so the option list is defined once. Sizes flow into both screen rendering (CSS variables) and print (`@page` rule injected via JS at print time).

**Metadata edit** uses `showEditInfoModal()` (exported from [book-preview.js](../frontend/js/pages/book-preview.js)) — a bootstrap modal with fields for title, subtitle, language, chapter grouping, page size, comments/reactions/page-numbers toggles. Used both from the preview toolbar ellipsis and the book list row ellipsis.

**Wizard preview** — when the user picks contacts and dates in the create wizard, a debounced (350ms) call to `POST /api/books/preview` returns post + estimated page count, displayed inline as "N posts → ≈ M pages" so the user can see what they're about to create.

### Admin Pages
| Page | Route | Function |
|------|-------|----------|
| Settings | `/settings` | `renderSettings()` |
| Profile | `/profile` | `renderProfile()` — 3 tabs: Account, Security, Sessions |
| Tenant Admin | `/admin/tenant` | `renderTenantAdmin()` — Members, invites, contact linking |
| System Admin | `/admin/system` | `renderSystemAdmin()` — 4 tabs: Tenants, Settings, Email, IP Security |
| Integrations | `/admin/integrations` | `renderIntegrations()` |
| MomentGarden | `/admin/integrations/momentgarden` | `renderMomentGarden()` |
| Labels | `/admin/labels` | `renderLabelAdmin()` |
| Addresses | `/admin/addresses` | `renderAddressMerge()` |
| Relationships | `/admin/relationships` | `renderRelationshipSuggestions()` |
| Duplicates | `/admin/duplicates` | `renderDuplicates()` |
| Consistency | `/admin/consistency` | `renderConsistencyReport()` |
| Export Data | `/admin/export-data` | `renderExportData()` — JSON and full backup download |
| Trash | `/admin/trash` | `renderTrash()` — restore or permanently delete contacts/posts |
| Security | `/admin/security` | `renderSecurityAdmin()` |

### Portal Pages
| Page | Route | Function |
|------|-------|----------|
| Portal Login | `/portal/login` | `renderPortalLogin()` |
| Portal Timeline | `/portal` | `renderPortalTimeline()` |
| Share Link | `/portal/s/:token` | `handleShareLink(token)` |

## Utilities

| File | Exports | Purpose |
|------|---------|---------|
| `api/client.js` | `api.get()`, `api.post()`, `api.put()`, `api.patch()`, `api.delete()`, `api.upload()` | Fetch wrapper with JWT auth, auto-refresh on 401 |
| `utils/i18n.js` | `t()`, `setLocale()`, `getLocale()`, `formatDate()`, `formatDateLong()` | Internationalization |
| `utils/auth-url.js` | `authUrl(path)` | Appends `?token=...` to upload URLs for auth |
| `utils/drop-zone.js` | `enableDropZone(el, onFiles, opts)` | Drag-and-drop + paste for files. `{ acceptDocuments: true }` for non-image files |
| `utils/datepicker.js` | Auto-init (MutationObserver) | Replaces `<input type="date">` with flatpickr. Locale-aware (dd.mm.yyyy for nb). No manual calls needed. |
| `utils/visibility.js` | `toggleVisibilityBtn()` | Shared/private pill toggle handler |

## Patterns

### Adding a New Page
1. Create `frontend/js/pages/my-page.js` exporting `renderMyPage()`
2. Add route in `app.js`: `'/my-route': () => renderMyPage()`
3. Add import at top of `app.js`
4. Add i18n keys to both locale files

### Adding a New Component
1. Check if an existing component can be extended
2. Create `frontend/js/components/my-component.js`
3. Export functions (not classes)
4. Document in this file

### Media Upload Flow
```
User selects file → preview (img/video/doc icon) → submit post
  → POST /api/posts (creates post)
  → POST /api/posts/:uuid/media (FormData with files)
    → Images: sharp processing (resize, WebP, thumbnail)
    → Videos: stored as-is
    → Documents: stored as-is with original extension
```

### Inline Search Pattern (for modals)
Instead of opening a search modal from a modal:
```javascript
// Search input + dropdown results
<input type="text" class="form-control" id="search-input">
<div id="search-results" style="position:absolute;..."></div>

// On input: debounced API call → render contactRowHtml() → click to select
```
