const TYPES = [
  { name: 'parent', inverse_name: 'child', category: 'family' },
  { name: 'spouse', inverse_name: 'spouse', category: 'family' },
  { name: 'sibling', inverse_name: 'sibling', category: 'family' },
  { name: 'grandparent', inverse_name: 'grandchild', category: 'family' },
  { name: 'uncle_aunt', inverse_name: 'nephew_niece', category: 'family' },
  { name: 'cousin', inverse_name: 'cousin', category: 'family' },
  { name: 'friend', inverse_name: 'friend', category: 'social' },
  { name: 'neighbor', inverse_name: 'neighbor', category: 'social' },
  { name: 'colleague', inverse_name: 'colleague', category: 'professional' },
  { name: 'boss', inverse_name: 'employee', category: 'professional' },
];

export function up(knex) {
  return knex('relationship_types').insert(
    TYPES.map((t) => ({ ...t, is_system: true }))
  );
}

export function down(knex) {
  return knex('relationship_types').where('is_system', true).del();
}
