# Fase 3 — Datamodell

## Prinsipper

- **Tenant-isolering** — alle tabeller med brukerdata har `tenant_id`. Alle queries filtreres på dette.
- **Soft delete** — `deleted_at` på tabeller der data kan gjenopprettes (kontakter, poster)
- **Timestamps** — `created_at` og `updated_at` på alle tabeller
- **UUID vs auto-increment** — auto-increment for interne ID-er, UUID for eksponering i API (hindrer ID-guessing)
- **Synlighet** — `visibility` kolonne på kontakter, poster og labels: `shared` (default) eller `private`

## Synlighetsmodell (planlagt)

Innad i en tenant kan data være privat eller delt:

| Verdi | Betydning |
|-------|-----------|
| `shared` | Synlig for alle brukere i tenanten (default) |
| `private` | Kun synlig for brukeren som opprettet det |

Gjelder for tabellene: `contacts`, `posts`, `labels`

Implementering:
- Ny kolonne: `visibility ENUM('shared','private') DEFAULT 'shared'`
- API-queries filtrerer: `WHERE (visibility = 'shared' OR created_by = :userId)`
- Eksisterende data beholder default `shared` (ingen breaking change)
- Frontend: toggle ved opprettelse, filter i lister

## Brukermodell

Viktig distinksjon mellom tre konsepter:

| Konsept | Tabell | Kan logge inn? | Beskrivelse |
|---------|--------|----------------|-------------|
| **System admin** | `users` (is_system_admin=true) | Ja | Første registrerte bruker. Kan se og bytte mellom alle tenants. |
| **Bruker** | `users` (is_active=true, email set) | Ja | Familiemedlem som logger inn og deler kontaktlisten innad i sin tenant. |
| **Husstandsmedlem** | `users` (is_active=false, email=null) | Nei | Familiemedlem uten innlogging (f.eks. barn). Kan kobles til kontakt. Reduserer angrepsflate. |
| **Kontakt** | `contacts` | Nei, aldri | Person man holder oversikt over. Har ingen innlogging. Kan kobles til en bruker via `linked_contact_id`. |

### Roller
- **is_system_admin** — global flag, uavhengig av tenant. Kan liste alle tenants og bytte kontekst.
- **role: admin** — tenant-nivå. Kan administrere brukere innad i sin tenant (invitere, deaktivere).
- **role: member** — tenant-nivå. Vanlig bruker, kan opprette/redigere kontakter og poster.

### Tenant-bytte (system admin)
System admin har en "hjem-tenant" (sin egen familie), men kan bytte aktiv tenant via API. JWT-tokenet inneholder `tenantId` (aktiv) og `homeTenantId`. All data-tilgang filtreres på aktiv tenant.

## ER-diagram

```
tenants
  ├── users
  ├── contacts
  │     ├── contact_photos
  │     ├── contact_fields       (telefon, e-post, SoMe, etc.)
  │     ├── contact_labels       (mange-til-mange → labels)
  │     ├── contact_addresses    (med historikk)
  │     └── relationships        (kontakt ↔ kontakt)
  ├── posts
  │     ├── post_contacts        (taggede kontakter)
  │     └── post_media           (bilder, dokumenter)
  ├── labels
  ├── reminders
  ├── notifications
  ├── tasks
  └── addresses                  (delt adresse-pool med geocoding)
```

## Tabeller

### tenants
Representerer en familie/husholdning. All data er isolert per tenant.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| uuid | CHAR(36) | Ekstern ID |
| name | VARCHAR(255) | Familienavn / husholdningsnavn |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

### users
Brukere/husstandsmedlemmer. Tilhører én tenant. Kan ha innlogging (e-post + passord) eller være uten innlogging (f.eks. barn).

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| uuid | CHAR(36) | Ekstern ID |
| tenant_id | INT | FK → tenants |
| email | VARCHAR(255) | Nullable, unik. Null for medlemmer uten innlogging |
| password_hash | VARCHAR(255) | Nullable. bcrypt hash |
| first_name | VARCHAR(100) | |
| last_name | VARCHAR(100) | |
| role | ENUM('admin','member') | Rolle innad i tenant |
| language | VARCHAR(5) | Foretrukket språk (default: 'en') |
| is_active | BOOLEAN | false for deaktiverte og ikke-login-medlemmer |
| is_system_admin | BOOLEAN | Global admin, kan bytte mellom tenants |
| linked_contact_id | INT | FK → contacts, nullable. Kobler bruker til egen kontakt |
| totp_secret | VARCHAR(64) | 2FA-hemmelighet |
| totp_enabled | BOOLEAN | 2FA aktivert |
| totp_backup_codes | TEXT | JSON-array med hashede backup-koder |
| last_login_at | TIMESTAMP | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `UNIQUE(email)`, `INDEX(tenant_id)`

