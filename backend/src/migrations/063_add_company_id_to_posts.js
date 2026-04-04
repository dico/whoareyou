export async function up(knex) {
  await knex.schema.alterTable('posts', (table) => {
    table.integer('company_id').unsigned().nullable()
      .references('id').inTable('companies').onDelete('SET NULL');
    table.index('company_id');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('posts', (table) => {
    table.dropForeign('company_id');
    table.dropIndex('company_id');
    table.dropColumn('company_id');
  });
}
