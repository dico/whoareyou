// Decode HTML entities in text scraped from <meta> tags (og:title,
// og:description …). Shops often encode non-ASCII as `&#229;` or `&aring;`;
// stored raw, the frontend escapes the `&` again and shows "F&#229;".
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aring: 'å', Aring: 'Å', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø',
  auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü',
  eacute: 'é', Eacute: 'É', egrave: 'è', aacute: 'á', oacute: 'ó', ccedil: 'ç',
  szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', deg: '°', euro: '€', times: '×',
};

export function decodeHtmlEntities(str) {
  if (!str) return str;
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : match;
    }
    return NAMED[code] ?? match;
  });
}
