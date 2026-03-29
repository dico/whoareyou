import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { processImage } from '../services/image.js';
import { config } from '../config/index.js';

const router = Router();

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.webm'];

const uploadZip = multer({
  dest: path.join(config.uploads.dir, 'temp'),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB for ZIP files
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new AppError('Only ZIP files are allowed', 400));
    }
  },
});

// POST /api/import/momentgarden — import MomentGarden ZIP export
router.post('/momentgarden', uploadZip.single('zip'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No ZIP file uploaded', 400);
    if (!req.body.contact_uuid) throw new AppError('contact_uuid is required', 400);

    // Verify admin
    if (req.user.role !== 'admin' && !req.user.isSystemAdmin) {
      throw new AppError('Admin access required', 403);
    }

    const contact = await db('contacts')
      .where({ uuid: req.body.contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    // Extract ZIP
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();

    // Find captions.txt
    const captionsEntry = entries.find(e => e.entryName.endsWith('captions.txt'));
    if (!captionsEntry) throw new AppError('No captions.txt found in ZIP', 400);

    const captionsText = captionsEntry.getData().toString('utf8');
    const lines = captionsText.trim().split('\n').filter(l => l.trim());

    // Parse captions: "DATE TIME : FILENAME : CAPTION"
    const moments = [];
    for (const line of lines) {
      const parts = line.split(' : ');
      if (parts.length >= 3) {
        moments.push({
          date: parts[0].trim(),
          filename: parts[1].trim(),
          caption: parts.slice(2).join(' : ').trim(),
        });
      }
    }

    // Build a map of ZIP entries by filename for quick lookup
    const fileMap = new Map();
    for (const entry of entries) {
      const name = entry.entryName.split('/').pop();
      if (name && !entry.isDirectory) fileMap.set(name, entry);
    }

    // Fetch existing imported filenames for this contact to detect duplicates
    const existingMedia = await db('post_media')
      .join('posts', 'post_media.post_id', 'posts.id')
      .where({ 'posts.contact_id': contact.id, 'posts.tenant_id': req.tenantId })
      .whereNotNull('post_media.original_name')
      .select('post_media.original_name');
    const importedNames = new Set(existingMedia.map(m => m.original_name));

    let postsCreated = 0;
    let mediaImported = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const moment of moments) {
      const ext = path.extname(moment.filename).toLowerCase();
      const isImage = IMAGE_EXTS.includes(ext);
      const isVideo = VIDEO_EXTS.includes(ext);

      if (!isImage && !isVideo) {
        console.log(`MomentGarden import: skipping unsupported file type "${ext}" for ${moment.filename}`);
        skipped++;
        continue;
      }

      // Skip duplicates (already imported)
      if (importedNames.has(moment.filename)) { duplicates++; continue; }

      // Find the file in the ZIP
      const fileEntry = fileMap.get(moment.filename);
      if (!fileEntry) {
        console.log(`MomentGarden import: file not found in ZIP: ${moment.filename}`);
        skipped++;
        continue;
      }

      // Mark as imported to prevent duplicates within same batch
      importedNames.add(moment.filename);

      // Create the post
      const postUuid = uuidv4();
      const [postId] = await db('posts').insert({
        uuid: postUuid,
        tenant_id: req.tenantId,
        created_by: req.user.id,
        contact_id: contact.id,
        body: moment.caption || '',
        post_date: moment.date,
        visibility: 'shared',
      });

      postsCreated++;

      // Extract file to temp, then process
      const tempPath = path.join(config.uploads.dir, 'temp', `mg_${Date.now()}_${moment.filename}`);
      const buffer = fileEntry.getData();
      await fs.writeFile(tempPath, buffer);

      try {
        let filePath, thumbnailPath, fileType;
        const outDir = `posts/${postUuid}`;

        if (isImage) {
          const processed = await processImage(tempPath, outDir, `media_0`);
          filePath = processed.filePath;
          thumbnailPath = processed.thumbnailPath;
          fileType = 'image/webp';
        } else {
          // Video — store as-is
          const destDir = path.join(config.uploads.dir, outDir);
          await fs.mkdir(destDir, { recursive: true });
          const destName = `video_0${ext}`;
          await fs.rename(tempPath, path.join(destDir, destName));
          filePath = `/uploads/${outDir}/${destName}`;
          thumbnailPath = null;
          fileType = `video/${ext.slice(1) === 'mov' ? 'quicktime' : ext.slice(1)}`;
        }

        // Extract MomentGarden moment ID from filename (e.g. "21483371_cipaybmd5uih6j0cphm684bgk.JPEG")
        const momentIdMatch = moment.filename.match(/^(\d+)_/);
        const externalId = momentIdMatch ? `mg:${momentIdMatch[1]}` : null;

        await db('post_media').insert({
          post_id: postId,
          tenant_id: req.tenantId,
          file_path: filePath,
          thumbnail_path: thumbnailPath,
          file_type: fileType,
          file_size: buffer.length,
          original_name: moment.filename,
          external_id: externalId,
          sort_order: 0,
        });

        mediaImported++;
      } catch (err) {
        // Clean up temp file on error
        await fs.unlink(tempPath).catch(() => {});
        console.error(`MomentGarden import: failed to process ${moment.filename}:`, err.message);
        skipped++;
      }
    }

    // Update last_contacted_at on the contact
    if (postsCreated) {
      await db('contacts').where({ id: contact.id }).update({ last_contacted_at: db.fn.now() });
    }

    // Clean up uploaded ZIP
    await fs.unlink(req.file.path).catch(() => {});

    res.json({ posts_created: postsCreated, media_imported: mediaImported, skipped, duplicates });
  } catch (err) {
    // Clean up on error
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    next(err);
  }
});

