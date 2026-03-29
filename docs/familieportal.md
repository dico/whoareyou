# Familieportal — konsept og implementeringsplan

> Planlagt feature. Denne dokumentasjonen beskriver konsept, arkitektur og implementeringsplan.

## Bakgrunn

WhoareYou brukes i dag kun av husstandsmedlemmer med full tilgang. Utvidet familie (besteforeldre, tanter, onkler etc.) har ingen måte å se bilder eller interagere med barnas/kjæledyrenes tidslinjer.

MomentGarden/Minnehagen løser dette — en privat delingsplattform der foreldre deler barnets milepæler med utvidet familie. "Så enkelt som e-post." Målet er å bygge tilsvarende funksjonalitet direkte i WhoareYou.

## Kjernebruk

Besteforeldre mottar en lenke (SMS/e-post), klikker, ser barnebarna vokse opp — bilder, videoer, milepæler. Kan like og kommentere. Ingen installasjon, ingen passord (valgfritt).

## Designprinsipper

- **Portal-ruter i eksisterende app** — `/portal/*` i samme SPA, ingen separat HTML-entrypoint
- **Mobilfokusert** — portalen er primært for telefon/nettbrett
- **Foto-album-estetikk** — store bildekort, ikke CRM-layout
- **Null risiko** — portalgjester er isolert i egen tabell, contactIds-filtrering server-side
- **To tilgangsmoduser** — gjestekonto (e-post+passord) eller delelenke (lang-levd token)
- **Global + tenant-kontroll** — systemadmin kan deaktivere portal globalt, husstandsadmin per tenant

## Sikkerhet — defense in depth

### Isolering
- **Separat `portal_guests`-tabell** — portalgjester er ALDRI i `users`-tabellen. Selv med middleware-bug finnes ingen bruker å eskalere til.
- **Separat JWT-type** (`type: 'portal'`) — kan ikke brukes mot vanlige API-endepunkter. `authenticate`-middleware avviser portal-tokens eksplisitt.
- **contactIds er eneste tilgang** — alle portal-queries filtrerer på contactIds-array. Ingen måte å omgå.

### Tilgangskontroll
- **Global toggle** (`system_settings: portal_enabled`) — systemadmin kan skru av portal for hele deployment
- **Tenant toggle** (`tenants.portal_enabled`) — husstandsadmin kan skru av for sin husstand
- **Per-gjest deaktivering** — admin kan deaktivere enkeltgjester
- **Per-lenke deaktivering/utløp** — delelenker kan trekkes tilbake eller utløpe

### Overvåking
- **Portal-sesjoner synlig for admin** — se hvem som er logget inn, IP, enhet, siste aktivitet
- **Aktivitetslogg** — portal-gjest-kommentarer og reaksjoner logges med IP
- **E-postvarsling** — admin kan få varsel når en gjest logger inn (valgfritt)

### Delelenker
- Token: 48 byte random, lagres som SHA-256 hash i DB
- Konfigurerbar utløpstid (standard: 1 år, kan settes til permanent)
- Oppretter automatisk en ephemeral gjeste-sesjon ved bruk
- Lenke i URL-format: `/portal/s/{token}` → validerer → oppretter sesjon → redirect til portal

## Database-skjema

### Nye tabeller

**`portal_guests`** — portalgjester (SEPARAT fra `users`)

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
| contact_ids | JSON | Direkte contactIds for standalone lenker |
| created_by | INT FK → users | |
| expires_at | TIMESTAMP NULL | Null = permanent |
| is_active | BOOLEAN | Kan trekkes tilbake |
| last_used_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |

**`portal_sessions`** — sesjoner for portalgjester

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT PK | |
| uuid | CHAR(36) UNIQUE | |
| portal_guest_id | INT FK → portal_guests | |
| refresh_token_hash | VARCHAR(64) | |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(500) | |
| device_label | VARCHAR(255) | |
| is_active | BOOLEAN | |
| expires_at | TIMESTAMP | |
| last_activity_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

### Endringer i eksisterende tabeller

**`post_comments`** — legg til `portal_guest_id` (nullable). `user_id` forblir NOT NULL for eksisterende kommentarer. Nye portal-kommentarer: `user_id = NULL`, `portal_guest_id = gjest-ID`.

**`post_reactions`** — legg til `portal_guest_id` (nullable). Oppdater unique constraint.

**`tenants`** — legg til `portal_enabled` (BOOLEAN, default false)

**Merk:** `posts.created_by` endres IKKE — portal-MVP har ikke posting. Defer til v2.

## Arkitektur

### Frontend — portal-ruter i eksisterende app

Portalen bruker eksisterende SPA med `/portal/*`-ruter. Ingen separat HTML-entrypoint.

- `app.js` sjekker om path starter med `/portal` → setter `portalMode` flagg
- I portal-modus: ingen navbar, ingen sidebar, portal-spesifikk layout
- Gjenbruker `post-list.js` med `{ portalMode: true }` → skjuler edit/delete/visibility
- Gjenbruker `photo-viewer.js`, `dialogs.js`, `i18n.js`, `auth-url.js`
- Én `portal.css` for foto-album-estetikk

```
frontend/js/pages/
├── portal-login.js          — innlogging + delelenke-validering
└── portal-timeline.js       — kontaktvelger + tidslinje + galleri

frontend/css/
└── portal.css               — portal-spesifikke stiler
```

