export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('posts', 'portal_guest_id');
  if (!hasCol) {
    await knex.schema.alterTable('posts', (table) => {
      table.integer('portal_guest_id').unsigned().nullable()
        .references('id').inTable('portal_guests').onDelete('SET NULL');
    });
  }
  // Make created_by nullable (portal guests don't have a user account)
  await knex.raw('ALTER TABLE posts MODIFY created_by INT UNSIGNED NULL');
}

export function down(knex) {
  return knex.schema.alterTable('posts', (table) => {
    table.dropColumn('portal_guest_id');
  });
}
