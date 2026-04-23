// Relax the audit_log schema so it can record events that don't have a
// tenant or user context yet: failed logins (user unknown), blocked IPs
// (pre-auth), anonymous portal-link probes, etc.
//
// Also widen `action` and add `user_agent` + `portal_guest_id` for forensic
// context, and an index on `ip_address` so "what happened from this IP"
// queries are cheap.
export async function up(knex) {
  await knex.schema.alterTable('audit_log', (table) => {
    table.integer('tenant_id').unsigned().nullable().alter();
    table.integer('user_id').unsigned().nullable().alter();
    table.integer('portal_guest_id').unsigned().nullable()
      .references('id').inTable('portal_guests').onDelete('SET NULL');
    table.string('user_agent', 255).nullable();
    table.index('ip_address');
    table.index(['action', 'created_at']);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('audit_log', (table) => {
    table.dropIndex(['action', 'created_at']);
    table.dropIndex('ip_address');
    table.dropColumn('user_agent');
    table.dropColumn('portal_guest_id');
    // Don't revert nullable on tenant_id / user_id — existing rows may have
    // nulls which would fail a non-null constraint.
  });
}
