export async function up(knex) {
  const exists = await knex.schema.hasTable('export_log');
  if (!exists) {
    await knex.schema.createTable('export_log', (table) => {
      table.increments('id');
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.string('export_type', 20).notNullable(); // 'data' or 'full'
      table.boolean('encrypted').notNullable().defaultTo(false);
      table.string('ip_address', 45).nullable();
      table.string('country_code', 2).nullable();
      table.string('filename', 255).nullable();
      table.integer('file_size').unsigned().nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('tenant_id');
    });
  }
}

export function down(knex) {
  return knex.schema.dropTableIfExists('export_log');
}
