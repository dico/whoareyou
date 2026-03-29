export function up(knex) {
  return knex.schema.createTable('post_reactions', (table) => {
    table.increments('id').primary();
    table.integer('post_id').unsigned().notNullable()
      .references('id').inTable('posts').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('emoji', 10).notNullable().defaultTo('❤️');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['post_id', 'user_id', 'emoji']);
    table.index('post_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('post_reactions');
}
