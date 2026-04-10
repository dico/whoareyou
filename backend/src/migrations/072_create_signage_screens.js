/**
 * Signage screens — token-based, read-only display of timeline posts on
 * a TV or digital signage device. Each screen has its own configuration
 * (contacts, visibility, display mode, overlay options) and a unique
 * token for URL-based access without login.
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('signage_screens');
  if (!exists) {
    await knex.schema.createTable('signage_screens', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.string('token_hash', 64).notNullable().unique(); // SHA-256 hex

      table.boolean('is_active').notNullable().defaultTo(true);
      table.json('contact_uuids'); // JSON array of contact UUIDs
      table.string('visibility_filter', 20).notNullable().defaultTo('shared');
      table.integer('days_back').unsigned().nullable(); // null = all time
      table.string('display_mode', 20).notNullable().defaultTo('slideshow');
      table.integer('slide_interval').unsigned().notNullable().defaultTo(15);
      table.boolean('show_body').notNullable().defaultTo(false);
      table.boolean('show_contact_name').notNullable().defaultTo(true);
      table.boolean('show_reactions').notNullable().defaultTo(false);
      table.boolean('show_comments').notNullable().defaultTo(false);
      table.boolean('show_date').notNullable().defaultTo(true);
      table.integer('max_posts').unsigned().notNullable().defaultTo(3);
      table.boolean('shuffle').notNullable().defaultTo(false);
      table.boolean('include_sensitive').notNullable().defaultTo(false);
      table.string('feed_layout', 20).notNullable().defaultTo('horizontal');
      table.string('multi_image', 20).notNullable().defaultTo('collage');
      table.string('image_fit', 20).notNullable().defaultTo('contain');

      table.timestamp('last_accessed_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('tenant_id');
      table.index('token_hash');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('signage_screens');
}
