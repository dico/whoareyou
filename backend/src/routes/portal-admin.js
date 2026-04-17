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
      .where({ 'portal_guests.tenant_id': req.tenantId })
      .leftJoin('contacts as lc', 'portal_guests.linked_contact_id', 'lc.id')
      .leftJoin('contact_photos as cp', function () {
        this.on('cp.contact_id', 'lc.id').andOn('cp.is_primary', db.raw('true'));
      })
      .select(
        'portal_guests.uuid', 'portal_guests.display_name', 'portal_guests.email',
        'portal_guests.is_active', 'portal_guests.last_login_at', 'portal_guests.created_at',
        'portal_guests.notifications_enabled',
        'lc.id as _linked_id', 'lc.uuid as linked_contact_uuid',
        'lc.first_name as contact_first_name', 'lc.last_name as contact_last_name',
        'cp.thumbnail_path as avatar'
      )
      .orderBy('portal_guests.display_name');

    // Batch-fetch email fields for all linked contacts
    const linkedIds = guests.map(g => g._linked_id).filter(Boolean);
    const emailsByContact = new Map();
    if (linkedIds.length) {
      const emailFields = await db('contact_fields')
        .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
        .whereIn('contact_fields.contact_id', linkedIds)
        .where('contact_field_types.name', 'email')
        .select('contact_fields.contact_id', 'contact_fields.value')
        .orderBy('contact_fields.sort_order');
      for (const f of emailFields) {
        if (!emailsByContact.has(f.contact_id)) emailsByContact.set(f.contact_id, []);
        emailsByContact.get(f.contact_id).push(f.value);
      }
    }

    // Get accessible contacts + session count for each guest
    for (const g of guests) {
      g.linked_contact_emails = emailsByContact.get(g._linked_id) || [];
      delete g._linked_id;
      const guestRow = await db('portal_guests').where({ uuid: g.uuid }).first();
      g.contacts = await db('portal_guest_contacts')
        .where({ portal_guest_id: guestRow.id })
        .join('contacts', 'portal_guest_contacts.contact_id', 'contacts.id')
        .select('contacts.uuid', 'contacts.first_name', 'contacts.last_name',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`));
      const [{ count }] = await db('portal_sessions')
        .where({ portal_guest_id: guestRow.id, is_active: true })
        .where('expires_at', '>', db.fn.now())
        .count('id as count');
      g.active_sessions = count;
    }

    res.json({ guests });
  } catch (err) { next(err); }
});

// POST /api/portal-admin/guests — create guest
router.post('/guests', async (req, res, next) => {
  try {
    const { display_name, email, password, contact_uuids, linked_contact_uuid } = req.body;
    if (!display_name?.trim()) throw new AppError('Display name required', 400);

    let passwordHash = null;
    if (email && password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    let linkedContactId = null;
    if (linked_contact_uuid) {
      const contact = await db('contacts').where({ uuid: linked_contact_uuid, tenant_id: req.tenantId }).first();
      if (contact) linkedContactId = contact.id;
    }

    const uuid = uuidv4();
    const [guestId] = await db('portal_guests').insert({
      uuid,
      tenant_id: req.tenantId,
      display_name: display_name.trim(),
      email: email?.trim().toLowerCase() || null,
      password_hash: passwordHash,
      linked_contact_id: linkedContactId,
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
    if (req.body.notifications_enabled !== undefined) updates.notifications_enabled = !!req.body.notifications_enabled;
    if (req.body.linked_contact_uuid !== undefined) {
      if (req.body.linked_contact_uuid) {
        const contact = await db('contacts').where({ uuid: req.body.linked_contact_uuid, tenant_id: req.tenantId }).first();
        updates.linked_contact_id = contact ? contact.id : null;
      } else {
        updates.linked_contact_id = null;
      }
    }

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
    let query = db('portal_share_links')
      .where({ 'portal_share_links.tenant_id': req.tenantId })
      .leftJoin('portal_guests', 'portal_share_links.portal_guest_id', 'portal_guests.id');

    // Filter by guest UUID if provided
    if (req.query.guest_uuid) {
      const guest = await db('portal_guests').where({ uuid: req.query.guest_uuid, tenant_id: req.tenantId }).first();
      if (guest) query = query.where('portal_share_links.portal_guest_id', guest.id);
    }

    const links = await query
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
