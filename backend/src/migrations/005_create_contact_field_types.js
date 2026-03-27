export function up(knex) {
  return knex.schema.createTable('contact_field_types', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().nullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('icon', 50).nullable();
    table.string('protocol', 50).nullable();
    table.boolean('is_system').notNullable().defaultTo(false);
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTable('contact_field_types');
}
