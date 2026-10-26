/**
 * Visibility circles — admin-defined subsets of tenant members (e.g.
 * "Foreldre") that can be chosen as a post's audience. Adds a fourth post
 * visibility level, 'circle', where `posts.circle_id` names the circle.
 *
 * Circle posts are only visible to the circle's members and the post's
 * creator. Like 'private', they never reach the portal, signage, books or
 * memory notifications. Circles grant no other permissions.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('visibility_circles'))) {
    await knex.schema.createTable('visibility_circles', (table) => {
      table.increments('id').primary();
      table.uuid('uuid').notNullable().unique();
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.string('name', 100).notNullable();
      table.timestamps(true, true);
      table.unique(['tenant_id', 'name']);
    });
  }

  if (!(await knex.schema.hasTable('visibility_circle_members'))) {
    await knex.schema.createTable('visibility_circle_members', (table) => {
      table.integer('circle_id').unsigned().notNullable().references('id').inTable('visibility_circles').onDelete('CASCADE');
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.primary(['circle_id', 'user_id']);
      table.index('user_id');
    });
  }

  await knex.raw("ALTER TABLE posts MODIFY visibility ENUM('shared','private','family','circle') DEFAULT 'shared'");

  if (!(await knex.schema.hasColumn('posts', 'circle_id'))) {
    await knex.schema.alterTable('posts', (table) => {
      // SET NULL is a fallback only — the delete route converts a circle's
      // posts to 'private' first, so a circle post never loses its audience
      // silently. A 'circle' post with NULL circle_id is creator-only.
      table.integer('circle_id').unsigned().nullable()
        .references('id').inTable('visibility_circles').onDelete('SET NULL');
    });
  }
}

export async function down(knex) {
  await knex.raw("UPDATE posts SET visibility='private' WHERE visibility='circle'");
  if (await knex.schema.hasColumn('posts', 'circle_id')) {
    await knex.schema.alterTable('posts', (table) => {
      table.dropForeign(['circle_id']);
      table.dropColumn('circle_id');
    });
  }
  await knex.raw("ALTER TABLE posts MODIFY visibility ENUM('shared','private','family') DEFAULT 'shared'");
  await knex.schema.dropTableIfExists('visibility_circle_members');
  await knex.schema.dropTableIfExists('visibility_circles');
}
