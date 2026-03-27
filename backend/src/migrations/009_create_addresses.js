export function up(knex) {
  return knex.schema.createTable('addresses', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('street', 255).notNullable();
    table.string('street2', 255).nullable();
    table.string('postal_code', 20).nullable();
    table.string('city', 100).nullable();
    table.string('state', 100).nullable();
    table.string('country', 100).nullable();
    table.decimal('latitude', 10, 7).nullable();
    table.decimal('longitude', 10, 7).nullable();
    table.timestamp('geocoded_at').nullable();
    table.timestamps(true, true);

    table.index('tenant_id');
    table.index(['tenant_id', 'postal_code']);
  });
}

export function down(knex) {
  return knex.schema.dropTable('addresses');
}
