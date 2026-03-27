export function up(knex) {
  return knex.schema.alterTable('relationships', (table) => {
    table.date('start_date').nullable();
    table.date('end_date').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('relationships', (table) => {
    table.dropColumn('start_date');
    table.dropColumn('end_date');
  });
}
