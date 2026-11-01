// Wishlist share links as their own entity: one token → a set of contacts.
// A single-person link and a family link are the same thing with one or
// many contacts. Replaces gift_wishlists.share_token(_hash) from 084;
// existing links are moved over with the same token so they keep working.
export async function up(knex) {
  if (!(await knex.schema.hasTable('wishlist_shares'))) {
    await knex.schema.createTable('wishlist_shares', (table) => {
      table.increments('id');
      table.string('uuid', 36).notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable()
        .references('id').inTable('tenants').onDelete('CASCADE');
      table.string('token', 128).notNullable();
      table.string('token_hash', 64).notNullable().unique();
      table.integer('created_by').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
      table.index('tenant_id');
    });
  }
  if (!(await knex.schema.hasTable('wishlist_share_contacts'))) {
    await knex.schema.createTable('wishlist_share_contacts', (table) => {
      table.integer('share_id').unsigned().notNullable()
        .references('id').inTable('wishlist_shares').onDelete('CASCADE');
      table.integer('contact_id').unsigned().notNullable()
        .references('id').inTable('contacts').onDelete('CASCADE');
      table.primary(['share_id', 'contact_id']);
    });
  }

  if (await knex.schema.hasColumn('gift_wishlists', 'share_token_hash')) {
    const { v4: uuidv4 } = await import('uuid');
    const shared = await knex('gift_wishlists').whereNotNull('share_token_hash')
      .select('tenant_id', 'contact_id', 'share_token', 'share_token_hash', 'created_by');
    for (const wl of shared) {
      const [shareId] = await knex('wishlist_shares').insert({
        uuid: uuidv4(),
        tenant_id: wl.tenant_id,
        token: wl.share_token,
        token_hash: wl.share_token_hash,
        created_by: wl.created_by,
      });
      await knex('wishlist_share_contacts').insert({ share_id: shareId, contact_id: wl.contact_id });
    }
    await knex.schema.alterTable('gift_wishlists', (table) => {
      table.dropUnique(['share_token_hash']);
      table.dropColumn('share_token_hash');
      table.dropColumn('share_token');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('wishlist_share_contacts');
  await knex.schema.dropTableIfExists('wishlist_shares');
}
