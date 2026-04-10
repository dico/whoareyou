/**
 * "Sensitive content" mode — a per-session opt-in to view content marked
 * as sensitive (health notes, private contacts, etc).
 *
 * - posts.is_sensitive: post is hidden from all sessions unless they have
 *   sensitive mode enabled. Orthogonal to visibility.
 * - contacts.is_sensitive: contact is hidden, AND every post that references
 *   it (subject or tagged) is implicitly hidden too. Cascades.
 * - sessions.show_sensitive_until: timestamp until which this specific
 *   session sees sensitive content. NULL = off. Past timestamp = off
 *   (auto-expiry). Far-future timestamp = "until I turn it off".
 *
 * Why per-session, not per-user: a phone, work laptop, and home browser
 * each have their own toggle. Logging in on a new device starts as off.
 */
export async function up(knex) {
  const hasPostsCol = await knex.schema.hasColumn('posts', 'is_sensitive');
  if (!hasPostsCol) {
    await knex.schema.alterTable('posts', (table) => {
      table.boolean('is_sensitive').notNullable().defaultTo(false);
      table.index('is_sensitive');
    });
  }

  const hasContactsCol = await knex.schema.hasColumn('contacts', 'is_sensitive');
  if (!hasContactsCol) {
    await knex.schema.alterTable('contacts', (table) => {
      table.boolean('is_sensitive').notNullable().defaultTo(false);
      table.index('is_sensitive');
    });
  }

  const hasSessionsCol = await knex.schema.hasColumn('sessions', 'show_sensitive_until');
  if (!hasSessionsCol) {
    await knex.schema.alterTable('sessions', (table) => {
      table.timestamp('show_sensitive_until').nullable();
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('posts', 'is_sensitive')) {
    await knex.schema.alterTable('posts', (table) => {
      table.dropColumn('is_sensitive');
    });
  }
  if (await knex.schema.hasColumn('contacts', 'is_sensitive')) {
    await knex.schema.alterTable('contacts', (table) => {
      table.dropColumn('is_sensitive');
    });
  }
  if (await knex.schema.hasColumn('sessions', 'show_sensitive_until')) {
    await knex.schema.alterTable('sessions', (table) => {
      table.dropColumn('show_sensitive_until');
    });
  }
}
