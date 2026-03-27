# Fase 2 — Arkitektur

## Designprinsipp: Enkelt og native

Samme "less is more"-filosofi som UI-et gjelder for teknologivalg. Vi unngår unødvendige abstraksjoner, tunge byggesystemer og rammeverk som drar med seg hundrevis av dependencies. Koden skal være forståelig, vedlikeholdbar, og så nær nettleseren som mulig.

## Teknologistakk (besluttet)

| Lag | Teknologi | Begrunnelse |
|-----|-----------|-------------|
| **Frontend** | Vanilla JS (ES6+), Bootstrap 5, Leaflet | Null byggesteg, native i nettleser |
| **Backend** | Node.js + Express | Samme språk hele veien, minimalistisk |
| **Query builder** | Knex.js | Tynn, database-agnostisk, gode migrasjoner |
| **Database** | MySQL (ekstern) | Brukers dedikerte server hjemme |
| **Bildeprosessering** | sharp | Best-in-class for Node, WebP-støtte |
| **Auth** | bcrypt + JWT | Eget system, ingen eksterne avhengigheter |
| **Container** | Docker | App-container, DB ekstern |
| **Reverse proxy** | Nginx | Serverer frontend + proxyer API |
| **Kart** | Leaflet + OpenStreetMap/Nominatim | Gratis, ingen API-nøkler |

## Frontend — Vanilla JS med ES6-moduler

**Ingen React/Vue/Angular.**

React hadde sin berettigelse da man måtte polyfille for IE6-IE11. I 2026 støtter alle relevante nettlesere ES6+ nativt. Vi kommer langt med:

| Verktøy | Rolle |
|---------|-------|
| **Vanilla JS (ES6+)** | Applikasjonslogikk, DOM-manipulering |
| **ES6-moduler** | Kodeorganisering (`import`/`export` native i nettleser) |
| **Bootstrap 5** | Grid, komponenter (modal, dropdown, toast), responsivt grunnlag |
| **Templating (jsrender el.)** | HTML-templates for gjenbrukbare views |
| **Enkel router (page.js el.)** | Client-side routing for SPA-opplevelse |
| **Leaflet** | Kartvisning (OpenStreetMap) |
| **CSS custom properties** | Design-tokens, tema-håndtering |

### Fordeler
- Null byggesteg — koden kjører direkte i nettleseren
- Ingen node_modules med tusenvis av pakker (kun backend har node_modules)
- Lett å forstå og vedlikeholde
- Raskere lasting, mindre payload
- Full kontroll — ingen "magi" fra rammeverk

### Frontend-struktur
```
frontend/
├── index.html
├── css/
│   ├── variables.css          # Design-tokens
│   ├── base.css               # Reset, typography, glass-effect
│   ├── components/            # Per-komponent CSS
│   │   ├── card.css
│   │   ├── timeline.css
│   │   ├── avatar.css
│   │   └── ...
│   └── bootstrap-overrides.css
├── js/
│   ├── app.js                 # Entry point, router setup
│   ├── api/                   # API-klient (fetch wrapper)
│   │   └── client.js
│   ├── components/            # Gjenbrukbare UI-komponenter
│   │   ├── modal.js
│   │   ├── timeline-post.js
│   │   ├── contact-card.js
│   │   └── ...
│   ├── pages/                 # Side-moduler
│   │   ├── contacts.js
│   │   ├── contact-detail.js
│   │   ├── timeline.js
│   │   ├── map.js
│   │   └── ...
│   ├── utils/                 # Hjelpefunksjoner
│   │   ├── validation.js
│   │   ├── format.js
│   │   └── i18n.js
│   └── templates/             # HTML-templates
│       ├── contact.html
│       ├── post.html
│       └── ...
├── locales/                   # Oversettelser
│   ├── en.json
│   └── nb.json
├── vendor/                    # Tredjepartsbiblioteker (Bootstrap, Leaflet, etc.)
└── img/                       # Statiske assets
```

