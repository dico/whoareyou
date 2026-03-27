/**
 * Geocoding service using OpenStreetMap Nominatim.
 * Respects Nominatim usage policy: max 1 request/second.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export async function geocodeAddress(street, postalCode, city, country) {
  const query = [street, postalCode, city, country].filter(Boolean).join(', ');
  if (!query) return null;

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': 'WhoareYou PRM (self-hosted)' },
  });

  if (!response.ok) return null;

  const results = await response.json();
  if (results.length === 0) return null;

  return {
    latitude: parseFloat(results[0].lat),
    longitude: parseFloat(results[0].lon),
  };
}

/**
 * Geocode all addresses without coordinates.
 * Adds a 1.1s delay between requests to respect Nominatim rate limits.
 */
export async function geocodeAllAddresses(db, tenantId = null) {
  const query = db('addresses')
    .whereNull('latitude')
    .where(function () {
      this.whereNotNull('street').orWhereNotNull('city');
    });

  if (tenantId) query.where('tenant_id', tenantId);

  const addresses = await query;
  console.log(`Geocoding ${addresses.length} addresses...`);

  let success = 0;
  let failed = 0;

  for (const addr of addresses) {
    try {
      const result = await geocodeAddress(addr.street, addr.postal_code, addr.city, addr.country);

      if (result) {
        await db('addresses').where({ id: addr.id }).update({
          latitude: result.latitude,
          longitude: result.longitude,
          geocoded_at: db.fn.now(),
        });
        success++;
        console.log(`  OK: ${addr.street}, ${addr.city} → ${result.latitude}, ${result.longitude}`);
      } else {
        failed++;
        console.log(`  MISS: ${addr.street}, ${addr.city}`);
      }
    } catch (err) {
      failed++;
      console.log(`  ERROR: ${addr.street} — ${err.message}`);
    }

    // Rate limit: 1 req/sec for Nominatim
    await new Promise((r) => setTimeout(r, 1100));
  }

  console.log(`\nGeocoding complete: ${success} success, ${failed} failed`);
  return { success, failed };
}
