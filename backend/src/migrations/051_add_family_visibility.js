export function up(knex) {
  return knex.raw("ALTER TABLE posts MODIFY visibility ENUM('shared','private','family') DEFAULT 'shared'")
    .then(() => knex.raw("ALTER TABLE contacts MODIFY visibility ENUM('shared','private','family') DEFAULT 'shared'"))
    .then(() => knex.raw("ALTER TABLE labels MODIFY visibility ENUM('shared','private','family') DEFAULT 'shared'"))
    .then(() => knex.raw("ALTER TABLE gift_orders MODIFY visibility ENUM('shared','private','family') DEFAULT 'private'"));
}

export function down(knex) {
  return knex.raw("UPDATE posts SET visibility='shared' WHERE visibility='family'")
    .then(() => knex.raw("ALTER TABLE posts MODIFY visibility ENUM('shared','private') DEFAULT 'shared'"))
    .then(() => knex.raw("UPDATE contacts SET visibility='shared' WHERE visibility='family'"))
    .then(() => knex.raw("ALTER TABLE contacts MODIFY visibility ENUM('shared','private') DEFAULT 'shared'"))
    .then(() => knex.raw("UPDATE labels SET visibility='shared' WHERE visibility='family'"))
    .then(() => knex.raw("ALTER TABLE labels MODIFY visibility ENUM('shared','private') DEFAULT 'shared'"))
    .then(() => knex.raw("ALTER TABLE gift_orders MODIFY visibility ENUM('shared','private') DEFAULT 'private'"));
}
