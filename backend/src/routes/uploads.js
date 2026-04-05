import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { processImage, extractImageMetadata } from '../services/image.js';
import { config } from '../config/index.js';

const router = Router();

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
const DOCUMENT_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv'];
const ALL_MEDIA_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...DOCUMENT_TYPES];

// Image-only upload (for contact photos)
const upload = multer({
  dest: path.join(config.uploads.dir, 'temp'),
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, WebP and GIF images are allowed', 400));
    }
  },
});

// Image + document upload (for post media)
const uploadMedia = multer({
  dest: path.join(config.uploads.dir, 'temp'),
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (ALL_MEDIA_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('File type not allowed', 400));
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

// POST /api/posts/:uuid/media — upload media (images + documents) to a post
router.post('/posts/:uuid/media', uploadMedia.array('media', 50), async (req, res, next) => {
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
    const imageDates = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const timestamp = Date.now();
      const isImage = IMAGE_TYPES.includes(file.mimetype);
      const isVideo = VIDEO_TYPES.includes(file.mimetype);

      let filePath, thumbnailPath, fileType;

      let takenAt = null, mediaLat = null, mediaLng = null;

      if (isImage) {
        // Extract EXIF metadata before processing (which strips it)
        const meta = await extractImageMetadata(file.path);
        if (meta.date) { imageDates.push(meta.date); takenAt = meta.date; }
        if (meta.latitude) mediaLat = meta.latitude;
        if (meta.longitude) mediaLng = meta.longitude;

        const processed = await processImage(
          file.path, `posts/${post.uuid}`, `media_${timestamp}_${i}`
        );
        filePath = processed.filePath;
        thumbnailPath = processed.thumbnailPath;
        fileType = 'image/webp';
      } else {
        // Video or document — store as-is with original extension
        const ext = path.extname(file.originalname) || '.bin';
        const prefix = isVideo ? 'video' : 'doc';
        const outDir = path.join(config.uploads.dir, 'posts', post.uuid);
        await fs.mkdir(outDir, { recursive: true });
        const destName = `${prefix}_${timestamp}_${i}${ext}`;
        await fs.rename(file.path, path.join(outDir, destName));
        filePath = `/uploads/posts/${post.uuid}/${destName}`;
        thumbnailPath = null;
        fileType = file.mimetype;
      }

      const [mediaId] = await db('post_media').insert({
        post_id: post.id,
        tenant_id: req.tenantId,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        file_type: fileType,
        file_size: file.size,
        original_name: file.originalname || null,
        sort_order: (maxSort || 0) + i + 1,
        taken_at: takenAt,
        latitude: mediaLat,
        longitude: mediaLng,
      });

      results.push({
        id: mediaId, file_path: filePath, thumbnail_path: thumbnailPath,
        file_type: fileType, original_name: file.originalname,
      });
    }

    // Suggest post_date from image EXIF dates
    // Strategy: use the most common date if > 50% agree, otherwise median
    let suggestedDate = null;
    if (imageDates.length) {
      const dateCounts = {};
      for (const d of imageDates) { dateCounts[d] = (dateCounts[d] || 0) + 1; }
      const sorted = Object.entries(dateCounts).sort((a, b) => b[1] - a[1]);
      const topDate = sorted[0][0];
      const topCount = sorted[0][1];

      if (topCount > imageDates.length / 2) {
        // Majority agree on one date
        suggestedDate = topDate;
      } else {
        // Use median date
        const sortedDates = [...imageDates].sort();
        suggestedDate = sortedDates[Math.floor(sortedDates.length / 2)];
      }

      // Only suggest if different from today
      const today = new Date().toISOString().split('T')[0];
      if (suggestedDate === today) suggestedDate = null;
    }

    res.status(201).json({ media: results, suggestedDate });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:uuid/media/:mediaId — remove a media item from a post
router.delete('/posts/:uuid/media/:mediaId', async (req, res, next) => {
  try {
    const post = await db('posts')
      .where({ uuid: req.params.uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!post) throw new AppError('Post not found', 404);

    const media = await db('post_media')
      .where({ id: req.params.mediaId, post_id: post.id })
      .first();
    if (!media) throw new AppError('Media not found', 404);

    // Delete files from disk (with path traversal protection)
    const uploadsDir = path.resolve(config.uploads.dir);
    for (const p of [media.file_path, media.thumbnail_path]) {
      if (p) {
        const absPath = path.resolve(uploadsDir, p.replace(/^\/uploads\//, ''));
        if (absPath.startsWith(uploadsDir)) {
          try { await fs.unlink(absPath); } catch {}
        }
      }
    }

    await db('post_media').where({ id: media.id }).del();
    res.json({ message: 'Media deleted' });
  } catch (err) { next(err); }
});

export default router;
