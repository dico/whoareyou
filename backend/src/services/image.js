import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config/index.js';

const { dir: uploadsDir, image: imageConfig } = config.uploads;

/**
 * Process an uploaded image:
 * - Resize to max width
 * - Generate thumbnail
 * - Convert to WebP
 * - Strip EXIF metadata
 *
 * @param {string} inputPath - Path to uploaded temp file
 * @param {string} subDir - Subdirectory (e.g. 'contacts/uuid' or 'posts/uuid')
 * @param {string} filename - Base filename (without extension)
 * @returns {{ filePath: string, thumbnailPath: string }}
 */
export async function processImage(inputPath, subDir, filename, { keepOriginal = false } = {}) {
  const outDir = path.join(uploadsDir, subDir);
  await fs.mkdir(outDir, { recursive: true });

  const mainFile = `${filename}.webp`;
  const thumbFile = `${filename}_thumb.webp`;
  const mainPath = path.join(outDir, mainFile);
  const thumbPath = path.join(outDir, thumbFile);

  // Main image: resize + webp + strip metadata
  await sharp(inputPath)
    .rotate() // auto-rotate based on EXIF
    .resize(imageConfig.maxWidth, null, { withoutEnlargement: true })
    .webp({ quality: imageConfig.quality })
    .toFile(mainPath);

  // Thumbnail: square crop + webp
  await sharp(inputPath)
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
    thumbnailPath: `/uploads/${subDir}/${thumbFile}`,
  };
}