// GET /api/import/momentgarden/sync-ids — list moment IDs with sync status
// Query: ?contact_uuid=...&only_unsynced=true&limit=50
router.get('/momentgarden/sync-ids', async (req, res, next) => {
  try {
    if (!req.query.contact_uuid) throw new AppError('contact_uuid is required', 400);

    const contact = await db('contacts')
      .where({ uuid: req.query.contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    let query = db('post_media')
      .join('posts', 'post_media.post_id', 'posts.id')
      .where({ 'posts.contact_id': contact.id, 'posts.tenant_id': req.tenantId })
      .whereNotNull('post_media.external_id')
      .where('post_media.external_id', 'like', 'mg:%');

    const allMedia = await query.clone().select('post_media.external_id', 'posts.id as post_id', 'post_media.id as media_id');

    const total = allMedia.length;
    const synced = allMedia.filter(m => m.external_id.includes(':synced')).length;
    const unsynced = total - synced;

    let moments = allMedia;
    if (req.query.only_unsynced === 'true') {
      moments = moments.filter(m => !m.external_id.includes(':synced'));
    }

    const limit = parseInt(req.query.limit) || 0;
    if (limit > 0) moments = moments.slice(0, limit);

    res.json({
      moments: moments.map(m => ({
        moment_id: m.external_id.replace('mg:', '').replace(':synced', ''),
        post_id: m.post_id,
        media_id: m.media_id,
        synced: m.external_id.includes(':synced'),
      })),
      total,
      synced,
      unsynced,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/momentgarden/discover-users — scan loves to find MG users + attempt contact matching
router.post('/momentgarden/discover-users', async (req, res, next) => {
  try {
    const { cookie, contact_uuid } = req.body;
    if (!cookie || !contact_uuid) throw new AppError('cookie and contact_uuid are required', 400);

    const contact = await db('contacts')
      .where({ uuid: contact_uuid, tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!contact) throw new AppError('Contact not found', 404);

    // Format cookie
    const cookieHeader = cookie.includes('CakeCookie') ? cookie : `CakeCookie%5BAuth%5D%5BUser%5D=${cookie}`;

    // Get moment IDs
    const mgMedia = await db('post_media')
      .join('posts', 'post_media.post_id', 'posts.id')
      .where({ 'posts.contact_id': contact.id, 'posts.tenant_id': req.tenantId })
      .whereNotNull('post_media.external_id')
      .where('post_media.external_id', 'like', 'mg:%')
      .select('post_media.external_id');

    // Sample up to 20 moments to discover users
    const sampleIds = mgMedia
      .map(m => m.external_id.replace('mg:', ''))
      .sort(() => Math.random() - 0.5)
      .slice(0, 20);

    const usersMap = new Map(); // mg_user_id → { alias, nickname }

    for (const momentId of sampleIds) {
      try {
        const res = await fetch(`https://momentgarden.com/api/loves/?moment=${momentId}`, {
          headers: { 'Cookie': cookieHeader },
        });
        const data = await res.json();
        if (data.status === 1 && data.loves) {
          for (const love of data.loves) {
            if (!usersMap.has(love.user_id)) {
              usersMap.set(love.user_id, {
                mg_user_id: love.user_id,
                alias: love.alias?.trim() || '',
                nickname: love.nickname?.trim() || '',
              });
            }
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 150));
    }

    // Also scan comments from a few moments
    for (const momentId of sampleIds.slice(0, 10)) {
      try {
        const res = await fetch(`https://momentgarden.com/comments/slideshow/${momentId}`, {
          headers: { 'Cookie': cookieHeader },
        });
        const html = await res.text();
        if (html && !html.includes('Invalid access')) {
          const matches = [...html.matchAll(/class='comment_title'>(.*?)<\/div>/g)];
          for (const m of matches) {
            const nick = m[1].trim();
            // Check if any existing user has this nickname
            const existing = [...usersMap.values()].find(u => u.nickname === nick);
            if (!existing) {
              usersMap.set(`comment_${nick}`, { mg_user_id: null, alias: '', nickname: nick });
            }
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 150));
    }

    const mgUsers = [...usersMap.values()];

    // Attempt to match against WhoareYou contacts
    const allContacts = await db('contacts')
      .where({ tenant_id: req.tenantId })
      .whereNull('deleted_at')
      .select('id', 'uuid', 'first_name', 'last_name',
        db.raw(`(SELECT cp.thumbnail_path FROM contact_photos cp WHERE cp.contact_id = contacts.id AND cp.is_primary = true LIMIT 1) as avatar`));

    // Get related contacts for the target contact (family, friends etc.) — these get priority
    const relatedIds = new Set();
    const rels = await db('relationships')
      .where({ tenant_id: req.tenantId })
      .where(function() { this.where('contact_id', contact.id).orWhere('related_contact_id', contact.id); })
      .select('contact_id', 'related_contact_id');
    for (const r of rels) {
      relatedIds.add(r.contact_id === contact.id ? r.related_contact_id : r.contact_id);
    }

    for (const mgUser of mgUsers) {
      if (!mgUser.alias && !mgUser.nickname) continue;

      // Strategy 1: Exact full name match (alias = "Veronica Karlsen")
      if (mgUser.alias) {
        const aliasLower = mgUser.alias.toLowerCase().trim();
        const match = allContacts.find(c =>
          `${c.first_name} ${c.last_name || ''}`.toLowerCase().trim() === aliasLower
        );
        if (match) {
          mgUser.suggested_contact = { uuid: match.uuid, first_name: match.first_name, last_name: match.last_name, avatar: match.avatar };
          continue;
        }
      }

      // Strategy 2: Exact first+last match with alias parts (for "Anne Lisbeth Johannesen" → first_name="Anne Lisbeth", last_name="Johannesen")
      if (mgUser.alias) {
        const parts = mgUser.alias.trim().split(/\s+/);
        for (let split = 1; split < parts.length; split++) {
          const first = parts.slice(0, split).join(' ').toLowerCase();
          const last = parts.slice(split).join(' ').toLowerCase();
          const match = allContacts.find(c =>
            c.first_name.toLowerCase() === first && c.last_name?.toLowerCase() === last
          );
          if (match) {
            mgUser.suggested_contact = { uuid: match.uuid, first_name: match.first_name, last_name: match.last_name, avatar: match.avatar };
            break;
          }
        }
        if (mgUser.suggested_contact) continue;
      }

      // Strategy 3: Fuzzy match — first_name contains search term, prioritize related contacts
      const searchTerms = [mgUser.alias, mgUser.nickname].filter(Boolean);
      for (const term of searchTerms) {
        const termLower = term.toLowerCase().trim();
        const matches = allContacts.filter(c => {
          const fullName = `${c.first_name} ${c.last_name || ''}`.toLowerCase().trim();
          return c.first_name.toLowerCase() === termLower
            || fullName === termLower
            || c.first_name.toLowerCase().startsWith(termLower)
            || termLower.startsWith(c.first_name.toLowerCase());
        });

        if (matches.length === 1) {
          mgUser.suggested_contact = { uuid: matches[0].uuid, first_name: matches[0].first_name, last_name: matches[0].last_name, avatar: matches[0].avatar };
          break;
        }

        // Multiple matches — prefer related contacts
        if (matches.length > 1) {
          const related = matches.find(c => relatedIds.has(c.id));
          if (related) {
            mgUser.suggested_contact = { uuid: related.uuid, first_name: related.first_name, last_name: related.last_name, avatar: related.avatar };
            break;
          }
        }
      }
    }

    res.json({ users: mgUsers, total_moments: mgMedia.length, sampled: sampleIds.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/momentgarden/cleanup — remove old MG reactions/comments without contact_id (before re-sync)
router.post('/momentgarden/cleanup', async (req, res, next) => {
  try {
    const deletedReactions = await db('post_reactions')
      .where({ tenant_id: req.tenantId })
      .whereNull('contact_id')
      .del();
    const deletedComments = await db('post_comments')
      .where({ tenant_id: req.tenantId })
      .whereNull('contact_id')
      .where('body', 'like', '[%] %')
      .del();
    res.json({
      message: `Cleaned up ${deletedReactions} reactions and ${deletedComments} comments without contact mapping. Ready for re-sync.`,
      deleted_reactions: deletedReactions,
      deleted_comments: deletedComments,
    });
  } catch (err) { next(err); }
});

// POST /api/import/momentgarden/sync-one — sync loves + comments for ONE moment
// Query param: ?dry_run=true → return data without saving
router.post('/momentgarden/sync-one', async (req, res, next) => {
  try {
    const { cookie: rawCookie, moment_id, post_id, user_map } = req.body;
    if (!rawCookie || !moment_id || !post_id) throw new AppError('cookie, moment_id and post_id are required', 400);

    const dryRun = req.query.dry_run === 'true';
    const cookie = rawCookie.includes('CakeCookie') ? rawCookie : `CakeCookie%5BAuth%5D%5BUser%5D=${rawCookie}`;

    let loves = 0;
    const lovesData = [];
    const commentsData = [];

    // Fetch loves
    try {
      const lovesRes = await fetch(`https://momentgarden.com/api/loves/?moment=${moment_id}`, {
        headers: { 'Cookie': cookie },
      });
      const data = await lovesRes.json();

      if (data.status === 1 && data.loves?.length) {
        loves = data.loves.length;
        for (const love of data.loves) {
          lovesData.push({ user_id: love.user_id, alias: love.alias?.trim(), nickname: love.nickname?.trim() });
        }

        if (!dryRun) {
          // Create one reaction per unique MG user (mapped to contacts)
          for (const love of data.loves) {
            const nickname = love.nickname?.trim() || love.alias?.trim();
            const contactUuid = nickname && user_map?.[nickname];
            let contactId = null;
            if (contactUuid) {
              const contact = await db('contacts').where({ uuid: contactUuid }).first();
              if (contact) contactId = contact.id;
            }
            // Check if this contact already reacted on this post
            const existing = contactId
              ? await db('post_reactions').where({ post_id, contact_id: contactId, emoji: '❤️' }).first()
              : await db('post_reactions').where({ post_id, user_id: req.user.id, emoji: '❤️', contact_id: null }).first();
            if (!existing) {
              await db('post_reactions').insert({
                post_id, user_id: contactId ? null : req.user.id, contact_id: contactId,
                tenant_id: req.tenantId, emoji: '❤️',
              }).catch(() => {});
            }
          }
        }
      }
    } catch {}

    // Fetch comments
    let comments = 0;
    try {
      const commentsRes = await fetch(`https://momentgarden.com/comments/slideshow/${moment_id}`, {
        headers: { 'Cookie': cookie },
      });
      const html = await commentsRes.text();

      if (html && !html.includes('Invalid access')) {
        const matches = [...html.matchAll(
          /class='comment_title'>(.*?)<\/div>\s*<div class='comment_comment'>(.*?)<\/div>\s*<span class='comment_created' data-d_string='(.*?)'/gs
        )];

        for (const match of matches) {
          const nickname = match[1].trim();
          const body = match[2].trim();
          const date = match[3].trim();
          if (!body) continue;

          commentsData.push({ nickname, body, date });

          if (!dryRun) {
            // Find mapped contact for this commenter
            const contactUuid = nickname && user_map?.[nickname];
            let contactId = null;
            if (contactUuid) {
              const contact = await db('contacts').where({ uuid: contactUuid }).first();
              if (contact) contactId = contact.id;
            }

            // Store comment — mapped contacts get clean body, unmapped keep [nickname] prefix
            const commentBody = contactId ? body : `[${nickname}] ${body}`;
            const existing = await db('post_comments')
              .where({ post_id, tenant_id: req.tenantId })
              .where('body', 'like', `%${body}%`).first();

            if (!existing) {
              await db('post_comments').insert({
                post_id, user_id: contactId ? null : req.user.id,
                contact_id: contactId, tenant_id: req.tenantId,
                body: commentBody,
                created_at: date || new Date(),
                updated_at: date || new Date(),
              });
              comments++;
            }
          }
        }
      }
    } catch {}

    if (dryRun) {
      res.json({ loves, loves_data: lovesData, comments_data: commentsData });
    } else {
      // Mark as synced (handle both mg:123 and mg:123:synced)
      await db('post_media')
        .where(function() {
          this.where('external_id', `mg:${moment_id}`)
            .orWhere('external_id', `mg:${moment_id}:synced`);
        })
        .update({ external_id: `mg:${moment_id}:synced` });
      res.json({ loves, comments });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
