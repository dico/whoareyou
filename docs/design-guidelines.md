# Design Guidelines

> These rules ensure visual and behavioral consistency across the application. **Read before writing any frontend code.**

## Core Philosophy

- **Less is more** — content-focused, minimal visible UI chrome
- **Glass-effect** (glassmorphism) — `backdrop-filter: blur` on cards, inspired by iOS
- **Mobile-first** — responsive design, touch-friendly
- **No build step** — vanilla JS, CSS custom properties, Bootstrap 5 as base

## CSS Architecture

### File Structure
```
css/
├── variables.css        # Theme: colors, spacing, typography, shadows, radii
├── base.css             # Layout, utilities, reusable patterns
├── portal.css           # Portal-specific styles
└── components/          # Per-feature styles (10 files)
    ├── auth.css
    ├── card.css
    ├── contacts.css
    ├── dialogs.css
    ├── gifts.css
    ├── map.css
    ├── navbar.css
    ├── photos.css
    └── timeline.css
```

### Rules
- Use CSS custom properties from `variables.css` — never hardcode colors, spacing, or radii
- No inline styles (exception: dynamically calculated values like SVG positions)
- Component CSS goes in the appropriate `components/*.css` file
- Never create new CSS files without clear justification

## Component Rules

### 1. No native dialogs
Never use `alert()`, `confirm()`, or `prompt()`. Use `confirmDialog()` from `components/dialogs.js`.

### 2. Modal sizing
- **Default**: `modal-dialog-centered` with no size class. This is the standard for all new modals.
- **`modal-sm`**: Never use unless explicitly approved per-modal and documented here.
- **`modal-lg`**: For content that needs space (forms with multiple fields).
- **`modal-xl`**: Side-by-side layouts (family tree, document preview).
- Approved `modal-sm` exceptions: `confirmDialog` (dialogs.js), password prompt for 2FA disable (profile.js).

### 3. Modals are white
Modal content uses `glass-card` class. Dropdowns inside modals use solid `var(--color-surface)` background.

### 4. No modal-in-modal for search/select
When a modal needs a contact/product picker, use an inline search field with dropdown (`.product-picker-dropdown` pattern). Never call `contactSearchDialog()` from inside a modal. Exception: simple yes/no confirmation dialogs.

### 5. Dropdowns are solid white
All dropdowns/search results use `background: var(--color-surface)` — no glass/transparency.

### 6. Contact rows
All lists showing contacts use `contactRowHtml()` from `components/contact-row.js`. 32px avatar, name, optional meta text. Same hover effect everywhere. Never build custom avatar+name structures.

### 7. Contact chips
For inline contact references (tags, selections), use `.contact-chip` with `.contact-chip-avatar` + name + optional `.contact-chip-remove`. Same pattern for country tags with flags. The `.edit-tag` class in post edit mode follows the same chip pattern (avatar + name + remove button) — never use plain text pills without avatars.

**Always show profile photo** in the avatar slot when available. Backend must include `avatar` (thumbnail_path) in every response that feeds contact chips. Fallback to initials only when no photo exists:
```html
<span class="contact-chip-avatar">
  ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${initials}</span>`}
