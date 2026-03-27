export function up(knex) {
  return knex.schema.alterTable('contacts', (table) => {
    table.timestamp('last_viewed_at').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('contacts', (table) => {
    table.dropColumn('last_viewed_at');
  });
}
