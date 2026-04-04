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

### Data export (in-app backup)
**Status:** Not started
**Why:** Users need a way to export all their data for backup or migration. With growing media libraries, an offsite backup option is essential.

**Phase 2 — In-app export:**
- Settings card → Export page (`/admin/export`)
- Two modes:
  1. **Data only (JSON)** — instant download, all metadata (contacts, relationships, posts, companies, gifts, labels, life events, reminders, addresses, wishlists)
  2. **Full export (with media)** — background job, ZIP to temp dir, progress polling, download when ready
- `export_jobs` table for tracking background jobs (status, progress, file path, cleanup)
- Auto-cleanup temp files after 1 hour
- Backend: `routes/export.js` with endpoints: `GET /data` (instant JSON), `POST /full` (start job), `GET /:jobId/status`, `GET /:jobId/download`
- Uses `archiver` npm package for streaming ZIP (avoids memory issues with large media)
- New doc: `docs/export.md` listing every field per JSON file — **must be updated when schema changes**

**ZIP structure:**
```
whoareyou-export-YYYY-MM-DD/
├── manifest.json          (version, date, stats)
├── contacts.json
├── relationships.json
├── posts.json
├── companies.json
├── gifts.json
├── labels.json
├── life-events.json
├── reminders.json
├── addresses.json
├── wishlists.json
└── media/
    ├── contacts/{uuid}/   (profile photos)
    └── posts/{uuid}/      (post media)
```

**Phase 3 (future) — Cloud backup:**
- OneDrive/Google Drive connector
- Scheduled export (daily/weekly)
- Encrypted before upload

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
