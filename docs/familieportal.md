# Familieportal — konsept og implementeringsplan

> Planlagt feature. Ikke implementert ennå. Denne dokumentasjonen beskriver konsept, arkitektur og implementeringsplan for fremtidig utvikling.

## Bakgrunn

WhoareYou brukes i dag kun av husstandsmedlemmer med full tilgang. Utvidet familie (besteforeldre, tanter, onkler etc.) har ingen måte å se bilder eller interagere med barnas/kjæledyrenes tidslinjer.

MomentGarden/Minnehagen løser dette i dag, men er en ekstern tjeneste. Målet er å bygge en tilsvarende funksjonalitet direkte i WhoareYou — en enkel, mobilfokusert portal der utvidet familie kan:

- Se tidslinjen til spesifikke barn/kjæledyr
- Like og kommentere på innlegg
- Legge til egne innlegg med bilder/videoer
- Bytte mellom flere barn/kjæledyr de har tilgang til

## Designprinsipper

- **Helt separat UI** — egen side (`/portal`), eget design, ingen navbar/søk/admin
- **Mobilfokusert** — portalen er primært for telefon/nettbrett
- **Foto-album-estetikk** — store bildekort, ikke CRM-layout
- **Null risiko** — portalgjester har ingen tilgang til hovedappen
- **To tilgangsmoduser** — gjestekonto (e-post+passord) eller delelenke (token i URL)

## Brukeropplevelse

### For familien (admin)

Administreres via Settings → Portal i hovedappen:

1. **Velg hvilke kontakter som eksponeres** — f.eks. "Ailo", "Enya" (barn/kjæledyr)
2. **Opprett portalgjester** — "Bestemor Vigdis", "Farmor Anne Lisbeth" — med valgfri e-post+passord
3. **Styr tilgang** — hvem ser hvem (Bestemor ser begge barn, Farmor ser bare det ene)
4. **Generer delelenker** — midlertidige eller permanente URL-er som gir tilgang uten innlogging
5. **Trekk tilbake** — deaktiver gjester eller lenker

### For gjester (portalbrukere)

1. **Åpne portal** — via delelenke eller innlogging på `/portal/login`
2. **Se kontakter** — horisontalt scrollbar med avatarer øverst (som Instagram Stories)
3. **Bla i tidslinje** — store bildekort med tekst, dato, likes, kommentarer
4. **Interagere** — like (hjerte), kommentere, se andres kommentarer
5. **Legge til innlegg** — bilde/video + tekst, tagge flere barn (innlegget vises på alle taggede barns tidslinjer)

## Arkitektur

### Separasjon fra hovedappen

Portalen er en **helt separat SPA** med egen HTML-entrypoint, egen router, egen API-klient og egne CSS-stiler. Den deler ingen frontend-kode med hovedappen (utenom eventuell gjenbruk av utility-funksjoner).

Backend-ruter er under `/api/portal/` med egen autentiserings-middleware. Portalgjester har **ingen tilgang** til standard API-endepunkter.

### Tilgangsmodell

Kjernen er en **contactIds-array** — listen over kontakt-IDer en gjest har tilgang til. Alle portal-API-endepunkter filtrerer data basert på denne listen. Det finnes ingen måte å omgå dette.

```
Portal-gjest "Bestemor" → contactIds: [870, 851] → kan se poster for Ailo og Enya
Delelenke "for Farmor" → contactIds: [870] → kan kun se poster for Ailo
```

### Database-skjema

#### Nye tabeller

**`portal_guests`** — portalgjester (separat fra `users`-tabellen)

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT PK | |
| uuid | CHAR(36) UNIQUE | Ekstern ID |
| tenant_id | INT FK → tenants | Hvilken husstand |
| display_name | VARCHAR(100) | "Bestemor Vigdis" |
| email | VARCHAR(255) NULL | Null for lenke-basert tilgang |
| password_hash | VARCHAR(255) NULL | Null for lenke-basert tilgang |
| is_active | BOOLEAN | Kan deaktiveres |
| created_by | INT FK → users | Hvem opprettet gjesten |
| last_login_at | TIMESTAMP NULL | |
| created_at, updated_at | TIMESTAMPS | |

