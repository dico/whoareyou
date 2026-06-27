/**
 * Per-user "last viewed" tracking for contacts.
 *
 * `contacts.last_viewed_at` is global (shared across the household) — kept
 * intact for a possible future "Recently viewed in the family" feature.
 * This table records per-(user, contact) views so each user's own
 * "Nylig vist" list reflects only what they personally have opened.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('contact_views'))) {
    await knex.schema.createTable('contact_views', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable().references('id').inTable('contacts').onDelete('CASCADE');
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.timestamp('viewed_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'contact_id']);
      table.index(['user_id', 'viewed_at']);
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('contact_views')) {
    await knex.schema.dropTable('contact_views');
  }
}
