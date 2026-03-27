export function up(knex) {
  return knex.schema
    .alterTable('contacts', (table) => {
      table.enum('visibility', ['shared', 'private']).defaultTo('shared').notNullable();
      table.index(['tenant_id', 'visibility']);
    })
    .alterTable('posts', (table) => {
      table.enum('visibility', ['shared', 'private']).defaultTo('shared').notNullable();
    })
    .alterTable('labels', (table) => {
      table.enum('visibility', ['shared', 'private']).defaultTo('shared').notNullable();
    });
}

export function down(knex) {
  return knex.schema
    .alterTable('contacts', (table) => {
      table.dropIndex(['tenant_id', 'visibility']);
      table.dropColumn('visibility');
    })
    .alterTable('posts', (table) => {
      table.dropColumn('visibility');
    })
    .alterTable('labels', (table) => {
      table.dropColumn('visibility');
    });
}