**`portal_guest_contacts`** — hvilke kontakter en gjest har tilgang til

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| portal_guest_id | INT FK → portal_guests | |
| contact_id | INT FK → contacts | |
| PK | (portal_guest_id, contact_id) | |

**`portal_share_links`** — delelenker

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT PK | |
| uuid | CHAR(36) UNIQUE | |
| tenant_id | INT FK → tenants | |
| token_hash | VARCHAR(64) UNIQUE | SHA-256 av token |
| label | VARCHAR(255) NULL | "Lenke for Farmor" |
| portal_guest_id | INT FK → portal_guests NULL | Kobles til gjest for samme tilgang |
| created_by | INT FK → users | |
| expires_at | TIMESTAMP NULL | Null = permanent |
| is_active | BOOLEAN | Kan trekkes tilbake |
| last_used_at | TIMESTAMP NULL | |
| created_at | TIMESTAMPS | |

**`portal_link_contacts`** — når en lenke IKKE er knyttet til en gjest

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| link_id | INT FK → portal_share_links | |
| contact_id | INT FK → contacts | |
| PK | (link_id, contact_id) | |

**`portal_sessions`** — sesjoner for portalgjester

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT PK | |
| uuid | CHAR(36) UNIQUE | |
| portal_guest_id | INT FK → portal_guests | |
| refresh_token_hash | VARCHAR(64) | |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(500) | |
| is_active | BOOLEAN | |
| expires_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

#### Endringer i eksisterende tabeller

**`post_comments`** — legg til `portal_guest_id` (nullable), gjør `user_id` nullable

**`post_reactions`** — legg til `portal_guest_id` (nullable), gjør `user_id` nullable, oppdater unique constraint

**`posts`** — legg til `portal_guest_id` (nullable), gjør `created_by` nullable (for portal-opprettede poster)

### Autentisering

#### Gjestekonto-innlogging
1. Gjest åpner `/portal/login`
2. Sender e-post+passord til `POST /api/portal/auth/login`
3. Backend verifiserer mot `portal_guests`, oppretter `portal_sessions`
4. Returnerer JWT: `{ portalGuestId, tenantId, type: 'portal', sid }`
5. Frontend lagrer i localStorage (`portalToken`)

#### Delelenke
1. Gjest åpner `/portal/s/{token}`
2. Backend slår opp `portal_share_links` via `SHA256(token)`
3. Validerer: aktiv, ikke utløpt
4. Returnerer JWT: `{ linkId, tenantId, type: 'portal_link', contactIds: [...] }`
5. Frontend lagrer i sessionStorage (ephemeral)

#### Middleware: `portalAuthenticate`
Ny middleware (`backend/src/middleware/portal-auth.js`), helt separat fra `authenticate`:
- Aksepterer portal-JWT fra `Authorization`-header
- Sjekker `type === 'portal'` eller `type === 'portal_link'`
- Setter `req.portal = { type, guestId, tenantId, contactIds }`
- **contactIds** er den fundamentale tilgangskontrollen

### Backend API-endepunkter

#### Portal-ruter (`/api/portal/`)

| Metode | Endepunkt | Beskrivelse |
|--------|-----------|-------------|
| POST | `/auth/login` | Gjeste-innlogging |
| POST | `/auth/refresh` | Forny portal-sesjon |
| GET | `/auth/link/:token` | Valider delelenke |
| GET | `/contacts` | Liste kontakter gjesten har tilgang til |
| GET | `/contacts/:uuid/timeline` | Tidslinje for kontakt (paginert) |
| POST | `/posts` | Opprett innlegg (med tagging av flere kontakter) |
| POST | `/posts/:uuid/media` | Last opp media til innlegg |
| GET | `/posts/:uuid/comments` | Hent kommentarer |
| POST | `/posts/:uuid/comments` | Legg til kommentar |
| POST | `/posts/:uuid/reactions` | Toggle reaksjon |
| GET | `/me` | Gjesteprofil + tilgjengelige kontakter |

#### Admin-ruter (`/api/portal-admin/`)

