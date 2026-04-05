export async function up(knex) {
  await knex.schema.alterTable('post_media', (table) => {
    table.date('taken_at').nullable();
    table.decimal('latitude', 10, 7).nullable();
    table.decimal('longitude', 10, 7).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('post_media', (table) => {
    table.dropColumn('taken_at');
    table.dropColumn('latitude');
    table.dropColumn('longitude');
  });
}
