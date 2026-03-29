export async function up(knex) {
  const exists = await knex.schema.hasTable('post_link_previews');
  if (!exists) {
    await knex.schema.createTable('post_link_previews', (table) => {
      table.increments('id');
      table.integer('post_id').unsigned().notNullable()
        .references('id').inTable('posts').onDelete('CASCADE');
      table.string('url', 2048).notNullable();
      table.string('title', 500);
      table.text('description');
      table.string('image_url', 2048);
      table.string('site_name', 200);
      table.timestamps(true, true);

      table.index('post_id');
    });
  }
}

export function down(knex) {
  return knex.schema.dropTableIfExists('post_link_previews');
}
