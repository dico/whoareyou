export function up(knex) {
  return knex.schema.alterTable('life_events', (table) => {
    table.boolean('remind_annually').defaultTo(false);
  });
}

export function down(knex) {
  return knex.schema.alterTable('life_events', (table) => {
    table.dropColumn('remind_annually');
  });
}