| Metode | Endepunkt | Beskrivelse |
|--------|-----------|-------------|
| GET | `/guests` | Liste portalgjester |
| POST | `/guests` | Opprett portalgjest |
| PUT | `/guests/:uuid` | Oppdater gjest |
| DELETE | `/guests/:uuid` | Slett gjest |
| PUT | `/guests/:uuid/contacts` | Sett tilgjengelige kontakter |
| POST | `/links` | Opprett delelenke |
| GET | `/links` | Liste delelenker |
| DELETE | `/links/:uuid` | Trekk tilbake delelenke |

### Frontend-struktur

#### Portal (egen SPA)

```
frontend/
├── portal.html                    — Separat HTML-entrypoint
├── css/
│   └── portal.css                 — Portal-spesifikke stiler
└── js/
    ├── portal-app.js              — Router + state
    ├── api/portal-client.js       — API-klient for portal
    └── pages/
        ├── portal-login.js        — Innloggingsside
        └── portal-timeline.js     — Hovedvisning (kontakter + tidslinje)
```

#### Admin (i hovedappen)

```
frontend/js/pages/admin-portal.js  — Gjeste-/lenke-administrasjon
```

#### Nginx

```nginx
location /portal {
    root /app/frontend;
    try_files /portal.html /portal.html;
}
```

### Mediafiler

Portal-gjester trenger tilgang til bilder/videoer. Eksisterende `/uploads/`-rute bruker `authenticate`-middleware. Løsning:

- Legg til `?ptoken=`-parameter i `/uploads/`-handleren
- Ny `portalMediaAuth`-middleware som validerer portal-JWT og sjekker at filen tilhører en tillatt kontakt
- Portal-frontend bruker `ptoken` i stedet for `token` i bilde-URLer

### Post-tagging og multi-kontakt-innlegg

Eksisterende system støtter allerede:
- `posts.contact_id` = "dette innlegget handler om kontakt X" (profilpost)
- `post_contacts` junction = "dette innlegget tagger kontakt X, Y, Z"
- Tidslinje-query henter poster hvor `contact_id = X ELLER X finnes i post_contacts`

For portalen:
- Når gjest poster på et barns tidslinje → `contact_id = barnet`
- Når gjest tagger flere barn → rader i `post_contacts`
- Poster opprettet av gjest: `portal_guest_id = gjest-ID`, `created_by = NULL`
- Synlighet: alltid `shared` for portal-poster

Hovedappens tidslinje viser automatisk portal-poster fordi de er vanlige `posts`-rader. Eneste endring: vis "Postet av {guest display_name}" i stedet for bruker-navn når `portal_guest_id` er satt.

## Implementeringsfaser

### Fase 1: Database og backend (3-4 dager)
- Migrasjon med alle nye tabeller og kolonneendringer
- Portal-auth middleware
- Portal API-endepunkter (les først, skriv etterpå)
- Portal-admin API-endepunkter
- Media-tilgang for portal

### Fase 2: Admin-UI (2-3 dager)
- Admin-side for gjester og lenker
- Kontaktvelger for tilgangsstyring
- Kopier-til-utklippstavle for delelenker

### Fase 3: Portal-frontend (4-5 dager)
- Egen HTML + router + API-klient
- Innloggingsside + delelenke-håndtering
- Tidslinjevisning med kontaktvelger
- Like/kommentar-interaksjon

### Fase 4: Skriveoperasjoner (2-3 dager)
- Innleggsopprettelse med foto/video-opplasting
- Multi-kontakt-tagging
- Kommentarer fra portal

### Fase 5: Integrasjon og polish (2 dager)
- Vis portalgjest-navn i hovedappens tidslinje
- Mobilresponsiv testing
- E-postvarsler ved nye innlegg/kommentarer (valgfritt)

**Estimert total: 13-17 dager**

## Sikkerhet

- Portalgjester lagres i **separat tabell** — ingen risiko for at de får hovedapp-tilgang
- JWT inneholder `type: 'portal'` — kan ikke brukes mot vanlige API-endepunkter
- Delelenke-tokens er **opaque** (ikke JWT) — trekkes tilbake umiddelbart ved sletting fra DB
- All datatilgang filtreres gjennom **contactIds-array** — ingen omgåelse mulig
- Portal-sesjoner har egen tabell og livssyklus