// Public share link per wishlist. The plaintext token is kept so members can
// copy the link again (same as signage_screens.token); lookups use the hash.
export async function up(knex) {
  if (await knex.schema.hasColumn('gift_wishlists', 'share_token_hash')) return;
  await knex.schema.alterTable('gift_wishlists', (table) => {
    table.string('share_token', 128).nullable();
    table.string('share_token_hash', 64).nullable().unique();
  });
}

export async function down(knex) {
  if (!(await knex.schema.hasColumn('gift_wishlists', 'share_token_hash'))) return;
  await knex.schema.alterTable('gift_wishlists', (table) => {
    table.dropUnique(['share_token_hash']);
    table.dropColumn('share_token_hash');
    table.dropColumn('share_token');
  });
}
