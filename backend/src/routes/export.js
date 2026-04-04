import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { AppError } from '../utils/errors.js';
import { config } from '../config/index.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const router = Router();

// In-memory job tracker (short-lived, cleaned up automatically)
const exportJobs = new Map();

// Cleanup old temp files (> 1 hour)
function cleanupOldExports() {
  const tempDir = path.join(config.uploads?.dir || '/app/uploads', 'temp');
  if (!fs.existsSync(tempDir)) return;
  const now = Date.now();
  for (const file of fs.readdirSync(tempDir)) {
    if (!file.startsWith('export-')) continue;
    const filePath = path.join(tempDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 3600000) fs.unlinkSync(filePath);
    } catch {}
  }
  // Clean stale jobs from memory
  for (const [id, job] of exportJobs) {
    if (now - job.createdAt > 3600000) exportJobs.delete(id);
  }
}

// ── Helper: query all tenant data ──

async function queryAllData(tenantId) {
  // Contacts with photos and fields
  const contacts = await db('contacts')
    .where({ tenant_id: tenantId }).whereNull('deleted_at')
    .select('uuid', 'first_name', 'last_name', 'nickname', 'birth_day', 'birth_month', 'birth_year',
      'deceased_date', 'how_we_met', 'notes', 'is_favorite', 'visibility',
      'last_contacted_at', 'created_at', 'updated_at');

  const contactIds = await db('contacts').where({ tenant_id: tenantId }).whereNull('deleted_at').select('id', 'uuid');
  const idToUuid = new Map(contactIds.map(c => [c.id, c.uuid]));
  const uuidToId = new Map(contactIds.map(c => [c.uuid, c.id]));

  const contactPhotos = await db('contact_photos')
    .where({ tenant_id: tenantId })
    .select('contact_id', 'file_path', 'thumbnail_path', 'is_primary', 'caption', 'taken_at', 'sort_order');

  const contactFields = await db('contact_fields')
    .join('contact_field_types', 'contact_fields.field_type_id', 'contact_field_types.id')
    .whereIn('contact_fields.contact_id', [...idToUuid.keys()])
    .select('contact_fields.contact_id', 'contact_field_types.name as type', 'contact_fields.value', 'contact_fields.label');

  // Attach photos and fields to contacts
  const photosByContact = new Map();
  for (const p of contactPhotos) {
    if (!photosByContact.has(p.contact_id)) photosByContact.set(p.contact_id, []);
    photosByContact.get(p.contact_id).push({ file_path: p.file_path, thumbnail_path: p.thumbnail_path, is_primary: p.is_primary, caption: p.caption, taken_at: p.taken_at, sort_order: p.sort_order });
  }
  const fieldsByContact = new Map();
  for (const f of contactFields) {
    if (!fieldsByContact.has(f.contact_id)) fieldsByContact.set(f.contact_id, []);
    fieldsByContact.get(f.contact_id).push({ type: f.type, value: f.value, label: f.label });
  }

  const contactsExport = contacts.map(c => {
    const id = uuidToId.get(c.uuid);
    return { ...c, photos: photosByContact.get(id) || [], fields: fieldsByContact.get(id) || [] };
  });

  // Relationships
  const relationships = await db('relationships')
    .join('relationship_types', 'relationships.relationship_type_id', 'relationship_types.id')
    .join('contacts as c1', 'relationships.contact_id', 'c1.id')
    .join('contacts as c2', 'relationships.related_contact_id', 'c2.id')
    .where({ 'relationships.tenant_id': tenantId })
    .select('c1.uuid as contact_uuid', 'c2.uuid as related_contact_uuid',
      'relationship_types.name as type', 'relationship_types.inverse_name',
      'relationships.start_date', 'relationships.end_date', 'relationships.notes');

  // Posts with media, comments, reactions
  const posts = await db('posts')
    .where({ tenant_id: tenantId }).whereNull('deleted_at')
    .select('id', 'uuid', 'body', 'post_date', 'contact_id', 'company_id', 'visibility', 'created_at');

  const postIds = posts.map(p => p.id);

  const postMedia = postIds.length ? await db('post_media')
    .whereIn('post_id', postIds)
    .select('post_id', 'file_path', 'thumbnail_path', 'file_type', 'original_name') : [];

  const postComments = postIds.length ? await db('post_comments')
    .whereIn('post_id', postIds)
    .select('post_id', 'body', 'contact_id', 'created_at') : [];

  const postReactions = postIds.length ? await db('post_reactions')
    .whereIn('post_id', postIds)
    .select('post_id', 'emoji', 'contact_id') : [];

  const postContacts = postIds.length ? await db('post_contacts')
    .whereIn('post_id', postIds)
    .select('post_id', 'contact_id') : [];

  const postLinkPreviews = postIds.length ? await db('post_link_previews')
    .whereIn('post_id', postIds)
    .select('post_id', 'url', 'title', 'description', 'image_url', 'site_name') : [];

  // Build post ID → uuid map
  const postIdToUuid = new Map(posts.map(p => [p.id, p.uuid]));

  // Company IDs for resolving
  const companyIds = await db('companies').where({ tenant_id: tenantId }).select('id', 'uuid');
  const companyIdToUuid = new Map(companyIds.map(c => [c.id, c.uuid]));

  const postsExport = posts.map(p => ({
    uuid: p.uuid,
    body: p.body,
    post_date: p.post_date,
    contact_uuid: idToUuid.get(p.contact_id) || null,
    company_uuid: companyIdToUuid.get(p.company_id) || null,
    visibility: p.visibility,
    created_at: p.created_at,
    media: postMedia.filter(m => m.post_id === p.id).map(m => ({ file_path: m.file_path, thumbnail_path: m.thumbnail_path, file_type: m.file_type, original_name: m.original_name })),
    comments: postComments.filter(c => c.post_id === p.id).map(c => ({ body: c.body, contact_uuid: idToUuid.get(c.contact_id) || null, created_at: c.created_at })),
    reactions: postReactions.filter(r => r.post_id === p.id).map(r => ({ emoji: r.emoji, contact_uuid: idToUuid.get(r.contact_id) || null })),
    tagged_contacts: postContacts.filter(tc => tc.post_id === p.id).map(tc => idToUuid.get(tc.contact_id)).filter(Boolean),
    link_preview: postLinkPreviews.find(lp => lp.post_id === p.id) || null,
  }));

  // Companies/Groups
  const companies = await db('companies')
    .where({ tenant_id: tenantId })
    .select('uuid', 'name', 'type', 'description', 'industry', 'website', 'phone', 'email',
      'notes', 'org_number', 'logo_path', 'address', 'latitude', 'longitude', 'parent_id', 'created_at');

  const companyPhotos = await db('company_photos')
    .where({ tenant_id: tenantId })
    .select('company_id', 'file_path', 'thumbnail_path', 'is_primary', 'caption', 'taken_at');

  const contactCompanies = await db('contact_companies')
    .where({ tenant_id: tenantId })
    .select('contact_id', 'company_id', 'title', 'start_date', 'end_date');

  const companiesExport = companies.map(c => {
    const compId = companyIds.find(ci => ci.uuid === c.uuid)?.id;
    return {
      ...c,
      parent_uuid: compId ? companyIdToUuid.get(companies.find(p => { const pid = companyIds.find(ci => ci.uuid === p.uuid)?.id; return pid === c.parent_id; })?.parent_id) : null,
      photos: companyPhotos.filter(p => p.company_id === compId).map(p => ({ file_path: p.file_path, thumbnail_path: p.thumbnail_path, is_primary: p.is_primary, caption: p.caption, taken_at: p.taken_at })),
      members: contactCompanies.filter(cc => cc.company_id === compId).map(cc => ({ contact_uuid: idToUuid.get(cc.contact_id), title: cc.title, start_date: cc.start_date, end_date: cc.end_date })),
    };
  });

  // Fix parent_uuid properly
  const companyUuidById = new Map(companyIds.map(c => [c.id, c.uuid]));
  for (const c of companiesExport) {
    const orig = companies.find(oc => oc.uuid === c.uuid);
    c.parent_uuid = orig?.parent_id ? companyUuidById.get(orig.parent_id) || null : null;
    delete c.parent_id;
  }

  // Labels
  const labels = await db('labels').where({ tenant_id: tenantId })
    .select('name', 'color', 'category', 'id');
  const contactLabels = await db('contact_labels')
    .whereIn('label_id', labels.map(l => l.id))
    .select('label_id', 'contact_id');

  const labelsExport = labels.map(l => ({
    name: l.name, color: l.color, category: l.category,
    contacts: contactLabels.filter(cl => cl.label_id === l.id).map(cl => idToUuid.get(cl.contact_id)).filter(Boolean),
  }));

  // Addresses
  const addresses = await db('addresses').where({ tenant_id: tenantId })
    .select('id', 'street', 'city', 'postal_code', 'country', 'latitude', 'longitude', 'created_at');
  const contactAddresses = await db('contact_addresses')
    .whereIn('address_id', addresses.map(a => a.id))
    .select('address_id', 'contact_id', 'label', 'is_primary', 'moved_in_at', 'moved_out_at');

  const addressesExport = addresses.map(a => ({
    id: a.id, street: a.street, city: a.city, postal_code: a.postal_code, country: a.country,
    latitude: a.latitude, longitude: a.longitude, created_at: a.created_at,
    residents: contactAddresses.filter(ca => ca.address_id === a.id).map(ca => ({
      contact_uuid: idToUuid.get(ca.contact_id), label: ca.label, is_primary: ca.is_primary,
      moved_in_at: ca.moved_in_at, moved_out_at: ca.moved_out_at,
    })),
  }));

  // Life events
  const lifeEvents = await db('life_events')
    .join('life_event_types', 'life_events.event_type_id', 'life_event_types.id')
    .where({ 'life_events.tenant_id': tenantId })
    .select('life_events.id', 'life_events.contact_id', 'life_event_types.name as type',
      'life_events.event_date', 'life_events.description', 'life_events.remind_annually');
  const lifeEventContacts = await db('life_event_contacts')
    .whereIn('life_event_id', lifeEvents.map(e => e.id))
    .select('life_event_id', 'contact_id');

  const lifeEventsExport = lifeEvents.map(e => ({
    type: e.type, event_date: e.event_date, description: e.description, remind_annually: e.remind_annually,
    contact_uuid: idToUuid.get(e.contact_id),
    linked_contacts: lifeEventContacts.filter(lc => lc.life_event_id === e.id).map(lc => idToUuid.get(lc.contact_id)).filter(Boolean),
  }));

  // Reminders
  const reminders = await db('reminders').where({ tenant_id: tenantId })
    .select('contact_id', 'title', 'reminder_date', 'is_recurring', 'is_completed', 'created_at');
  const remindersExport = reminders.map(r => ({
    ...r, contact_uuid: idToUuid.get(r.contact_id), contact_id: undefined,
  }));

  // Gifts
  const giftEvents = await db('gift_events').where({ tenant_id: tenantId })
    .select('id', 'uuid', 'name', 'event_type', 'event_date', 'honoree_contact_id', 'notes');
  const giftProducts = await db('gift_products').where({ tenant_id: tenantId })
    .select('id', 'uuid', 'name', 'description', 'url', 'image_url', 'default_price', 'currency_code');
  const giftProductLinks = await db('gift_product_links')
    .whereIn('product_id', giftProducts.map(p => p.id))
    .select('product_id', 'store_name', 'url', 'price');
  const giftOrders = await db('gift_orders').where({ tenant_id: tenantId })
    .select('id', 'uuid', 'event_id', 'product_id', 'title', 'status', 'order_type', 'price', 'currency_code', 'notes', 'visibility');
  const giftParticipants = await db('gift_order_participants')
    .whereIn('order_id', giftOrders.map(o => o.id))
    .select('order_id', 'contact_id', 'role');
  const giftWishlists = await db('gift_wishlists').where({ tenant_id: tenantId })
    .select('id', 'uuid', 'contact_id', 'name', 'is_default', 'visibility');
  const giftWishlistItems = await db('gift_wishlist_items')
    .whereIn('wishlist_id', giftWishlists.map(w => w.id))
    .select('wishlist_id', 'product_id', 'title', 'priority', 'notes', 'is_fulfilled');

  const productUuidById = new Map(giftProducts.map(p => [p.id, p.uuid]));
  const eventUuidById = new Map(giftEvents.map(e => [e.id, e.uuid]));

  const giftsExport = {
    events: giftEvents.map(e => ({
      uuid: e.uuid, name: e.name, event_type: e.event_type, event_date: e.event_date,
      honoree_contact_uuid: idToUuid.get(e.honoree_contact_id) || null, notes: e.notes,
    })),
    products: giftProducts.map(p => ({
      uuid: p.uuid, name: p.name, description: p.description, url: p.url, image_url: p.image_url,
      default_price: p.default_price, currency_code: p.currency_code,
      links: giftProductLinks.filter(l => l.product_id === p.id).map(l => ({ store_name: l.store_name, url: l.url, price: l.price })),
    })),
    orders: giftOrders.map(o => ({
      uuid: o.uuid, event_uuid: eventUuidById.get(o.event_id) || null,
      product_uuid: productUuidById.get(o.product_id) || null,
      title: o.title, status: o.status, order_type: o.order_type, price: o.price, currency_code: o.currency_code,
      notes: o.notes, visibility: o.visibility,
      participants: giftParticipants.filter(p => p.order_id === o.id).map(p => ({ contact_uuid: idToUuid.get(p.contact_id), role: p.role })),
    })),
    wishlists: giftWishlists.map(w => ({
      uuid: w.uuid, contact_uuid: idToUuid.get(w.contact_id), name: w.name, is_default: w.is_default, visibility: w.visibility,
      items: giftWishlistItems.filter(i => i.wishlist_id === w.id).map(i => ({
        product_uuid: productUuidById.get(i.product_id) || null, title: i.title, priority: i.priority, notes: i.notes, is_fulfilled: i.is_fulfilled,
      })),
    })),
  };

  return {
    contacts: contactsExport,
    relationships,
    posts: postsExport,
    companies: companiesExport,
    labels: labelsExport,
    addresses: addressesExport,
    lifeEvents: lifeEventsExport,
    reminders: remindersExport,
    gifts: giftsExport,
  };
}

