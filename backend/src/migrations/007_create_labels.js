export function up(knex) {
  return knex.schema.createTable('labels', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('color', 7).notNullable().defaultTo('#6C757D');
    table.timestamps(true, true);

    table.unique(['tenant_id', 'name']);
  });
}

export function down(knex) {
  return knex.schema.dropTable('labels');
}
