export async function up(knex) {
  const exists = await knex.schema.hasTable('dismissed_duplicates');
  if (!exists) {
    await knex.schema.createTable('dismissed_duplicates', (table) => {
      table.increments('id');
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.integer('contact1_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.integer('contact2_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.integer('dismissed_by').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['tenant_id', 'contact1_id', 'contact2_id']);
      table.index('tenant_id');
    });
  }
}

export function down(knex) {
  return knex.schema.dropTableIfExists('dismissed_duplicates');
}
