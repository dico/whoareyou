/**
 * One-time migration script: Monica → WhoareYou
 *
 * Migrates contacts, relationships, notes (as posts), tags, addresses,
 * contact fields, and reminders from a Monica database.
 *
 * Usage: node src/migrate-monica.js
 *
 * Requires env vars: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
 * Plus: MONICA_DB=monica_backup (source database)
 */

import knex from 'knex';
import { v4 as uuidv4 } from 'uuid';

const TARGET_TENANT_ID = 1; // Your tenant
const TARGET_USER_ID = 1;   // Your user

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

// Map Monica IDs → WhoareYou IDs
const contactMap = new Map(); // monica_id → whoareyou_id
const labelMap = new Map();   // monica_tag_id → whoareyou_label_id

// Relationship type mapping: Monica name → WhoareYou relationship_type_id
const REL_TYPE_MAP = {
  'partner': 2,    // spouse
  'spouse': 2,
  'date': 7,       // friend (closest match)
  'lover': 2,      // spouse
  'inlovewith': 2,
  'ex': 7,         // friend
  'parent': 1,     // parent
  'child': 1,      // parent (inverse handled by direction)
  'sibling': 3,
  'grandparent': 4,
  'grandchild': 4, // grandparent (inverse)
  'uncle': 5,      // uncle_aunt
  'nephew': 5,     // uncle_aunt (inverse)
  'cousin': 6,
  'godfather': 7,  // friend (no direct match)
  'godson': 7,
  'friend': 7,
  'bestfriend': 7,
  'colleague': 9,
  'boss': 10,
  'mentor': 9,     // colleague
  'protege': 9,
  'ex-colleague': 9,
};

// Types where Monica stores the "child" direction but we need to flip
const INVERSE_TYPES = new Set(['child', 'grandchild', 'nephew', 'godson', 'lovedby', 'protege']);

