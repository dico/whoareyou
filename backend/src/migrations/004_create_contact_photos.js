export function up(knex) {
  return knex.schema.createTable('contact_photos', (table) => {
    table.increments('id').primary();
    table.integer('contact_id').unsigned().notNullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('file_path', 500).notNullable();
    table.string('thumbnail_path', 500).notNullable();
    table.boolean('is_primary').notNullable().defaultTo(false);
    table.string('caption', 255).nullable();
    table.date('taken_at').nullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('contact_id');
    table.index('tenant_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('contact_photos');
}
