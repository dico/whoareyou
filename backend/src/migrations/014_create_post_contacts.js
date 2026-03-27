export function up(knex) {
  return knex.schema.createTable('post_contacts', (table) => {
    table.integer('post_id').unsigned().notNullable()
      .references('id').inTable('posts').onDelete('CASCADE');
    table.integer('contact_id').unsigned().notNullable()
      .references('id').inTable('contacts').onDelete('CASCADE');

    table.primary(['post_id', 'contact_id']);
    table.index('contact_id');
  });
}

export function down(knex) {
  return knex.schema.dropTable('post_contacts');
}
