export async function up(knex) {
  await knex('relationship_types').insert([
    { name: 'boyfriend_girlfriend', inverse_name: 'boyfriend_girlfriend', category: 'family', is_system: true },
    { name: 'cohabitant', inverse_name: 'cohabitant', category: 'family', is_system: true },
  ]);
}

export async function down(knex) {
  await knex('relationship_types').whereIn('name', ['boyfriend_girlfriend', 'cohabitant']).del();
}
