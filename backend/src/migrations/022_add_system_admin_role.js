export function up(knex) {
  return knex.schema.alterTable('users', (table) => {
    // Add system-level admin flag (separate from tenant role)
    table.boolean('is_system_admin').notNullable().defaultTo(false);
  });
}

export function down(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_system_admin');
  });
}
