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

### Data export — Phase 3 (scheduled cloud backup)
**Status:** Not started — Phase 2 (in-app export) is done, documented in [export.md](export.md)
**Plan:** Backblaze B2 + node-cron, S3-compatible, AES-256 encryption. See [export.md](export.md).

---

## Low Priority

### Gift module UX improvements
**Status:** In progress
**Remaining:**
3. **Wedding: two honorees** — second honoree field (requires migration)
6. **Planning page redesign:**
   - Remove "From" field — family app, always from the household
   - Remove "Change event" / "Remove from event" from planning dropdown — planning is pre-purchase, not event-linked. Transfer to event when marked as purchased/given.
   - Edit modal: show product as card (image + info) instead of raw input, with "Change" button to search
   - Planning dropdown should use `glass-dropdown` class (currently transparent)
   - Visibility: hide gifts from recipients who are logged-in users (use `linked_contact_id` to check if recipient is current user)

### Standardize company search component
**Status:** Not started
**Why:** Company search in `contact-detail.js` has its own implementation. Should follow the same pattern as contact search.

### Performance: relationship suggestions at scale
**Status:** Monitoring — currently 38ms for 450 contacts / 308 suggestions
**Why:** Suggestions are computed on-the-fly. Algorithm is O(n*r). If it exceeds 1s with more contacts, consider caching or pagination.
