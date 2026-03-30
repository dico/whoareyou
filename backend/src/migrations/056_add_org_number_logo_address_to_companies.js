export async function up(knex) {
  const hasOrg = await knex.schema.hasColumn('companies', 'org_number');
  if (!hasOrg) {
    await knex.schema.alterTable('companies', (table) => {
      table.string('org_number', 50).nullable();
      table.string('logo_path', 500).nullable();
      table.string('address', 500).nullable();
      table.decimal('latitude', 10, 7).nullable();
      table.decimal('longitude', 10, 7).nullable();
    });
  }
}

export function down(knex) {
  return knex.schema.alterTable('companies', (table) => {
    table.dropColumn('org_number');
    table.dropColumn('logo_path');
    table.dropColumn('address');
    table.dropColumn('latitude');
    table.dropColumn('longitude');
  });
}