</span>
```

### 8. Visibility pill
Use `.visibility-pill` toggle for shared/private selection everywhere. Never use a plain button.

### 9. Round avatars everywhere
All thumbnails use `border-radius: var(--radius-full)` (circles). Contacts, products, gifts, member avatars. Only square images in dedicated galleries/lightbox.

### 10. Image viewer
All images open in the same lightbox design (black background, white footer, arrow navigation, keyboard support). Never open images in new tabs. Reuse `photo-viewer` CSS.

**Image resolution for inline display:** use `file_path` (full-size, up to 1920px) for post media in `renderPostList`, not `thumbnail_path`. Thumbnails are 200×200 square crops — fine for tiny avatars (32-64px) and compose previews (64-96px), but pixelate badly when stretched to ~500-1000px wide cards. See [TODO](todo.md) "Medium-size image variant" for the planned intermediate size.

### 11. Consistent action buttons
In modals: `btn btn-outline-secondary btn-sm` (cancel), `btn btn-primary btn-sm` (primary action). Use `btn-danger` for destructive actions.

### 12. Post types
Profile posts show contact with avatar at top. Activity posts show date + tags. Both use `post-list.js`.

### 13. Lists for large datasets
For lists that can grow to hundreds+ (products, contacts): use contact-card pattern (48px round avatar + name + meta, grid with min 280px). Never large image cards for scalable lists.

### 14. Quick-add pattern
For rapid data entry: compact inline form with essential fields visible, advanced options behind "More options" toggle. Form clears after submission.

### 15. Keyboard navigation
Support arrow keys + Enter in search dropdowns. `/` key focuses navbar search.

### 16. Auto-fill on event type
Gift events: selecting type (Christmas, birthday) auto-fills date and name. Hide irrelevant fields.

### 17. Gift visibility
Gifts are `private` by default. Auto-switch to `shared` when status = `given`. Shared gifts are hidden from recipients who are users.

### 18. Post engagement bar (Facebook-style)
Posts show an **engagement bar** between media and action buttons:
- **Left**: `❤️ Robert, Ola og 3 andre` — clickable, opens modal with all likers as contact links
- **Right**: `4 kommentarer` — clickable, toggles comment section
- Only first names (family context). Names link to contact profiles where possible.
- Action bar below: `❤️ Lik` and `💬 Kommenter` as text buttons (no counts on buttons)

### 19. Comments
- Use `<textarea>` (not `<input>`) for comment fields. Enter submits, Shift+Enter adds newline.
- Auto-resize textarea up to 120px max height.
- Comments show: avatar (clickable) | bubble with **Name** (clickable link to contact) + text + timestamp below
- Portal comments: same bubble pattern but simpler (no avatar, name + text in bubble, time below)

### 20. Contact identity principle
All reactions and comments are attributed to a **contact** (not a user or guest). Users and portal guests are linked to contacts via `linked_contact_id`. Backend always resolves to `contact_id` for display. Only first names are shown in social contexts (likes, comments).

### 21. Post author display
Posts show **who posted** (author) rather than just the contact the post is about:
- **Contact profile** (`/contacts/:uuid`): Author name + avatar in header (you already know which contact it's about)
- **Global feed** (`/`): "Author → Contact" format with author avatar
- **Portal**: Author with display_name for guests ("Bestefar Roger"), first name for users ("Robert")
- Posts without a known author fall back to showing the contact name

### 22. No nested cards
Never nest glass-cards inside glass-cards (box-in-box). This creates visual clutter and breaks the flat, content-focused aesthetic. Instead, place them as siblings. Example: a timeline section should have the compose form as one glass-card and the posts list as a flat `timeline` div below it — each post renders its own card via `renderPostList`.

### 23. Link preview
When a URL is typed/pasted in post compose or edit, a link preview card is fetched and shown:
- Debounced detection (600ms) on input, immediate on paste
- Preview card: image (if og:image), site name, title, description — clickable
- Dismiss button (X) to remove preview — stays dismissed until next post
- Preview data saved to `post_link_previews` table (persists if URL goes offline)
- Auto-fetched when editing old posts that have URLs but no saved preview

### 24. Contact fields — auto-detect
When adding a contact field, the type select is hidden. A small "auto" badge shows instead. Pasting a URL auto-detects the platform (Facebook, Instagram, LinkedIn, YouTube, etc.), email addresses and phone numbers are also detected. Click the badge to manually override. Social media fields display the type name (e.g. "Facebook") rather than extracted usernames.

### 25. Duplicate detection and merge
`/admin/duplicates` finds potential duplicates by scoring name similarity, birthday, email, and phone matches. Merge transfers all data (posts, relationships, photos, fields, addresses, companies) to the kept contact and soft-deletes the other. Routes under `/contacts/tools/*` to avoid `/:uuid` collision.

### 26. Contact search component (`components/contact-search.js`)
Reusable floating contact search dropdown. Use `attachContactSearch(inputElement, options)` instead of writing inline search logic.

**Usage:**
```javascript
import { attachContactSearch } from '../components/contact-search.js';
const search = attachContactSearch(inputEl, {
  limit: 8,           // max results (default 8)
  floating: true,     // absolute positioned dropdown (default true)
  keyboard: true,     // arrow keys + enter (default true)
  onSelect: (contact) => { /* { uuid, first_name, last_name, avatar } */ },
  placeholder: '...', // override input placeholder
});
// Cleanup: search.destroy(), search.hide(), search.clear()
```

**Behavior:**
- Debounced search (200ms) via `GET /contacts?search=`
- Floating dropdown with `z-index: 1050`, `box-shadow`, max-height 280px
- Keyboard: Arrow Up/Down to navigate, Enter to select, Escape to close
- Active item highlighted with blue background
- Auto-close on blur (200ms delay to allow click)
- "No results" message when empty
- For single-select: hide input after selection, show contact chip with X to clear
- For multi-select: keep input visible, clear value after selection

**CSS classes:** `.contact-search-dropdown`, `.contact-search-item`, `.contact-search-empty`

### 27. Detail header pattern (CSS in `base.css`)
Reusable header for detail pages that need an icon + title/meta + actions, with a toolbar row below. Used by gift events and groups.

```html
<div class="detail-header-wrap">
  <div class="detail-header glass-card">
    <div class="detail-header-icon" style="background:..."><i class="bi bi-..."></i></div>
    <div class="detail-header-info">
      <h3 class="mb-0">Title</h3>
      <span class="text-muted small">Meta info</span>
    </div>
    <div class="detail-header-actions"><!-- dropdown menu --></div>
  </div>
  <div class="detail-header-toolbar">
    <div class="filter-tabs"><!-- tabs --></div>
    <button class="btn btn-primary btn-sm"><!-- action --></button>
  </div>
