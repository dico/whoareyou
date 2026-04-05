import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// ── Helper: visibility filter for gift_orders ──
function applyVisibilityFilter(query, userId, userLinkedContactId) {
  query.where(function () {
    this.where(function () {
      this.where('gift_orders.visibility', 'private')
        .where('gift_orders.created_by', userId);
    }).orWhere(function () {
      this.whereIn('gift_orders.visibility', ['shared', 'family']);
      if (userLinkedContactId) {
        this.whereNotExists(function () {
          this.select(db.raw(1))
            .from('gift_order_participants as gop')
            .whereRaw('gop.order_id = gift_orders.id')
            .where('gop.role', 'recipient')
            .where('gop.contact_id', userLinkedContactId);
        });
      }
    });
  });
}

import { getLinkedContactId } from '../utils/tenant.js';
// Helper: get current user's linked contact id (per-tenant)
async function getUserLinkedContactId(userId, tenantId) {
  return getLinkedContactId(userId, tenantId);
}

// ════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════

// GET /api/gifts/products — search/list products
router.get('/products', async (req, res, next) => {
  try {
    const { search, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 200);

    let query = db('gift_products')
      .where({ tenant_id: req.tenantId })
      .select('uuid', 'name', 'description', 'url', 'image_url', 'default_price', 'currency_code', 'created_at')
      .orderBy('name')
      .limit(limit);

    if (search) {
      query = query.where('name', 'like', `%${search}%`);
    }

    const products = await query;
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

// GET /api/gifts/products/scrape — extract metadata from URL (MUST be before :uuid)
router.get('/products/scrape', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) throw new AppError('URL is required', 400);

    // SSRF protection: only allow public http(s) URLs
    let urlObj;
    try { urlObj = new URL(url); } catch { throw new AppError('Invalid URL', 400); }
    if (!['http:', 'https:'].includes(urlObj.protocol)) throw new AppError('Invalid URL scheme', 400);
    const hostname = urlObj.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '169.254.169.254', 'metadata.google.internal'];
    if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')
      || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) {
      throw new AppError('URL not allowed', 400);
    }

    const result = { url, title: '', image_url: '', price: null };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
      });
      clearTimeout(timeout);

      const html = await response.text();

      // Extract og:title or <title>
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1];
      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      result.title = ogTitle || titleTag || '';
      result.title = result.title.replace(/\s+/g, ' ').trim();

      // Detect bot-blocked pages and discard results
      const blockedPatterns = /security checkpoint|access denied|captcha|just a moment|cloudflare|verify you are human/i;
      if (blockedPatterns.test(result.title) || blockedPatterns.test(html.slice(0, 2000))) {
        result.title = '';
        result.blocked = true;
      }

      // Extract og:image
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
      // Filter out logos/favicons
      if (ogImage && !/apple-touch-icon|favicon|logo/i.test(ogImage)) {
        result.image_url = ogImage;
      }

      // Extract price
      const priceMatch = html.match(/<meta[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:product:price:amount|og:price:amount)["']/i)?.[1];
      if (priceMatch) result.price = parseFloat(priceMatch) || null;

      // Extract description
      const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1]
        || html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1];
      if (ogDesc) result.description = ogDesc.replace(/\s+/g, ' ').trim();
    } catch {
      // Scrape failed silently — return what we have
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/gifts/products/:uuid — product detail with history
router.get('/products/:uuid', async (req, res, next) => {
  try {
    const product = await db('gift_products')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!product) throw new AppError('Product not found', 404);

    // Gift orders using this product
    const linkedContactId = await getUserLinkedContactId(req.user.id, req.tenantId);
    let ordersQuery = db('gift_orders')
      .where({ 'gift_orders.product_id': product.id, 'gift_orders.tenant_id': req.tenantId })
      .leftJoin('gift_events', 'gift_orders.event_id', 'gift_events.id')
      .select(
        'gift_orders.uuid', 'gift_orders.title', 'gift_orders.status',
        'gift_orders.order_type', 'gift_orders.price', 'gift_orders.created_at',
        'gift_events.name as event_name'
      )
      .orderBy('gift_orders.created_at', 'desc');

    applyVisibilityFilter(ordersQuery, req.user.id, linkedContactId);
    const orders = await ordersQuery;

    // Fetch participants
    if (orders.length) {
      const orderIds = await db('gift_orders').whereIn('uuid', orders.map(o => o.uuid)).select('id', 'uuid');
      const idMap = Object.fromEntries(orderIds.map(o => [o.id, o.uuid]));
      const participants = await db('gift_order_participants')
        .whereIn('order_id', orderIds.map(o => o.id))
        .join('contacts', 'gift_order_participants.contact_id', 'contacts.id')
        .leftJoin('contact_photos', function () {
          this.on('contact_photos.contact_id', 'contacts.id').andOn('contact_photos.is_primary', db.raw('true'));
        })
        .select('gift_order_participants.order_id', 'gift_order_participants.role',
          'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name',
          'contact_photos.thumbnail_path as avatar');

      const partMap = {};
      for (const p of participants) {
        const orderUuid = idMap[p.order_id];
        if (!partMap[orderUuid]) partMap[orderUuid] = { givers: [], recipients: [] };
        const entry = { uuid: p.contact_uuid, first_name: p.first_name, last_name: p.last_name, avatar: p.avatar };
        if (p.role === 'giver') partMap[orderUuid].givers.push(entry);
        else partMap[orderUuid].recipients.push(entry);
      }
      orders.forEach(o => { o.givers = partMap[o.uuid]?.givers || []; o.recipients = partMap[o.uuid]?.recipients || []; });
    }

    // Wishlist items using this product
    const wishlistItems = await db('gift_wishlist_items')
      .where({ 'gift_wishlist_items.product_id': product.id })
      .join('gift_wishlists', 'gift_wishlist_items.wishlist_id', 'gift_wishlists.id')
      .where({ 'gift_wishlists.tenant_id': req.tenantId })
      .join('contacts', 'gift_wishlists.contact_id', 'contacts.id')
      .select(
        'gift_wishlist_items.title', 'gift_wishlist_items.notes', 'gift_wishlist_items.is_fulfilled',
        'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name'
      );

    res.json({
      product: {
        uuid: product.uuid, name: product.name, description: product.description,
        url: product.url, image_url: product.image_url,
        default_price: product.default_price, currency_code: product.currency_code,
      },
      links: await db('gift_product_links').where({ product_id: product.id }).select('id', 'store_name', 'url', 'price'),
      orders,
      wishlist_items: wishlistItems,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/gifts/products — create product
router.post('/products', async (req, res, next) => {
  try {
    const { name, description, url, image_url, default_price, currency_code } = req.body;
    if (!name?.trim()) throw new AppError('Product name is required', 400);

    const uuid = uuidv4();
    await db('gift_products').insert({
      uuid,
      tenant_id: req.tenantId,
      name: name.trim(),
      description: description || null,
      url: url || null,
      image_url: image_url || null,
      default_price: default_price || null,
      currency_code: currency_code || 'NOK',
      created_by: req.user.id,
    });

    const product = await db('gift_products').where({ uuid }).first();
    res.status(201).json({ product: { uuid: product.uuid, name: product.name, default_price: product.default_price, url: product.url, image_url: product.image_url } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/gifts/products/:uuid — update product
router.put('/products/:uuid', async (req, res, next) => {
  try {
    const product = await db('gift_products').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!product) throw new AppError('Product not found', 404);

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.description !== undefined) updates.description = req.body.description || null;
    if (req.body.url !== undefined) updates.url = req.body.url || null;
    if (req.body.image_url !== undefined) updates.image_url = req.body.image_url || null;
    if (req.body.default_price !== undefined) updates.default_price = req.body.default_price || null;
    if (req.body.currency_code !== undefined) updates.currency_code = req.body.currency_code;

    if (Object.keys(updates).length) {
      await db('gift_products').where({ id: product.id }).update(updates);
    }

    res.json({ message: 'Product updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/gifts/products/:uuid — delete product
router.delete('/products/:uuid', async (req, res, next) => {
  try {
    const deleted = await db('gift_products').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).del();
    if (!deleted) throw new AppError('Product not found', 404);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/gifts/products/:uuid/image — upload product image (drag-and-drop)
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { processImage } from '../services/image.js';
import { config } from '../config/index.js';

const productUpload = multer({
  dest: path.join(config.uploads.dir, 'temp'),
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) cb(null, true);
    else cb(new AppError('Only images allowed', 400));
  },
});

router.post('/products/:uuid/image', productUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const product = await db('gift_products').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!product) throw new AppError('Product not found', 404);

    const subDir = `products/${product.uuid}`;
    const filename = `product_${Date.now()}`;
    const { filePath } = await processImage(req.file.path, subDir, filename);

    await db('gift_products').where({ id: product.id }).update({
      image_url: `/uploads/${subDir}/${path.basename(filePath)}`,
    });

    res.json({ image_url: `/uploads/${subDir}/${path.basename(filePath)}` });
  } catch (err) {
    next(err);
  } finally {
    if (req.file) try { await fs.unlink(req.file.path); } catch { /* ignore */ }
  }
});

// GET /api/gifts/products/:uuid/links
router.get('/products/:uuid/links', async (req, res, next) => {
  try {
    const product = await db('gift_products').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!product) throw new AppError('Product not found', 404);
    const links = await db('gift_product_links').where({ product_id: product.id }).select('id', 'store_name', 'url', 'price');
    res.json({ links });
  } catch (err) { next(err); }
});

// POST /api/gifts/products/:uuid/links
router.post('/products/:uuid/links', async (req, res, next) => {
  try {
    const product = await db('gift_products').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!product) throw new AppError('Product not found', 404);
    const { store_name, url, price } = req.body;
    if (!url?.trim()) throw new AppError('URL is required', 400);
    const [id] = await db('gift_product_links').insert({
      product_id: product.id, store_name: store_name?.trim() || null,
      url: url.trim(), price: price || null,
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// DELETE /api/gifts/products/links/:id
router.delete('/products/links/:id', async (req, res, next) => {
  try {
    await db('gift_product_links').where({ id: req.params.id }).del();
    res.json({ message: 'Link deleted' });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// EVENTS
// ════════════════════════════════════════════

// GET /api/gifts/events — list events
router.get('/events', async (req, res, next) => {
  try {
    const { year, type } = req.query;

    let query = db('gift_events')
      .where({ 'gift_events.tenant_id': req.tenantId })
      .leftJoin('contacts', 'gift_events.honoree_contact_id', 'contacts.id')
      .select(
        'gift_events.uuid', 'gift_events.name', 'gift_events.event_type',
        'gift_events.event_date', 'gift_events.notes', 'gift_events.created_at',
        'contacts.uuid as honoree_uuid', 'contacts.first_name as honoree_first_name',
        'contacts.last_name as honoree_last_name',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as honoree_avatar`)
      )
      .orderBy('gift_events.event_date', 'desc');

    if (year) {
      query = query.whereRaw('YEAR(gift_events.event_date) = ?', [year]);
    }
    if (type) {
      query = query.where('gift_events.event_type', type);
    }

    const events = await query;

    // Add gift counts per event
    const eventUuids = events.map(e => e.uuid);
    if (eventUuids.length) {
      const counts = await db('gift_orders')
        .join('gift_events', 'gift_orders.event_id', 'gift_events.id')
        .whereIn('gift_events.uuid', eventUuids)
        .where('gift_orders.tenant_id', req.tenantId)
        .groupBy('gift_events.uuid')
        .select('gift_events.uuid', db.raw('COUNT(*) as gift_count'));

      const countMap = Object.fromEntries(counts.map(c => [c.uuid, c.gift_count]));
      events.forEach(e => { e.gift_count = countMap[e.uuid] || 0; });
    }

    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// GET /api/gifts/events/:uuid — event detail with gifts
router.get('/events/:uuid', async (req, res, next) => {
  try {
    const event = await db('gift_events')
      .where({ 'gift_events.uuid': req.params.uuid, 'gift_events.tenant_id': req.tenantId })
      .leftJoin('contacts', 'gift_events.honoree_contact_id', 'contacts.id')
      .select(
        'gift_events.*',
        'contacts.uuid as honoree_uuid', 'contacts.first_name as honoree_first_name',
        'contacts.last_name as honoree_last_name',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as honoree_avatar`)
      )
      .first();

    if (!event) throw new AppError('Event not found', 404);

    // Get gifts for this event with visibility filter
    const linkedContactId = await getUserLinkedContactId(req.user.id, req.tenantId);
    let giftsQuery = db('gift_orders')
      .where({ 'gift_orders.event_id': event.id, 'gift_orders.tenant_id': req.tenantId })
      .leftJoin('gift_products', 'gift_orders.product_id', 'gift_products.id')
      .select(
        'gift_orders.uuid', 'gift_orders.title', 'gift_orders.status',
        'gift_orders.order_type', 'gift_orders.price', 'gift_orders.currency_code',
        'gift_orders.notes', 'gift_orders.visibility', 'gift_orders.created_by',
        'gift_orders.created_at',
        'gift_products.uuid as product_uuid', 'gift_products.name as product_name',
        'gift_products.url as product_url', 'gift_products.image_url as product_image_url'
      )
      .orderBy('gift_orders.created_at', 'desc');

    applyVisibilityFilter(giftsQuery, req.user.id, linkedContactId);
    const gifts = await giftsQuery;

    // Fetch participants for all gifts
    if (gifts.length) {
      const giftIds = await db('gift_orders')
        .whereIn('uuid', gifts.map(g => g.uuid))
        .select('id', 'uuid');
      const idMap = Object.fromEntries(giftIds.map(g => [g.id, g.uuid]));

      const participants = await db('gift_order_participants')
        .whereIn('order_id', giftIds.map(g => g.id))
        .join('contacts', 'gift_order_participants.contact_id', 'contacts.id')
        .leftJoin('contact_photos', function () {
          this.on('contact_photos.contact_id', 'contacts.id').andOn('contact_photos.is_primary', db.raw('true'));
        })
        .select(
          'gift_order_participants.order_id', 'gift_order_participants.role',
          'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name',
          'contact_photos.thumbnail_path as avatar'
        );

      const partMap = {};
      for (const p of participants) {
        const giftUuid = idMap[p.order_id];
        if (!partMap[giftUuid]) partMap[giftUuid] = { givers: [], recipients: [] };
        const entry = { uuid: p.contact_uuid, first_name: p.first_name, last_name: p.last_name, avatar: p.avatar };
        if (p.role === 'giver') partMap[giftUuid].givers.push(entry);
        else partMap[giftUuid].recipients.push(entry);
      }

      gifts.forEach(g => {
        g.givers = partMap[g.uuid]?.givers || [];
        g.recipients = partMap[g.uuid]?.recipients || [];
      });
    }

    res.json({
      event: {
        uuid: event.uuid, name: event.name, event_type: event.event_type,
        event_date: event.event_date, notes: event.notes,
        honoree: event.honoree_uuid ? { uuid: event.honoree_uuid, first_name: event.honoree_first_name, last_name: event.honoree_last_name, avatar: event.honoree_avatar || null } : null,
      },
      gifts,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/gifts/events — create event
router.post('/events', async (req, res, next) => {
  try {
    const { name, event_type, event_date, honoree_contact_uuid, notes } = req.body;
    if (!name?.trim()) throw new AppError('Event name is required', 400);

    let honoreeId = null;
    if (honoree_contact_uuid) {
      const contact = await db('contacts').where({ uuid: honoree_contact_uuid, tenant_id: req.tenantId }).first();
      if (contact) honoreeId = contact.id;
    }

    const uuid = uuidv4();
    await db('gift_events').insert({
      uuid,
      tenant_id: req.tenantId,
      name: name.trim(),
      event_type: event_type || 'other',
      event_date: event_date || null,
      honoree_contact_id: honoreeId,
      notes: notes || null,
      created_by: req.user.id,
    });

    res.status(201).json({ uuid });
  } catch (err) {
    next(err);
  }
});

// PUT /api/gifts/events/:uuid — update event
router.put('/events/:uuid', async (req, res, next) => {
  try {
    const event = await db('gift_events').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!event) throw new AppError('Event not found', 404);

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.event_type !== undefined) updates.event_type = req.body.event_type;
    if (req.body.event_date !== undefined) updates.event_date = req.body.event_date || null;
    if (req.body.notes !== undefined) updates.notes = req.body.notes || null;

    if (req.body.honoree_contact_uuid !== undefined) {
      if (req.body.honoree_contact_uuid) {
        const contact = await db('contacts').where({ uuid: req.body.honoree_contact_uuid, tenant_id: req.tenantId }).first();
        updates.honoree_contact_id = contact ? contact.id : null;
      } else {
        updates.honoree_contact_id = null;
      }
    }

    if (Object.keys(updates).length) {
      await db('gift_events').where({ id: event.id }).update(updates);
    }

    res.json({ message: 'Event updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/gifts/events/:uuid — delete event
router.delete('/events/:uuid', async (req, res, next) => {
  try {
    const deleted = await db('gift_events').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).del();
    if (!deleted) throw new AppError('Event not found', 404);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
// ORDERS (GIFTS)
// ════════════════════════════════════════════

// GET /api/gifts/orders — list orders
router.get('/orders', async (req, res, next) => {
  try {
    const { event_uuid, contact_uuid, status, type, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 200);
    const linkedContactId = await getUserLinkedContactId(req.user.id, req.tenantId);

    let query = db('gift_orders')
      .where({ 'gift_orders.tenant_id': req.tenantId })
      .leftJoin('gift_products', 'gift_orders.product_id', 'gift_products.id')
      .leftJoin('gift_events', 'gift_orders.event_id', 'gift_events.id')
      .select(
        'gift_orders.uuid', 'gift_orders.title', 'gift_orders.status',
        'gift_orders.order_type', 'gift_orders.price', 'gift_orders.currency_code',
        'gift_orders.visibility', 'gift_orders.created_at',
        'gift_events.uuid as event_uuid', 'gift_events.name as event_name',
        'gift_products.uuid as product_uuid', 'gift_products.name as product_name',
        'gift_products.url as product_url', 'gift_products.image_url as product_image_url'
      )
      .orderBy('gift_orders.created_at', 'desc')
      .limit(limit);

    applyVisibilityFilter(query, req.user.id, linkedContactId);

    if (event_uuid) {
      query = query.where('gift_events.uuid', event_uuid);
    }
    if (status) {
      query = query.where('gift_orders.status', status);
    }
    if (type) {
      query = query.where('gift_orders.order_type', type);
    }
    if (contact_uuid) {
      query = query.whereExists(function () {
        this.select(db.raw(1))
          .from('gift_order_participants as gop')
          .join('contacts as c', 'gop.contact_id', 'c.id')
          .whereRaw('gop.order_id = gift_orders.id')
          .where('c.uuid', contact_uuid);
      });
    }

    const orders = await query;

    // Fetch participants for all orders
    if (orders.length) {
      const orderIds = await db('gift_orders')
        .whereIn('uuid', orders.map(o => o.uuid))
        .select('id', 'uuid');
      const idMap = Object.fromEntries(orderIds.map(o => [o.id, o.uuid]));

      const participants = await db('gift_order_participants')
        .whereIn('order_id', orderIds.map(o => o.id))
        .join('contacts', 'gift_order_participants.contact_id', 'contacts.id')
        .leftJoin('contact_photos', function () {
          this.on('contact_photos.contact_id', 'contacts.id').andOn('contact_photos.is_primary', db.raw('true'));
        })
        .select('gift_order_participants.order_id', 'gift_order_participants.role',
          'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name',
          'contact_photos.thumbnail_path as avatar');

      const partMap = {};
      for (const p of participants) {
        const orderUuid = idMap[p.order_id];
        if (!partMap[orderUuid]) partMap[orderUuid] = { givers: [], recipients: [] };
        const entry = { uuid: p.contact_uuid, first_name: p.first_name, last_name: p.last_name, avatar: p.avatar };
        if (p.role === 'giver') partMap[orderUuid].givers.push(entry);
        else partMap[orderUuid].recipients.push(entry);
      }
      orders.forEach(o => { o.givers = partMap[o.uuid]?.givers || []; o.recipients = partMap[o.uuid]?.recipients || []; });
    }

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// POST /api/gifts/orders — create gift order
router.post('/orders', async (req, res, next) => {
  try {
    const { title, product_uuid, event_uuid, status, order_type, price, currency_code, notes, visibility, giver_uuids, recipient_uuids } = req.body;

    if (!title?.trim() && !product_uuid) throw new AppError('Gift title or product is required', 400);

    let productId = null;
    let giftTitle = title?.trim() || '';
    if (product_uuid) {
      const product = await db('gift_products').where({ uuid: product_uuid, tenant_id: req.tenantId }).first();
      if (product) {
        productId = product.id;
        if (!giftTitle) giftTitle = product.name;
      }
    }

    if (!giftTitle) throw new AppError('Gift title is required', 400);

    let eventId = null;
    if (event_uuid) {
      const event = await db('gift_events').where({ uuid: event_uuid, tenant_id: req.tenantId }).first();
      if (event) eventId = event.id;
    }

    const uuid = uuidv4();
    const effectiveStatus = status || 'idea';
    // Auto-share when status is 'given'
    const effectiveVisibility = effectiveStatus === 'given' ? 'shared' : (visibility || 'private');

    const [orderId] = await db('gift_orders').insert({
      uuid,
      tenant_id: req.tenantId,
      event_id: eventId,
      product_id: productId,
      title: giftTitle,
      status: effectiveStatus,
      order_type: order_type || 'outgoing',
      price: price || null,
      currency_code: currency_code || 'NOK',
      notes: notes || null,
      visibility: effectiveVisibility,
      created_by: req.user.id,
    });

    // Add participants
    const participantRows = [];
    if (giver_uuids?.length) {
      const givers = await db('contacts').whereIn('uuid', giver_uuids).where({ tenant_id: req.tenantId }).select('id');
      givers.forEach(c => participantRows.push({ order_id: orderId, contact_id: c.id, role: 'giver' }));
    }
    if (recipient_uuids?.length) {
      const recipients = await db('contacts').whereIn('uuid', recipient_uuids).where({ tenant_id: req.tenantId }).select('id');
      recipients.forEach(c => participantRows.push({ order_id: orderId, contact_id: c.id, role: 'recipient' }));
    }
    if (participantRows.length) {
      await db('gift_order_participants').insert(participantRows);
    }

    res.status(201).json({ uuid });
  } catch (err) {
    next(err);
  }
});

// PUT /api/gifts/orders/:uuid — update gift order
router.put('/orders/:uuid', async (req, res, next) => {
  try {
    const order = await db('gift_orders').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!order) throw new AppError('Gift not found', 404);

    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title.trim();
    if (req.body.status !== undefined) {
      updates.status = req.body.status;
      // Auto-share when marked as given
      if (req.body.status === 'given' && order.visibility === 'private') {
        updates.visibility = 'shared';
      }
    }
    if (req.body.order_type !== undefined) updates.order_type = req.body.order_type;
    if (req.body.price !== undefined) updates.price = req.body.price || null;
    if (req.body.notes !== undefined) updates.notes = req.body.notes || null;
    if (req.body.visibility !== undefined) updates.visibility = req.body.visibility;

    if (req.body.event_uuid !== undefined) {
      if (req.body.event_uuid) {
        const event = await db('gift_events').where({ uuid: req.body.event_uuid, tenant_id: req.tenantId }).first();
        updates.event_id = event ? event.id : null;
      } else {
        updates.event_id = null;
      }
    }

    if (req.body.product_uuid !== undefined) {
      if (req.body.product_uuid) {
        const product = await db('gift_products').where({ uuid: req.body.product_uuid, tenant_id: req.tenantId }).first();
        updates.product_id = product ? product.id : null;
      } else {
        updates.product_id = null;
      }
    }

    if (Object.keys(updates).length) {
      await db('gift_orders').where({ id: order.id }).update(updates);
    }

    // Update participants if provided
    if (req.body.giver_uuids !== undefined || req.body.recipient_uuids !== undefined) {
      await db('gift_order_participants').where({ order_id: order.id }).del();
      const rows = [];
      if (req.body.giver_uuids?.length) {
        const givers = await db('contacts').whereIn('uuid', req.body.giver_uuids).where({ tenant_id: req.tenantId }).select('id');
        givers.forEach(c => rows.push({ order_id: order.id, contact_id: c.id, role: 'giver' }));
      }
      if (req.body.recipient_uuids?.length) {
        const recipients = await db('contacts').whereIn('uuid', req.body.recipient_uuids).where({ tenant_id: req.tenantId }).select('id');
        recipients.forEach(c => rows.push({ order_id: order.id, contact_id: c.id, role: 'recipient' }));
      }
      if (rows.length) await db('gift_order_participants').insert(rows);
    }

    res.json({ message: 'Gift updated' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/gifts/orders/:uuid/status — quick status change
router.patch('/orders/:uuid/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) throw new AppError('Status is required', 400);

    const order = await db('gift_orders').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!order) throw new AppError('Gift not found', 404);

    const updates = { status };
    // Auto-share when marked as given
    if (status === 'given' && order.visibility === 'private') {
      updates.visibility = 'shared';
    }

    await db('gift_orders').where({ id: order.id }).update(updates);
    res.json({ message: 'Status updated', visibility: updates.visibility || order.visibility });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/gifts/orders/:uuid — delete gift order
router.delete('/orders/:uuid', async (req, res, next) => {
  try {
    const deleted = await db('gift_orders').where({ uuid: req.params.uuid, tenant_id: req.tenantId }).del();
    if (!deleted) throw new AppError('Gift not found', 404);
    res.json({ message: 'Gift deleted' });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
// ════════════════════════════════════════════
// WISHLISTS
// ════════════════════════════════════════════

// GET /api/gifts/wishlists — list all wishlists (with item counts)
router.get('/wishlists', async (req, res, next) => {
  try {
    const { contact_uuid } = req.query;
    let query = db('gift_wishlists')
      .where({ 'gift_wishlists.tenant_id': req.tenantId })
      .join('contacts', 'gift_wishlists.contact_id', 'contacts.id')
      .select(
        'gift_wishlists.uuid', 'gift_wishlists.name', 'gift_wishlists.is_default',
        'gift_wishlists.visibility', 'gift_wishlists.created_at',
        'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name'
      )
      .select(db.raw('(SELECT COUNT(*) FROM gift_wishlist_items WHERE gift_wishlist_items.wishlist_id = gift_wishlists.id) as item_count'))
      .orderBy('contacts.first_name');

    if (contact_uuid) {
      query = query.where('contacts.uuid', contact_uuid);
    }

    const wishlists = await query;
    res.json({ wishlists });
  } catch (err) {
    next(err);
  }
});

// GET /api/gifts/wishlists/:uuid — wishlist detail with items
router.get('/wishlists/:uuid', async (req, res, next) => {
  try {
    const wishlist = await db('gift_wishlists')
      .where({ 'gift_wishlists.uuid': req.params.uuid, 'gift_wishlists.tenant_id': req.tenantId })
      .join('contacts', 'gift_wishlists.contact_id', 'contacts.id')
      .select('gift_wishlists.*', 'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name')
      .first();

    if (!wishlist) throw new AppError('Wishlist not found', 404);

    const items = await db('gift_wishlist_items')
      .where({ wishlist_id: wishlist.id })
      .leftJoin('gift_products', 'gift_wishlist_items.product_id', 'gift_products.id')
      .select(
        'gift_wishlist_items.id', 'gift_wishlist_items.title', 'gift_wishlist_items.priority',
        'gift_wishlist_items.notes', 'gift_wishlist_items.is_fulfilled',
        'gift_products.uuid as product_uuid', 'gift_products.url as product_url',
        'gift_products.image_url as product_image_url', 'gift_products.default_price'
      )
      .orderBy([{ column: 'gift_wishlist_items.is_fulfilled' }, { column: 'gift_wishlist_items.priority', order: 'desc' }, { column: 'gift_wishlist_items.id' }]);

    res.json({
      wishlist: {
        uuid: wishlist.uuid, name: wishlist.name,
        contact_uuid: wishlist.contact_uuid, first_name: wishlist.first_name, last_name: wishlist.last_name,
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/gifts/wishlists — create wishlist
router.post('/wishlists', async (req, res, next) => {
  try {
    const { contact_uuid, name } = req.body;
    if (!contact_uuid || !name?.trim()) throw new AppError('Contact and name are required', 400);

    const contact = await db('contacts').where({ uuid: contact_uuid, tenant_id: req.tenantId }).first();
    if (!contact) throw new AppError('Contact not found', 404);

    const uuid = uuidv4();
    await db('gift_wishlists').insert({
      uuid,
      tenant_id: req.tenantId,
      contact_id: contact.id,
      name: name.trim(),
      created_by: req.user.id,
    });

    res.status(201).json({ uuid });
  } catch (err) {
    next(err);
  }
});

// POST /api/gifts/wishlists/:uuid/items — add item
router.post('/wishlists/:uuid/items', async (req, res, next) => {
  try {
    const wishlist = await db('gift_wishlists')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!wishlist) throw new AppError('Wishlist not found', 404);

    const { title, product_uuid, priority, notes } = req.body;
    if (!title?.trim()) throw new AppError('Title is required', 400);

    let productId = null;
    if (product_uuid) {
      const product = await db('gift_products').where({ uuid: product_uuid, tenant_id: req.tenantId }).first();
      if (product) productId = product.id;
    }

    const [id] = await db('gift_wishlist_items').insert({
      wishlist_id: wishlist.id,
      product_id: productId,
      title: title.trim(),
      priority: priority || 0,
      notes: notes || null,
    });

    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

// PUT /api/gifts/wishlists/:uuid/items/:id — update item
router.put('/wishlists/:uuid/items/:id', async (req, res, next) => {
  try {
    const wishlist = await db('gift_wishlists')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!wishlist) throw new AppError('Wishlist not found', 404);

    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title.trim();
    if (req.body.priority !== undefined) updates.priority = req.body.priority;
    if (req.body.notes !== undefined) updates.notes = req.body.notes || null;
    if (req.body.is_fulfilled !== undefined) updates.is_fulfilled = !!req.body.is_fulfilled;

    await db('gift_wishlist_items').where({ id: req.params.id, wishlist_id: wishlist.id }).update(updates);
    res.json({ message: 'Item updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/gifts/wishlists/:uuid/items/:id — delete item
router.delete('/wishlists/:uuid/items/:id', async (req, res, next) => {
  try {
    const wishlist = await db('gift_wishlists')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId }).first();
    if (!wishlist) throw new AppError('Wishlist not found', 404);

    await db('gift_wishlist_items').where({ id: req.params.id, wishlist_id: wishlist.id }).del();
    res.json({ message: 'Item deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
