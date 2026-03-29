export function up(knex) {
  return knex.schema
    // Portal guests — completely separate from users table
    .createTable('portal_guests', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('display_name', 100).notNullable();
      table.string('email', 255).nullable();
      table.string('password_hash', 255).nullable();
      table.boolean('is_active').defaultTo(true);
      table.integer('created_by').unsigned().notNullable()
        .references('id').inTable('users');
      table.timestamp('last_login_at').nullable();
      table.timestamps(true, true);

      table.index('tenant_id');
      table.index(['tenant_id', 'email']);
    })

    // Which contacts a portal guest can see
    .createTable('portal_guest_contacts', (table) => {
      table.integer('portal_guest_id').unsigned().notNullable()
        .references('id').inTable('portal_guests').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.primary(['portal_guest_id', 'contact_id']);
    })

    // Share links — long-lived tokens for passwordless access
    .createTable('portal_share_links', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('token_hash', 64).notNullable().unique();
      table.string('label', 255).nullable();
      table.integer('portal_guest_id').unsigned().nullable()
        .references('id').inTable('portal_guests').onDelete('SET NULL');
      table.json('contact_ids').nullable(); // for standalone links not tied to a guest
      table.integer('created_by').unsigned().notNullable()
        .references('id').inTable('users');
      table.timestamp('expires_at').nullable(); // null = permanent
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_used_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('tenant_id');
    })

    // Portal sessions — separate from main sessions
    .createTable('portal_sessions', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('portal_guest_id').unsigned().notNullable()
        .references('id').inTable('portal_guests').onDelete('CASCADE');
      table.string('refresh_token_hash', 64).notNullable();
      table.string('ip_address', 45).nullable();
      table.string('user_agent', 500).nullable();
      table.string('device_label', 255).nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('expires_at').notNullable();
      table.timestamp('last_activity_at').defaultTo(knex.fn.now());
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['portal_guest_id', 'is_active']);
      table.index('refresh_token_hash');
    })

    // Add portal_guest_id to comments and reactions, make user_id nullable
    .alterTable('post_comments', (table) => {
      table.integer('portal_guest_id').unsigned().nullable()
        .references('id').inTable('portal_guests').onDelete('CASCADE');
    })
    .alterTable('post_reactions', (table) => {
      table.integer('portal_guest_id').unsigned().nullable()
        .references('id').inTable('portal_guests').onDelete('CASCADE');
    })
    .then(() => knex.raw('ALTER TABLE post_comments MODIFY user_id INT UNSIGNED NULL'))
    .then(() => knex.raw('ALTER TABLE post_reactions MODIFY user_id INT UNSIGNED NULL'))

    // Add portal_enabled to tenants
    .alterTable('tenants', (table) => {
      table.boolean('portal_enabled').defaultTo(false);
    });
}

export function down(knex) {
  return knex.schema
    .alterTable('tenants', (table) => { table.dropColumn('portal_enabled'); })
    .alterTable('post_reactions', (table) => { table.dropColumn('portal_guest_id'); })
    .alterTable('post_comments', (table) => { table.dropColumn('portal_guest_id'); })
    .dropTableIfExists('portal_sessions')
    .dropTableIfExists('portal_share_links')
    .dropTableIfExists('portal_guest_contacts')
    .dropTableIfExists('portal_guests');
}
