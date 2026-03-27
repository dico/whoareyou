import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { geocodeAddress } from '../services/geocoding.js';

const router = Router();

// GET /api/addresses/map — all addresses with coordinates for map view
router.get('/map', async (req, res, next) => {
  try {
    const addresses = await db('addresses')
      .join('contact_addresses', 'addresses.id', 'contact_addresses.address_id')
      .join('contacts', 'contact_addresses.contact_id', 'contacts.id')
      .where('addresses.tenant_id', req.tenantId)
      .whereNotNull('addresses.latitude')
      .whereNotNull('addresses.longitude')
      .whereNull('contacts.deleted_at')
      .whereNull('contact_addresses.moved_out_at')
      .select(
        'addresses.id as address_id',
        'addresses.street', 'addresses.postal_code', 'addresses.city',
        'addresses.latitude', 'addresses.longitude',
        'contacts.uuid as contact_uuid',
        'contacts.first_name', 'contacts.last_name',
        'contact_addresses.label'
      )
      .orderBy('addresses.street');

    // Group contacts by address
    const addressMap = new Map();
    for (const row of addresses) {
      const key = row.address_id;
      if (!addressMap.has(key)) {
        addressMap.set(key, {
          address_id: row.address_id,
          street: row.street,
          postal_code: row.postal_code,
          city: row.city,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          contacts: [],
        });
      }
      addressMap.get(key).contacts.push({
        uuid: row.contact_uuid,
        first_name: row.first_name,
        last_name: row.last_name,
        label: row.label,
      });
    }

    res.json({ addresses: Array.from(addressMap.values()) });
  } catch (err) {
    next(err);
  }
});

