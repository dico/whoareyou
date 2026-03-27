export function up(knex) {
  return knex.schema.createTable('contact_labels', (table) => {
    table.integer('contact_id').unsigned().notNullable()
      .references('id').inTable('contacts').onDelete('CASCADE');
    table.integer('label_id').unsigned().notNullable()
      .references('id').inTable('labels').onDelete('CASCADE');

    table.primary(['contact_id', 'label_id']);
  });
}

export function down(knex) {
  return knex.schema.dropTable('contact_labels');
}
