export function up(knex) {
  return knex.schema.createTable('sessions', (table) => {
    table.increments('id').unsigned().primary();
    table.string('uuid', 36).notNullable().unique();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('refresh_token_hash', 64).notNullable().index();
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.string('device_label', 255);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_activity_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.timestamps(true, true);

    table.index(['user_id', 'is_active']);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('sessions');
}
