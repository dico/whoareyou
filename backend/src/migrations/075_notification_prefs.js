/**
 * Per-user notification preferences.
 *
 * Three layers decide whether a notification fires for user U about contact C:
 *   1. Per-person override (user_notification_overrides) — 'always' or 'never', wins over everything.
 *   2. Per-type global rule (user_notification_prefs) — scope: 'none'|'all'|'favorites'|'family'|'guests'|'both'|'my_posts'|'all_posts'.
 *      Interpretation depends on type; 'none' disables, 'all' allows everything.
 *   3. Favorites (contacts.is_favorite) — consulted when scope='favorites'.
 *
 * Channels: deliver_app (navbar bell) and deliver_email (SMTP). Stored per-type
 * so the user can e.g. want birthdays in the app but not by email.
 *
 * Per-user, not per-tenant: each user in the household has their own rules.
 * `tenant_id` is carried so a user who switches tenants keeps separate rules
 * per household.
 */
export async function up(knex) {
  const hasPrefs = await knex.schema.hasTable('user_notification_prefs');
  if (!hasPrefs) {
    await knex.schema.createTable('user_notification_prefs', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('type', 32).notNullable();
      table.string('scope', 32).notNullable().defaultTo('all');
      table.boolean('deliver_app').notNullable().defaultTo(true);
      table.boolean('deliver_email').notNullable().defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'tenant_id', 'type']);
      table.index(['user_id', 'tenant_id']);
    });
  }

  const hasOverrides = await knex.schema.hasTable('user_notification_overrides');
  if (!hasOverrides) {
    await knex.schema.createTable('user_notification_overrides', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable().references('id').inTable('contacts').onDelete('CASCADE');
      table.string('type', 32).notNullable();
      table.enum('mode', ['always', 'never']).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'tenant_id', 'contact_id', 'type']);
      table.index(['user_id', 'tenant_id']);
      table.index(['contact_id']);
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('user_notification_overrides')) {
    await knex.schema.dropTable('user_notification_overrides');
  }
  if (await knex.schema.hasTable('user_notification_prefs')) {
    await knex.schema.dropTable('user_notification_prefs');
  }
}
