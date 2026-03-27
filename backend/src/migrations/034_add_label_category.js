export function up(knex) {
  return knex.schema.alterTable('labels', (table) => {
    table.enum('category', ['group', 'interest']).defaultTo('group').notNullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('labels', (table) => {
    table.dropColumn('category');
  });
}
