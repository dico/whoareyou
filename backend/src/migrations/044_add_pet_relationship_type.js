export async function up(knex) {
  await knex('relationship_types').insert([
    { name: 'owner', inverse_name: 'pet', category: 'family', is_system: true },
  ]);
}

export async function down(knex) {
  await knex('relationship_types').whereIn('name', ['owner']).del();
}
