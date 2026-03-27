export function up(knex) {
  return knex.schema.createTable('posts', (table) => {
    table.increments('id').primary();
    table.uuid('uuid').notNullable().unique();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('created_by').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.text('body').notNullable();
    table.datetime('post_date').notNullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.index(['tenant_id', 'post_date']);
    table.index(['tenant_id', 'deleted_at']);
  });
}

export function down(knex) {
  return knex.schema.dropTable('posts');
}
