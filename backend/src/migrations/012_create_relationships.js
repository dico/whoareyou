export function up(knex) {
  return knex.schema.createTable('relationships', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('contact_id').unsigned().notNullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('related_contact_id').unsigned().notNullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('relationship_type_id').unsigned().notNullable()
      .references('id').inTable('relationship_types').onDelete('CASCADE');
    table.text('notes').nullable();
    table.timestamps(true, true);

    table.unique(['tenant_id', 'contact_id', 'related_contact_id']);
    table.index('contact_id');
    table.index('related_contact_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('relationships');
}
