export function up(knex) {
  return knex.schema.alterTable('sessions', (table) => {
    table.boolean('is_trusted_ip').notNullable().defaultTo(false);
  });
}

export function down(knex) {
  return knex.schema.alterTable('sessions', (table) => {
    table.dropColumn('is_trusted_ip');
  });
}
