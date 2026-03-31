export async function up(knex) {
  // Add linked_contact_id to tenant_members (per-tenant contact linking)
  const has = await knex.schema.hasColumn('tenant_members', 'linked_contact_id');
  if (!has) {
    await knex.schema.alterTable('tenant_members', (table) => {
      table.integer('linked_contact_id').unsigned().nullable()
        .references('id').inTable('contacts').onDelete('SET NULL');
    });
  }

  // Migrate: copy users.linked_contact_id to matching tenant_members row
  const users = await knex('users').whereNotNull('linked_contact_id').select('id', 'tenant_id', 'linked_contact_id');
  for (const u of users) {
    await knex('tenant_members')
      .where({ user_id: u.id, tenant_id: u.tenant_id })
      .whereNull('linked_contact_id')
      .update({ linked_contact_id: u.linked_contact_id });
  }
}

export function down(knex) {
  return knex.schema.alterTable('tenant_members', (table) => {
    table.dropColumn('linked_contact_id');
  });
}
