export function up(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.string('totp_secret', 255).nullable();
    table.boolean('totp_enabled').notNullable().defaultTo(false);
    table.json('totp_backup_codes').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('totp_secret');
    table.dropColumn('totp_enabled');
    table.dropColumn('totp_backup_codes');
  });
}
