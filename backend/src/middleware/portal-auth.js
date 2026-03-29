import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { getSetting } from '../utils/settings.js';

/**
 * Portal authentication middleware.
 * Validates portal JWT tokens (type: 'portal') and loads contactIds.
 * Completely separate from the main authenticate middleware.
 * Sets req.portal = { guestId, tenantId, contactIds, displayName, sessionId }
 */
export async function portalAuthenticate(req, res, next) {
  try {
    // Check global portal toggle
    const globalEnabled = await getSetting('portal_enabled', 'true');
    if (globalEnabled !== 'true') {
      throw new AppError('Portal is disabled', 403);
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Portal authentication required', 401);
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      throw new AppError('Invalid or expired portal token', 401);
    }

    // CRITICAL: Only accept portal tokens — never main app tokens
    if (payload.type !== 'portal') {
      throw new AppError('Invalid token type', 401);
    }

    // Load guest
    const guest = await db('portal_guests')
      .where({ id: payload.portalGuestId, is_active: true })
      .first();

    if (!guest) {
      throw new AppError('Portal guest not found or inactive', 401);
    }

    // Check tenant portal toggle
    const tenant = await db('tenants').where({ id: guest.tenant_id }).first();
    if (!tenant?.portal_enabled) {
      throw new AppError('Portal is disabled for this household', 403);
    }

    // Verify session is active
    if (payload.sid) {
      const session = await db('portal_sessions')
        .where({ uuid: payload.sid, portal_guest_id: guest.id, is_active: true })
        .where('expires_at', '>', db.fn.now())
        .first();

      if (!session) {
        throw new AppError('Portal session expired', 401);
      }

      // Update last activity
      await db('portal_sessions').where({ id: session.id }).update({ last_activity_at: db.fn.now() });
    }

    // Load contactIds — ALWAYS from DB, never from token
    const contactRows = await db('portal_guest_contacts')
      .where({ portal_guest_id: guest.id })
      .join('contacts', 'portal_guest_contacts.contact_id', 'contacts.id')
      .whereNull('contacts.deleted_at')
      .select('contacts.id');

    const contactIds = contactRows.map(r => r.id);

    if (!contactIds.length) {
      throw new AppError('No contacts assigned to this portal guest', 403);
    }

    // Set portal context on request
    req.portal = {
      guestId: guest.id,
      guestUuid: guest.uuid,
      tenantId: guest.tenant_id,
      contactIds,
      displayName: guest.display_name,
      sessionId: payload.sid,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Portal authentication failed', 401));
  }
}
