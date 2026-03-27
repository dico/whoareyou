import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { processImage } from '../services/image.js';
import { config } from '../config/index.js';

const router = Router();

const upload = multer({
  dest: path.join(config.uploads.dir, 'temp'),
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, WebP and GIF images are allowed', 400));
    }
  },
});

// POST /api/contacts/:uuid/photos — upload contact photo
router.post('/contacts/:uuid/photos', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    // Process image
    const timestamp = Date.now();
    const { filePath, thumbnailPath } = await processImage(
      req.file.path,
      `contacts/${contact.uuid}`,
      `photo_${timestamp}`
    );

    // Check if this is the first photo (make it primary)
    const existingCount = await db('contact_photos')
      .where({ contact_id: contact.id })
      .count('id as count')
      .first();

    const [photoId] = await db('contact_photos').insert({
      contact_id: contact.id,
      tenant_id: req.tenantId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      is_primary: existingCount.count === 0,
      caption: req.body.caption || null,
      taken_at: req.body.taken_at || null,
      sort_order: existingCount.count,
    });

    res.status(201).json({
      photo: {
        id: photoId,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        is_primary: existingCount.count === 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/contacts/:uuid/photos/:photoId/primary — set as primary
router.put('/contacts/:uuid/photos/:photoId/primary', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    // Unset all, then set the one
    await db('contact_photos').where({ contact_id: contact.id }).update({ is_primary: false });
    await db('contact_photos')
      .where({ id: req.params.photoId, contact_id: contact.id })
      .update({ is_primary: true });

    res.json({ message: 'Primary photo updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:uuid/photos/:photoId
router.delete('/contacts/:uuid/photos/:photoId', async (req, res, next) => {
  try {
    const contact = await db('contacts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    const photo = await db('contact_photos')
      .where({ id: req.params.photoId, contact_id: contact.id })
      .first();
    if (!photo) throw new AppError('Photo not found', 404);

    await db('contact_photos').where({ id: photo.id }).del();

    // If deleted photo was primary, make the first remaining photo primary
    if (photo.is_primary) {
      const next = await db('contact_photos')
        .where({ contact_id: contact.id })
        .orderBy('sort_order')
        .first();
      if (next) {
        await db('contact_photos').where({ id: next.id }).update({ is_primary: true });
      }
    }

    res.json({ message: 'Photo deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:uuid/media — upload media to a post
router.post('/posts/:uuid/media', upload.array('media', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) throw new AppError('No files uploaded', 400);

    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    const [{ maxSort }] = await db('post_media')
      .where({ post_id: post.id })
      .max('sort_order as maxSort');

    const results = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const timestamp = Date.now();
      const { filePath, thumbnailPath } = await processImage(
        file.path,
        `posts/${post.uuid}`,
        `media_${timestamp}_${i}`
      );

      const [mediaId] = await db('post_media').insert({
        post_id: post.id,
        tenant_id: req.tenantId,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        file_type: 'image/webp',
        file_size: file.size,
        sort_order: (maxSort || 0) + i + 1,
      });

      results.push({ id: mediaId, file_path: filePath, thumbnail_path: thumbnailPath });
    }

    res.status(201).json({ media: results });
  } catch (err) {
    next(err);
  }
});

export default router;
