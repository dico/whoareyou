export function up(knex) {
  return knex.schema.createTable('tasks', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('contact_id').unsigned().nullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('created_by').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.boolean('is_completed').notNullable().defaultTo(false);
    table.timestamp('completed_at').nullable();
    table.date('due_date').nullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.index(['tenant_id', 'is_completed']);
    table.index('contact_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('tasks');
}
