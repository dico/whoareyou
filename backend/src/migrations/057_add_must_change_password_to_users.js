export async function up(knex) {
  const has = await knex.schema.hasColumn('users', 'must_change_password');
  if (!has) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('must_change_password').defaultTo(false);
    });
  }
}

export function down(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('must_change_password');
  });
}
