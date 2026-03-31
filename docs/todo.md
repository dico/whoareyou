# Development TODO

> Tasks identified but not yet implemented. Prioritized top-down.

## High Priority

### Standardize contact search component
**Status:** Not started
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

**Files to refactor:** All 9 files listed above. Each implementation replaced with 1-3 lines.

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

### Standardize company search component
**Status:** Not started
**Why:** Company search in `contact-detail.js` has its own implementation. Should follow the same pattern as contact search.

### Portal: edit/delete own posts
**Status:** Not started
**Why:** Portal guests can create posts but cannot edit or delete them after creation.
