import { db } from '../db.js';
import { AppError } from './errors.js';

/**
 * Per-user notification preferences — three-layer filter.
 *
 *   override → global type rule → (optional scope like favorites)
 *
 * A per-person override (`user_notification_overrides.mode`) wins. Without an
 * override, we consult the global rule (`user_notification_prefs.scope`) for
 * the type. Default is "notify for everything" so existing behavior is
 * preserved for users who have never visited the settings page.
 */

// Notification types and their valid scope values + defaults.
// The UI validates against these; the helper also rejects unknown combos.
export const NOTIFICATION_TYPES = {
  // Default to `favorites` for birthday/anniversary so new users don't get
  // pinged about every colleague, neighbor and school contact the family
  // has added over the years. `is_favorite` is the curated subset.
  birthday:       { scopes: ['none', 'favorites', 'all'],            defaultScope: 'favorites' },
  anniversary:    { scopes: ['none', 'favorites', 'all'],            defaultScope: 'favorites' },
  reminder:       { scopes: ['none', 'all'],                          defaultScope: 'all' },
  memory:         { scopes: ['none', 'all'],                          defaultScope: 'all' },
  family_post:    { scopes: ['none', 'family', 'guests', 'both'],     defaultScope: 'both' },
  family_comment: { scopes: ['none', 'my_posts', 'all_posts'],        defaultScope: 'all_posts' },
};

export function isValidScopeForType(type, scope) {
  const def = NOTIFICATION_TYPES[type];
  return !!def && def.scopes.includes(scope);
}

/**
 * Return the per-type rule for a user, materializing the default if the row
 * does not yet exist. Does not insert — callers that need the defaults
 * persisted should call `seedDefaultsForUser`.
 */
export async function getPref(userId, tenantId, type) {
  const row = await db('user_notification_prefs')
    .where({ user_id: userId, tenant_id: tenantId, type })
    .first();
  if (row) return row;
  const def = NOTIFICATION_TYPES[type];
  return {
    user_id: userId,
    tenant_id: tenantId,
    type,
    scope: def?.defaultScope || 'all',
    deliver_app: true,
    deliver_email: false,
    deliver_push: true,
  };
}

export async function listPrefs(userId, tenantId) {
  const rows = await db('user_notification_prefs')
    .where({ user_id: userId, tenant_id: tenantId });
  const byType = new Map(rows.map((r) => [r.type, r]));
  return Object.entries(NOTIFICATION_TYPES).map(([type, def]) => {
    const row = byType.get(type);
    return row || {
      user_id: userId,
      tenant_id: tenantId,
      type,
      scope: def.defaultScope,
      deliver_app: true,
      deliver_email: false,
      deliver_push: true,
    };
  });
}

/**
 * Upsert a single preference. Fails if `scope` is invalid for the given type.
 */
export async function upsertPref(userId, tenantId, type, { scope, deliver_app, deliver_email, deliver_push }) {
  if (!NOTIFICATION_TYPES[type]) throw new AppError(`Unknown notification type: ${type}`, 400);
  if (scope !== undefined && !isValidScopeForType(type, scope)) {
    throw new AppError(`Invalid scope '${scope}' for type '${type}'`, 400);
  }
  const existing = await db('user_notification_prefs')
    .where({ user_id: userId, tenant_id: tenantId, type })
    .first();
  if (existing) {
    const patch = { updated_at: db.fn.now() };
    if (scope !== undefined) patch.scope = scope;
    if (deliver_app !== undefined) patch.deliver_app = !!deliver_app;
    if (deliver_email !== undefined) patch.deliver_email = !!deliver_email;
    if (deliver_push !== undefined) patch.deliver_push = !!deliver_push;
    await db('user_notification_prefs').where({ id: existing.id }).update(patch);
    return db('user_notification_prefs').where({ id: existing.id }).first();
  }
  const def = NOTIFICATION_TYPES[type];
  const row = {
    user_id: userId,
    tenant_id: tenantId,
    type,
    scope: scope ?? def.defaultScope,
    deliver_app: deliver_app ?? true,
    deliver_email: deliver_email ?? false,
    deliver_push: deliver_push ?? true,
  };
  const [id] = await db('user_notification_prefs').insert(row);
  return { id, ...row };
}

