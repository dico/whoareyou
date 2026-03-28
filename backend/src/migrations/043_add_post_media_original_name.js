export function up(knex) {
  return knex.schema.alterTable('post_media', (table) => {
    table.string('original_name', 255).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('post_media', (table) => {
    table.dropColumn('original_name');
  });
}
