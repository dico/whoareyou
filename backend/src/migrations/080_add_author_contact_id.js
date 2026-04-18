/**
 * Add author_contact_id to posts — the primary source of author identity.
 * Points directly to a contact, independent of user/guest/membership status.
 * Backfills from existing created_by → tenant_members and portal_guest_id → portal_guests.
 */
export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('posts', 'author_contact_id');
  if (!hasCol) {
    await knex.schema.alterTable('posts', (table) => {
      table.integer('author_contact_id').unsigned().nullable()
        .references('id').inTable('contacts').onDelete('SET NULL');
      table.index('author_contact_id');
    });
  }

  // Backfill 1: created_by → tenant_members.linked_contact_id
  await knex.raw(`
    UPDATE posts
    JOIN tenant_members tm ON tm.user_id = posts.created_by AND tm.tenant_id = posts.tenant_id
    SET posts.author_contact_id = tm.linked_contact_id
    WHERE posts.author_contact_id IS NULL
      AND posts.created_by IS NOT NULL
      AND tm.linked_contact_id IS NOT NULL
  `);

  // Backfill 2: portal_guest_id → portal_guests.linked_contact_id
  await knex.raw(`
    UPDATE posts
    JOIN portal_guests pg ON pg.id = posts.portal_guest_id
    SET posts.author_contact_id = pg.linked_contact_id
    WHERE posts.author_contact_id IS NULL
      AND posts.portal_guest_id IS NOT NULL
      AND pg.linked_contact_id IS NOT NULL
  `);

  // Backfill 3: fallback for orphaned users (no tenant_members row)
  await knex.raw(`
    UPDATE posts
    JOIN users u ON u.id = posts.created_by
    JOIN contacts c ON c.id = u.linked_contact_id AND c.tenant_id = posts.tenant_id
    SET posts.author_contact_id = c.id
    WHERE posts.author_contact_id IS NULL
      AND posts.created_by IS NOT NULL
      AND u.linked_contact_id IS NOT NULL
  `);
}

export function down(knex) {
  return knex.schema.alterTable('posts', (table) => {
    table.dropColumn('author_contact_id');
  });
}
