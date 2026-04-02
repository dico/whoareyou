export async function up(knex) {
  const exists = await knex.schema.hasTable('dismissed_suggestions');
  if (!exists) {
    await knex.schema.createTable('dismissed_suggestions', (table) => {
      table.increments('id');
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.integer('contact1_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.integer('contact2_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.string('suggested_type', 50).notNullable();
      table.integer('dismissed_by').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['tenant_id', 'contact1_id', 'contact2_id', 'suggested_type']);
      table.index('tenant_id');
    });
  }
}

export function down(knex) {
  return knex.schema.dropTableIfExists('dismissed_suggestions');
}