export async function listOverrides(userId, tenantId) {
  return db('user_notification_overrides')
    .join('contacts', 'user_notification_overrides.contact_id', 'contacts.id')
    .where({
      'user_notification_overrides.user_id': userId,
      'user_notification_overrides.tenant_id': tenantId,
    })
    .select(
      'user_notification_overrides.id',
      'user_notification_overrides.type',
      'user_notification_overrides.mode',
      'contacts.id as contact_id',
      'contacts.uuid as contact_uuid',
      'contacts.first_name',
      'contacts.last_name',
      db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`),
    )
    .orderBy('contacts.first_name');
}

/**
 * Decide whether a notification of `type` about `contactId` should fire for
 * `userId` in `tenantId`. Returns a shape that lets the caller know which
 * delivery channels are on.
 *
 *   { fire: true,  deliver_app, deliver_email, deliver_push }
 *   { fire: false, reason: 'override_never' | 'scope_none' | 'not_favorite' | ... }
 */
export async function shouldNotify(userId, tenantId, type, { contactId = null, authorUserId = null, authorIsGuest = false, postAuthorUserId = null } = {}) {
  // 1. Per-person override — only applies if the notification is about a specific contact.
  if (contactId) {
    const override = await db('user_notification_overrides')
      .where({ user_id: userId, tenant_id: tenantId, contact_id: contactId, type })
      .first();
    if (override?.mode === 'never') return { fire: false, reason: 'override_never' };
    if (override?.mode === 'always') {
      const pref = await getPref(userId, tenantId, type);
      return { fire: true, deliver_app: !!pref.deliver_app, deliver_email: !!pref.deliver_email, deliver_push: !!pref.deliver_push };
    }
  }

  // 2. Global rule.
  const pref = await getPref(userId, tenantId, type);
  if (pref.scope === 'none') return { fire: false, reason: 'scope_none' };

  // 3. Scope-specific filters.
  if (pref.scope === 'favorites') {
    if (!contactId) return { fire: false, reason: 'no_contact_for_favorites' };
    const contact = await db('contacts').where({ id: contactId, tenant_id: tenantId }).first();
    if (!contact?.is_favorite) return { fire: false, reason: 'not_favorite' };
  }
  if (pref.scope === 'family' && authorIsGuest) return { fire: false, reason: 'scope_family_only' };
  if (pref.scope === 'guests' && !authorIsGuest) return { fire: false, reason: 'scope_guests_only' };
  if (pref.scope === 'my_posts' && postAuthorUserId && postAuthorUserId !== userId) {
    return { fire: false, reason: 'scope_my_posts_only' };
  }

  // Never notify the user about their own actions.
  if (authorUserId && authorUserId === userId) return { fire: false, reason: 'self_action' };

  return { fire: true, deliver_app: !!pref.deliver_app, deliver_email: !!pref.deliver_email, deliver_push: !!pref.deliver_push };
}

/**
 * Insert a notification row after checking prefs. Silent no-op if the filter
 * rejects the firing or if `deliver_app` is off. Returns the inserted row id
 * or null.
 *
 * Also fires a web push (fire-and-forget) if `deliver_push` is on for this
 * user/type. Push goes out immediately — no throttling — because it's the
 * "I want to know right now" channel. Email still batches via the hourly
 * digest.
 */
export async function tryCreateNotification(userId, tenantId, type, row, filterArgs = {}) {
  const decision = await shouldNotify(userId, tenantId, type, filterArgs);
  if (!decision.fire || !decision.deliver_app) return null;
  const [id] = await db('notifications').insert({
    user_id: userId,
    tenant_id: tenantId,
    type,
    ...row,
    is_read: false,
  });
  if (decision.deliver_push) {
    // Lazy import to avoid circular service dependencies.
    import('../services/notification-push.js').then(({ sendPushToUser, payloadFromNotification }) => {
      sendPushToUser(userId, tenantId, payloadFromNotification({ id, type, ...row })).catch(() => {});
    }).catch(() => {});
  }
  return id;
}
