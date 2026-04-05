export async function up(knex) {
  await knex.schema.alterTable('export_log', (table) => {
    table.string('status', 20).notNullable().defaultTo('started');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('export_log', (table) => {
    table.dropColumn('status');
  });
}
