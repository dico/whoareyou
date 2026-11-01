import { decodeHtmlEntities } from '../utils/html-entities.js';

// Data fix: product/link-preview text scraped before decodeHtmlEntities()
// was stored with raw entities ("F&#229;"). Decode existing rows in place.
const TARGETS = [
  ['gift_products', ['name', 'description', 'image_url']],
  ['gift_wishlist_items', ['title', 'notes']],
  ['gift_orders', ['title']],
  ['post_link_previews', ['title', 'description', 'site_name', 'image_url']],
];

export async function up(knex) {
  for (const [table, columns] of TARGETS) {
    if (!(await knex.schema.hasTable(table))) continue;
    const present = [];
    for (const c of columns) if (await knex.schema.hasColumn(table, c)) present.push(c);
    if (!present.length) continue;

    const rows = await knex(table)
      .where(q => present.forEach(c => q.orWhere(c, 'like', '%&%;%')))
      .select('id', ...present);
    for (const row of rows) {
      const updates = {};
      for (const c of present) {
        const decoded = decodeHtmlEntities(row[c]);
        if (decoded !== row[c]) updates[c] = decoded;
      }
      if (Object.keys(updates).length) await knex(table).where({ id: row.id }).update(updates);
    }
  }
}

export async function down() {
  // Irreversible data fix — nothing to undo.
}
