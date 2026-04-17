export function up(knex) {
  return knex.schema.alterTable('portal_guests', (table) => {
    // Master switch controlled by admin — defaults off so new guests don't
    // get notifications until admin has onboarded them.
    table.boolean('notifications_enabled').notNullable().defaultTo(false);
    // Per-type toggles controlled by the guest themselves.
    table.boolean('notify_new_post').notNullable().defaultTo(true);
    table.boolean('notify_new_comment').notNullable().defaultTo(false);
    // Used for 6-hour digest throttling.
    table.timestamp('last_notification_email_at').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('portal_guests', (table) => {
    table.dropColumn('notifications_enabled');
    table.dropColumn('notify_new_post');
    table.dropColumn('notify_new_comment');
    table.dropColumn('last_notification_email_at');
  });
}
