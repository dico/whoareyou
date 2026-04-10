export async function up(knex) {
  const has = await knex.schema.hasColumn('signage_screens', 'image_fit');
  if (!has) {
    await knex.schema.alterTable('signage_screens', (table) => {
      table.string('image_fit', 20).notNullable().defaultTo('contain');
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('signage_screens', 'image_fit')) {
    await knex.schema.alterTable('signage_screens', (table) => {
      table.dropColumn('image_fit');
    });
  }
}
