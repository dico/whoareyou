export async function up(knex) {
  await knex.schema.alterTable('contacts', (table) => {
    table.tinyint('birth_day').unsigned().nullable();
    table.tinyint('birth_month').unsigned().nullable();
    table.smallint('birth_year').unsigned().nullable();
  });

  // Migrate existing date_of_birth data into the new columns
  await knex.raw(`
    UPDATE contacts
    SET birth_day   = DAY(date_of_birth),
        birth_month = MONTH(date_of_birth),
        birth_year  = YEAR(date_of_birth)
    WHERE date_of_birth IS NOT NULL
  `);

  await knex.schema.alterTable('contacts', (table) => {
    table.dropColumn('date_of_birth');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('contacts', (table) => {
    table.date('date_of_birth').nullable();
  });

  // Restore full dates where all three parts exist
  await knex.raw(`
    UPDATE contacts
    SET date_of_birth = DATE(CONCAT(birth_year, '-', LPAD(birth_month, 2, '0'), '-', LPAD(birth_day, 2, '0')))
    WHERE birth_day IS NOT NULL AND birth_month IS NOT NULL AND birth_year IS NOT NULL
  `);

  await knex.schema.alterTable('contacts', (table) => {
    table.dropColumn('birth_day');
    table.dropColumn('birth_month');
    table.dropColumn('birth_year');
  });
}