// GET /api/addresses/search — find who lives at/near an address
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) throw new AppError('Search query required');

    const results = await db('addresses')
      .join('contact_addresses', 'addresses.id', 'contact_addresses.address_id')
      .join('contacts', 'contact_addresses.contact_id', 'contacts.id')
      .where('addresses.tenant_id', req.tenantId)
      .whereNull('contacts.deleted_at')
      .whereNull('contact_addresses.moved_out_at')
      .where(function () {
        this.where('addresses.street', 'like', `%${q}%`)
          .orWhere('addresses.city', 'like', `%${q}%`)
          .orWhere('addresses.postal_code', 'like', `%${q}%`);
      })
      .select(
        'addresses.id as address_id',
        'addresses.street', 'addresses.postal_code', 'addresses.city',
        'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
        'contact_addresses.label'
      );

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// GET /api/addresses/duplicates — find duplicate addresses
router.get('/duplicates', async (req, res, next) => {
  try {
    const allAddresses = await db('addresses')
      .where({ tenant_id: req.tenantId })
      .select('id', 'street', 'street2', 'postal_code', 'city', 'country', 'latitude', 'longitude');

    const groups = new Map();
    for (const addr of allAddresses) {
      const key = `${addr.street.trim().toLowerCase()}|${(addr.postal_code || '').trim()}|${(addr.city || '').trim().toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(addr);
    }

    const duplicates = [];
    for (const [, addrs] of groups) {
      if (addrs.length < 2) continue;
      const addressIds = addrs.map(a => a.id);
      const contacts = await db('contact_addresses')
        .join('contacts', 'contact_addresses.contact_id', 'contacts.id')
        .whereIn('contact_addresses.address_id', addressIds)
        .where('contact_addresses.tenant_id', req.tenantId)
        .whereNull('contacts.deleted_at')
        .select('contact_addresses.address_id', 'contacts.uuid', 'contacts.first_name', 'contacts.last_name', 'contact_addresses.moved_out_at');

      const contactsByAddr = {};
      for (const c of contacts) {
        if (!contactsByAddr[c.address_id]) contactsByAddr[c.address_id] = [];
        contactsByAddr[c.address_id].push(c);
      }

      duplicates.push({
        street: addrs[0].street,
        postal_code: addrs[0].postal_code,
        city: addrs[0].city,
        addresses: addrs.map(a => ({
          id: a.id,
          has_coords: !!(a.latitude && a.longitude),
          contacts: contactsByAddr[a.id] || [],
        })),
      });
    }

    res.json({ duplicates, total: duplicates.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/addresses/merge — merge duplicate addresses into one
router.post('/merge', async (req, res, next) => {
  try {
    const { keep_id, merge_ids } = req.body;
    if (!keep_id || !merge_ids?.length) {
      throw new AppError('keep_id and merge_ids are required');
    }

    const keepAddr = await db('addresses').where({ id: keep_id, tenant_id: req.tenantId }).first();
    if (!keepAddr) throw new AppError('Address to keep not found', 404);

    await db.transaction(async (trx) => {
      for (const mergeId of merge_ids) {
        const links = await trx('contact_addresses').where({ address_id: mergeId, tenant_id: req.tenantId });
        for (const link of links) {
          const existing = await trx('contact_addresses').where({ contact_id: link.contact_id, address_id: keep_id }).first();
          if (existing) {
            await trx('contact_addresses').where({ id: link.id }).del();
          } else {
            await trx('contact_addresses').where({ id: link.id }).update({ address_id: keep_id });
          }
        }
        await trx('addresses').where({ id: mergeId, tenant_id: req.tenantId }).del();
      }
    });

    res.json({ message: `Merged ${merge_ids.length} addresses into ${keep_id}` });
  } catch (err) {
    next(err);
  }
});

// GET /api/addresses/:id — address detail with current and previous residents
router.get('/:id', async (req, res, next) => {
  try {
    const address = await db('addresses')
      .where({ id: req.params.id, tenant_id: req.tenantId })
      .first();
    if (!address) throw new AppError('Address not found', 404);

    const [currentResidents, previousResidents] = await Promise.all([
      db('contact_addresses')
        .join('contacts', 'contact_addresses.contact_id', 'contacts.id')
        .where({ 'contact_addresses.address_id': address.id, 'contact_addresses.tenant_id': req.tenantId })
        .whereNull('contacts.deleted_at')
        .whereNull('contact_addresses.moved_out_at')
        .select(
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
          'contact_addresses.label', 'contact_addresses.moved_in_at',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        .orderBy('contacts.first_name'),

      db('contact_addresses')
        .join('contacts', 'contact_addresses.contact_id', 'contacts.id')
        .where({ 'contact_addresses.address_id': address.id, 'contact_addresses.tenant_id': req.tenantId })
        .whereNull('contacts.deleted_at')
        .whereNotNull('contact_addresses.moved_out_at')
        .select(
          'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
          'contact_addresses.label', 'contact_addresses.moved_in_at', 'contact_addresses.moved_out_at',
          db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`)
        )
        .orderBy('contact_addresses.moved_out_at', 'desc'),
    ]);

    res.json({
      address: {
        id: address.id,
        street: address.street,
        street2: address.street2,
        postal_code: address.postal_code,
        city: address.city,
        country: address.country,
        latitude: address.latitude,
        longitude: address.longitude,
      },
      currentResidents,
      previousResidents,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/addresses — create address and link to contact
router.post('/', async (req, res, next) => {
  try {
    const { contact_uuid, street, street2, postal_code, city, country, label } = req.body;
    if (!contact_uuid || !street) {
      throw new AppError('contact_uuid and street are required');
    }

    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    // Geocode in background
    let latitude = null;
    let longitude = null;
    try {
      const coords = await geocodeAddress(street, postal_code, city, country);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    } catch {}

    const [addressId] = await db('addresses').insert({
      tenant_id: req.tenantId,
      street,
      street2: street2 || null,
      postal_code: postal_code || null,
      city: city || null,
      country: country || null,
      latitude,
      longitude,
      geocoded_at: latitude ? db.fn.now() : null,
    });

    await db('contact_addresses').insert({
      contact_id: contact.id,
      address_id: addressId,
      tenant_id: req.tenantId,
      label: label || 'Home',
      is_primary: true,
    });

    res.status(201).json({
      address: { id: addressId, street, city, postal_code, latitude, longitude },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/addresses/:addressId — update address fields
router.put('/:addressId', async (req, res, next) => {
  try {
    const address = await db('addresses')
      .where({ id: req.params.addressId, tenant_id: req.tenantId })
      .first();
    if (!address) throw new AppError('Address not found', 404);

    const updates = {};
    for (const field of ['street', 'street2', 'postal_code', 'city', 'country']) {
      if (req.body[field] !== undefined) updates[field] = req.body[field] || null;
    }

    if (Object.keys(updates).length) {
      await db('addresses').where({ id: address.id }).update(updates);

      // Re-geocode if street/city/postal changed
      if (updates.street || updates.city || updates.postal_code) {
        try {
          const a = { ...address, ...updates };
          const coords = await geocodeAddress(a.street, a.postal_code, a.city, a.country);
          if (coords) {
            await db('addresses').where({ id: address.id }).update({
              latitude: coords.latitude,
              longitude: coords.longitude,
              geocoded_at: db.fn.now(),
            });
          }
        } catch {}
      }
    }

    // Update label on contact_addresses if provided
    if (req.body.label !== undefined && req.body.contact_uuid) {
      const contact = await db('contacts')
        .where({ uuid: req.body.contact_uuid, tenant_id: req.tenantId })
        .first();
      if (contact) {
        await db('contact_addresses')
          .where({ contact_id: contact.id, address_id: address.id, tenant_id: req.tenantId })
          .update({ label: req.body.label });
      }
    }

    res.json({ message: 'Address updated' });
  } catch (err) {
    next(err);
  }
});

// POST /api/addresses/link — link contact to existing address (same address as someone)
router.post('/link', async (req, res, next) => {
  try {
    const { contact_uuid, address_id, label } = req.body;
    if (!contact_uuid || !address_id) {
      throw new AppError('contact_uuid and address_id are required');
    }

    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    const address = await db('addresses')
      .where({ id: address_id, tenant_id: req.tenantId })
      .first();
    if (!address) throw new AppError('Address not found', 404);

    // Check if already linked
    const existing = await db('contact_addresses')
      .where({ contact_id: contact.id, address_id })
      .whereNull('moved_out_at')
      .first();
    if (existing) throw new AppError('Contact already linked to this address', 409);

    await db('contact_addresses').insert({
      contact_id: contact.id,
      address_id,
      tenant_id: req.tenantId,
      label: label || 'Home',
      is_primary: true,
    });

    res.status(201).json({
      address: {
        street: address.street,
        city: address.city,
        postal_code: address.postal_code,
        latitude: address.latitude,
        longitude: address.longitude,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/addresses/contact/:contactUuid/:addressId/move-out — mark as moved out
router.patch('/contact/:contactUuid/:addressId/move-out', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.contactUuid, tenant_id: req.tenantId })
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    const updated = await db('contact_addresses')
      .where({ contact_id: contact.id, address_id: req.params.addressId, tenant_id: req.tenantId })
      .whereNull('moved_out_at')
      .update({ moved_out_at: req.body.moved_out_at || db.fn.now() });

    if (!updated) throw new AppError('Link not found or already moved out', 404);
    res.json({ message: 'Marked as moved out' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/addresses/contact/:contactUuid/:addressId/move-in — undo move-out
router.patch('/contact/:contactUuid/:addressId/move-in', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.contactUuid, tenant_id: req.tenantId })
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    const updated = await db('contact_addresses')
      .where({ contact_id: contact.id, address_id: req.params.addressId, tenant_id: req.tenantId })
      .whereNotNull('moved_out_at')
      .update({ moved_out_at: null });

    if (!updated) throw new AppError('Link not found or not moved out', 404);
    res.json({ message: 'Moved back in' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/addresses/contact/:contactUuid/:addressId — unlink contact from address
router.delete('/contact/:contactUuid/:addressId', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.contactUuid, tenant_id: req.tenantId })
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    const deleted = await db('contact_addresses')
      .where({ contact_id: contact.id, address_id: req.params.addressId, tenant_id: req.tenantId })
      .del();

    if (!deleted) throw new AppError('Link not found', 404);
    res.json({ message: 'Address unlinked' });
  } catch (err) {
    next(err);
  }
});

export default router;
