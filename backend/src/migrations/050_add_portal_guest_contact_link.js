export function up(knex) {
  return knex.schema.alterTable('portal_guests', (table) => {
    table.integer('linked_contact_id').unsigned().nullable()
      .references('id').inTable('contacts').onDelete('SET NULL');
  });
}

export function down(knex) {
  return knex.schema.alterTable('portal_guests', (table) => {
    table.dropColumn('linked_contact_id');
  });
}
