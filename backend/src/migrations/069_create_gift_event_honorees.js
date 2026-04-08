/**
 * Multi-honoree support for gift events.
 *
 * Some events have more than one honoree (wedding: bride + groom,
 * shared birthday for a couple, anniversary, etc.). The single
 * `honoree_contact_id` column on `gift_events` is too restrictive.
 *
 * This migration:
 *   - Creates `gift_event_honorees` (junction: event_id + contact_id, plus
 *     a position column for stable ordering).
 *   - Migrates existing `gift_events.honoree_contact_id` rows into the
 *     junction so the new code can read both old and new events the
 *     same way.
 *   - Leaves the legacy column in place for now — to be removed in a
 *     follow-up migration once code paths no longer reference it.
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('gift_event_honorees');
  if (!exists) {
    await knex.schema.createTable('gift_event_honorees', (table) => {
      table.increments('id');
      table.integer('event_id').unsigned().notNullable()
        .references('id').inTable('gift_events').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.integer('position').unsigned().notNullable().defaultTo(0);
      table.unique(['event_id', 'contact_id']);
      table.index('event_id');
      table.index('contact_id');
    });
  }

  // Backfill: copy existing single-honoree rows into the junction table.
  const legacy = await knex('gift_events')
    .whereNotNull('honoree_contact_id')
    .select('id', 'honoree_contact_id');
  for (const row of legacy) {
    const existsRow = await knex('gift_event_honorees')
      .where({ event_id: row.id, contact_id: row.honoree_contact_id })
      .first();
    if (!existsRow) {
      await knex('gift_event_honorees').insert({
        event_id: row.id,
        contact_id: row.honoree_contact_id,
        position: 0,
      });
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('gift_event_honorees');
}
