export function up(knex) {
  return knex.schema.createTable('post_media', (table) => {
    table.increments('id').primary();
    table.integer('post_id').unsigned().notNullable()
      .references('id').inTable('posts').onDelete('CASCADE');
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('file_path', 500).notNullable();
    table.string('thumbnail_path', 500).nullable();
    table.string('file_type', 50).notNullable();
    table.integer('file_size').unsigned().notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('post_id');
    table.index('tenant_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('post_media');
}
