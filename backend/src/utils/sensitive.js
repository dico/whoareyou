import { db } from '../db.js';

/**
 * Sensitive-content filtering helpers.
 *
 * "Sensitive" is an orthogonal axis to visibility (shared/family/private).
 * A post or contact marked sensitive is hidden from every session unless
 * that session has explicitly enabled sensitive mode (per-device, with
 * an expiry timestamp on the sessions row).
 *
 * Filtering is enforced server-side on every relevant query so the
 * actual response payload never contains sensitive content while the
 * mode is off.
 */

// ── Knex modifiers ──

/**
 * Modifier for queries against the `posts` table. Hides:
 *   1. posts where posts.is_sensitive = true
 *   2. posts whose contact_id points at a sensitive contact
 *   3. posts that are tagged with at least one sensitive contact
 *
 * Pass the request so the modifier can short-circuit when sensitive mode
 * is on. Use as: query.modify(filterSensitivePosts(req))
 */
export function filterSensitivePosts(req, postsTable = 'posts') {
  return (query) => {
    if (req?.showSensitive) return;
    const tenantId = req.user.tenantId;

    query.where(`${postsTable}.is_sensitive`, false);

    // Exclude posts whose subject contact is sensitive.
    query.where((builder) => {
      builder.whereNull(`${postsTable}.contact_id`)
        .orWhereNotIn(
          `${postsTable}.contact_id`,
          db('contacts').where({ tenant_id: tenantId, is_sensitive: true }).select('id'),
        );
    });

    // Exclude posts that are tagged with any sensitive contact.
    query.whereNotExists(
      db('post_contacts')
        .join('contacts', 'post_contacts.contact_id', 'contacts.id')
        .whereRaw(`post_contacts.post_id = ${postsTable}.id`)
        .where('contacts.tenant_id', tenantId)
        .where('contacts.is_sensitive', true),
    );
  };
}

/**
 * Modifier for queries against `contacts`. Hides rows where is_sensitive
 * is true unless the request has sensitive mode on.
 */
export function filterSensitiveContacts(req, contactsTable = 'contacts') {
  return (query) => {
    if (req?.showSensitive) return;
    query.where(`${contactsTable}.is_sensitive`, false);
  };
}

/**
 * Filter an in-memory array of contact-shaped objects. Useful for
 * post-processing JSON aggregates (e.g. relationships, tagged contacts)
 * where the SQL filter is awkward.
 */
export function stripSensitiveContacts(req, items) {
  if (req?.showSensitive) return items;
  return items.filter(c => !c?.is_sensitive);
}

/**
 * Same shape as the boolean parser used elsewhere — accepts 0/1, true/false,
 * 'true'/'false'. Used to normalize the is_sensitive field on incoming
 * create/update payloads.
 */
export function parseSensitiveFlag(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  return false;
}
