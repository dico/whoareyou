import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { userCircleIds } from '../utils/visibility.js';
import { logAuditFromReq } from '../utils/audit.js';

/**
 * Visibility circles — admin-defined subsets of tenant members used as a
 * post audience (visibility = 'circle'). Circles grant visibility only,
 * no other permissions. See utils/visibility.js for the read rule.
 */
const router = Router();

function audit(req, action, circleId, details) {
  logAuditFromReq(req, {
    tenantId: req.tenantId, userId: req.user.id,
    action, entityType: 'circle', entityId: circleId, details,
  });
}

function requireAdmin(req) {
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);
}

// Resolve user UUIDs to ids, keeping only members of this tenant.
async function resolveMemberIds(tenantId, userUuids) {
  if (!Array.isArray(userUuids) || !userUuids.length) return [];
  const rows = await db('users')
    .join('tenant_members', 'tenant_members.user_id', 'users.id')
    .where('tenant_members.tenant_id', tenantId)
    .whereIn('users.uuid', userUuids)
    .select('users.id');
  return [...new Set(rows.map(r => r.id))];
}

function validateName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new AppError('name is required', 400);
  if (trimmed.length > 100) throw new AppError('name is too long', 400);
  return trimmed;
}

async function loadCircle(req) {
  const circle = await db('visibility_circles')
    .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
    .first();
  if (!circle) throw new AppError('Circle not found', 404);
  return circle;
}

// GET /api/circles/mine — circles the current user belongs to (for the
// post visibility picker). Available to every member.
router.get('/mine', async (req, res, next) => {
  try {
    const circles = await db('visibility_circles')
      .whereIn('id', userCircleIds(req.user.id, req.tenantId))
      .select('uuid', 'name')
      .orderBy('name');
    res.json({ circles });
  } catch (err) { next(err); }
});

// GET /api/circles — all circles with members (admin)
router.get('/', async (req, res, next) => {
  try {
    requireAdmin(req);
    const circles = await db('visibility_circles')
      .where({ tenant_id: req.tenantId })
      .select('id', 'uuid', 'name')
      .orderBy('name');

    const ids = circles.map(c => c.id);
    const members = ids.length ? await db('visibility_circle_members')
      .join('users', 'visibility_circle_members.user_id', 'users.id')
      .whereIn('visibility_circle_members.circle_id', ids)
      .select('visibility_circle_members.circle_id', 'users.uuid', 'users.first_name', 'users.last_name') : [];

    const postCounts = ids.length ? await db('posts')
      .whereIn('circle_id', ids).where('visibility', 'circle').whereNull('deleted_at')
      .groupBy('circle_id').select('circle_id', db.raw('COUNT(*) as count')) : [];
    const countByCircle = new Map(postCounts.map(r => [r.circle_id, Number(r.count)]));

    res.json({
      circles: circles.map(c => ({
        uuid: c.uuid,
        name: c.name,
        post_count: countByCircle.get(c.id) || 0,
        members: members.filter(m => m.circle_id === c.id)
          .map(m => ({ uuid: m.uuid, first_name: m.first_name, last_name: m.last_name })),
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/circles — create { name, user_uuids } (admin)
router.post('/', async (req, res, next) => {
  try {
    requireAdmin(req);
    const name = validateName(req.body.name);
    const existing = await db('visibility_circles').where({ tenant_id: req.tenantId, name }).first();
    if (existing) throw new AppError('Circle already exists', 409);

    const memberIds = await resolveMemberIds(req.tenantId, req.body.user_uuids);
    const uuid = uuidv4();
    const id = await db.transaction(async (trx) => {
      const [newId] = await trx('visibility_circles').insert({ uuid, tenant_id: req.tenantId, name });
      if (memberIds.length) {
        await trx('visibility_circle_members').insert(memberIds.map(user_id => ({ circle_id: newId, user_id })));
      }
      return newId;
    });
    audit(req, 'circle.create', id, { uuid, name, members: memberIds.length });
    res.status(201).json({ circle: { uuid, name } });
  } catch (err) { next(err); }
});

// PUT /api/circles/:uuid — rename and/or replace members (admin)
router.put('/:uuid', async (req, res, next) => {
  try {
    requireAdmin(req);
    const circle = await loadCircle(req);

    await db.transaction(async (trx) => {
      if (req.body.name !== undefined) {
        const name = validateName(req.body.name);
        const clash = await trx('visibility_circles')
          .where({ tenant_id: req.tenantId, name }).whereNot('id', circle.id).first();
        if (clash) throw new AppError('Circle already exists', 409);
        await trx('visibility_circles').where({ id: circle.id }).update({ name, updated_at: trx.fn.now() });
      }
      if (req.body.user_uuids !== undefined) {
        const memberIds = await resolveMemberIds(req.tenantId, req.body.user_uuids);
        await trx('visibility_circle_members').where({ circle_id: circle.id }).del();
        if (memberIds.length) {
          await trx('visibility_circle_members').insert(memberIds.map(user_id => ({ circle_id: circle.id, user_id })));
        }
      }
    });

    // Removed members lose post notifications for this circle's posts
    if (req.body.user_uuids !== undefined) pruneCircleNotifications(circle.id, req.tenantId).catch(() => {});

    audit(req, 'circle.update', circle.id, { uuid: circle.uuid, changed: Object.keys(req.body) });
    res.json({ message: 'Circle updated' });
  } catch (err) { next(err); }
});

// DELETE /api/circles/:uuid — delete (admin). The circle's posts become
// private (creator-only) so they never widen to a broader audience.
router.delete('/:uuid', async (req, res, next) => {
  try {
    requireAdmin(req);
    const circle = await loadCircle(req);
    await pruneCircleNotifications(circle.id, req.tenantId, { all: true });
    await db.transaction(async (trx) => {
      await trx('posts').where({ circle_id: circle.id, tenant_id: req.tenantId })
        .update({ visibility: 'private', circle_id: null });
      await trx('visibility_circles').where({ id: circle.id }).del();
    });
    audit(req, 'circle.delete', circle.id, { uuid: circle.uuid, name: circle.name });
    res.json({ message: 'Circle deleted' });
  } catch (err) { next(err); }
});

// Remove family_post / family_comment notifications about a circle's posts
// from users who are no longer in the audience (or from everyone except the
// post creator when the circle is being deleted).
async function pruneCircleNotifications(circleId, tenantId, { all = false } = {}) {
  const posts = await db('posts').where({ circle_id: circleId, tenant_id: tenantId }).select('uuid', 'created_by');
  if (!posts.length) return;
  const memberIds = all ? [] : (await db('visibility_circle_members').where({ circle_id: circleId }).select('user_id')).map(r => r.user_id);
  for (const p of posts) {
    const keep = [...memberIds, p.created_by].filter(Boolean);
    await db('notifications')
      .where({ tenant_id: tenantId })
      .whereIn('type', ['family_post', 'family_comment'])
      .where('body', 'like', `${p.uuid}|%`)
      .modify((q) => { if (keep.length) q.whereNotIn('user_id', keep); })
      .del();
  }
}

export default router;