### Backend

```
backend/src/
├── middleware/portal-auth.js  — portal JWT-validering + contactIds
├── routes/portal.js           — portal API (tidslinje, reaksjoner, kommentarer)
└── routes/portal-admin.js     — admin API (gjester, lenker)
```

### Autentisering

#### Gjestekonto-innlogging
1. Gjest åpner `/portal/login`
2. `POST /api/portal/auth/login` → verifiserer mot `portal_guests`
3. Oppretter `portal_sessions`, returnerer JWT: `{ portalGuestId, tenantId, type: 'portal', sid }`
4. Frontend lagrer i localStorage (`portalToken`)

#### Delelenke
1. Gjest åpner `/portal/s/{token}`
2. `POST /api/portal/auth/link` → SHA-256 oppslag i `portal_share_links`
3. Validerer aktiv + ikke utløpt
4. Oppretter ephemeral portal-sesjon
5. Returnerer JWT som over
6. contactIds resolves fra gjest eller direkte fra lenke

#### Middleware: `portalAuthenticate`
- Aksepterer portal-JWT
- Sjekker `type === 'portal'`
- Laster contactIds fra `portal_guest_contacts` (alltid ferskt fra DB)
- Setter `req.portal = { guestId, tenantId, contactIds, displayName }`

### API-endepunkter

#### Portal (`/api/portal/`) — krever portalAuthenticate
| Metode | Endepunkt | Beskrivelse |
|--------|-----------|-------------|
| POST | `/auth/login` | Gjeste-innlogging |
| POST | `/auth/link` | Valider delelenke → sesjon |
| POST | `/auth/refresh` | Forny sesjon |
| GET | `/contacts` | Kontakter gjesten har tilgang til (avatar, navn) |
| GET | `/contacts/:uuid/timeline` | Tidslinje for kontakt (paginert, kun shared) |
| GET | `/contacts/:uuid/gallery` | Bilder for kontakt |
| GET | `/posts/:uuid/comments` | Kommentarer |
| POST | `/posts/:uuid/comments` | Legg til kommentar |
| POST | `/posts/:uuid/reactions` | Toggle reaksjon |
| GET | `/me` | Gjesteprofil |

#### Portal-admin (`/api/portal-admin/`) — krever authenticate + admin
| Metode | Endepunkt | Beskrivelse |
|--------|-----------|-------------|
| GET | `/guests` | Liste portalgjester |
| POST | `/guests` | Opprett gjest |
| PUT | `/guests/:uuid` | Oppdater gjest |
| DELETE | `/guests/:uuid` | Slett gjest |
| PUT | `/guests/:uuid/contacts` | Sett tilgjengelige kontakter |
| POST | `/links` | Opprett delelenke |
| GET | `/links` | Liste delelenker |
| DELETE | `/links/:uuid` | Trekk tilbake delelenke |
| GET | `/sessions` | Aktive portal-sesjoner |
| DELETE | `/sessions/:uuid` | Revokér portal-sesjon |

### Mediafiler

Portal-gjester trenger tilgang til bilder/videoer. Løsning:
- Utvid `/uploads/`-handler til å akseptere portal-JWT via `?token=`
- Sjekk at filen tilhører en kontakt i guestens `contactIds`
- Portal-frontend bruker `authUrl()` med portal-token

## Implementeringsfaser — MVP

### Fase 1: Database + backend (~3 dager)
- Migrasjoner (nye tabeller + kolonneendringer)
- Portal-auth middleware
- Portal API (les: kontakter, tidslinje, galleri)
- Portal-admin API (gjester, lenker, sesjoner)
- Media-tilgang for portal
- Global + tenant portal-toggle

### Fase 2: Admin-UI (~2 dager)
- Settings → Portal admin-side
- Gjeste-administrasjon med kontaktvelger
- Delelenke-generering med kopier-knapp
- Portal-sesjoner (overvåking)
- Global/tenant toggle

### Fase 3: Portal-frontend (~3 dager)
- Portal-login + delelenke-håndtering
- Kontaktvelger (horisontalt scrollbar med avatarer)
- Tidslinjevisning (gjenbruk post-list.js i portal-modus)
- Galleri-visning
- Like/kommentar-interaksjon
- Mobilresponsivt foto-album-design

**Estimert total: ~8 dager**

### Fase 4: v2 (senere)
- Posting fra portal (upload, tagging, moderering)
- E-postvarsler ved nye innlegg
- Push-notifikasjoner

## Sikkerhetskrav — sjekkliste

- [ ] Portal-JWT kan IKKE brukes mot vanlige API-endepunkter
- [ ] contactIds filtreres server-side på ALLE portal-queries
- [ ] Portal-gjester kan IKKE se private poster
- [ ] Portal-gjester kan IKKE se kontakter de ikke har tilgang til
- [ ] Mediefiler valideres mot contactIds
- [ ] Delelenke-tokens er kryptografisk sterke (48 byte random)
- [ ] Portal kan deaktiveres globalt og per tenant
- [ ] Portal-sesjoner er synlige for admin
- [ ] Rate limiting på portal-endepunkter (strengere enn hovedapp)
- [ ] Kommentarer fra portal-gjester kan slettes av admin
