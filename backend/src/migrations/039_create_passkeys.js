export function up(knex) {
  return knex.schema.createTable('passkeys', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('credential_id', 500).notNullable().unique();
    table.text('public_key').notNullable();
    table.bigInteger('counter').unsigned().notNullable().defaultTo(0);
    table.text('transports'); // JSON array of transports
    table.string('device_name', 255);
    table.timestamp('last_used_at').nullable();
    table.timestamps(true, true);

    table.index('user_id');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('passkeys');
}
