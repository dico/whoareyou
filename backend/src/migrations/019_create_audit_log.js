export function up(knex) {
  return knex.schema.createTable('audit_log', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('action', 100).notNullable();
    table.string('entity_type', 50).nullable();
    table.integer('entity_id').unsigned().nullable();
    table.json('details').nullable();
    table.string('ip_address', 45).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['tenant_id', 'created_at']);
    table.index('user_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('audit_log');
}
