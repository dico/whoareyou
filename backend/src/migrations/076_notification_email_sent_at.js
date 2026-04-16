/**
 * Track when a notification was sent by email. NULL means "not yet sent by
 * email" — any such row with `deliver_email=true` on its type preference is a
 * candidate for the next digest.
 *
 * The throttle ("don't email the same user more than once per hour") is
 * implemented as: find MAX(email_sent_at) for the user; skip if within 1 hour.
 */
export async function up(knex) {
  if (!(await knex.schema.hasColumn('notifications', 'email_sent_at'))) {
    await knex.schema.alterTable('notifications', (table) => {
      table.timestamp('email_sent_at').nullable();
      table.index(['user_id', 'email_sent_at']);
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('notifications', 'email_sent_at')) {
    await knex.schema.alterTable('notifications', (table) => {
      table.dropColumn('email_sent_at');
    });
  }
}