---

### contacts
Hovedtabellen — personer brukeren vil holde oversikt over.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| uuid | CHAR(36) | Ekstern ID |
| tenant_id | INT | FK → tenants |
| created_by | INT | FK → users (hvem opprettet) |
| first_name | VARCHAR(100) | |
| last_name | VARCHAR(100) | |
| nickname | VARCHAR(100) | Kallenavn |
| birth_day | TINYINT | Nullable (1-31) |
| birth_month | TINYINT | Nullable (1-12) |
| birth_year | SMALLINT | Nullable (f.eks. 1985) |
| how_we_met | TEXT | Fritekst om hvordan dere møttes |
| notes | TEXT | Generelle notater |
| is_favorite | BOOLEAN | Default false |
| is_active | BOOLEAN | Default true (soft "arkivering") |
| last_contacted_at | TIMESTAMP | Utledes fra poster, caches her for ytelse |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP | Soft delete |

**Indekser:** `INDEX(tenant_id)`, `INDEX(tenant_id, last_name, first_name)`, `INDEX(tenant_id, is_favorite)`, `INDEX(tenant_id, deleted_at)`

---

### contact_photos
Flere profilbilder per kontakt, med historikk.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| contact_id | INT | FK → contacts |
| tenant_id | INT | FK → tenants (for sikkerhet) |
| file_path | VARCHAR(500) | Sti til originalbilde (resized) |
| thumbnail_path | VARCHAR(500) | Sti til thumbnail |
| is_primary | BOOLEAN | Aktivt profilbilde? |
| caption | VARCHAR(255) | Valgfri bildetekst |
| taken_at | DATE | Når bildet ble tatt (valgfri) |
| sort_order | INT | For rekkefølge |
| created_at | TIMESTAMP | |

**Indekser:** `INDEX(contact_id)`, `INDEX(tenant_id)`

---

### contact_fields
Fleksible kontaktopplysninger (telefon, e-post, SoMe, etc.).

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| contact_id | INT | FK → contacts |
| tenant_id | INT | FK → tenants |
| field_type_id | INT | FK → contact_field_types |
| value | VARCHAR(500) | Verdien (telefonnr, e-post, URL, etc.) |
| label | VARCHAR(100) | Brukerdefinert label ("Jobb", "Privat") |
| sort_order | INT | Rekkefølge |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `INDEX(contact_id)`, `INDEX(tenant_id)`

---

### contact_field_types
Definerer typer kontaktfelt. Noen er system-defaults, andre brukerdefinerte.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants (NULL = system-default) |
| name | VARCHAR(100) | "phone", "email", "instagram", etc. |
| icon | VARCHAR(50) | Ikon-identifikator for frontend |
| protocol | VARCHAR(50) | URL-prefix: "tel:", "mailto:", etc. |
| is_system | BOOLEAN | Kan ikke slettes av bruker |
| sort_order | INT | |
| created_at | TIMESTAMP | |

System-defaults: phone, email, website, facebook, instagram, linkedin, twitter/X, snapchat

---