async function migrate() {
  console.log('Starting Monica → WhoareYou migration...\n');

  // 1. Clear existing data for this tenant (except the user)
  console.log('Clearing existing data...');
  await app('post_contacts').whereIn('post_id',
    app('posts').where({ tenant_id: TARGET_TENANT_ID }).select('id')
  ).del();
  await app('post_media').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('posts').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('contact_labels').whereIn('contact_id',
    app('contacts').where({ tenant_id: TARGET_TENANT_ID }).select('id')
  ).del();
  await app('contact_fields').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('contact_addresses').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('relationships').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('contact_photos').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('reminders').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('addresses').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('contacts').where({ tenant_id: TARGET_TENANT_ID }).del();
  await app('labels').where({ tenant_id: TARGET_TENANT_ID }).del();

  // 2. Migrate tags → labels
  console.log('Migrating tags...');
  const tags = await monica('tags').where({ account_id: 1 });
  for (const tag of tags) {
    const [id] = await app('labels').insert({
      tenant_id: TARGET_TENANT_ID,
      name: tag.name,
      color: tag.name_slug ? `#${hashColor(tag.name)}` : '#6C757D',
    });
    labelMap.set(tag.id, id);
  }
  console.log(`  ${tags.length} tags migrated`);

  // 3. Migrate contacts
  console.log('Migrating contacts...');
  const contacts = await monica('contacts')
    .where({ account_id: 1 })
    .whereNull('deleted_at');

  // Fetch birthday dates
  const specialDates = await monica('special_dates').where({ account_id: 1 });
  const dateMap = new Map(specialDates.map((d) => [d.id, d.date]));

  for (const c of contacts) {
    const uuid = uuidv4();
    const dob = c.birthday_special_date_id ? dateMap.get(c.birthday_special_date_id) : null;

    const [id] = await app('contacts').insert({
      uuid,
      tenant_id: TARGET_TENANT_ID,
      created_by: TARGET_USER_ID,
      first_name: c.first_name || 'Unknown',
      last_name: c.last_name || null,
      nickname: c.nickname || null,
      date_of_birth: dob ? new Date(dob).toISOString().slice(0, 10) : null,
      how_we_met: [c.first_met_where, c.first_met_additional_info].filter(Boolean).join(' — ') || null,
      notes: c.description || null,
      is_favorite: !!c.is_starred,
      is_active: !c.is_partial,
      last_contacted_at: c.last_talked_to || null,
      created_at: c.created_at || new Date(),
      updated_at: c.updated_at || new Date(),
    });

    contactMap.set(c.id, id);
  }
  console.log(`  ${contacts.length} contacts migrated`);

  // 4. Migrate contact-tag associations
  console.log('Migrating contact tags...');
  const contactTags = await monica('contact_tag');
  let tagCount = 0;
  for (const ct of contactTags) {
    const contactId = contactMap.get(ct.contact_id);
    const labelId = labelMap.get(ct.tag_id);
    if (contactId && labelId) {
      await app('contact_labels').insert({ contact_id: contactId, label_id: labelId }).catch(() => {});
      tagCount++;
    }
  }
  console.log(`  ${tagCount} contact-tag associations migrated`);

  // 5. Migrate contact fields (phone, email, etc.)
  console.log('Migrating contact fields...');
  const monicaFieldTypes = await monica('contact_field_types').where({ account_id: 1 });
  const appFieldTypes = await app('contact_field_types').where({ is_system: true });

  // Map Monica field type → WhoareYou field type
  const fieldTypeMap = new Map();
  for (const mft of monicaFieldTypes) {
    const name = mft.name?.toLowerCase();
    const match = appFieldTypes.find((aft) =>
      aft.name === name || aft.protocol === mft.protocol
    );
    if (match) fieldTypeMap.set(mft.id, match.id);
  }

  const monicaFields = await monica('contact_fields').where({ account_id: 1 });
  let fieldCount = 0;
  for (const f of monicaFields) {
    const contactId = contactMap.get(f.contact_id);
    const fieldTypeId = fieldTypeMap.get(f.contact_field_type_id);
    if (contactId && fieldTypeId && f.data) {
      await app('contact_fields').insert({
        contact_id: contactId,
        tenant_id: TARGET_TENANT_ID,
        field_type_id: fieldTypeId,
        value: f.data,
        label: null,
        sort_order: 0,
      });
      fieldCount++;
    }
  }
  console.log(`  ${fieldCount} contact fields migrated`);

  // 6. Migrate addresses
  console.log('Migrating addresses...');
  const places = await monica('places').where({ account_id: 1 });
  const placeMap = new Map(); // monica place_id → whoareyou address_id

  for (const p of places) {
    if (!p.street && !p.city) continue;
    const [id] = await app('addresses').insert({
      tenant_id: TARGET_TENANT_ID,
      street: p.street || p.city || 'Unknown',
      street2: null,
      postal_code: p.postal_code || null,
      city: p.city || null,
      state: p.province || null,
      country: p.country || null,
      latitude: p.latitude || null,
      longitude: p.longitude || null,
    });
    placeMap.set(p.id, id);
  }

  const monicaAddresses = await monica('addresses').where({ account_id: 1 });
  let addrCount = 0;
  for (const a of monicaAddresses) {
    const contactId = contactMap.get(a.contact_id);
    const addressId = placeMap.get(a.place_id);
    if (contactId && addressId) {
      await app('contact_addresses').insert({
        contact_id: contactId,
        address_id: addressId,
        tenant_id: TARGET_TENANT_ID,
        label: a.name || 'Home',
        is_primary: true,
      });
      addrCount++;
    }
  }
  console.log(`  ${addrCount} addresses linked`);

  // 7. Migrate relationships
  console.log('Migrating relationships...');
  const monicaRelTypes = await monica('relationship_types').where({ account_id: 1 });
  const relTypeNameMap = new Map(monicaRelTypes.map((r) => [r.id, r.name]));

  const monicaRels = await monica('relationships').where({ account_id: 1 });
  const seenPairs = new Set();
  let relCount = 0;

  for (const r of monicaRels) {
    const typeName = relTypeNameMap.get(r.relationship_type_id);
    if (!typeName) continue;

    let contactId = contactMap.get(r.contact_is);
    let relatedId = contactMap.get(r.of_contact);
    if (!contactId || !relatedId) continue;

    // Flip if it's an inverse type
    if (INVERSE_TYPES.has(typeName)) {
      [contactId, relatedId] = [relatedId, contactId];
    }

    // Deduplicate (A→B and B→A for symmetric types)
    const pairKey = [Math.min(contactId, relatedId), Math.max(contactId, relatedId), REL_TYPE_MAP[typeName]].join('-');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const typeId = REL_TYPE_MAP[typeName];
    if (!typeId) continue;

    await app('relationships').insert({
      tenant_id: TARGET_TENANT_ID,
      contact_id: contactId,
      related_contact_id: relatedId,
      relationship_type_id: typeId,
    }).catch(() => {}); // Skip duplicates
    relCount++;
  }
  console.log(`  ${relCount} relationships migrated`);

  // 8. Migrate notes → posts
  console.log('Migrating notes as posts...');
  const notes = await monica('notes').where({ account_id: 1 });
  let noteCount = 0;
  for (const n of notes) {
    const contactId = contactMap.get(n.contact_id);
    if (!contactId || !n.body) continue;

    const uuid = uuidv4();
    const [postId] = await app('posts').insert({
      uuid,
      tenant_id: TARGET_TENANT_ID,
      created_by: TARGET_USER_ID,
      body: n.body,
      post_date: n.created_at || new Date(),
      created_at: n.created_at || new Date(),
      updated_at: n.updated_at || new Date(),
      contact_id: contactId, // Profile post — about this contact
    });

    // No need for post_contacts tag since it's a profile post
    noteCount++;
  }
  console.log(`  ${noteCount} notes migrated as posts`);

  // 9. Migrate activities → posts
  console.log('Migrating activities as posts...');
  const activities = await monica('activities').where({ account_id: 1 });
  const activityContacts = await monica('activity_contact');
  const actContactMap = new Map();
  for (const ac of activityContacts) {
    if (!actContactMap.has(ac.activity_id)) actContactMap.set(ac.activity_id, []);
    actContactMap.get(ac.activity_id).push(ac.contact_id);
  }

  let actCount = 0;
  for (const a of activities) {
    const body = [a.summary, a.description].filter(Boolean).join('\n\n');
    if (!body) continue;

    const uuid = uuidv4();
    const [postId] = await app('posts').insert({
      uuid,
      tenant_id: TARGET_TENANT_ID,
      created_by: TARGET_USER_ID,
      body,
      post_date: a.happened_at || a.created_at || new Date(),
      created_at: a.created_at || new Date(),
      updated_at: a.updated_at || new Date(),
    });

    const monicaContactIds = actContactMap.get(a.id) || [];
    for (const mcId of monicaContactIds) {
      const cId = contactMap.get(mcId);
      if (cId) {
        await app('post_contacts').insert({ post_id: postId, contact_id: cId }).catch(() => {});
      }
    }
    actCount++;
  }
  console.log(`  ${actCount} activities migrated as posts`);

  // 10. Migrate reminders
  console.log('Migrating reminders...');
  const monicaReminders = await monica('reminders').where({ account_id: 1 });
  let remCount = 0;
  for (const r of monicaReminders) {
    const contactId = contactMap.get(r.contact_id);
    if (!contactId) continue;

    await app('reminders').insert({
      tenant_id: TARGET_TENANT_ID,
      contact_id: contactId,
      created_by: TARGET_USER_ID,
      title: r.title || 'Reminder',
      reminder_date: r.initial_date || new Date(),
      is_recurring: r.frequency_type !== 'one_time',
      is_birthday: false,
      is_completed: false,
    });
    remCount++;
  }
  console.log(`  ${remCount} reminders migrated`);

  // 11. Geocode addresses
  console.log('Geocoding addresses (this takes ~1 sec per address)...');
  const { geocodeAllAddresses } = await import('./services/geocoding.js');
  await geocodeAllAddresses(app, TARGET_TENANT_ID);

  // Summary
  console.log('\n=== Migration complete ===');
  console.log(`Contacts:      ${contacts.length}`);
  console.log(`Tags/Labels:   ${tags.length}`);
  console.log(`Contact fields: ${fieldCount}`);
  console.log(`Addresses:     ${addrCount}`);
  console.log(`Relationships: ${relCount}`);
  console.log(`Posts (notes):  ${noteCount}`);
  console.log(`Posts (activities): ${actCount}`);
  console.log(`Reminders:     ${remCount}`);

  await monica.destroy();
  await app.destroy();
}

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return hslToHex(hue, 60, 50);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `${f(0)}${f(8)}${f(4)}`;
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
