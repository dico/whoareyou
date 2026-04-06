export async function up(knex) {
  const exists = await knex.schema.hasTable('book_jobs');
  if (!exists) {
    await knex.schema.createTable('book_jobs', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.string('title', 255).notNullable();
      table.string('subtitle', 255).nullable();
      // JSON array of contact UUIDs the book covers
      table.json('contact_uuids').notNullable();
      table.date('date_from').nullable();
      table.date('date_to').nullable();
      // 'shared' or 'shared_family' — never includes private
      table.string('visibility_filter', 20).notNullable().defaultTo('shared_family');
      // JSON options: { language, includeComments, includeReactions, chapterGrouping }
      table.json('layout_options').nullable();
      // draft | ready
      table.string('status', 20).notNullable().defaultTo('ready');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['tenant_id', 'user_id']);
    });
  }
}

export function down(knex) {
  return knex.schema.dropTableIfExists('book_jobs');
}
