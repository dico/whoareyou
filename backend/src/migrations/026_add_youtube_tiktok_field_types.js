export async function up(knex) {
  await knex('contact_field_types').insert([
    { name: 'youtube', icon: 'bi-youtube', protocol: 'https://youtube.com/@', is_system: true, sort_order: 9 },
    { name: 'tiktok', icon: 'bi-tiktok', protocol: 'https://tiktok.com/@', is_system: true, sort_order: 10 },
  ]);
}

export async function down(knex) {
  await knex('contact_field_types').whereIn('name', ['youtube', 'tiktok']).del();
}
