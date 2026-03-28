export function up(knex) {
  return knex.schema
    .createTable('gift_wishlists', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.string('name', 200).notNullable();
      table.boolean('is_default').defaultTo(false);
      table.enum('visibility', ['shared', 'private']).defaultTo('shared');
      table.integer('created_by').unsigned().notNullable()
        .references('id').inTable('users');
      table.timestamps(true, true);

      table.index(['tenant_id', 'contact_id']);
    })
    .createTable('gift_wishlist_items', (table) => {
      table.increments('id');
      table.integer('wishlist_id').unsigned().notNullable()
        .references('id').inTable('gift_wishlists').onDelete('CASCADE');
      table.integer('product_id').unsigned().nullable()
        .references('id').inTable('gift_products').onDelete('SET NULL');
      table.string('title', 300).notNullable();
      table.integer('priority').defaultTo(0);
      table.text('notes').nullable();
      table.boolean('is_fulfilled').defaultTo(false);
      table.integer('fulfilled_by_order_id').unsigned().nullable()
        .references('id').inTable('gift_orders').onDelete('SET NULL');
      table.timestamps(true, true);

      table.index('wishlist_id');
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('gift_wishlist_items')
    .dropTableIfExists('gift_wishlists');
}
