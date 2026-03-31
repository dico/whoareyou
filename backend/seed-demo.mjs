import { db } from './src/db.js';
import { v4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { processImage } from './src/services/image.js';

const TENANT_ID = 3;
const USER_ID = 1; // created_by

// Norwegian-style demo data
const people = [
  { first: 'Lars', last: 'Berg', birth_year: 1955, gender: 'm' },
  { first: 'Ingrid', last: 'Berg', birth_year: 1957, gender: 'f' },
  { first: 'Erik', last: 'Berg', birth_year: 1980, gender: 'm' },
  { first: 'Marte', last: 'Haugen', birth_year: 1982, gender: 'f' },
  { first: 'Oskar', last: 'Berg', birth_year: 2010, gender: 'm' },
  { first: 'Nora', last: 'Berg', birth_year: 2013, gender: 'f' },
  { first: 'Hilde', last: 'Berg', birth_year: 1983, gender: 'f' },
  { first: 'Thomas', last: 'Lund', birth_year: 1981, gender: 'm' },
  { first: 'Elias', last: 'Lund', birth_year: 2012, gender: 'm' },
  { first: 'Knut', last: 'Haugen', birth_year: 1950, gender: 'm' },
  { first: 'Solveig', last: 'Haugen', birth_year: 1953, gender: 'f' },
  { first: 'Per', last: 'Haugen', birth_year: 1979, gender: 'm' },
  { first: 'Silje', last: 'Vik', birth_year: 1985, gender: 'f' },
  { first: 'Aksel', last: 'Haugen', birth_year: 2015, gender: 'm' },
  { first: 'Maja', last: 'Dahl', birth_year: 1990, gender: 'f' },
  { first: 'Jonas', last: 'Dahl', birth_year: 1988, gender: 'm' },
  { first: 'Olivia', last: 'Dahl', birth_year: 2018, gender: 'f' },
  { first: 'Henrik', last: 'Nilsen', birth_year: 1975, gender: 'm' },
  { first: 'Astrid', last: 'Nilsen', birth_year: 1977, gender: 'f' },
  { first: 'Magnus', last: 'Nilsen', birth_year: 2005, gender: 'm' },
  { first: 'Ida', last: 'Strand', birth_year: 1995, gender: 'f' },
  { first: 'Ole', last: 'Strand', birth_year: 1992, gender: 'm' },
  { first: 'Turid', last: 'Moen', birth_year: 1948, gender: 'f', deceased: '2020-03-15' },
  { first: 'Bjørn', last: 'Moen', birth_year: 1945, gender: 'm', deceased: '2018-11-02' },
  { first: 'Kristin', last: 'Sæther', birth_year: 1970, gender: 'f' },
  { first: 'Rune', last: 'Sæther', birth_year: 1968, gender: 'm' },
  { first: 'Emilie', last: 'Sæther', birth_year: 2000, gender: 'f' },
  { first: 'Vegard', last: 'Holm', birth_year: 1985, gender: 'm' },
  { first: 'Lise', last: 'Holm', birth_year: 1987, gender: 'f' },
  { first: 'Filip', last: 'Holm', birth_year: 2016, gender: 'm' },
  { first: 'Anders', last: 'Bakke', birth_year: 1960, gender: 'm' },
  { first: 'Grete', last: 'Bakke', birth_year: 1962, gender: 'f' },
  { first: 'Simen', last: 'Fjeld', birth_year: 1998, gender: 'm' },
  { first: 'Thea', last: 'Fjeld', birth_year: 2001, gender: 'f' },
  // Extra without photos
  { first: 'Anne', last: 'Johansen', birth_year: 1965, gender: 'f' },
  { first: 'Geir', last: 'Pettersen', birth_year: 1972, gender: 'm' },
  { first: 'Liv', last: 'Olsen', birth_year: 1940, gender: 'f', deceased: '2015-06-20' },
  { first: 'Torstein', last: 'Aasen', birth_year: 1955, gender: 'm' },
  { first: 'Mari', last: 'Fredriksen', birth_year: 1999, gender: 'f' },
  { first: 'Pål', last: 'Henriksen', birth_year: 1988, gender: 'm' },
  { first: 'Sofie', last: 'Kristiansen', birth_year: 2003, gender: 'f' },
  { first: 'Jan', last: 'Eriksen', birth_year: 1958, gender: 'm' },
  { first: 'Berit', last: 'Larsen', birth_year: 1963, gender: 'f' },
  { first: 'Håkon', last: 'Johnsen', birth_year: 1991, gender: 'm' },
  { first: 'Camilla', last: 'Andresen', birth_year: 1986, gender: 'f' },
  { first: 'Stein', last: 'Gundersen', birth_year: 1975, gender: 'm' },
  { first: 'Heidi', last: 'Thorsen', birth_year: 1980, gender: 'f' },
  { first: 'Eirik', last: 'Solberg', birth_year: 2008, gender: 'm' },
  { first: 'Vilde', last: 'Nygård', birth_year: 2011, gender: 'f' },
  { first: 'Roar', last: 'Hagen', birth_year: 1952, gender: 'm' },
];

const companies = [
  { name: 'Fjord Tech AS', industry: 'Teknologi', website: 'https://fjordtech.no' },
  { name: 'Berg & Sønn Snekkerverksted', industry: 'Håndverk' },
  { name: 'Nordlys Regnskap', industry: 'Regnskap', website: 'https://nordlysregnskap.no' },
  { name: 'Haugen Gård', industry: 'Landbruk' },
  { name: 'Kystbyen Kafé', industry: 'Restaurant og servering' },
];

const postTexts = [
  'Fantastisk dag på fjellet i dag!',
  'Gratulerer med dagen! 🎂',
  'Ny jobb - jeg gleder meg!',
  'Fint vær for en strandtur 🏖️',
  'Besøk hos besteforeldrene i helgen.',
  'Første skoledag! 📚',
  'Familiemiddag med hele gjengen.',
  'Nydelig solnedgang fra hytta.',
  'Bursdagsfest med venner 🎉',
  'Påskeferie i fjellet ⛷️',
  'Sommerkveld i hagen.',
  'God jul fra oss alle! 🎄',
  'Konfirmasjon i dag - så stolt!',
  'Tur til København i helgen.',
  'Babyen er født! Velkommen til verden 👶',
];

async function seed() {
  console.log('Seeding demo data for tenant', TENANT_ID);

  // Get profile pictures
  const picDir = '/app/_tmp/demo_profile_pictures';
  let pics = [];
  try { pics = await fs.readdir(picDir); } catch { console.log('No pics dir found at', picDir); }
  pics = pics.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log(`Found ${pics.length} profile pictures`);

  // Create contacts
  const contactIds = [];
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const uuid = v4();
    const [id] = await db('contacts').insert({
      uuid, tenant_id: TENANT_ID, created_by: USER_ID,
      first_name: p.first, last_name: p.last,
      birth_year: p.birth_year,
      birth_month: Math.floor(Math.random() * 12) + 1,
      birth_day: Math.floor(Math.random() * 28) + 1,
      deceased_date: p.deceased || null,
    });
    contactIds.push({ id, uuid, ...p });

    // Upload profile picture
    if (i < pics.length) {
      const srcPath = path.join(picDir, pics[i]);
      try {
        const processed = await processImage(srcPath, `contacts/${uuid}`, `photo_${Date.now()}_${i}`, { keepOriginal: true });
        await db('contact_photos').insert({
          contact_id: id, tenant_id: TENANT_ID,
          file_path: processed.filePath, thumbnail_path: processed.thumbnailPath,
          is_primary: true, sort_order: 0,
        });
      } catch (e) { console.log('Photo error for', p.first, e.message); }
    }
  }
  console.log(`Created ${contactIds.length} contacts`);

  // Relationship types
  const relTypes = await db('relationship_types').select('id', 'name');
  const rt = (name) => relTypes.find(t => t.name === name)?.id;

  // Create relationships
  const rels = [
    [0,1,'spouse'], // Lars & Ingrid
    [0,2,'parent'],[1,2,'parent'], // Erik son of Lars+Ingrid
    [0,6,'parent'],[1,6,'parent'], // Hilde daughter of Lars+Ingrid
    [2,3,'spouse'], // Erik & Marte
    [2,4,'parent'],[3,4,'parent'], // Oskar son of Erik+Marte
    [2,5,'parent'],[3,5,'parent'], // Nora daughter of Erik+Marte
    [6,7,'spouse'], // Hilde & Thomas
    [6,8,'parent'],[7,8,'parent'], // Elias son of Hilde+Thomas
    [9,10,'spouse'], // Knut & Solveig (Marte's parents)
    [9,3,'parent'],[10,3,'parent'], // Marte daughter of Knut+Solveig
    [9,11,'parent'],[10,11,'parent'], // Per son of Knut+Solveig
    [11,12,'spouse'], // Per & Silje
    [11,13,'parent'],[12,13,'parent'], // Aksel
    [15,14,'spouse'], // Jonas & Maja
    [15,16,'parent'],[14,16,'parent'], // Olivia
    [17,18,'spouse'], // Henrik & Astrid
    [17,19,'parent'],[18,19,'parent'], // Magnus
    [21,20,'spouse'], // Ole & Ida
    [23,22,'spouse'], // Bjørn & Turid
    [25,24,'spouse'], // Rune & Kristin
    [25,26,'parent'],[24,26,'parent'], // Emilie
    [28,27,'spouse'], // Lise & Vegard
    [28,29,'parent'],[27,29,'parent'], // Filip
    [30,31,'spouse'], // Anders & Grete
    // Friends and social
    [2,15,'friend'],[2,27,'friend'],[6,24,'friend'],
    [14,20,'friend'],[19,32,'friend'],
    // Colleagues
    [2,17,'colleague'],[27,21,'colleague'],
  ];

  for (const [i1, i2, type] of rels) {
    if (contactIds[i1] && contactIds[i2] && rt(type)) {
      await db('relationships').insert({
        tenant_id: TENANT_ID,
        contact_id: contactIds[i1].id,
        related_contact_id: contactIds[i2].id,
        relationship_type_id: rt(type),
      }).catch(() => {});
    }
  }
  console.log('Created relationships');

  // Create companies
  const companyIds = [];
  for (const c of companies) {
    const uuid = v4();
    const [id] = await db('companies').insert({
      uuid, tenant_id: TENANT_ID, name: c.name,
      industry: c.industry, website: c.website || null,
    });
    companyIds.push(id);
  }

  // Link some people to companies
  const jobs = [
    [2, 0, 'CTO'], [17, 0, 'Utvikler'], [27, 0, 'Designer'],
    [0, 1, 'Daglig leder'], [7, 1, 'Snekker'],
    [24, 2, 'Regnskapsfører'], [31, 2, 'Partner'],
    [9, 3, 'Gårdbruker'], [11, 3, 'Gårdbruker'],
    [14, 4, 'Barista'], [20, 4, 'Kokk'],
  ];
  for (const [ci, coi, title] of jobs) {
    if (contactIds[ci] && companyIds[coi]) {
      await db('contact_companies').insert({
        contact_id: contactIds[ci].id, company_id: companyIds[coi],
        tenant_id: TENANT_ID, title,
      }).catch(() => {});
    }
  }
  console.log('Created companies and jobs');

  // Create posts
  for (let i = 0; i < postTexts.length; i++) {
    const contact = contactIds[Math.floor(Math.random() * Math.min(20, contactIds.length))];
    const uuid = v4();
    const daysAgo = Math.floor(Math.random() * 365);
    const postDate = new Date(Date.now() - daysAgo * 86400000);
    await db('posts').insert({
      uuid, tenant_id: TENANT_ID, created_by: USER_ID,
      body: postTexts[i], post_date: postDate,
      contact_id: contact.id, visibility: 'shared',
    });
  }
  console.log('Created posts');

  // Link user 1 to a contact in demo tenant (Erik Berg)
  await db('tenant_members')
    .where({ user_id: USER_ID, tenant_id: TENANT_ID })
    .update({ linked_contact_id: contactIds[2].id });
  console.log('Linked user 1 to Erik Berg');

  console.log('\n=== DEMO SEED COMPLETE ===');
  process.exit(0);
}

seed().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
