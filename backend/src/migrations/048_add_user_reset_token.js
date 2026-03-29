export function up(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.string('reset_token_hash', 64).nullable();
    table.timestamp('reset_token_expires').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('reset_token_hash');
    table.dropColumn('reset_token_expires');
  });
}
