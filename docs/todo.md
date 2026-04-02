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

### Dismissed relationship suggestions should persist in backend
**Status:** Done — migration 060, backend endpoints, frontend updated
**Post-deploy cleanup:** Remove `localStorage.getItem('dismissedSuggestions')` references from any client code if found.

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

### Relationship direction convention (RESOLVED)
**Status:** Resolved — code is correct, data was manually corrupted
**Convention:** `contact_id` IS `type.name` OF `related_contact_id`
- `contact_id=Robert, related=Ailo, type=parent` → "Robert is parent of Ailo"
- Forward query on Robert's profile: shows Ailo with `type.name=parent` (Robert is parent of Ailo)
- Inverse query on Ailo's profile: shows Robert with `type.inverse_name=child` (Ailo is child of Robert)
**Display:** Shows what I AM to the other person, not what they are to me. This is the correct convention.
**Root cause of bug:** Manual editing via swap button in UI reversed some relationships.

**Previous analysis (kept for reference):**
The meaning of `contact_id` → `related_contact_id` with `type.name` was thought to be inconsistent:

The DB convention is: `contact_id` HAS the relationship `type.name` WITH `related_contact_id`.
- `contact_id=Robert, related_contact_id=Ailo, type=parent` → "Robert is parent of Ailo"

But when displaying on a profile page:
- Forward query (my `contact_id`): shows `related` person with `type.name` → "Ailo — Parent" (meaning I am parent of Ailo) ✅ correct
- Inverse query (my `related_contact_id`): shows `origin` person with `type.inverse_name` → "Robert — Child" (meaning Robert is my child) ❌ wrong — Robert is my parent!

**Root cause:** `inverse_name` of `parent` is `child`. When Ailo views Robert via inverse query, it shows `inverse_name=child`, but the intended display is "Robert is my parent" not "Robert is child".

**The display should show what the OTHER person is TO ME:**
- Forward: I am contact_id. I see related. type.name = what I am to them. But I want to show what THEY are to ME → use `inverse_name`
- Inverse: I am related_contact_id. I see origin. origin has type.name toward me. So origin IS type.name to me → use `name`

**Swapping name/inverse_name** was attempted but broke other relationships because some relationships were manually created with inconsistent direction.

**Recommended fix:**
1. First: audit ALL relationships in DB to ensure consistent direction (parent is always contact_id, child is always related_contact_id)
2. Then: swap name/inverse_name in the query (forward shows inverse_name, inverse shows name)
3. Update is_inverse flags accordingly
4. Test thoroughly before deploying

**DO NOT** change the query again without first auditing the data.

### Separate family tree from relationship graph
**Status:** Not started
**Why:** Current tree component mixes relationship graph (hop-based) with family tree (generation-based). These are fundamentally different:

| | Relationship graph | Family tree |
|---|---|---|
| **Purpose** | "Who knows who" | Ancestry & descendants |
| **Depth** | Hop count (any relation) | Generations (parent/child only) |
| **Layout** | Free-form | Strict: parents above, children below, partners beside |
| **Missing data** | Not shown | Placeholder boxes ("Unknown father") |
| **Includes** | Friends, colleagues, etc. | Only biological/family lines |

**Proposed approach:**
- Keep existing tree for "Full family" and "Social"/"Professional" modes
- New "Family tree" mode with generation-based layout:
  - Build from parent/child edges only
  - Calculate generation number relative to root (0 = root, -1 = parents, +1 = children)
  - Partners placed beside their partner, not as separate generation
  - Placeholder nodes for missing parents (e.g. if only mother is registered, show empty box for father)
  - Depth slider controls generations, not hops
  - Siblings always shown in same generation row

### Performance: relationship suggestions at scale
**Status:** Monitoring — currently 38ms for 450 contacts / 308 suggestions
**Why:** Suggestions are computed on-the-fly (no cache). Algorithm is O(n*r) where n=contacts, r=relationships. With 2000+ contacts may reach 200-400ms. If it exceeds 1s, consider:
- Caching results in a `suggestion_cache` table, invalidated on relationship changes
- Paginating suggestions (load 20 at a time)
- Moving computation to a background job

### Standardize company search component
**Status:** Not started
**Why:** Company search in `contact-detail.js` has its own implementation. Should follow the same pattern as contact search.

### Portal: edit/delete own posts
**Status:** Not started
**Why:** Portal guests can create posts but cannot edit or delete them after creation.
