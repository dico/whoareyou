export function up(knex) {
  return knex.schema
    .createTable('companies', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants');
      table.string('name', 255).notNullable();
      table.string('industry', 255).nullable();
      table.string('website', 500).nullable();
      table.string('phone', 100).nullable();
      table.string('email', 255).nullable();
      table.text('notes').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index('tenant_id');
    })
    .createTable('contact_companies', (table) => {
      table.increments('id');
      table.integer('contact_id').unsigned().notNullable().references('id').inTable('contacts').onDelete('CASCADE');
      table.integer('company_id').unsigned().notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants');
      table.string('title', 255).nullable(); // Job title / role
      table.date('start_date').nullable();
      table.date('end_date').nullable(); // null = current
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('contact_id');
      table.index('company_id');
      table.index('tenant_id');
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('contact_companies')
    .dropTableIfExists('companies');
}
