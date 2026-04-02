# Development TODO

> Tasks identified but not yet implemented. Prioritized top-down.

## High Priority

### Standardize contact search component
**Status:** In progress — component created (`components/contact-search.js`), admin-labels refactored
**Why:** 12 separate inline contact search implementations across 9 files, each with slightly different behavior (debounce, result count, keyboard nav, dropdown style). This leads to inconsistent UX and duplicated code.

**Current implementations:**
| File | Context | Limit | Keyboard nav | Floating dropdown |
|------|---------|-------|-------------|-------------------|
| `components/dialogs.js:138` | contactSearchDialog modal | 8 | No | N/A (modal) |
| `pages/admin-labels.js:243` | Add contact to label | 8 | Yes | Yes |
| `pages/admin-momentgarden.js:158` | Select import target | 5 | No | No |
| `pages/admin-momentgarden.js:546` | Map MG users | 5 | No | No |
| `pages/admin-tenant.js:834` | Link member to contact | 6 | No | No |
| `pages/admin-tenant.js:1164` | Portal guest contact link | 6 | No | No |
| `pages/company-detail.js:238` | Add employee to company | 8 | No | No |
| `pages/contact-detail.js:1587` | Add relationship search | 6 | No | No |
| `pages/contact-detail.js:2800` | Company search (different) | 8 | No | No |
| `pages/gift-event-detail.js:673` | Gift recipient picker | 6 | No | No |
| `pages/gift-planning.js:404` | Gift planning contact | 6 | No | No |
| `pages/gifts.js:292` | Gift event honoree | 6 | No | No |

**Proposed solution:** Create a reusable `ContactSearchDropdown` component:
```javascript
// Usage:
import { attachContactSearch } from '../components/contact-search.js';

attachContactSearch(inputElement, {
  limit: 8,
  floating: true,        // dropdown floats over content
  keyboard: true,         // arrow keys + enter
  onSelect: (contact) => { /* handle selection */ },
  renderResult: null,     // optional custom render
});
```

**Component should include:**
- Debounced search (200ms)
- Floating dropdown with `z-index: 1050` and `box-shadow`
- Keyboard navigation (Arrow Up/Down, Enter, Escape)
- Contact row with avatar (reuse `contactRowHtml`)
- Configurable result limit
- Auto-close on blur (with delay for click)
- "No results" state

**Refactored:**
- [x] `admin-labels.js` — add contact to label
- [x] `admin-tenant.js:834` — portal guest linked contact
- [x] `admin-tenant.js:1164` — portal contact search (setupPortalContactSearch)
- [x] `admin-momentgarden.js:158` — select import target contact

- [x] `company-detail.js:238` — add employee search
- [x] `gifts.js:292` — gift event honoree
- [x] `gift-planning.js:404` — setupInlineContactSearch helper
- [x] `gift-event-detail.js:673` — setupContactSearch helper

**Remaining (complex — custom selection flows, may not be worth refactoring):**
- [ ] `components/dialogs.js:138` — contactSearchDialog (full modal, used as standalone)
- [ ] `contact-detail.js:2800` — relationship add (multi-step modal: search + type picker + create-and-link)
- [ ] `contact-detail.js:1587` — life event linked contacts (multi-select with chips, filter already linked)
- [ ] `admin-momentgarden.js:546` — MG user mapping (per-row search with pre-filled alias)

---

## Medium Priority

### Multi-tenant: per-tenant linked_contact_id migration
**Status:** Partially done (tenant_members.linked_contact_id exists, utility function created)
**Remaining:** Some code paths still reference `users.linked_contact_id` as fallback. Eventually remove `linked_contact_id` from `users` table entirely and rely solely on `tenant_members`.

### Relationship edit: admin-relationships direction detection
**Status:** Partially done
**Remaining:** The relationship suggestion page (`admin-relationships.js`) creates relationships but doesn't always correctly determine direction. Should use the same inverse-aware logic as the edit dialog.

---

## Low Priority

### Remove `users.linked_contact_id` column
**Status:** Blocked by multi-tenant migration above
**When:** After all code paths use `tenant_members.linked_contact_id` exclusively.

### Gift module UX improvements
**Status:** Not started
**Why:** Several UX issues identified during testing.

**Issues:**

1. **New event defaults to Christmas with pre-filled title**
   - Select should show "Choose type..." as default, not auto-select Christmas
   - Title should only auto-fill when type is actively changed (not on initial load)
   - Date can auto-fill on type change (e.g. Dec 24 for Christmas)

2. **Birthday/wedding events don't need "Giving" tab**
   - Birthdays: you typically receive gifts, not give many
   - Weddings: same — one gift received from each guest
   - Christmas: both giving and receiving many gifts
   - Suggestion: hide "Giving" tab for birthday/wedding, show only "Receiving"
   - Or: default to "Receiving" tab for birthday/wedding

3. **Wedding events should support two honorees**
   - Current: single honoree picker
   - Need: second honoree field when type is "wedding"
   - Backend: `honoree_contact_id_2` column or a junction table
   - Display: "Erik & Marte's wedding" in header

4. **Planning page dropdown z-index**
   - File: `gift-planning.js`
   - Three-dots dropdown on gift cards clips behind the next card
   - Fix: add `z-index` or use `data-bs-display="static"` on dropdown

5. **Planning page edit modal incomplete**
   - Edit gift modal only shows title/notes text fields
   - Missing: product picker, recipient/giver contact chips, status selector
   - Should reuse the same form as "Add gift" with pre-filled values

### Standardize company search component
**Status:** Not started
**Why:** Company search in `contact-detail.js` has its own implementation. Should follow the same pattern as contact search.

### Portal: edit/delete own posts
**Status:** Not started
**Why:** Portal guests can create posts but cannot edit or delete them after creation.