## Backend — Node.js + Express

### Begrunnelse
- Samme språk (JS) i hele stakken — lavere kognitiv byrde
- Express er minimalistisk og modent — ikke bloated
- Knex.js er en tynn query builder som støtter MySQL, PostgreSQL og SQLite
- sharp for bildeprosessering er best-in-class
- Skiller seg tydelig fra dev-tools (Python) — ingen forvirring

### Backend-struktur
```
backend/
├── package.json
├── knexfile.js                # Knex-konfigurasjon (DB-tilkobling)
├── src/
│   ├── index.js               # Entry point — Express app setup
│   ├── config/
│   │   └── index.js           # Env-variabler, konfigurasjon
│   ├── middleware/
│   │   ├── auth.js            # JWT-verifisering
│   │   ├── tenant.js          # Tenant-isolering
│   │   ├── upload.js          # Filopplasting (multer)
│   │   └── validate.js        # Request-validering
│   ├── routes/
│   │   ├── auth.js            # Login, register, token refresh
│   │   ├── contacts.js        # CRUD kontakter
│   │   ├── posts.js           # CRUD poster/tidslinje
│   │   ├── relationships.js   # Relasjoner mellom kontakter
│   │   ├── addresses.js       # Adresser og geocoding
│   │   ├── reminders.js       # Påminnelser
│   │   ├── notifications.js   # Varsler
│   │   ├── tasks.js           # Oppgaver
│   │   └── uploads.js         # Bilde/fil-opplasting
│   ├── services/              # Forretningslogikk
│   │   ├── image.js           # sharp — resize, thumbnail, WebP
│   │   ├── geocoding.js       # Nominatim-klient
│   │   ├── notification.js    # Varslingssystem
│   │   └── ...
│   ├── utils/                 # Delte hjelpefunksjoner
│   │   ├── validation.js      # Felles validering (e-post, telefon, etc.)
│   │   ├── format.js          # Formatering
│   │   └── errors.js          # Konsistent feilhåndtering
│   └── migrations/            # Knex-migrasjoner
│       ├── 001_create_tenants.js
│       ├── 002_create_users.js
│       ├── 003_create_contacts.js
│       └── ...
├── uploads/                   # Opplastede filer (bind mount i Docker)
└── seeds/                     # Testdata (valgfritt)
```

## Database — MySQL

### Tilkobling
- **Utvikling:** Ekstern MySQL-server hjemme (via `host.docker.internal` eller direkte IP)
- **Produksjon:** Konfigurerbar via miljøvariabler
- **Andre brukere:** Kan bruke docker-compose med MySQL-container, eller egen server

### Database-agnostisk strategi
- Knex.js abstraherer dialekt-forskjeller mellom MySQL, PostgreSQL og SQLite
- Unngå MySQL-spesifikke funksjoner der mulig
- Migrasjoner via Knex — kjøres automatisk ved oppstart

## Utviklingsmiljø

### Arkitektur (passer med dev-tools-mønsteret)

```
Lokal PC (Windows)                     Ubuntu-server hjemme
┌─────────────────────┐                ┌──────────────────────────────┐
│ VSCode / Claude Code │───── bind ────│ whoareyou-app (Docker)       │
│                      │     mount     │ ├── Nginx (:80)              │
│ Kildekode:           │               │ │   ├── / → frontend         │
│  z:\whoareyou\       │               │ │   └── /api → backend :3000 │
│   ├── frontend/      │               │ └── Node.js/Express (:3000)  │
│   ├── backend/       │               │                              │
│   └── dev-tools/     │               │ dev-tools (Docker, :9000)    │
│                      │               │                              │
└─────────────────────┘                │ MySQL-server (ekstern, :3306)│
                                       └──────────────────────────────┘
```

- Kode redigeres lokalt, synces til server via bind mount (som med dev-tools)
- Node.js kjører med `--watch` for auto-restart ved endringer
- Frontend-endringer er umiddelbare (statiske filer servert av Nginx)
- dev-tools gir tilgang til logger, DB-queries, container-status

