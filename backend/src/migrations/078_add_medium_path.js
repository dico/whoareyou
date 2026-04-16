export function up(knex) {
  return knex.schema
    .alterTable('post_media', (table) => {
      table.string('medium_path', 500).nullable().after('file_path');
    })
    .alterTable('contact_photos', (table) => {
      table.string('medium_path', 500).nullable().after('file_path');
    });
}

export function down(knex) {
  return knex.schema
    .alterTable('post_media', (table) => {
      table.dropColumn('medium_path');
    })
    .alterTable('contact_photos', (table) => {
      table.dropColumn('medium_path');
    });
}
