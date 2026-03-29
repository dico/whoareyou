export function up(knex) {
  return knex.schema.alterTable('post_media', (table) => {
    table.string('external_id', 100).nullable();
    table.index('external_id');
  });
}

export function down(knex) {
  return knex.schema.alterTable('post_media', (table) => {
    table.dropIndex('external_id');
    table.dropColumn('external_id');
  });
}
