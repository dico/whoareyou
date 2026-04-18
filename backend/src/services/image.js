import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config/index.js';
import exifReader from 'exif-reader';

const { dir: uploadsDir, image: imageConfig } = config.uploads;

const MEDIUM_WIDTH = 800;

/**
 * Process an uploaded image:
 * - Resize to max width (full) + medium variant (~800px) + thumbnail (square crop)
 * - Convert to WebP
 * - Strip EXIF metadata
 *
 * @param {string} inputPath - Path to uploaded temp file
 * @param {string} subDir - Subdirectory (e.g. 'contacts/uuid' or 'posts/uuid')
 * @param {string} filename - Base filename (without extension)
 * @returns {{ filePath: string, mediumPath: string, thumbnailPath: string }}
 */
export async function processImage(inputPath, subDir, filename, { keepOriginal = false } = {}) {
  const outDir = path.join(uploadsDir, subDir);
  await fs.mkdir(outDir, { recursive: true });

  const mainFile = `${filename}.webp`;
  const mediumFile = `${filename}_medium.webp`;
  const thumbFile = `${filename}_thumb.webp`;
  const mainPath = path.join(outDir, mainFile);
  const mediumPath = path.join(outDir, mediumFile);
  const thumbPath = path.join(outDir, thumbFile);

  // Main image: resize + webp + strip metadata
  // failOn:'none' tolerates partially corrupted JPEGs (e.g. invalid SOS headers)
  await sharp(inputPath, { failOn: 'none' })
    .rotate() // auto-rotate based on EXIF
    .resize(imageConfig.maxWidth, null, { withoutEnlargement: true })
    .webp({ quality: imageConfig.quality })
    .toFile(mainPath);

  // Medium variant: ~800px wide, good for inline timeline display
  await sharp(inputPath, { failOn: 'none' })
    .rotate()
    .resize(MEDIUM_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: imageConfig.quality })
    .toFile(mediumPath);

  // Thumbnail: square crop + webp
  await sharp(inputPath, { failOn: 'none' })
    .rotate()
    .resize(imageConfig.thumbnailSize, imageConfig.thumbnailSize, { fit: 'cover' })
    .webp({ quality: imageConfig.quality })
    .toFile(thumbPath);

  // Clean up temp file (unless keepOriginal)
  if (!keepOriginal) {
    await fs.unlink(inputPath).catch(() => {});
  }

  // Return web-accessible paths
  return {
    filePath: `/uploads/${subDir}/${mainFile}`,
    mediumPath: `/uploads/${subDir}/${mediumFile}`,
    thumbnailPath: `/uploads/${subDir}/${thumbFile}`,
  };
}

/**
 * Rotate an image 90° clockwise on disk — overwrites all variants (full, medium, thumb).
 * @param {string} filePath - Web path e.g. /uploads/posts/uuid/media_0.webp
 */
export async function rotateImage(filePath) {
  const rel = filePath.replace(/^\/uploads\//, '');
  const absPath = path.join(uploadsDir, rel);

  // Derive variant paths from the main file
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const base = path.basename(absPath, ext);
  const mediumPath = path.join(dir, `${base}_medium${ext}`);
  const thumbPath = path.join(dir, `${base}_thumb${ext}`);

  // Read file into memory first so sharp releases the file handle before we overwrite
  const mainInput = await fs.readFile(absPath);
  const mainBuf = await sharp(mainInput, { failOn: 'none' }).rotate(90).webp({ quality: imageConfig.quality }).toBuffer();
  await fs.writeFile(absPath, mainBuf);

  // Rotate medium (if exists)
  try {
    const medInput = await fs.readFile(mediumPath);
    const medBuf = await sharp(medInput, { failOn: 'none' }).rotate(90).webp({ quality: imageConfig.quality }).toBuffer();
    await fs.writeFile(mediumPath, medBuf);
  } catch {}

  // Regenerate thumbnail from rotated main
  await sharp(mainBuf, { failOn: 'none' })
    .resize(imageConfig.thumbnailSize, imageConfig.thumbnailSize, { fit: 'cover' })
    .webp({ quality: imageConfig.quality })
    .toFile(thumbPath);
}

/**
 * Extract date and GPS from image EXIF metadata.
 * Uses exif-reader for full EXIF parsing including GPS coordinates.
 * @param {string} inputPath - Path to image file
 * @returns {{ date: string|null, latitude: number|null, longitude: number|null }}
 */
export async function extractImageMetadata(inputPath) {
  try {
    const meta = await sharp(inputPath, { failOn: 'none' }).metadata();
    if (!meta.exif) return { date: null, latitude: null, longitude: null };

    const exif = exifReader(meta.exif);

    // Date: prefer DateTimeOriginal, fall back to DateTime
    let date = null;
    const dateObj = exif.Photo?.DateTimeOriginal || exif.Image?.DateTime || exif.exif?.DateTimeOriginal;
    if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
      date = dateObj.toISOString().split('T')[0];
    }

    // GPS coordinates
    let latitude = null, longitude = null;
    const gps = exif.GPSInfo || exif.gps;
    if (gps?.GPSLatitude && gps?.GPSLongitude) {
      latitude = dmsToDecimal(gps.GPSLatitude, gps.GPSLatitudeRef);
      longitude = dmsToDecimal(gps.GPSLongitude, gps.GPSLongitudeRef);
    }

    return { date, latitude, longitude };
  } catch {
    return { date: null, latitude: null, longitude: null };
  }
}

// Convert GPS DMS (degrees/minutes/seconds) to decimal
function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  let decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (ref === 'S' || ref === 'W') decimal = -decimal;
  return Math.round(decimal * 10000000) / 10000000;
}