### docker-compose.yml (utvikling)
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: whoareyou-app
    ports:
      - "8080:80"
    volumes:
      # Bind mount for hot-reload
      - ./frontend:/app/frontend
      - ./backend/src:/app/backend/src
      # Persistent uploads
      - ./uploads:/app/uploads
    environment:
      - NODE_ENV=development
      - DB_HOST=host.docker.internal
      - DB_PORT=3306
      - DB_NAME=whoareyou
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - TZ=Europe/Oslo
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
```

### docker-compose.prod.yml (produksjon / andre brukere)
```yaml
services:
  app:
    image: ghcr.io/dico/whoareyou:latest  # eller dockerhub
    container_name: whoareyou-app
    ports:
      - "80:80"
    volumes:
      - uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - DB_HOST=${DB_HOST:-db}
      - DB_PORT=${DB_PORT:-3306}
      - DB_NAME=${DB_NAME:-whoareyou}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped

  # Valgfri — for brukere uten egen MySQL-server
  db:
    image: mysql:8
    container_name: whoareyou-db
    volumes:
      - db-data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
      - MYSQL_DATABASE=${DB_NAME:-whoareyou}
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASSWORD}
    profiles: ["with-db"]  # Kun aktivert med --profile with-db
    restart: unless-stopped

volumes:
  uploads:
  db-data:
```

### Dockerfile
```dockerfile
FROM node:22-alpine AS base

# Backend dependencies
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --production

# Copy backend source
COPY backend/src ./src
COPY backend/knexfile.js ./

# Copy frontend (statiske filer, ingen build)
COPY frontend /app/frontend

# Nginx config
COPY nginx.conf /etc/nginx/nginx.conf
RUN apk add --no-cache nginx

# Uploads directory
RUN mkdir -p /app/uploads

EXPOSE 80

# Start Nginx + Node
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
```

### CI/CD — GitHub → Docker image
```
git push → GitHub Actions → docker build → push til ghcr.io/dockerhub
```
Andre brukere kjører:
```bash
docker compose -f docker-compose.prod.yml up -d
# Eller med inkludert database:
docker compose -f docker-compose.prod.yml --profile with-db up -d
```

### dev-tools-integrasjon
Oppdater `dev-tools/credentials.json` for dette prosjektet:
```json
{
  "database": {
    "host": "host.docker.internal",
    "port": 3306,
    "name": "whoareyou",
    "user": "...",
    "password": "..."
  },
  "docker": {
    "containers": ["whoareyou-app"]
  },
  "app": {
    "url": "http://whoareyou-app:80"
  }
}
```

## Integrasjoner

### OpenStreetMap / Leaflet
- Leaflet.js for kartvisning i frontend
- Geocoding: Nominatim (OpenStreetMap sin gratis geocoding-API) for adresse → koordinater
- Ingen API-nøkler nødvendig

### Bildeprosessering (sharp)
- Automatisk resize ved upload (f.eks. maks 1920px bredde)
- Thumbnail-generering (f.eks. 200x200 for lister, 80x80 for avatarer)
- Konvertering til WebP for bedre komprimering
- EXIF-stripping for personvern

## Sikkerhet

### Arkitektur-nivå
- Alle API-endepunkter bak autentisering (unntatt login/register)
- Tenant-isolering: alle queries filtrert på tenant_id — aldri direkte ID-oppslag uten tenant-sjekk
- Prepared statements / parameteriserte queries (Knex håndterer dette)
- CORS-policy begrenset til egen origin
- CSRF-beskyttelse
- Helmet for security headers
- Rate limiting på auth-endepunkter (express-rate-limit)
- Filopplasting: validering av filtype, størrelse, og innhold (ikke bare extension)

## Åpne spørsmål

*Ingen — alle teknologivalg er besluttet. Neste steg er Fase 3 (datamodell).*
