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
        'addresses.street', 'addresses.postal_code', 'addresses.city',
        'contacts.uuid', 'contacts.first_name', 'contacts.last_name',
        'contact_addresses.label'
      );

    res.json({ results });
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