// Collect all media file paths from the data
function collectMediaPaths(data) {
  const paths = new Set();
  for (const c of data.contacts) {
    for (const p of c.photos) { paths.add(p.file_path); paths.add(p.thumbnail_path); }
  }
  for (const p of data.posts) {
    for (const m of p.media) { paths.add(m.file_path); paths.add(m.thumbnail_path); }
  }
  for (const c of data.companies) {
    if (c.logo_path) paths.add(c.logo_path);
    for (const p of c.photos) { paths.add(p.file_path); paths.add(p.thumbnail_path); }
  }
  return [...paths].filter(Boolean);
}

// ── GET /api/export/data — instant JSON-only ZIP download ──

router.get('/data', async (req, res, next) => {
  try {
    const data = await queryAllData(req.tenantId);
    const today = new Date().toISOString().split('T')[0];

    const manifest = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      format: 'data-only',
      stats: {
        contacts: data.contacts.length,
        relationships: data.relationships.length,
        posts: data.posts.length,
        companies: data.companies.length,
        labels: data.labels.length,
        addresses: data.addresses.length,
        lifeEvents: data.lifeEvents.length,
        reminders: data.reminders.length,
        giftEvents: data.gifts.events.length,
        giftProducts: data.gifts.products.length,
        giftOrders: data.gifts.orders.length,
      },
    };

    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.addFile('contacts.json', Buffer.from(JSON.stringify(data.contacts, null, 2)));
    zip.addFile('relationships.json', Buffer.from(JSON.stringify(data.relationships, null, 2)));
    zip.addFile('posts.json', Buffer.from(JSON.stringify(data.posts, null, 2)));
    zip.addFile('companies.json', Buffer.from(JSON.stringify(data.companies, null, 2)));
    zip.addFile('labels.json', Buffer.from(JSON.stringify(data.labels, null, 2)));
    zip.addFile('addresses.json', Buffer.from(JSON.stringify(data.addresses, null, 2)));
    zip.addFile('life-events.json', Buffer.from(JSON.stringify(data.lifeEvents, null, 2)));
    zip.addFile('reminders.json', Buffer.from(JSON.stringify(data.reminders, null, 2)));
    zip.addFile('gifts.json', Buffer.from(JSON.stringify(data.gifts, null, 2)));

    const buffer = zip.toBuffer();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="whoareyou-export-${today}.zip"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  } catch (err) { next(err); }
});

