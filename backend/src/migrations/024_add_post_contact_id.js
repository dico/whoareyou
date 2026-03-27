export function up(knex) {
  return knex.schema.alterTable('posts', (table) => {
    // If set: this is a profile post "about" this contact
    // If null: this is a diary/activity post with optional tags
    table.integer('contact_id').unsigned().nullable()
      .references('id').inTable('contacts').onDelete('SET NULL');
    table.index('contact_id');
  });
}

export function down(knex) {
  return knex.schema.alterTable('posts', (table) => {
    table.dropColumn('contact_id');
  });
}
