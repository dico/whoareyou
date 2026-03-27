/**
 * One-time script: Import Monica profile photos into WhoareYou.
 *
 * Reads photos from a local directory, processes them with sharp,
 * and links them to the correct contacts.
 *
 * Usage: node src/migrate-monica-photos.js /path/to/monica/photos
 *
 * The photos dir should contain the raw files (e.g. USmiKo6kYzMYpCbub4s3dMpqXxOwdGpTGdTVXQck.jpg)
 */

import knex from 'knex';
import fs from 'fs/promises';
import path from 'path';
import { processImage } from './services/image.js';

const PHOTOS_DIR = process.argv[2];
if (!PHOTOS_DIR) {
  console.error('Usage: node src/migrate-monica-photos.js /path/to/monica/photos');
  process.exit(1);
}

const TARGET_TENANT_ID = 1;

const monica = knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.MONICA_DB || 'monica_backup',
  },
});

const app = knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'whoareyou',
  },
});

async function migrate() {
  console.log(`Importing Monica photos from: ${PHOTOS_DIR}\n`);

  // Get Monica photo-contact mappings
  const monicaPhotos = await monica('photos')
    .join('contact_photo', 'photos.id', 'contact_photo.photo_id')
    .join('contacts as mc', 'contact_photo.contact_id', 'mc.id')
    .select(
      'photos.id as photo_id',
      'photos.new_filename',
      'mc.id as monica_contact_id',
      'mc.first_name',
      'mc.last_name',
      'mc.avatar_photo_id'
    )
    .where('mc.account_id', 1)
    .whereNull('mc.deleted_at');

  console.log(`Found ${monicaPhotos.length} photo-contact mappings in Monica\n`);

  // Build monica_contact_id → whoareyou contact mapping
  // We match on first_name + last_name since IDs differ
  const appContacts = await app('contacts')
    .where({ tenant_id: TARGET_TENANT_ID })
    .whereNull('deleted_at')
    .select('id', 'uuid', 'first_name', 'last_name');

  const contactMap = new Map();
  for (const ac of appContacts) {
    const key = `${ac.first_name}|${ac.last_name || ''}`;
    contactMap.set(key, ac);
  }

  // Clear existing photos for this tenant
  await app('contact_photos').where({ tenant_id: TARGET_TENANT_ID }).del();

  let imported = 0;
  let skipped = 0;
  let notFound = 0;

  for (const mp of monicaPhotos) {
    // Find matching WhoareYou contact
    const key = `${mp.first_name}|${mp.last_name || ''}`;
    const appContact = contactMap.get(key);

    if (!appContact) {
      skipped++;
      continue;
    }

    // Extract filename from Monica path (e.g. "photos/USmiKo6k...jpg" → "USmiKo6k...jpg")
    const monicaFilename = mp.new_filename.replace(/^photos\//, '');
    const sourcePath = path.join(PHOTOS_DIR, monicaFilename);

    // Check if file exists
    try {
      await fs.access(sourcePath);
    } catch {
      notFound++;
      console.log(`  MISSING: ${monicaFilename} (${mp.first_name} ${mp.last_name || ''})`);
      continue;
    }

    // Process image with sharp
    try {
      const timestamp = Date.now();
      const { filePath, thumbnailPath } = await processImage(
        sourcePath,
        `contacts/${appContact.uuid}`,
        `photo_${timestamp}_${mp.photo_id}`,
        { keepOriginal: true }
      );

      // Determine if this was the avatar
      const isPrimary = mp.avatar_photo_id === mp.photo_id;

      await app('contact_photos').insert({
        contact_id: appContact.id,
        tenant_id: TARGET_TENANT_ID,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        is_primary: isPrimary,
        sort_order: isPrimary ? 0 : 1,
      });

      imported++;
      console.log(`  OK: ${mp.first_name} ${mp.last_name || ''} → ${filePath}${isPrimary ? ' (primary)' : ''}`);
    } catch (err) {
      console.log(`  ERROR: ${monicaFilename} — ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n=== Photo import complete ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Not found: ${notFound}`);

  await monica.destroy();
  await app.destroy();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
