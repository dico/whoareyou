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
For inline contact references (tags, selections), use `.contact-chip` with `.contact-chip-avatar` + name + optional `.contact-chip-remove`. Same pattern for country tags with flags.

### 8. Visibility pill
Use `.visibility-pill` toggle for shared/private selection everywhere. Never use a plain button.

### 9. Round avatars everywhere
All thumbnails use `border-radius: var(--radius-full)` (circles). Contacts, products, gifts, member avatars. Only square images in dedicated galleries/lightbox.

### 10. Image viewer
All images open in the same lightbox design (black background, white footer, arrow navigation, keyboard support). Never open images in new tabs. Reuse `photo-viewer` CSS.

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
