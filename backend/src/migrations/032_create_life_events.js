export function up(knex) {
  return knex.schema
    .createTable('life_event_types', (table) => {
      table.increments('id');
      table.integer('tenant_id').unsigned().nullable(); // null = system default
      table.string('name', 100).notNullable(); // e.g. 'married', 'child_born'
      table.string('icon', 50).nullable(); // Bootstrap icon class
      table.string('color', 7).nullable(); // hex color
      table.boolean('is_system').defaultTo(false);
      table.integer('sort_order').defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('life_events', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants');
      table.integer('contact_id').unsigned().notNullable().references('id').inTable('contacts').onDelete('CASCADE');
      table.integer('event_type_id').unsigned().notNullable().references('id').inTable('life_event_types');
      table.date('event_date').notNullable();
      table.text('description').nullable();
      table.integer('created_by').unsigned().references('id').inTable('users');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index('tenant_id');
      table.index('contact_id');
      table.index(['tenant_id', 'event_date']);
    })
    .createTable('life_event_contacts', (table) => {
      // Link additional contacts to a life event (e.g. married TO someone)
      table.integer('life_event_id').unsigned().notNullable().references('id').inTable('life_events').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable().references('id').inTable('contacts').onDelete('CASCADE');
      table.primary(['life_event_id', 'contact_id']);
    })
    .then(() => {
      // Seed system default event types
      return knex('life_event_types').insert([
        { name: 'married', icon: 'bi-heart-fill', color: '#FF3B6F', is_system: true, sort_order: 1 },
        { name: 'engaged', icon: 'bi-gem', color: '#FF9500', is_system: true, sort_order: 2 },
        { name: 'child_born', icon: 'bi-balloon-heart', color: '#34C759', is_system: true, sort_order: 3 },
        { name: 'moved', icon: 'bi-house-door', color: '#007AFF', is_system: true, sort_order: 4 },
        { name: 'new_job', icon: 'bi-briefcase', color: '#5856D6', is_system: true, sort_order: 5 },
        { name: 'retired', icon: 'bi-sun', color: '#FF9500', is_system: true, sort_order: 6 },
        { name: 'graduated', icon: 'bi-mortarboard', color: '#007AFF', is_system: true, sort_order: 7 },
        { name: 'passed_away', icon: 'bi-flower1', color: '#8E8E93', is_system: true, sort_order: 8 },
        { name: 'divorced', icon: 'bi-heart-half', color: '#8E8E93', is_system: true, sort_order: 9 },
        { name: 'other', icon: 'bi-star', color: '#007AFF', is_system: true, sort_order: 99 },
      ]);
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('life_event_contacts')
    .dropTableIfExists('life_events')
    .dropTableIfExists('life_event_types');
}
