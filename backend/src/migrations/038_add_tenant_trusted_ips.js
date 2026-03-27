export function up(knex) {
  return knex.schema.alterTable('tenants', (table) => {
    // Comma-separated CIDR ranges, e.g. "192.168.1.0/24,10.0.0.0/8"
    table.string('trusted_ip_ranges', 500).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('tenants', (table) => {
    table.dropColumn('trusted_ip_ranges');
  });
}
