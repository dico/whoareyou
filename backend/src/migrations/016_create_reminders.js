export function up(knex) {
  return knex.schema.createTable('reminders', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('contact_id').unsigned().nullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('created_by').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table.date('reminder_date').notNullable();
    table.boolean('is_recurring').notNullable().defaultTo(false);
    table.boolean('is_birthday').notNullable().defaultTo(false);
    table.boolean('is_completed').notNullable().defaultTo(false);
    table.timestamps(true, true);

    table.index(['tenant_id', 'reminder_date']);
    table.index('contact_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('reminders');
}
