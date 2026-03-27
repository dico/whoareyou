export function up(knex) {
  return knex.schema.createTable('tenants', (table) => {
    table.increments('id').primary();
    table.uuid('uuid').notNullable().unique();
    table.string('name', 255).notNullable();
    table.timestamps(true, true);
  });
}

export function down(knex) {
  return knex.schema.dropTable('tenants');
}
