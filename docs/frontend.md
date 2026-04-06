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
| `showProductDetailModal()` | `product-detail-modal.js` | Product detail modal with links, image, gift history. |
| `openContactGiftModal()` / `giftContactLinkAttrs()` | `contact-gift-modal.js` | Modal shown when clicking a contact name anywhere in the gift app. Shows avatar, name, "open profile" button, and the contact's received/given gift history. Pages mark contact links with `giftContactLinkAttrs(contact)` — a global click delegate handles every link. |
| `attachContactSearch()` | `contact-search.js` | Reusable inline contact search dropdown. Floating dropdown, keyboard navigation, modal-aware. |
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
