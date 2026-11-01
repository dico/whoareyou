import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import { createReadStream, existsSync } from 'fs';
import { db } from '../db.js';
import { config } from '../config/index.js';

// Public, token-based wishlist view (no auth). Mounted at /api/public/wishlists.
// A share (wishlist_shares) covers one or more contacts; each contact shows
// their default wishlist. Only exposes what a gift-giver needs: names,
// avatars and the open (unfulfilled) items. Fulfilled items are hidden so
// the link can't reveal what has already been bought.
const router = Router();

export function hashShareToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Resolve a token to its people, in display order. Each entry carries the
// contact's default wishlist id (null if they have none).
async function findShare(token) {
  if (!token || token.length > 128) return null;
  const share = await db('wishlist_shares').where({ token_hash: hashShareToken(token) }).first();
  if (!share) return null;

  const people = await db('wishlist_share_contacts')
    .where({ 'wishlist_share_contacts.share_id': share.id })
    .join('contacts', 'wishlist_share_contacts.contact_id', 'contacts.id')
    .where('contacts.tenant_id', share.tenant_id)
    .whereNull('contacts.deleted_at')
    .select('contacts.id', 'contacts.first_name', 'contacts.last_name',
      db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp
        WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`),
      db.raw(`(SELECT w.id FROM gift_wishlists w WHERE w.contact_id = contacts.id AND w.tenant_id = ?
        ORDER BY w.is_default DESC, w.id LIMIT 1) as wishlist_id`, [share.tenant_id]))
    .orderBy([{ column: 'contacts.first_name' }, { column: 'contacts.id' }]);

  return { share, people };
}

const imageUrl = (token, url, query) => {
  if (!url) return null;
  if (!url.startsWith('/uploads/')) return url; // external product image
  return `/api/public/wishlists/${encodeURIComponent(token)}/image?${query}`;
};

// GET /api/public/wishlists/:token
router.get('/:token', async (req, res, next) => {
  try {
    const found = await findShare(req.params.token);
    if (!found) return res.status(404).json({ error: 'Not found' });
    const { token } = req.params;

    const wishlistIds = found.people.map(p => p.wishlist_id).filter(Boolean);
    const items = wishlistIds.length ? await db('gift_wishlist_items')
      .whereIn('wishlist_id', wishlistIds)
      .where({ is_fulfilled: false })
      .leftJoin('gift_products', 'gift_wishlist_items.product_id', 'gift_products.id')
      .select(
        'gift_wishlist_items.id', 'gift_wishlist_items.wishlist_id',
        'gift_wishlist_items.title', 'gift_wishlist_items.notes',
        'gift_products.url as product_url', 'gift_products.image_url as product_image_url',
        'gift_products.default_price', 'gift_products.description as product_description'
      )
      .orderBy([{ column: 'gift_wishlist_items.priority', order: 'desc' }, { column: 'gift_wishlist_items.id' }])
      : [];

    res.set('Cache-Control', 'no-store');
    res.json({
      people: found.people.map((p, index) => ({
        first_name: p.first_name,
        last_name: p.last_name,
        avatar: imageUrl(token, p.avatar, `avatar=${index}`),
        items: items.filter(i => i.wishlist_id === p.wishlist_id).map(i => ({
          id: i.id,
          title: i.title,
          description: i.notes || i.product_description || null,
          url: /^https?:\/\//i.test(i.product_url || '') ? i.product_url : null,
          price: i.default_price,
          image: imageUrl(token, i.product_image_url, `item=${i.id}`),
        })),
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/public/wishlists/:token/image?item=ID | ?avatar=INDEX
// Serves only avatars of the shared people or images of open items on
// their wishlists.
router.get('/:token/image', async (req, res, next) => {
  try {
    const found = await findShare(req.params.token);
    if (!found) return res.status(404).json({ error: 'Not found' });

    let url = null;
    if (/^\d+$/.test(req.query.avatar || '')) {
      url = found.people[Number(req.query.avatar)]?.avatar;
    } else if (/^\d+$/.test(req.query.item || '')) {
      const wishlistIds = found.people.map(p => p.wishlist_id).filter(Boolean);
      const row = wishlistIds.length ? await db('gift_wishlist_items')
        .where({ 'gift_wishlist_items.id': req.query.item, is_fulfilled: false })
        .whereIn('wishlist_id', wishlistIds)
        .join('gift_products', 'gift_wishlist_items.product_id', 'gift_products.id')
        .select('gift_products.image_url')
        .first() : null;
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