### labels
Tags for å organisere kontakter.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants |
| name | VARCHAR(100) | |
| color | VARCHAR(7) | Hex-farge (#FF5733) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `UNIQUE(tenant_id, name)`

---

### contact_labels
Mange-til-mange: kontakter ↔ labels.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| contact_id | INT | FK → contacts |
| label_id | INT | FK → labels |

**PK:** `(contact_id, label_id)`

---

### addresses
Delt adressepool. En adresse kan ha flere beboere (viktig for nabolag).

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants |
| street | VARCHAR(255) | Gateadresse |
| street2 | VARCHAR(255) | Tilleggslinje |
| postal_code | VARCHAR(20) | |
| city | VARCHAR(100) | |
| state | VARCHAR(100) | Fylke/delstat |
| country | VARCHAR(100) | |
| latitude | DECIMAL(10,7) | Geocodet |
| longitude | DECIMAL(10,7) | Geocodet |
| geocoded_at | TIMESTAMP | Sist geocodet |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `INDEX(tenant_id)`, `INDEX(tenant_id, latitude, longitude)`, `INDEX(tenant_id, postal_code)`

---

### contact_addresses
Knytter kontakter til adresser, med historikk.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| contact_id | INT | FK → contacts |
| address_id | INT | FK → addresses |
| tenant_id | INT | FK → tenants |
| label | VARCHAR(100) | "Hjem", "Jobb", "Hytte" |
| is_primary | BOOLEAN | Hovedadresse |
| moved_in_at | DATE | Når de flyttet inn |
| moved_out_at | DATE | Når de flyttet ut (NULL = bor der nå) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `INDEX(contact_id)`, `INDEX(address_id)`, `INDEX(tenant_id)`

Denne designen løser:
- **"Hvem bor i gata mi?"** → Query addresses + contact_addresses WHERE moved_out_at IS NULL
- **"Hvem bodde der før?"** → Query contact_addresses WHERE address_id = X ORDER BY moved_in_at
- **Delt adresse** → Flere contact_addresses kan peke til samme address

---

### relationships
Relasjoner mellom kontakter. Bidireksjonelle — lagres som ett par.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants |
| contact_id | INT | FK → contacts (person A) |
| related_contact_id | INT | FK → contacts (person B) |
| relationship_type_id | INT | FK → relationship_types |
| notes | TEXT | Valgfri beskrivelse |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `UNIQUE(tenant_id, contact_id, related_contact_id)`, `INDEX(contact_id)`, `INDEX(related_contact_id)`

---

### relationship_types
Definerer relasjonstyper med inverse.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | NULL = system-default |
| name | VARCHAR(100) | "parent" |
| inverse_name | VARCHAR(100) | "child" |
| category | ENUM('family','social','professional') | Gruppering |
| is_system | BOOLEAN | Kan ikke slettes |
| created_at | TIMESTAMP | |

System-defaults:

| name | inverse_name | category |
|------|-------------|----------|
| parent | child | family |
| spouse | spouse | family |
| sibling | sibling | family |
| grandparent | grandchild | family |
| uncle_aunt | nephew_niece | family |
| cousin | cousin | family |
| friend | friend | social |
| neighbor | neighbor | social |
| colleague | colleague | professional |
| boss | employee | professional |

---

### posts
Den universelle post-modellen. Erstatter aktiviteter, møter, dagbok, notater.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| uuid | CHAR(36) | Ekstern ID |
| tenant_id | INT | FK → tenants |
| created_by | INT | FK → users |
| body | TEXT | Fritekst-innhold |
| post_date | DATETIME | Når hendelsen skjedde (default: nå) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP | Soft delete |

**Indekser:** `INDEX(tenant_id, post_date DESC)`, `INDEX(tenant_id, deleted_at)`

---

### post_contacts
Taggede kontakter i en post.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| post_id | INT | FK → posts |
| contact_id | INT | FK → contacts |

**PK:** `(post_id, contact_id)`

---

### post_media
Bilder og dokumenter knyttet til poster.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| post_id | INT | FK → posts |
| tenant_id | INT | FK → tenants |
| file_path | VARCHAR(500) | Sti til fil |
| thumbnail_path | VARCHAR(500) | Sti til thumbnail (bilder) |
| file_type | VARCHAR(50) | MIME-type |
| file_size | INT | Bytes |
| sort_order | INT | |
| created_at | TIMESTAMP | |

**Indekser:** `INDEX(post_id)`, `INDEX(tenant_id)`

---

### reminders
Påminnelser — både automatiske (bursdag) og egendefinerte.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants |
| contact_id | INT | FK → contacts (nullable) |
| created_by | INT | FK → users |
| title | VARCHAR(255) | Hva skal påminnes |
| reminder_date | DATE | Dato for påminnelse |
| is_recurring | BOOLEAN | Gjentas årlig? (f.eks. bursdag) |
| is_birthday | BOOLEAN | Auto-generert fra fødselsdato |
| is_completed | BOOLEAN | Markert som utført |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `INDEX(tenant_id, reminder_date)`, `INDEX(contact_id)`

---

### notifications
Generisk varslingssystem. Alle varsler (påminnelser, system, etc.) leveres her.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants |
| user_id | INT | FK → users (mottaker) |
| type | VARCHAR(50) | "reminder", "birthday", "system" |
| title | VARCHAR(255) | Varsel-tittel |
| body | TEXT | Varsel-innhold |
| link | VARCHAR(500) | URL å navigere til |
| is_read | BOOLEAN | Lest? |
| read_at | TIMESTAMP | Når den ble lest |
| created_at | TIMESTAMP | |

**Indekser:** `INDEX(user_id, is_read, created_at DESC)`, `INDEX(tenant_id)`

---

### tasks
Oppgaver knyttet til kontakter.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants |
| contact_id | INT | FK → contacts (nullable) |
| created_by | INT | FK → users |
| title | VARCHAR(255) | Oppgavebeskrivelse |
| is_completed | BOOLEAN | |
| completed_at | TIMESTAMP | |
| due_date | DATE | Frist (valgfri) |
| sort_order | INT | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indekser:** `INDEX(tenant_id, is_completed)`, `INDEX(contact_id)`

---

### audit_log
Logg over sensitive operasjoner.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | INT AUTO_INCREMENT | PK |
| tenant_id | INT | FK → tenants |
| user_id | INT | FK → users |
| action | VARCHAR(100) | "login", "export", "delete_contact", etc. |
| entity_type | VARCHAR(50) | "contact", "post", "user" |
| entity_id | INT | ID til påvirket objekt |
| details | JSON | Ekstra kontekst |
| ip_address | VARCHAR(45) | IPv4/IPv6 |
| created_at | TIMESTAMP | |

**Indekser:** `INDEX(tenant_id, created_at DESC)`, `INDEX(user_id)`

---

## Knex-migrasjoner (rekkefølge)

```
001_create_tenants.js          019_create_audit_log.js
002_create_users.js            020_seed_relationship_types.js
003_create_contacts.js         021_seed_contact_field_types.js
004_create_contact_photos.js   022_add_system_admin_role.js
005_create_contact_field_types.js  023_add_last_viewed_at.js
006_create_contact_fields.js   024_add_post_contact_id.js
007_create_labels.js           025_add_visibility.js
008_create_contact_labels.js   026_add_youtube_tiktok_field_types.js
009_create_addresses.js        027_add_more_relationship_types.js
010_create_contact_addresses.js  028_add_relationship_dates.js
011_create_relationship_types.js  029_add_relationship_types_norwegian.js
012_create_relationships.js    030_add_user_linked_contact.js
013_create_posts.js            031_create_companies.js
014_create_post_contacts.js    032_create_life_events.js
015_create_post_media.js       033_add_life_event_remind.js
016_create_reminders.js        034_add_label_category.js
017_create_notifications.js    035_create_sessions.js
018_create_tasks.js            036_add_user_totp.js
                               037_create_system_settings.js
                               038_add_tenant_trusted_ips.js
                               039_create_passkeys.js
                               040_add_session_trusted.js
                               041_split_date_of_birth.js
                               042_nullable_user_email.js
```

## Notater

### Tenant-isolering
**Kritisk:** Selv om foreign keys allerede sikrer at en kontakt tilhører riktig tenant, inkluderer vi `tenant_id` på de fleste tabeller som en ekstra sikkerhetsbarriere. Alle queries SKAL filtrere på `tenant_id` — dette gjøres i middleware/query builder, aldri manuelt per route.

### last_contacted_at
Denne kolonnen på `contacts` er en **denormalisert cache**. Den oppdateres asynkront når en post med kontakten som tag opprettes. Alternativt kan den beregnes med en subquery, men caching gir bedre ytelse i kontaktlisten.

### Adressemodell
Adresser er en egen tabell (ikke embedded i kontakter) fordi:
- Flere kontakter kan dele adresse (familie, naboer)
- Muliggjør "hvem bor her?"-oppslag
- Geocoding-resultater caches per adresse, ikke per kontakt
- Adressehistorikk via `contact_addresses.moved_in_at/moved_out_at`

### Relasjonstyper med inverse
Lagres som par: hvis "Ola er far til Kari", lagres det som én rad med type "parent". Når vi viser Karis relasjoner, bruker vi `inverse_name` ("child") for å vise "Kari er barn av Ola".