// ── POST /api/export/full — start full export with media ──

router.post('/full', async (req, res, next) => {
  try {
    // Rate limit: one active job per user
    for (const [id, job] of exportJobs) {
      if (job.userId === req.user.id && job.tenantId === req.tenantId && job.status === 'running') {
        return res.json({ jobId: id, status: 'running', progress: job.progress });
      }
    }

    cleanupOldExports();

    const jobId = uuidv4();
    const job = { userId: req.user.id, tenantId: req.tenantId, status: 'running', progress: 0, filePath: null, createdAt: Date.now() };
    exportJobs.set(jobId, job);

    res.json({ jobId, status: 'running', progress: 0 });

    // Run in background (don't await)
    runFullExport(jobId, job, req.tenantId).catch(err => {
      job.status = 'failed';
      job.error = err.message;
    });
  } catch (err) { next(err); }
});

async function runFullExport(jobId, job, tenantId) {
  const uploadsDir = config.uploads?.dir || '/app/uploads';
  const tempDir = path.join(uploadsDir, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  job.progress = 10;
  const data = await queryAllData(tenantId);

  job.progress = 30;
  const today = new Date().toISOString().split('T')[0];

  const manifest = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    format: 'full',
    stats: {
      contacts: data.contacts.length,
      relationships: data.relationships.length,
      posts: data.posts.length,
      companies: data.companies.length,
      labels: data.labels.length,
      addresses: data.addresses.length,
      lifeEvents: data.lifeEvents.length,
      reminders: data.reminders.length,
      giftEvents: data.gifts.events.length,
      giftProducts: data.gifts.products.length,
      giftOrders: data.gifts.orders.length,
    },
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  zip.addFile('contacts.json', Buffer.from(JSON.stringify(data.contacts, null, 2)));
  zip.addFile('relationships.json', Buffer.from(JSON.stringify(data.relationships, null, 2)));
  zip.addFile('posts.json', Buffer.from(JSON.stringify(data.posts, null, 2)));
  zip.addFile('companies.json', Buffer.from(JSON.stringify(data.companies, null, 2)));
  zip.addFile('labels.json', Buffer.from(JSON.stringify(data.labels, null, 2)));
  zip.addFile('addresses.json', Buffer.from(JSON.stringify(data.addresses, null, 2)));
  zip.addFile('life-events.json', Buffer.from(JSON.stringify(data.lifeEvents, null, 2)));
  zip.addFile('reminders.json', Buffer.from(JSON.stringify(data.reminders, null, 2)));
  zip.addFile('gifts.json', Buffer.from(JSON.stringify(data.gifts, null, 2)));

  job.progress = 50;

  // Add media files
  const mediaPaths = collectMediaPaths(data);
  let processed = 0;
  for (const mediaPath of mediaPaths) {
    // mediaPath is like /uploads/contacts/uuid/file.webp
    const relativePath = mediaPath.replace(/^\/uploads\//, '');
    const absolutePath = path.join(uploadsDir, relativePath);
    if (fs.existsSync(absolutePath)) {
      zip.addLocalFile(absolutePath, 'media/' + path.dirname(relativePath));
    }
    processed++;
    job.progress = 50 + Math.floor((processed / mediaPaths.length) * 45);
  }

  const filePath = path.join(tempDir, `export-${jobId}.zip`);
  zip.writeZip(filePath);
  job.filePath = filePath;
  job.status = 'complete';
  job.progress = 100;
}

// ── GET /api/export/status/:jobId — poll job status ──

router.get('/status/:jobId', (req, res) => {
  const job = exportJobs.get(req.params.jobId);
  if (!job || job.userId !== req.user.id || job.tenantId !== req.tenantId) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ status: job.status, progress: job.progress });
});

// ── GET /api/export/download/:jobId — download completed ZIP ──

router.get('/download/:jobId', (req, res) => {
  const job = exportJobs.get(req.params.jobId);
  if (!job || job.userId !== req.user.id || job.tenantId !== req.tenantId) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (job.status !== 'complete' || !job.filePath) {
    return res.status(400).json({ error: 'Export not ready' });
  }

  const today = new Date().toISOString().split('T')[0];
  res.download(job.filePath, `whoareyou-full-export-${today}.zip`, (err) => {
    // Clean up after download (or on error)
    try { fs.unlinkSync(job.filePath); } catch {}
    exportJobs.delete(req.params.jobId);
  });
});

export default router;
