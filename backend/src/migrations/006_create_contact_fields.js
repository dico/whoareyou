export function up(knex) {
  return knex.schema.createTable('contact_fields', (table) => {
    table.increments('id').primary();
    table.integer('contact_id').unsigned().notNullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('field_type_id').unsigned().notNullable()
      .references('id').inTable('contact_field_types').onDelete('CASCADE');
    table.string('value', 500).notNullable();
    table.string('label', 100).nullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.index('contact_id');
    table.index('tenant_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('contact_fields');
}
