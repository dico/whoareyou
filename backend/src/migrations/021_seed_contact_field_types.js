const TYPES = [
  { name: 'phone', icon: 'bi-telephone', protocol: 'tel:', sort_order: 1 },
  { name: 'email', icon: 'bi-envelope', protocol: 'mailto:', sort_order: 2 },
  { name: 'website', icon: 'bi-globe', protocol: 'https://', sort_order: 3 },
  { name: 'facebook', icon: 'bi-facebook', protocol: 'https://facebook.com/', sort_order: 4 },
  { name: 'instagram', icon: 'bi-instagram', protocol: 'https://instagram.com/', sort_order: 5 },
  { name: 'linkedin', icon: 'bi-linkedin', protocol: 'https://linkedin.com/in/', sort_order: 6 },
  { name: 'x', icon: 'bi-twitter-x', protocol: 'https://x.com/', sort_order: 7 },
  { name: 'snapchat', icon: 'bi-snapchat', protocol: 'https://snapchat.com/add/', sort_order: 8 },
];

export function up(knex) {
  return knex('contact_field_types').insert(
    TYPES.map((t) => ({ ...t, tenant_id: null, is_system: true }))
  );
}

export function down(knex) {
  return knex('contact_field_types').where('is_system', true).del();
}
