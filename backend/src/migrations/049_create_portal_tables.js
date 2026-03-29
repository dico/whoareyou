export async function up(knex) {
  // Idempotent — safe to re-run if migration failed partway through

  if (!await knex.schema.hasTable('portal_guests')) {
    await knex.schema.createTable('portal_guests', (table) => {
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
    });
  }

  if (!await knex.schema.hasTable('portal_guest_contacts')) {
    await knex.schema.createTable('portal_guest_contacts', (table) => {
      table.integer('portal_guest_id').unsigned().notNullable()
        .references('id').inTable('portal_guests').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.primary(['portal_guest_id', 'contact_id']);
    });
  }

  if (!await knex.schema.hasTable('portal_share_links')) {
    await knex.schema.createTable('portal_share_links', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('token_hash', 64).notNullable().unique();
      table.string('label', 255).nullable();
      table.integer('portal_guest_id').unsigned().nullable()
        .references('id').inTable('portal_guests').onDelete('SET NULL');
      table.json('contact_ids').nullable();
      table.integer('created_by').unsigned().notNullable()
        .references('id').inTable('users');
      table.timestamp('expires_at').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_used_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('tenant_id');
    });
  }

  if (!await knex.schema.hasTable('portal_sessions')) {
    await knex.schema.createTable('portal_sessions', (table) => {
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
    });
  }

  // Add portal_guest_id to comments and reactions (check if column exists)
  const commentsHasCol = await knex.schema.hasColumn('post_comments', 'portal_guest_id');
  if (!commentsHasCol) {
    await knex.schema.alterTable('post_comments', (table) => {
      table.integer('portal_guest_id').unsigned().nullable()
        .references('id').inTable('portal_guests').onDelete('CASCADE');
    });
  }

  const reactionsHasCol = await knex.schema.hasColumn('post_reactions', 'portal_guest_id');
  if (!reactionsHasCol) {
    await knex.schema.alterTable('post_reactions', (table) => {
      table.integer('portal_guest_id').unsigned().nullable()
        .references('id').inTable('portal_guests').onDelete('CASCADE');
    });
  }

  // Make user_id nullable on comments and reactions
  await knex.raw('ALTER TABLE post_comments MODIFY user_id INT UNSIGNED NULL').catch(() => {});
  await knex.raw('ALTER TABLE post_reactions MODIFY user_id INT UNSIGNED NULL').catch(() => {});

  // Add portal_enabled to tenants
  const tenantsHasCol = await knex.schema.hasColumn('tenants', 'portal_enabled');
  if (!tenantsHasCol) {
    await knex.schema.alterTable('tenants', (table) => {
      table.boolean('portal_enabled').defaultTo(false);
    });
  }
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
