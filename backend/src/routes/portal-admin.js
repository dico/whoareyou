import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// All routes require admin role
router.use((req, res, next) => {
  if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
    return next(new AppError('Admin access required', 403));
  }
  next();
});

// ── Guests ──

// GET /api/portal-admin/guests
router.get('/guests', async (req, res, next) => {
  try {
    const guests = await db('portal_guests')
      .where({ tenant_id: req.tenantId })
      .select('uuid', 'display_name', 'email', 'is_active', 'last_login_at', 'created_at')
      .orderBy('display_name');

    // Get contact counts
    for (const g of guests) {
      const guestRow = await db('portal_guests').where({ uuid: g.uuid }).first();
      const contacts = await db('portal_guest_contacts')
        .where({ portal_guest_id: guestRow.id })
        .join('contacts', 'portal_guest_contacts.contact_id', 'contacts.id')
        .select('contacts.uuid', 'contacts.first_name', 'contacts.last_name');
      g.contacts = contacts;
    }

    res.json({ guests });
  } catch (err) { next(err); }
});

// POST /api/portal-admin/guests — create guest
router.post('/guests', async (req, res, next) => {
  try {
    const { display_name, email, password, contact_uuids } = req.body;
    if (!display_name?.trim()) throw new AppError('Display name required', 400);

    let passwordHash = null;
    if (email && password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    const uuid = uuidv4();
    const [guestId] = await db('portal_guests').insert({
      uuid,
      tenant_id: req.tenantId,
      display_name: display_name.trim(),
      email: email?.trim().toLowerCase() || null,
      password_hash: passwordHash,
      is_active: true,
      created_by: req.user.id,
    });

    // Set contacts
    if (contact_uuids?.length) {
      const contacts = await db('contacts')
        .whereIn('uuid', contact_uuids)
        .where({ tenant_id: req.tenantId })
        .whereNull('deleted_at')
        .select('id');
      if (contacts.length) {
        await db('portal_guest_contacts').insert(
          contacts.map(c => ({ portal_guest_id: guestId, contact_id: c.id }))
        );
      }
    }

    res.status(201).json({ uuid });
  } catch (err) { next(err); }
});

// PUT /api/portal-admin/guests/:uuid — update guest
router.put('/guests/:uuid', async (req, res, next) => {
  try {
    const guest = await db('portal_guests').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!guest) throw new AppError('Guest not found', 404);

    const updates = {};
    if (req.body.display_name !== undefined) updates.display_name = req.body.display_name.trim();
    if (req.body.email !== undefined) updates.email = req.body.email?.trim().toLowerCase() || null;
    if (req.body.password) updates.password_hash = await bcrypt.hash(req.body.password, 12);
    if (req.body.is_active !== undefined) updates.is_active = !!req.body.is_active;

    if (Object.keys(updates).length) {
      await db('portal_guests').where({ id: guest.id }).update(updates);
    }

    res.json({ message: 'Guest updated' });
  } catch (err) { next(err); }
});

// DELETE /api/portal-admin/guests/:uuid — delete guest
router.delete('/guests/:uuid', async (req, res, next) => {
  try {
    const guest = await db('portal_guests').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!guest) throw new AppError('Guest not found', 404);

    // Revoke sessions
    await db('portal_sessions').where({ portal_guest_id: guest.id }).update({ is_active: false });
    await db('portal_guests').where({ id: guest.id }).del();

    res.json({ message: 'Guest deleted' });
  } catch (err) { next(err); }
});

// PUT /api/portal-admin/guests/:uuid/contacts — set accessible contacts
router.put('/guests/:uuid/contacts', async (req, res, next) => {
  try {
    const guest = await db('portal_guests').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!guest) throw new AppError('Guest not found', 404);

    const { contact_uuids } = req.body;
    await db('portal_guest_contacts').where({ portal_guest_id: guest.id }).del();

    if (contact_uuids?.length) {
      const contacts = await db('contacts')
        .whereIn('uuid', contact_uuids)
        .where({ tenant_id: req.tenantId })
        .whereNull('deleted_at')
        .select('id');
      if (contacts.length) {
        await db('portal_guest_contacts').insert(
          contacts.map(c => ({ portal_guest_id: guest.id, contact_id: c.id }))
        );
      }
    }

    res.json({ message: 'Contacts updated' });
  } catch (err) { next(err); }
});

