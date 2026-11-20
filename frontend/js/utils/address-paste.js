/**
 * Split a pasted one-line address ("Karl Johans vei 49, 7100 Rissa") into
 * street, postal code and city.
 *
 * Accepted shapes (comma or line breaks between parts, optional trailing country):
 *   "Karl Johans vei 49, 7100 Rissa"
 *   "Karl Johans vei 49\n7100 Rissa\nNorge"
 *   "Karl Johans vei 49 7100 Rissa"
 *
 * Returns { street, postal_code, city } or null if the text doesn't look like that.
 */
const POSTAL_PART = /^(\d{4,5})\s+(\p{L}[\p{L}\s.'-]*)$/u;

export function parseAddress(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  const parts = raw.split(/\s*[,\n\r]+\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Last part with "1234 City" — anything after it (e.g. country) is dropped
    for (let i = parts.length - 1; i >= 1; i--) {
      const m = parts[i].match(POSTAL_PART);
      if (m) {
        return { street: parts.slice(0, i).join(', '), postal_code: m[1], city: m[2].trim() };
      }
    }
    return null;
  }

  // No separator: "Street 12 7100 Rissa"
  const m = raw.match(/^(.+?\S)\s+(\d{4})\s+(\p{L}[\p{L}\s.'-]*)$/u);
  if (m) return { street: m[1], postal_code: m[2], city: m[3].trim() };
  return null;
}

/**
 * When a full address is pasted into the street input, fill postal code and city too.
 * Ordinary pastes (just a street) are left alone.
 */
export function attachAddressPaste(streetInput, postalInput, cityInput) {
  if (!streetInput || !postalInput || !cityInput) return;
  streetInput.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text');
    const parsed = parseAddress(text);
    if (!parsed) return;
    e.preventDefault();
    streetInput.value = parsed.street;
    postalInput.value = parsed.postal_code;
    cityInput.value = parsed.city;
  });
}
