export function up(knex) {
  return knex.schema
    .createTable('gift_events', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 200).notNullable();
      table.enum('event_type', ['christmas', 'birthday', 'wedding', 'other']).defaultTo('other');
      table.date('event_date').nullable();
      table.integer('honoree_contact_id').unsigned().nullable()
        .references('id').inTable('contacts').onDelete('SET NULL');
      table.text('notes').nullable();
      table.integer('created_by').unsigned().notNullable()
        .references('id').inTable('users');
      table.timestamps(true, true);

      table.index('tenant_id');
      table.index(['tenant_id', 'event_date']);
    })
    .createTable('gift_products', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 300).notNullable();
      table.text('description').nullable();
      table.string('url', 2048).nullable();
      table.string('image_url', 2048).nullable();
      table.decimal('default_price', 10, 2).nullable();
      table.string('currency_code', 3).defaultTo('NOK');
      table.integer('created_by').unsigned().notNullable()
        .references('id').inTable('users');
      table.timestamps(true, true);

      table.index('tenant_id');
      table.index(['tenant_id', 'name']);
    })
    .createTable('gift_product_links', (table) => {
      table.increments('id');
      table.integer('product_id').unsigned().notNullable()
        .references('id').inTable('gift_products').onDelete('CASCADE');
      table.string('store_name', 200).nullable();
      table.string('url', 2048).notNullable();
      table.decimal('price', 10, 2).nullable();
    })
    .createTable('gift_orders', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.integer('event_id').unsigned().nullable()
        .references('id').inTable('gift_events').onDelete('SET NULL');
      table.integer('product_id').unsigned().nullable()
        .references('id').inTable('gift_products').onDelete('SET NULL');
      table.string('title', 300).notNullable();
      table.enum('status', ['idea', 'reserved', 'purchased', 'wrapped', 'given', 'cancelled']).defaultTo('idea');
      table.enum('order_type', ['outgoing', 'incoming']).defaultTo('outgoing');
      table.decimal('price', 10, 2).nullable();
      table.string('currency_code', 3).defaultTo('NOK');
      table.text('notes').nullable();
      table.enum('visibility', ['shared', 'private']).defaultTo('private');
      table.integer('created_by').unsigned().notNullable()
        .references('id').inTable('users');
      table.timestamps(true, true);

      table.index('tenant_id');
      table.index(['tenant_id', 'event_id']);
      table.index(['tenant_id', 'status']);
    })
    .createTable('gift_order_participants', (table) => {
      table.increments('id');
      table.integer('order_id').unsigned().notNullable()
        .references('id').inTable('gift_orders').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.enum('role', ['giver', 'recipient']).notNullable();

      table.unique(['order_id', 'contact_id', 'role']);
      table.index('contact_id');
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('gift_order_participants')
    .dropTableIfExists('gift_orders')
    .dropTableIfExists('gift_product_links')
    .dropTableIfExists('gift_products')
    .dropTableIfExists('gift_events');
}
