# Migrering fra Monica

## Oversikt

Engangscript for å migrere data fra Monica til WhoareYou. Scriptet ligger i `backend/src/migrate-monica.js` og er ment for utviklere/tekniske brukere.

Scriptet kan kjøres flere ganger — det sletter eksisterende data i target-tenant før import.

## Hva migreres

| Monica | WhoareYou | Antall (sist kjørt) |
|--------|-----------|---------------------|
| contacts | contacts | 422 |
| tags | labels | 14 |
| contact_tags | contact_labels | 228 |
| contact_fields | contact_fields | 114 |
| places + addresses | addresses + contact_addresses | 107 |
| relationships | relationships | 433 (deduplisert) |
| notes | posts (med kontakt-tag) | 76 |
| activities | posts (med kontakt-tags) | 36 |
| reminders | reminders | 41 |

## Hva migreres IKKE (foreløpig)

- Profilbilder / avatars
- Kjæledyr
- Dagbok-innlegg (entries/journal)
- Dokumenter / vedlegg
- Gaver (gifts)
- Samtaler (conversations)
- Gjeld (debts)
- Livshendelster (life_events)

Disse kan legges til i scriptet ved behov.

## Kjøring

### Fra containeren
```bash
docker exec whoareyou-app sh -c "cd /app/backend && \
  DB_HOST=your-db-host \
  DB_USER=your-db-user \
  DB_PASSWORD='your-db-password' \
  DB_NAME=whoareyou \
  MONICA_DB=monica_backup \
  node src/migrate-monica.js"
```

### Via dev-tools
```bash
curl -s -X POST "http://your-server:7601/containers/whoareyou-app/exec" \
  -H "Content-Type: application/json" \
  -d '{"command":"cd /app/backend && DB_HOST=your-db-host DB_USER=your-db-user DB_PASSWORD=your-db-password DB_NAME=whoareyou MONICA_DB=monica_backup node src/migrate-monica.js"}'
```

## Konfigurasjon

Øverst i scriptet:
```js
const TARGET_TENANT_ID = 1; // Hvilken tenant data importeres til
const TARGET_USER_ID = 1;   // Hvilken bruker som "eier" importerte data
```

## Relasjonstype-mapping

Monica har flere relasjonstyper enn WhoareYou. Mapping:

| Monica | WhoareYou |
|--------|-----------|
| partner, spouse, lover, inlovewith | spouse |
| parent | parent |
| child | parent (flippet retning) |
| sibling | sibling |
| grandparent | grandparent |
| grandchild | grandparent (flippet) |
| uncle | uncle_aunt |
| nephew | uncle_aunt (flippet) |
| cousin | cousin |
| friend, bestfriend, date, ex, godfather, godson | friend |
| colleague, boss, mentor, protege, ex-colleague | colleague |

## Iterering

Scriptet kan utvides etter hvert som vi legger til funksjoner i WhoareYou. Typiske ting å legge til:
- Profilbilder (krever filkopiering + sharp-prosessering)
- Dagbok → poster uten kontakt-tag
- Livshendelster → poster med spesial-tag
