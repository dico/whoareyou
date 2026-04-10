export async function up(knex) {
  const has = await knex.schema.hasColumn('signage_screens', 'token');
  if (!has) {
    await knex.schema.alterTable('signage_screens', (table) => {
      table.string('token', 128).nullable();
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('signage_screens', 'token')) {
    await knex.schema.alterTable('signage_screens', (table) => {
      table.dropColumn('token');
    });
  }
}