// ── Share links ──

// GET /api/portal-admin/links
router.get('/links', async (req, res, next) => {
  try {
    const links = await db('portal_share_links')
      .where({ 'portal_share_links.tenant_id': req.tenantId })
      .leftJoin('portal_guests', 'portal_share_links.portal_guest_id', 'portal_guests.id')
      .select(
        'portal_share_links.uuid', 'portal_share_links.label',
        'portal_share_links.is_active', 'portal_share_links.expires_at',
        'portal_share_links.last_used_at', 'portal_share_links.created_at',
        'portal_guests.display_name as guest_name'
      )
      .orderBy('portal_share_links.created_at', 'desc');

    res.json({ links });
  } catch (err) { next(err); }
});

// POST /api/portal-admin/links — create share link
router.post('/links', async (req, res, next) => {
  try {
    const { label, portal_guest_uuid, contact_uuids, expires_days } = req.body;

    const token = crypto.randomBytes(48).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const uuid = uuidv4();

    let portalGuestId = null;
    let contactIds = null;

    if (portal_guest_uuid) {
      const guest = await db('portal_guests').where({ uuid: portal_guest_uuid, tenant_id: req.tenantId }).first();
      if (guest) portalGuestId = guest.id;
    }

    if (!portalGuestId && contact_uuids?.length) {
      const contacts = await db('contacts')
        .whereIn('uuid', contact_uuids)
        .where({ tenant_id: req.tenantId })
        .whereNull('deleted_at')
        .select('id');
      contactIds = JSON.stringify(contacts.map(c => c.id));
    }

    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000) : null;

    await db('portal_share_links').insert({
      uuid, tenant_id: req.tenantId, token_hash: tokenHash,
      label: label?.trim() || null, portal_guest_id: portalGuestId,
      contact_ids: contactIds, created_by: req.user.id,
      expires_at: expiresAt, is_active: true,
    });

    // Return the actual token (only time it's visible)
    const appUrl = process.env.CORS_ORIGIN || `http://${process.env.VIRTUAL_HOST || 'localhost'}`;
    res.status(201).json({
      uuid,
      token,
      url: `${appUrl}/portal/s/${token}`,
    });
  } catch (err) { next(err); }
});

// DELETE /api/portal-admin/links/:uuid — revoke link
router.delete('/links/:uuid', async (req, res, next) => {
  try {
    const link = await db('portal_share_links').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!link) throw new AppError('Link not found', 404);
    await db('portal_share_links').where({ id: link.id }).update({ is_active: false });
    res.json({ message: 'Link revoked' });
  } catch (err) { next(err); }
});

// ── Sessions (monitoring) ──

// GET /api/portal-admin/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await db('portal_sessions')
      .join('portal_guests', 'portal_sessions.portal_guest_id', 'portal_guests.id')
      .where({ 'portal_guests.tenant_id': req.tenantId, 'portal_sessions.is_active': true })
      .where('portal_sessions.expires_at', '>', db.fn.now())
      .select(
        'portal_sessions.uuid', 'portal_sessions.ip_address',
        'portal_sessions.device_label', 'portal_sessions.last_activity_at',
        'portal_sessions.created_at',
        'portal_guests.display_name'
      )
      .orderBy('portal_sessions.last_activity_at', 'desc');

    res.json({ sessions });
  } catch (err) { next(err); }
});

// DELETE /api/portal-admin/sessions/:uuid — revoke session
router.delete('/sessions/:uuid', async (req, res, next) => {
  try {
    await db('portal_sessions').where({ uuid: req.params.uuid }).update({ is_active: false });
    res.json({ message: 'Session revoked' });
  } catch (err) { next(err); }
});

export default router;
