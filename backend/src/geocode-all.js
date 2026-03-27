/**
 * One-time script: geocode all addresses without coordinates.
 * Usage: node src/geocode-all.js
 */

import { db } from './db.js';
import { geocodeAllAddresses } from './services/geocoding.js';

const tenantId = parseInt(process.argv[2]) || null;

geocodeAllAddresses(db, tenantId)
  .then(() => { db.destroy(); })
  .catch((err) => { console.error(err); process.exit(1); });
