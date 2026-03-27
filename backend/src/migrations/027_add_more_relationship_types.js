export async function up(knex) {
  await knex('relationship_types').insert([
    { name: 'stepparent', inverse_name: 'stepchild', category: 'family', is_system: true },
    { name: 'godparent', inverse_name: 'godchild', category: 'family', is_system: true },
    { name: 'partner', inverse_name: 'partner', category: 'family', is_system: true },
    { name: 'ex', inverse_name: 'ex', category: 'social', is_system: true },
    { name: 'in-law', inverse_name: 'in-law', category: 'family', is_system: true },
    { name: 'mentor', inverse_name: 'mentee', category: 'professional', is_system: true },
    { name: 'classmate', inverse_name: 'classmate', category: 'social', is_system: true },
  ]);
}

export async function down(knex) {
  await knex('relationship_types')
    .whereIn('name', ['stepparent', 'godparent', 'partner', 'ex', 'in-law', 'mentor', 'classmate'])
    .del();
}