</div>
```

**CSS classes:** `.detail-header-wrap`, `.detail-header`, `.detail-header-icon`, `.detail-header-info`, `.detail-header-actions`, `.detail-header-toolbar`

**Refactoring status:** See [TODO](todo.md) for remaining files.

### 28. Submit loading state
When submitting actions that may take time (post with media upload, export, etc.), the submit button must:
- Disable immediately on click (prevent double-submit)
- Show a spinner (`<span class="spinner-border spinner-border-sm">`) replacing button text
- Re-enable after completion (success or error)
- Restore original button text

### 29. Fade-out on delete
When removing items from a list (posts, trash items), use a fade-out animation before removing from DOM:
```javascript
el.style.transition = 'opacity 0.3s, transform 0.3s';
el.style.opacity = '0';
el.style.transform = 'scale(0.95)';
await new Promise(r => setTimeout(r, 300));
el.remove();
```
This provides visual confirmation that the item was removed, especially when identical items are adjacent.

### 30. Mobile-responsive action bars
On narrow screens (≤480px), action bars with multiple items (tags + date + buttons) should wrap to multiple rows rather than cramming everything on one line. The post edit bar uses `flex-wrap` with a `border-top` separator on the actions row at this breakpoint. Apply the same pattern to any toolbar that combines inputs and buttons.

### 31. Date picker (`utils/datepicker.js`)
All date inputs use flatpickr (CDN) for locale-aware formatting. **No manual initialization needed** — a MutationObserver automatically converts any `<input type="date">` that appears in the DOM.

- Norwegian: `dd.mm.yyyy`, English: `dd/mm/yyyy`
- Internal value is always `YYYY-MM-DD` (altInput mode)
- `disableMobile: true` — forces flatpickr's own picker on all devices. Without this, iOS shows its native datepicker which uses a localized format (e.g. "15. apr 2026") and doesn't sync changes back to flatpickr's hidden input.
- Compact width via `.fp-date` class (`width: 120px`)
- Lazy-loaded: flatpickr JS/CSS only fetched on first date input
- Just use `<input type="date">` — it works everywhere (pages, modals, dynamic forms)

### 32. Performance: avoid MutationObserver with subtree
**Never** use `MutationObserver` with `{ childList: true, subtree: true }` on `document.body` for scanning/initializing elements. It fires on EVERY DOM change in the entire app — with large renders (e.g. 20 posts × many child elements), this causes thousands of synchronous callbacks that freeze the browser or trigger Chrome's "Out of Memory" crash.

**Instead:**
- Debounce the observer callback (minimum 200ms)
- Or better: call initialization manually after page/modal render
- Only observe specific containers, never the entire body
- This lesson was learned when flatpickr's auto-init observer crashed Chrome at ~1900 posts in production

### 33. Portal post creation
Portal guests can create posts on contacts they have access to. Posts are always `visibility: shared` and attributed to the guest via `portal_guest_id`. Media upload uses same image processing pipeline as main app.

## i18n

### Usage
```javascript
import { t } from '../utils/i18n.js';
t('contacts.title');                    // Simple key
t('contacts.deleteConfirm', { name }); // With params
```

### Rules
- Every user-facing string must use `t()` — no hardcoded text
- Add keys to BOTH `locales/en.json` and `locales/nb.json`
- Use nested keys: `section.key` (e.g., `contacts.title`, `admin.save`)
- Dates: use `formatDate()` or `formatDateLong()` from `utils/i18n.js`
- Relative time: use `timeAgo()` from `utils/i18n.js` — "3 minutter siden", "om 5 dager". Falls back to `formatDate()` for >30 days. Works both directions (past/future). Use for comments, activity timestamps, and countdowns (e.g. birthdays).

## Navigation Structure

```
Navbar (sticky top, glass-effect):
├── Logo → /
├── Search (/ shortcut, autocomplete)
├── Timeline | Contacts | Map | Companies | Gifts
├── Notification bell
└── User dropdown
    ├── My Profile → /contacts/{uuid} (if linked)
    ├── Account Settings → /profile
    ├── Administration → /settings (admin only)
    └── Logout
```
