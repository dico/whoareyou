export async function up(knex) {
  const has = await knex.schema.hasColumn('contacts', 'deceased_date');
  if (!has) {
    await knex.schema.alterTable('contacts', (table) => {
      table.date('deceased_date').nullable();
    });
  }
}

export function down(knex) {
  return knex.schema.alterTable('contacts', (table) => {
    table.dropColumn('deceased_date');
  });
}
