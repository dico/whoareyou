export async function up(knex) {
  // Add type, description, parent_id to companies
  await knex.schema.alterTable('companies', (table) => {
    table.string('type', 50).notNullable().defaultTo('company');
    table.text('description').nullable();
    table.integer('parent_id').unsigned().nullable()
      .references('id').inTable('companies').onDelete('SET NULL');
    table.index('parent_id');
    table.index('type');
  });

  // Create company_photos (same pattern as contact_photos)
  const exists = await knex.schema.hasTable('company_photos');
  if (!exists) {
    await knex.schema.createTable('company_photos', (table) => {
      table.increments('id').primary();
      table.integer('company_id').unsigned().notNullable()
        .references('id').inTable('companies').onDelete('CASCADE');
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('file_path', 500).notNullable();
      table.string('thumbnail_path', 500).notNullable();
      table.boolean('is_primary').notNullable().defaultTo(false);
      table.string('caption', 255).nullable();
      table.date('taken_at').nullable();
      table.integer('sort_order').notNullable().defaultTo(0);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.index('company_id');
      table.index('tenant_id');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('company_photos');
  await knex.schema.alterTable('companies', (table) => {
    table.dropIndex('type');
    table.dropForeign('parent_id');
    table.dropIndex('parent_id');
    table.dropColumn('parent_id');
    table.dropColumn('description');
    table.dropColumn('type');
  });
}
