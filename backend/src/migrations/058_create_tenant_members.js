export async function up(knex) {
  const exists = await knex.schema.hasTable('tenant_members');
  if (!exists) {
    await knex.schema.createTable('tenant_members', (table) => {
      table.increments('id');
      table.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.enum('role', ['admin', 'member']).defaultTo('member');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['user_id', 'tenant_id']);
      table.index('tenant_id');
    });
  }

  // Migrate existing users: each user gets a membership in their home tenant (idempotent)
  const users = await knex('users').select('id', 'tenant_id', 'role');
  for (const u of users) {
    const exists = await knex('tenant_members').where({ user_id: u.id, tenant_id: u.tenant_id }).first();
    if (!exists) {
      await knex('tenant_members').insert({ user_id: u.id, tenant_id: u.tenant_id, role: u.role });
    }
  }
}

export function down(knex) {
  return knex.schema.dropTableIfExists('tenant_members');
}
