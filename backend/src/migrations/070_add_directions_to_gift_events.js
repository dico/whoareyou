/**
 * Per-event direction setting controlling whether the event shows
 * a Giving tab, a Receiving tab, or both.
 *
 * Defaults:
 *   - wedding / birthday → 'incoming' (gifts received by the honoree(s))
 *   - christmas / other  → 'both'
 *
 * Users can override per event after creation.
 */
const ALLOWED = ['both', 'incoming', 'outgoing'];

export async function up(knex) {
  const exists = await knex.schema.hasColumn('gift_events', 'directions');
  if (!exists) {
    await knex.schema.alterTable('gift_events', (table) => {
      table.enum('directions', ALLOWED).notNullable().defaultTo('both');
    });
  }

  // Backfill existing rows: honoree-centric events default to incoming.
  await knex('gift_events')
    .whereIn('event_type', ['wedding', 'birthday'])
    .update({ directions: 'incoming' });
}

export async function down(knex) {
  await knex.schema.alterTable('gift_events', (table) => {
    table.dropColumn('directions');
  });
}
