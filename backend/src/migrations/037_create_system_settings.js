export function up(knex) {
  return knex.schema.createTable('system_settings', (table) => {
    table.string('key', 100).primary();
    table.text('value');
    table.timestamps(true, true);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('system_settings');
}
