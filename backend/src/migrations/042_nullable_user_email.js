export async function up(knex) {
  // Allow null email for household members that don't log in
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['email']);
  });
  await knex.raw('ALTER TABLE users MODIFY email VARCHAR(255) NULL');
  await knex.schema.alterTable('users', (table) => {
    table.unique(['email']);
  });
}

export async function down(knex) {
  // Restore NOT NULL — fill in placeholder emails first
  await knex.raw(`
    UPDATE users SET email = CONCAT('member-', uuid, '@nologin.internal')
    WHERE email IS NULL
  `);
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['email']);
  });
  await knex.raw('ALTER TABLE users MODIFY email VARCHAR(255) NOT NULL');
  await knex.schema.alterTable('users', (table) => {
    table.unique(['email']);
  });
}
