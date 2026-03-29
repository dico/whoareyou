export function up(knex) {
  return knex.schema.createTable('ip_geo_cache', (table) => {
    table.string('ip', 45).primary();
    table.string('country_code', 5).notNullable();
    table.string('country_name', 100).nullable();
    table.string('city', 100).nullable();
    table.string('isp', 200).nullable();
    table.json('raw_data').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTable('ip_geo_cache');
}
