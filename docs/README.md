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
| Bildeprosessering | sharp (WebP, thumbnail, EXIF-stripping) |
| Kart | Leaflet + OpenStreetMap, Nominatim geocoding |
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
- [x] 28 Knex-migrasjoner — 19 tabeller + 2 seeds + system admin + last_viewed_at + post contact_id + visibility + YouTube/TikTok + relationship types + relationship dates
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

### Neste (prioritert)
- [ ] **Rediger adresse** — redigere eksisterende adresse på kontakt, slette adressekobling
- [ ] **Rediger relasjon** — endre type, datoer, slette relasjon fra sidebar
- [ ] **Grupper/labels** — frontend for å opprette, redigere og tildele labels
- [ ] **Brukerprofil** — redigere eget navn, passord, språk i en egen side
- [ ] **Tenant member API** — /api/auth/tenant/members for å liste, invitere, deaktivere brukere

### Senere
- [ ] Påminnelser og varslingssystem (bjelle-ikon)
- [ ] Oppgaver knyttet til kontakter
- [ ] Bilder i poster (post_media)
- [ ] Slektstre-visualisering — SVG-rendret familiestruktur i modal
- [ ] CI/CD — GitHub Actions → Docker image
- [ ] Eksport-funksjoner

### Vurderes
- [ ] Kjæledyr-registrering
- [ ] Egendefinerte kjønn
- [ ] Konfigurerbare seksjoner på kontaktkortet
- [ ] Flere valutaer

### Planlagte konsepter

#### Household / adresse-deling
Vise hvem som bor på samme adresse i en egen seksjon på kontaktkortet ("Household"). Gjøre det enkelt å tildele samme adresse til flere kontakter — f.eks. velge "bor på samme adresse som [Person]" i stedet for å skrive inn adresse manuelt (unngå skrivefeil). Nyttig for å se nabolag og familieoversikt.

#### Komplekse familieforhold
Familierelasjoner kan være rotete — skilte foreldre, barn med flere partnere, bonus/ste-barn. Vi trenger å støtte dette uten å gjøre UI-et rotete. Mulig tilnærming: toggle/filter på relasjonskategorier (familie/sosialt/jobb), og et slektstre (SVG) i modal for å visualisere familiestruktur.

#### Slektstre
Rendere familiestruktur visuelt med SVG eller canvas i en modal. Åpnes fra et ikon ved siden av "Relationships"-headeren. Viser foreldre, barn, søsken, ektefelle — med klikkbare noder for å navigere.

## Feature-oversikt

### Kontakthåndtering
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Kontakt-CRUD | **Implementert** | Opprette, redigere, slette kontakter |
| Profilbilder | **Implementert** | Flere bilder, crop, viewer, drag-and-drop, set primary |
| Hvordan vi møttes | **Implementert** | Felt + visning i sidebar |
| Favoritter | **Implementert** | Markering + filtrering |
| Grupper/labels | Delvis (backend) | Tildele labels, frontend mangler |
| Søk og filtrering | **Implementert** | Navn, favoritter, sortering, paginering |
| Synlighet | **Implementert** | Privat/delt per kontakt, toggle ved opprettelse/redigering |

### Tidslinje / poster
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Opprette poster | **Implementert** | Profil-poster + aktivitets-poster |
| Tagge kontakter | **Implementert** | @-mention + manuell tagging |
| Redigere poster | **Implementert** | Inline edit med tag-håndtering, bytte about-kontakt |
| Bilder i poster | Planlagt | post_media-tabell finnes, frontend mangler |
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
