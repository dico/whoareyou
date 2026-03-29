export async function up(knex) {
  const reactionsHas = await knex.schema.hasColumn('post_reactions', 'contact_id');
  if (!reactionsHas) {
    await knex.schema.alterTable('post_reactions', (table) => {
      table.integer('contact_id').unsigned().nullable()
        .references('id').inTable('contacts').onDelete('SET NULL');
    });
  }

  const commentsHas = await knex.schema.hasColumn('post_comments', 'contact_id');
  if (!commentsHas) {
    await knex.schema.alterTable('post_comments', (table) => {
      table.integer('contact_id').unsigned().nullable()
        .references('id').inTable('contacts').onDelete('SET NULL');
    });
  }
}

export function down(knex) {
  return knex.schema
    .alterTable('post_reactions', (table) => { table.dropColumn('contact_id'); })
    .alterTable('post_comments', (table) => { table.dropColumn('contact_id'); });
}
