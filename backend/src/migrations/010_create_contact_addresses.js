export function up(knex) {
  return knex.schema.createTable('contact_addresses', (table) => {
    table.increments('id').primary();
    table.integer('contact_id').unsigned().notNullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('address_id').unsigned().notNullable()
      .references('id').inTable('addresses').onDelete('CASCADE');
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('label', 100).nullable().defaultTo('Home');
    table.boolean('is_primary').notNullable().defaultTo(false);
    table.date('moved_in_at').nullable();
    table.date('moved_out_at').nullable();
    table.timestamps(true, true);

    table.index('contact_id');
    table.index('address_id');
    table.index('tenant_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('contact_addresses');
}
