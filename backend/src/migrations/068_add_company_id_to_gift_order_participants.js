/**
 * Allow companies/groups as gift order participants in addition to contacts.
 *
 * - Adds nullable `company_id` FK to gift_order_participants.
 * - Makes `contact_id` nullable so a row can reference either a contact
 *   or a company (exactly one of the two is set; enforced in application code).
 *
 * This enables gifts from/to groups (e.g. "Jobben", "Fotballaget") without
 * needing to maintain a dummy contact per group.
 */
export async function up(knex) {
  const hasCompanyId = await knex.schema.hasColumn('gift_order_participants', 'company_id');
  if (!hasCompanyId) {
    await knex.schema.alterTable('gift_order_participants', (table) => {
      table.integer('company_id').unsigned().nullable()
        .references('id').inTable('companies').onDelete('CASCADE');
      table.index('company_id');
    });
  }

  // Make contact_id nullable (it was NOT NULL before).
  // Knex's alter() replays the column definition with the new modifier.
  await knex.schema.alterTable('gift_order_participants', (table) => {
    table.integer('contact_id').unsigned().nullable().alter();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('gift_order_participants', (table) => {
    table.dropColumn('company_id');
  });
  // Note: we don't restore contact_id to NOT NULL on down — there may be
  // company-only rows that would fail the constraint.
}
