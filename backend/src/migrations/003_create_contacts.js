export function up(knex) {
  return knex.schema.createTable('contacts', (table) => {
    table.increments('id').primary();
    table.uuid('uuid').notNullable().unique();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('created_by').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).nullable();
    table.string('nickname', 100).nullable();
    table.date('date_of_birth').nullable();
    table.text('how_we_met').nullable();
    table.text('notes').nullable();
    table.boolean('is_favorite').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_contacted_at').nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.index('tenant_id');
    table.index(['tenant_id', 'last_name', 'first_name']);
    table.index(['tenant_id', 'is_favorite']);
    table.index(['tenant_id', 'deleted_at']);
  });
}

export function down(knex) {
  return knex.schema.dropTable('contacts');
}
