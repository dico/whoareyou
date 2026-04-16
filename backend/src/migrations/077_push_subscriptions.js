/**
 * Web Push subscriptions per user/device.
 *
 * Each browser that subscribes produces an endpoint URL + two keys (p256dh,
 * auth). We store one row per (user, endpoint) pair — a single user may have
 * many devices. Rows are deleted on explicit unsubscribe, on 404/410 from
 * the push service (subscription expired), or cascade when the user is
 * deleted.
 *
 * Also adds `deliver_push` to user_notification_prefs so the three-layer
 * filter can decide which types generate a push.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('push_subscriptions'))) {
    await knex.schema.createTable('push_subscriptions', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('endpoint').notNullable();
      table.string('p256dh', 255).notNullable();
      table.string('auth', 255).notNullable();
      table.string('user_agent', 255).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('last_used_at').nullable();
      table.index(['user_id', 'tenant_id']);
      // endpoint uniqueness across users (can't have a unique on TEXT in MySQL
      // without specifying length, so index a prefix)
      table.index(knex.raw('endpoint(255)'));
    });
  }

  if (!(await knex.schema.hasColumn('user_notification_prefs', 'deliver_push'))) {
    await knex.schema.alterTable('user_notification_prefs', (table) => {
      table.boolean('deliver_push').notNullable().defaultTo(true);
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('user_notification_prefs', 'deliver_push')) {
    await knex.schema.alterTable('user_notification_prefs', (table) => {
      table.dropColumn('deliver_push');
    });
  }
  if (await knex.schema.hasTable('push_subscriptions')) {
    await knex.schema.dropTable('push_subscriptions');
  }
}
