import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import { createReadStream, existsSync } from 'fs';
import { db } from '../db.js';
import { config } from '../config/index.js';

// Public, token-based wishlist view (no auth). Mounted at /api/public/wishlists.
// Only exposes what a gift-giver needs: owner's first name + avatar and the
// open (unfulfilled) items. Fulfilled items are hidden so the link can't
// reveal what has already been bought.
const router = Router();

export function hashShareToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findShared(token) {
  if (!token || token.length > 128) return null;
  return db('gift_wishlists')
    .where({ 'gift_wishlists.share_token_hash': hashShareToken(token) })
    .join('contacts', 'gift_wishlists.contact_id', 'contacts.id')
    .whereNull('contacts.deleted_at')
    .select('gift_wishlists.id', 'gift_wishlists.name', 'contacts.first_name', 'contacts.last_name',
      db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp
        WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`))
    .first();
}

const imageUrl = (token, url, query) => {
  if (!url) return null;
  if (!url.startsWith('/uploads/')) return url; // external product image
  return `/api/public/wishlists/${encodeURIComponent(token)}/image?${query}`;
};

// GET /api/public/wishlists/:token
router.get('/:token', async (req, res, next) => {
  try {
    const wl = await findShared(req.params.token);
    if (!wl) return res.status(404).json({ error: 'Not found' });

    const items = await db('gift_wishlist_items')
      .where({ wishlist_id: wl.id, is_fulfilled: false })
      .leftJoin('gift_products', 'gift_wishlist_items.product_id', 'gift_products.id')
      .select(
        'gift_wishlist_items.id', 'gift_wishlist_items.title', 'gift_wishlist_items.notes',
        'gift_products.url as product_url', 'gift_products.image_url as product_image_url',
        'gift_products.default_price', 'gift_products.description as product_description'
      )
      .orderBy([{ column: 'gift_wishlist_items.priority', order: 'desc' }, { column: 'gift_wishlist_items.id' }]);

    res.set('Cache-Control', 'no-store');
    res.json({
      wishlist: {
        name: wl.name,
        first_name: wl.first_name,
        last_name: wl.last_name,
        avatar: imageUrl(req.params.token, wl.avatar, 'avatar=1'),
      },
      items: items.map(i => ({
        id: i.id,
        title: i.title,
        description: i.notes || i.product_description || null,
        url: /^https?:\/\//i.test(i.product_url || '') ? i.product_url : null,
        price: i.default_price,
        image: imageUrl(req.params.token, i.product_image_url, `item=${i.id}`),
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/public/wishlists/:token/image?item=ID | ?avatar=1
// Serves only the owner's avatar or images of open items on this wishlist.
router.get('/:token/image', async (req, res, next) => {
  try {
    const wl = await findShared(req.params.token);
    if (!wl) return res.status(404).json({ error: 'Not found' });

    let url = null;
    if (req.query.avatar) {
      url = wl.avatar;
    } else if (/^\d+$/.test(req.query.item || '')) {
      const row = await db('gift_wishlist_items')
        .where({ 'gift_wishlist_items.id': req.query.item, wishlist_id: wl.id, is_fulfilled: false })
        .join('gift_products', 'gift_wishlist_items.product_id', 'gift_products.id')
        .select('gift_products.image_url')
        .first();
      url = row?.image_url;
    }
    if (!url?.startsWith('/uploads/')) return res.status(404).json({ error: 'Not found' });

    const uploadsDir = path.resolve(config.uploads?.dir || '/app/uploads');
    const absPath = path.resolve(uploadsDir, url.slice('/uploads/'.length));
    if (!absPath.startsWith(uploadsDir + path.sep) || !existsSync(absPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeTypes = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };
    res.set('Content-Type', mimeTypes[path.extname(absPath).toLowerCase()] || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=3600');
    createReadStream(absPath).pipe(res);
  } catch (err) { next(err); }
});

export default router;
