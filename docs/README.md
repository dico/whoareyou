# Personal Relationship Management System

## Bakgrunn

Inspirert av [Monica](https://github.com/monicahq/monica), men utviklet fra scratch som et eget prosjekt. Monica har hatt stagnerende utvikling — ny versjon har vært under arbeid i 2-3 år uten ferdigstilling, og siste aktivitet på ny versjon var ~7 måneder siden.

Målet er å bygge et moderne, vedlikeholdbart system for å holde oversikt over personlige relasjoner.

## Dokumentstruktur

| Dokument | Beskrivelse |
|----------|-------------|
| [Fase 1 — Kravspesifikasjon](fase-1-kravspesifikasjon.md) | Funksjonelle og ikke-funksjonelle krav |
| [Fase 2 — Arkitektur](fase-2-arkitektur.md) | Teknologivalg og systemdesign |
| [Fase 3 — Datamodell](fase-3-datamodell.md) | Database-skjema, brukermodell og relasjoner |
| [Fase 4 — UI/UX](fase-4-ui-ux.md) | Designsystem, retningslinjer og komponentbibliotek |
| [Fase 5 — Implementering](fase-5-implementering.md) | Utviklingsplan og milepæler |
| [Migrering fra Monica](migrering-monica.md) | Engangscript for import fra Monica-database |

## Teknologistakk

| | Valg |
|---|---|
| Frontend | Vanilla JS (ES6+), Bootstrap 5, Leaflet |
| Backend | Node.js + Express, Knex.js |
| Database | MySQL (ekstern) |
| App-server | Docker på Ubuntu |
| Reverse proxy | Nginx (i container) + Nginx Proxy Manager (lokalt DNS via PiHole) |
| Auth | bcrypt + JWT (15 min) + refresh tokens (30d) + TOTP 2FA |
| Bildeprosessering | sharp (WebP, thumbnail, EXIF-stripping) |
| Kart | Leaflet + OpenStreetMap, Nominatim geocoding |
| i18n | JSON locale-filer (en + nb), t()-funksjon med fallback |
| Dev-tools | FastAPI-bro for AI-assistert debugging (port 7601) |
| CI/CD | GitHub → DockerHub/GHCR (ikke satt opp ennå) |

## Miljø

| | URL / Port |
|---|---|
| App | http://whoareyou.local (port 7600) |
| Dev-tools | port 7601 |
| MySQL | Se .env for host/port, database `whoareyou` |

## Faseplan

- [x] Fase 1 — Kravspesifikasjon
- [x] Fase 2 — Arkitektur
- [x] Fase 3 — Datamodell
- [x] Fase 4 — UI/UX (dokumentert og implementert)
- [ ] Fase 5 — Implementering (pågår)

## TODO

> Denne listen holdes løpende oppdatert, slik at det er enkelt å fortsette der man slapp — uansett om det er pause i utviklingen, ny samtale, eller bytte av PC. Les denne først for å forstå hva som gjenstår.

### Gjort (dag 1 — 2026-03-27)
- [x] Prosjektskjelett — Dockerfile, docker-compose, Nginx, Express, Knex
- [x] 29 Knex-migrasjoner — 19 tabeller + 2 seeds + system admin + last_viewed_at + post contact_id + visibility + YouTube/TikTok + relationship types + dates + kjæreste/samboer
- [x] Deploy og verifisert — containere kjører
- [x] Auth — register, login, JWT, refresh, system admin, tenant-bytte
- [x] Kontakt-CRUD — list, get, create, update, soft delete, søk, filtrering, sortering
- [x] Post/tidslinje — CRUD, profil-poster vs aktivitets-poster, @-mention, tagging
- [x] Relasjoner API — types, create, delete (433 migrert fra Monica)
- [x] Adresser — CRUD, geocoding (Nominatim), kartvisning, adresse-søk
- [x] Profilbilder — upload med crop, sharp-prosessering, photo viewer, drag-and-drop
- [x] Frontend — login, dashboard, kontaktliste, profil (Facebook-stil), kart, tidslinje
- [x] Designsystem — glass-effect, egne dialoger, post-list komponent, navbar-søk
- [x] Monica-import — 422 kontakter, 356 bilder, 112 poster, 433 relasjoner, 107 adresser
- [x] robots.txt, .gitignore, dev-tools integrert
- [x] Synlighet/privat — visibility-kolonne (shared/private) på contacts, posts, labels + API-filtrering + frontend-toggle
- [x] Admin-sider (shell) — settings, tenant admin, system admin med tenant-bytte
- [x] Dropdown WCAG — glass-dropdown: solid hvit bakgrunn, ingen glass-effekt
- [x] Kontaktfelt — CRUD API + inline add/edit/delete i sidebar + YouTube/TikTok-typer (migrasjon 026)
- [x] SoMe-felt — kompakt visning med ikon + brukernavn i stedet for full URL
- [x] Relasjoner — legg til via kontaktsøk + type-velger (modal med kategorier)
- [x] Adresser — legg til ny adresse + "same address as"-snarvei (søk i eksisterende)
- [x] Household-seksjon — viser hvem som bor på samme adresse i sidebar
- [x] Relasjons-labels — renere styling (label + navn i stedet for badge)
- [x] Visibility pill-toggle — shared/private som pill-switch i post-compose

- [x] Adresse-side — `/addresses/:id` med nåværende og tidligere beboere, kart
- [x] Adresse move-out/move-in — markere utflytting + angre, adressehistorikk
- [x] "Same as" fikset — deler nå eksisterende adresse i stedet for å opprette duplikat
- [x] Rediger adresse — redigere eksisterende adresse (modal), fjerne adressekobling, hover-actions
- [x] Rediger relasjon — endre type/datoer (modal), slette relasjon, hover-actions
- [x] Grupper/labels — CRUD API, assign/remove i sidebar, filter i kontaktliste, klikkbare labels
- [x] i18n komplett — t()-funksjon, en.json + nb.json, språkvelger i settings, browser-deteksjon, locale-aware datoer
- [x] Standardisert contact-row komponent — avatar + navn + meta, brukes overalt
- [x] Kontaktkort-grid — individuelle kort med alder, visibility-badge, favoritt
- [x] Dashboard — kommende bursdager (30 dager) i sidebar
- [x] Kart — husker posisjon/zoom, søkefelt til høyre, adresse-lenker i popups
- [x] Relasjonstyper — 19 typer inkl. kjæreste, samboer, steforelder, fadder, sviger
- [x] Post-tags — hvit tekst på hover (WCAG)

- [x] Brukerprofil — redigere navn/e-post, bytte passord, språkvelger i Settings
- [x] Bilder i poster — image-knapp i compose, multi-upload, preview, grid-galleri, lightbox-viewer
- [x] Standardisert lightbox — post-bilder og profilbilder bruker samme photo-viewer-design

- [x] Adresse-merge — admin-side for å finne og slå sammen duplikater
- [x] Adresse-deling — del adresse fra relasjonsliste (hus-ikon), legg til beboer fra adresseside
- [x] Label-administrasjon — split-view for å flytte/kopiere kontakter mellom labels

- [x] Påminnelser — CRUD, bursdags-auto-varsler, bjelle med unread-count, kontakt-påminnelser, e-post-placeholder
- [x] Bildebeskyttelse — /uploads/ auth-beskyttet via Express + token query param, nginx proxy
- [x] Drag-and-drop på poster — dra bilder fra nettleser/Facebook/filsystem + Ctrl+V paste
- [x] Kontaktliste-preferanser — filter/sort huskes i localStorage

- [x] Tenant member API — liste, invitere, deaktivere, rolle-endring, koble bruker til kontakt

- [x] Globalt søk — kontakter + poster + kontaktfelt, grupperte resultater, klikk på post → scroll + highlight

- [x] Bedrifter — CRUD, bedriftsside med ansatte/tidligere ansatte, sidebar på kontaktprofil, navbar + globalt søk

- [x] Livshendelser — 10 event-typer med ikoner, sidebar + tidslinje-feed, type-velger-grid
- [x] Tilbake-knapp — bruker history.back() på bedrift/adresse-sider (navigerer tilbake dit man kom fra)

- [x] Merkedager — integrert som "påminn årlig" på livshendelser, genererer varsler på jubileum
- [x] Livshendelser redigering — endre type/dato/beskrivelse, koble kontakter (inline søk), vises på tvers av profiler

#### Design-runde (dag 2)
- [x] Logo — SVG-logo (people-circle) i navbar, login-side og favicon
- [x] Bildeknapp — `.post-media-btn` (ikon uten border) erstatter Bootstrap-knapp i compose
- [x] Lenker uten understrek — global `.btn-link` override, ny `.subtle-link`-klasse for sekundære lenker
- [x] Kontaktfelt-gruppering — felt sorteres i kategorier (kontakt, nett, SoMe) med luft mellom
- [x] Nettsider — vises som ikon + label/domene (samme stil som SoMe-felt)
- [x] Visibility-pill — matcher høyden på `.btn-sm` (konsistent compose-bar)
- [x] Sidebar — ikke lenger sticky på kontaktprofil (scroller med innhold)
- [x] Post dropdown z-index — `:has(.dropdown-menu.show)` løfter post over neste
- [x] Cropper — firkantet viewport (ikke sirkulær), større area (450px), "Last opp original"-knapp, i18n
- [x] Notifications — fikset duplikat-bug (emoji-prefix mismatch), fjernet hardkodede emojis, i18n for bursdagsvarsler
- [x] @-mention i edit-modus — `attachMention` på edit-textarea, tagging fungerer i redigering
- [x] Klikkbare navn i poster — `linkifyPost` matcher taggede kontaktnavn i tekst og gjør dem til lenker
- [x] Contact chips — post-tags med mini-avatar (pill-design), erstatter blå badges overalt (poster, livshendelser, timeline compose)
- [x] Del adresse — hus-ikon skjules når kontakten ikke har adresse
- [x] Livshendelser i tidslinje — "Fikk barn med Navn", per-type preposisjoner (med/fra/sammen med), filtrerer bort profil-kontakt, skjuler linked for pensjonert/gikk bort
- [x] Post-header layout — visibility-ikon og ellipsis-meny side ved side (flex)
- [x] Avatar i alle kontakt-valg — mention, contactSearchDialog, tag-dialog og livshendelser sender avatar fra API

- [x] Interesser/hobbyer — gjenbruker labels med category (group/interest), samlet i én seksjon med gruppe/interesse-ikoner

- [x] Slektstre — SVG med profilbilder, hover-highlight, nivåbasert layout, klikkbare noder
- [x] Opprett kontakt fra relasjon — ny kontakt + relasjon i én dialog, med andre-forelder-valg
- [x] Relasjonsforslag — utleder manglende søsken, besteforeldre, onkel/tante, partner-barn automatisk
- [x] Relasjonstyper begge retninger — forelder/barn, besteforelder/barnebarn, sjef/ansatt som separate valg
- [x] PWA — manifest.json, app-ikoner (192+512), apple-touch-icon, standalone-modus, safe-area for notch

### Neste (prioritert)
- [ ] **Eksport** — eksportere kontakter, poster, relasjoner som JSON/CSV

#### Autentisering og sikkerhet (implementert)
- [x] Sesjonsbasert auth — sessions-tabell, kort-levd JWT (15 min) + refresh token (30 dager), auto-refresh i frontend
- [x] Sesjonsvisning i profil — se alle aktive pålogginger med enhet/IP, logge ut andre sesjoner
- [x] To-faktor-autentisering (2FA) — TOTP med QR-kode, backup-koder, deaktivering med passord
- [x] Trusted IP-ranges — per tenant, konfigurerbar i tenant admin UI + env var fallback
- [x] 2FA-påkrevd eksternt — brukere uten 2FA får feilmelding ved ekstern pålogging (når trusted ranges er konfigurert)
- [x] Settings redesign — profil + 2FA øverst, admin-kort med fargerike ikoner i grid, ryddig navbar-dropdown
- [x] Security admin-side — `/admin/security` med sesjoner og trusted IP-ranges (flyttet fra settings)
- [x] Rate limiting — alle API-endepunkter (300 req/15 min), auth strengere (20 req/15 min)
- [x] CORS-begrensning — `CORS_ORIGIN` env var for produksjon
- [x] Passord-endring revokerer alle andre sesjoner
- [x] Session cleanup — automatisk opprydning av utløpte sesjoner hver time

- [x] Passkey/WebAuthn — registrering i profil, passordfri innlogging, bypasser 2FA, browser-lib fra vendor
- [x] Profil/Settings-splitt — `/profile` for personlig (konto, 2FA, passkeys), `/settings` for admin-kort

- [x] Mobil-layout — dashboard sidebar stacker vertikalt, lange URLer brytes, "Last inn flere"-knapp på tidslinje
- [x] Sikkerhetsaudit runde 2 — alle HIGH/MEDIUM-funn fikset (label-tenant, fil-tenant, type-validering)

#### Gjenstår (sikkerhet)
- [ ] E-post ved ny pålogging — varsle bruker når ny enhet/lokasjon logger inn (krever SMTP-oppsett)

### Senere
- [ ] Slektstre forbedringer — pan/zoom, husstand-gruppering, velge hvilke relasjoner som vises, dybde-kontroll
- [ ] Dokumenter — utvide upload-støtte til PDF/filer
- [ ] Reminder-frekvens — månedlig, kvartalsvis, årlig

### Vurderes
- [ ] **Gaver og ønskelister** — events (f.eks. "Jul 2026"), gaver gitt/mottatt med retning (person→person, husstand→husstand, husstand→person), ønskelister per person, produktregister med historikk over hvem som fikk/ga produktet. Større feature som krever eget design
- [ ] Kjæledyr-registrering
- [ ] Egendefinerte kjønn
- [ ] Konfigurerbare seksjoner på kontaktkortet

### Planlagte konsepter

#### ~~Household / adresse-deling~~ ✅ Implementert
Household-seksjon, "same as"-snarvei, adresse-side med beboerhistorikk, move-out/move-in.

#### Komplekse familieforhold
Familierelasjoner kan være rotete — skilte foreldre, barn med flere partnere, bonus/ste-barn. Vi trenger å støtte dette uten å gjøre UI-et rotete. Mulig tilnærming: toggle/filter på relasjonskategorier (familie/sosialt/jobb), og et slektstre (SVG) i modal for å visualisere familiestruktur.

#### Slektstre
Rendere familiestruktur visuelt med SVG eller canvas i en modal. Åpnes fra et ikon ved siden av "Relationships"-headeren. Viser foreldre, barn, søsken, ektefelle — med klikkbare noder for å navigere.

#### Label-administrasjon (tag management)
Side for avansert tag-håndtering: se alle kontakter per tag, flytte kontakter mellom tags i en split-view (venstre: kilde-tag, høyre: mål-tag). Nyttig når grupper endrer seg over tid — f.eks. barnehage → skole, der de fleste men ikke alle skal flyttes til ny tag. Beholder historikk ved å ha begge tags.

## Feature-oversikt

### Kontakthåndtering
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Kontakt-CRUD | **Implementert** | Opprette, redigere, slette kontakter |
| Profilbilder | **Implementert** | Flere bilder, crop, viewer, drag-and-drop, set primary |
| Hvordan vi møttes | **Implementert** | Felt + visning i sidebar |
| Favoritter | **Implementert** | Markering + filtrering |
| Grupper/labels | **Implementert** | CRUD API, assign/remove i sidebar, filter i kontaktliste, klikkbare |
| Søk og filtrering | **Implementert** | Navn, favoritter, sortering, paginering |
| Synlighet | **Implementert** | Privat/delt per kontakt, toggle ved opprettelse/redigering |

### Tidslinje / poster
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Opprette poster | **Implementert** | Profil-poster + aktivitets-poster |
| Tagge kontakter | **Implementert** | @-mention + manuell tagging |
| Redigere poster | **Implementert** | Inline edit med tag-håndtering, bytte about-kontakt |
| Bilder i poster | **Implementert** | Multi-upload i compose, grid-galleri, sharp-prosessering |
| Global tidslinje | **Implementert** | Dashboard med sidebar |
| Per-kontakt tidslinje | **Implementert** | Facebook-lignende profil |
| Sist kontaktet | **Implementert** | Auto-oppdatert fra poster |
| Synlighet | **Implementert** | Privat/delt per post, toggle ved compose + quick-toggle via meny |

### Relasjoner og familie
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Generelle relasjoner | **Implementert** | API + visning i sidebar med avatar, gruppert etter kategori |
| Familierelasjoner | **Implementert** | Foreldre, barn, søsken, ektefelle, ste-foreldre, gudfar, svigers |
| Legg til relasjon | **Implementert** | Én dialog: søk kontakt → velg type (optgroup) → valgfrie datoer (siden/til) |
| Relasjonstyper | **Implementert** | 17 typer: spouse, parent, sibling, grandparent, uncle_aunt, cousin, stepparent, godparent, partner, ex, in-law, friend, neighbor, classmate, colleague, boss, mentor |
| Relasjonsdatoer | **Implementert** | Valgfri start_date/end_date (sammen siden, gikk fra hverandre) |
| Relasjonsvisning | **Implementert** | Avatar + navn + type, sortert: spouse → child → parent → sibling → venner |
| Navigasjon | **Implementert** | Klikke mellom relaterte kontakter |
| Slektstre | Planlagt | SVG-visualisering i modal |

### Adresser og kart
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Adresser på kontakter | **Implementert** | Backend + sidebar-visning |
| Kartvisning | **Implementert** | Leaflet, minikart + fullskjerm, on-demand Leaflet |
| Omvendt oppslag | **Implementert** | Adresse-søk API |
| Geocoding | **Implementert** | Nominatim, automatisk ved ny adresse + batch-script |
| Adressehistorikk | **Implementert** | moved_in_at/moved_out_at |

### Kontaktinfo
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Standard felt | **Implementert** | CRUD API + inline add/edit/delete i sidebar |
| Egendefinerte felt | Delvis (backend) | contact_field_types finnes, egendefinerte via UI planlagt |
| SoMe-visning | **Implementert** | Kompakt ikon + brukernavn for sosiale medier |
| Felt-typer | **Implementert** | phone, email, website, facebook, instagram, linkedin, x, snapchat, youtube, tiktok |
| Flere felt per type | **Støttet** | Kan ha flere av samme type (f.eks. to YouTube-kanaler) med label |

### Påminnelser og varsler
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Bursdagspåminnelser | Planlagt | Tabeller finnes, frontend mangler |
| Egne påminnelser | Planlagt | 41 migrert fra Monica |
| In-app varsler | Planlagt | Bjelle-ikon er placeholder |
| E-postvarsler | Senere | |
| Push-varsler | Senere | |

### System
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Autentisering | **Implementert** | Register, login, JWT, refresh |
| System admin | **Implementert** | Første bruker = system admin, tenant-bytte |
| Multi-tenancy | **Implementert** | Isolerte data per familie |
| Synlighet | **Implementert** | Privat/delt data innad i tenant — API-filtrering + frontend |
| Rollestyring | Delvis | admin/member per tenant |
| Settings-side | **Implementert** | Bruker-info, lenker til admin-sider |
| Tenant admin UI | Delvis (shell) | Side for å administrere medlemmer (inviter-funksjon planlagt) |
| System admin UI | **Implementert** | Tenant-oversikt + bytte tenant |
| REST API | **Implementert** | Auth, contacts, posts, addresses, relationships, uploads |
| Bildeprosessering | **Implementert** | sharp: WebP, thumbnail, crop, EXIF-stripping |
| Monica-import | **Implementert** | Kontakter, bilder, poster, relasjoner, adresser, labels |
| Eksport | Senere | |
