export function up(knex) {
  return knex.schema.createTable('relationship_types', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().nullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('inverse_name', 100).notNullable();
    table.enum('category', ['family', 'social', 'professional']).notNullable();
    table.boolean('is_system').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTable('relationship_types');
}
