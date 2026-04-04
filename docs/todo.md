# Development TODO

> Open tasks only. Completed work is documented in the relevant docs.

## High Priority

### Standardize contact search component
**Status:** In progress — 8/12 refactored
**Why:** 12 inline contact search implementations across 9 files with inconsistent UX. Reusable component created (`components/contact-search.js`).

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

### Data export — Phase 3 (cloud backup)
**Status:** Not started — Phase 2 (in-app export) is done, documented in [export.md](export.md)
**Future:** OneDrive/Google Drive connector with scheduled export (daily/weekly), encrypted before upload.

---

## Low Priority

### Gift module UX improvements
**Status:** Not started
**Issues:**
1. **New event defaults to Christmas** — select should show "Choose type..." as default, title should only auto-fill on type change
2. **Birthday/wedding events** — hide or de-emphasize "Giving" tab, default to "Receiving"
3. **Wedding: two honorees** — need second honoree field, display "Erik & Marte's wedding"
4. **Planning page dropdown z-index** — three-dots dropdown clips behind next card
5. **Planning page edit modal** — missing product picker, contact chips, status selector

### Standardize company search component
**Status:** Not started
**Why:** Company search in `contact-detail.js` has its own implementation. Should follow the same pattern as contact search.

### Portal: edit/delete own posts
**Status:** Not started
**Why:** Portal guests can create posts but cannot edit or delete them after creation.

### Performance: relationship suggestions at scale
**Status:** Monitoring — currently 38ms for 450 contacts / 308 suggestions
**Why:** Suggestions are computed on-the-fly. Algorithm is O(n*r). If it exceeds 1s with more contacts, consider caching or pagination.
