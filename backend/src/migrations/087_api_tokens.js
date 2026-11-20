// Short-lived API tokens for AI agents and scripts. The token acts as the
// user who created it, but only on the routes allowed by
// utils/api-token-policy.js. Only the SHA-256 hash is stored — the plaintext
// is shown once at creation.
export async function up(knex) {
  if (await knex.schema.hasTable('api_tokens')) return;
  await knex.schema.createTable('api_tokens', (table) => {
    table.increments('id');
    table.string('uuid', 36).notNullable().unique();
    table.integer('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('token_hash', 64).notNullable().unique();
    table.string('token_prefix', 16).notNullable(); // for display: "way_ab12…"
    table.string('scope', 20).notNullable().defaultTo('read'); // 'read' | 'write'
    table.timestamp('expires_at').notNullable();
    table.timestamp('revoked_at').nullable();
    table.timestamp('last_used_at').nullable();
    table.string('last_used_ip', 45).nullable();
    table.integer('request_count').unsigned().notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['tenant_id', 'user_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('api_tokens');
}
