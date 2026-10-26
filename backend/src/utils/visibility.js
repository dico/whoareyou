import { db } from '../db.js';
import { AppError } from './errors.js';
import { filterSensitivePosts } from './sensitive.js';

/**
 * Visibility rules for main-app users — the single place these live.
 *
 * Contacts: `shared` and `family` are visible to every tenant member,
 * `private` only to the creator.
 *
 * Posts: `shared` and `family` are visible to every tenant member,
 * `circle` to members of `posts.circle_id` (see visibility_circles),
 * `private` only to the creator. The creator always sees their own posts.
 *
 * Portal, signage and books do NOT use these helpers — they have their own
 * explicit allow-lists (`shared`, or `shared` + `family`) and must never
 * include `private` or `circle` posts.
 *
 * `req` only needs `req.user.id` and `req.tenantId`, so background jobs
 * can pass a viewer object: `{ user: { id: userId }, tenantId }`.
 */

export const POST_VISIBILITIES = ['shared', 'family', 'circle', 'private'];

/** Use as: query.modify(filterVisibleContacts(req)) */
export function filterVisibleContacts(req, contactsTable = 'contacts') {
  return (query) => {
    query.where(function () {
      this.whereIn(`${contactsTable}.visibility`, ['shared', 'family'])
        .orWhere(`${contactsTable}.created_by`, req.user.id);
    });
  };
}

/** Subquery: ids of the circles (in this tenant) the user is a member of. */
export function userCircleIds(userId, tenantId) {
  return db('visibility_circle_members')
    .join('visibility_circles', 'visibility_circle_members.circle_id', 'visibility_circles.id')
    .where('visibility_circle_members.user_id', userId)
    .where('visibility_circles.tenant_id', tenantId)
    .select('visibility_circles.id');
}

/** Use as: query.modify(filterVisiblePosts(req)) */
export function filterVisiblePosts(req, postsTable = 'posts') {
  return (query) => {
    query.where(function () {
      this.whereIn(`${postsTable}.visibility`, ['shared', 'family'])
        .orWhere(`${postsTable}.created_by`, req.user.id)
        .orWhere(function () {
          this.where(`${postsTable}.visibility`, 'circle')
            .whereIn(`${postsTable}.circle_id`, userCircleIds(req.user.id, req.tenantId));
        });
    });
  };
}

/**
 * Load a single post the user is allowed to see, or throw 404. Every
 * per-post endpoint (edit, delete, comments, reactions, media) goes through
 * this so a post the user can't see in the feed can't be touched by UUID.
 *
 * @param {object} opts - { sensitive: also apply the sensitive-mode filter }
 */
export async function loadVisiblePost(req, uuid, { sensitive = false } = {}) {
  const post = await db('posts')
    .where({ uuid, tenant_id: req.tenantId })
    .whereNull('deleted_at')
    .modify(filterVisiblePosts(req))
    .modify((q) => { if (sensitive) q.modify(filterSensitivePosts(req)); })
    .first();
  if (!post) throw new AppError('Post not found', 404);
  return post;
}

/**
 * Validate an incoming visibility + circle choice. Returns the columns to
 * store. A circle must belong to the tenant and the user must be a member
 * (you can't post into a circle you can't see).
 *
 * @returns {Promise<{ visibility: string, circle_id: number|null }>}
 */
export async function resolvePostVisibility(req, visibility, circleUuid) {
  if (visibility !== 'circle') {
    return {
      visibility: ['shared', 'family', 'private'].includes(visibility) ? visibility : 'shared',
      circle_id: null,
    };
  }
  if (!circleUuid) throw new AppError('circle_uuid is required for circle visibility', 400);
  const circle = await db('visibility_circles')
    .where({ uuid: circleUuid, tenant_id: req.tenantId })
    .whereIn('id', userCircleIds(req.user.id, req.tenantId))
    .first();
  if (!circle) throw new AppError('Circle not found', 400);
  return { visibility: 'circle', circle_id: circle.id };
}

/**
 * User ids (active tenant members) who can see a post — used to scope
 * family_post / family_comment notifications. Excludes nobody else; the
 * caller removes the actor.
 */
export async function postAudienceUserIds(post, tenantId) {
  if (post.visibility === 'private') return post.created_by ? [post.created_by] : [];

  let query = db('users')
    .join('tenant_members', function () {
      this.on('users.id', 'tenant_members.user_id')
        .andOn('tenant_members.tenant_id', '=', db.raw('?', [tenantId]));
    })
    .where('users.is_active', true);

  if (post.visibility === 'circle') {
    query = query.where(function () {
      this.whereIn('users.id',
        db('visibility_circle_members').where('circle_id', post.circle_id || 0).select('user_id'));
      if (post.created_by) this.orWhere('users.id', post.created_by);
    });
  }

  return (await query.select('users.id')).map(u => u.id);
}
