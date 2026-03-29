export function up(knex) {
  return knex.schema.createTable('post_comments', (table) => {
    table.increments('id').primary();
    table.integer('post_id').unsigned().notNullable()
      .references('id').inTable('posts').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.text('body').notNullable();
    table.timestamps(true, true);

    table.index(['post_id', 'created_at']);
    table.index('tenant_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('post_comments');
}
