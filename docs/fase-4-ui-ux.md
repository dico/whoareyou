# Fase 4 — UI/UX

## Designfilosofi

### Less is more
- **Innholdet er kongen** — UI-elementer skal støtte, ikke konkurrere med innhold
- Menyer, handlinger og verktøy skjules bak ellipsis (⋯) eller kontekstmenyer
- Minimalt med synlige knapper — kun de mest brukte handlingene er direkte tilgjengelige
- Ren, luftig layout med god bruk av whitespace

### Moderne 2026-estetikk
- **Glass-effect / glassmorphism** inspirert av Apple iOS 26
  - Halvgjennomsiktige bakgrunner med blur på kort og navbar
  - Subtile skygger og dybde
  - Lyse, softe fargepaletter (Apple-blå som primærfarge)
- Smooth animasjoner og overganger (fadeIn)
- Avrundede hjørner, myke former
- Typografi-drevet design — system font stack

### Responsivt og mobile-first
- **Bygges mobile-first** — CSS og layout designes for mobil først, utvides til desktop
- **Testes primært på desktop** — det er hovedplattformen for daglig bruk
- Breakpoints: 576px (mobil), 768px (tablet/layout-switch)
- Touch-vennlige interaksjoner (store nok treffområder)

## Designsystem

### Grunnlag
- **Bootstrap 5** som base-rammeverk (CDN)
- **Bootstrap Icons** for ikoner
- Tilpasset med eget tema gjennom CSS custom properties (variabler)
- Overstyring av Bootstrap-defaults for glass-effect, farger, border-radius

### CSS-arkitektur
- **Ingen inline styles** — aldri
- Alt gjennom CSS-klasser og CSS custom properties
- Globale design-tokens i `css/variables.css`
- Komponent-spesifikk CSS i `css/components/`
- Endring av én variabel gjenspeiles konsistent i hele appen

### Design-tokens (`css/variables.css`)
```css
:root {
  /* Glass effect */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-blur: blur(20px);
  --glass-border: 1px solid rgba(255, 255, 255, 0.3);

  /* Colors — Apple-inspirert */
  --color-primary: #007AFF;
  --color-primary-hover: #0062CC;
  --color-bg: #F2F2F7;
  --color-surface: #FFFFFF;
  --color-text: #1C1C1E;
  --color-text-secondary: #8E8E93;
  --color-border: rgba(0, 0, 0, 0.08);
  --color-danger: #FF3B30;
  --color-success: #34C759;
  --color-warning: #FF9500;

  /* Shadows */
  --shadow-sm/md/lg

  /* Border radius */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 20px; --radius-full: 9999px;

  /* Spacing */
  --space-xs: 4px → --space-2xl: 48px;

  /* Typography — system font stack */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* Transitions */
  --transition-fast: 150ms ease; --transition-base: 250ms ease;
}
```

### Gjenbrukbare komponenter

| Komponent | Fil(er) | Beskrivelse |
|-----------|---------|-------------|
| Glass card | `css/base.css` (.glass-card) | Halvgjennomsiktig kort med blur — brukes overalt |
| Confirm dialog | `js/components/dialogs.js` | Erstatter `window.confirm()` — hvit modal |
| Contact search dialog | `js/components/dialogs.js` | Erstatter `window.prompt()` — søk med keyboard-nav |
| Post list | `js/components/post-list.js` | Tidslinje med profil-/aktivitetsposter, edit/delete |
| @-mention | `js/components/mention.js` | Textarea @-autocomplete for kontakt-tagging |
| Image cropper | `js/components/image-cropper.js` | Pan + zoom + sirkulært viewport, canvas-basert |
| Photo viewer | `js/components/photo-viewer.js` | Bla gjennom bilder, set primary, delete, drag-and-drop |
| Navbar search | `js/components/navbar.js` | Global kontaktsøk med keyboard-nav og `/`-snarvei |
| Avatar | diverse | Profilbilde med initialer-fallback, hover-overlay |
| Ellipsis-meny | Bootstrap dropdown | Kontekstuell handlingsmeny (⋯) |
| Filter-tabs | `css/components/contacts.css` | Segmenterte tabs (All / Favorites) |
| Sort-select | `css/components/contacts.css` | Sorteringsvelger for kontaktliste |
| Empty state | `css/base.css` | Ikon + tekst for tomme lister |
| Visibility toggle | `js/utils/visibility.js`, `css/base.css` | Shared/private pill-switch i post-compose |
| Contact row | `js/components/contact-row.js`, `css/base.css` | Standardisert kontakt-rad: avatar + navn + meta. Brukes i sidebar, navbar-søk, kontaktsøk-dialog, relasjoner, household |
| Visibility pill | `css/base.css` | Shared/Private pill-switch i post-compose |

### i18n-arkitektur

| Fil | Beskrivelse |
|-----|-------------|
| `js/utils/i18n.js` | `t(key, params)`, `setLocale(locale)`, `getLocale()` |
| `locales/en.json` | Engelsk (fallback) |
| `locales/nb.json` | Norsk bokmål |

**Regler:**
- All brukersynlig tekst skal gå gjennom `t()` — aldri hardkodede strenger
- Nøkler er dot-separerte: `contacts.title`, `relationships.types.spouse`
- Interpolering med `{placeholder}`: `t('greeting', { name: 'Ola' })`
- Locale lastes ved oppstart: brukerens `language` → localStorage → nettleserens språk → `en`
- Språk kan byttes i Settings → velges fra dropdown → lagres til API + localStorage
- Fallback: key → engelsk → nøkkelen selv

**Dato/tid-formatering:**

| Funksjon | Import fra | Eksempel (nb) | Eksempel (en) |
|----------|-----------|---------------|---------------|
| `formatDate(dateStr)` | `i18n.js` | 27. mar. 2026 | 27 Mar 2026 |
| `formatDateLong(dateStr)` | `i18n.js` | 27. mars 2026 | 27 March 2026 |
| `formatDate(dateStr, opts)` | `i18n.js` | Egendefinert Intl-format | |

Bruk **alltid** funksjonene fra `i18n.js` — aldri lag lokale `formatDate`-funksjoner. Locale-mapping: `nb` → `nb-NO`, `en` → `en-GB`.

**Retningslinjer for oversettelser:**

1. **Bruk generiske termer** — unngå synonymer. Én engelsk term = én norsk term. Eksempel: bruk alltid "Slett" for "Delete", aldri "Fjern" eller "Ta bort" for samme handling.
2. **Hold nøklene konsistente** — gjenbruk `common.*` for knapper/handlinger som brukes på tvers (Save, Cancel, Delete, Edit, Error, OK).
3. **Aldri hardkod tekst** — all ny tekst skal ha nøkkel i begge locale-filer. Legg til i `en.json` og `nb.json` samtidig.
4. **Kontroller begge filer** — etter endring i én locale-fil, oppdater den andre. Bruk `grep` for å finne manglende nøkler.
5. **Unngå setninger i kode** — bruk interpolering: `t('key', { name })` i stedet for `t('key') + name`.
6. **Test begge språk** — bytt til norsk i Settings og verifiser at alle sider ser riktige ut.

### CSS-filer

```
css/
├── variables.css          # Design-tokens
├── base.css               # Reset, glass-card, layout, utilities
├── bootstrap-overrides.css # (ikke opprettet ennå)
└── components/
    ├── navbar.css          # Sticky navbar, søkefelt, dropdown
    ├── auth.css            # Login/register side
    ├── contacts.css        # Kontaktliste, søk, filtrering, sortering
    ├── card.css            # Profil-layout, detalj-kort, sidebar
    ├── timeline.css        # Poster, compose, edit-modus, @-mention
    ├── map.css             # Kartside, toolbar, søkeresultater
    ├── photos.css          # Avatar overlay, photo strip, cropper, viewer
    └── dialogs.css         # Contact search dialog
```

### Retningslinjer (MÅ følges)

1. **Ingen `alert()`, `confirm()` eller `prompt()`** — bruk dialoger fra `dialogs.js`
2. **Ingen inline styles** — bruk CSS-klasser og custom properties
3. **Modaler er hvite** — `background: var(--color-surface)` (backdrop gjør glass grått)
4. **Dropdowns/søkeresultater** — `rgba(255, 255, 255, 0.95)` for lesbarhet
5. **Keyboard-navigasjon** — alle søk/dropdowns støtter piltaster + Enter + Escape
6. **Universell utforming** — nok kontrast i overlays, fokus-synlighet
7. **Konsistente action-knapper** — bruk `.edit-action` / `.edit-action-primary` i edit-modus, ikke blandede Bootstrap-knapper
8. **Avatar-interaksjon** — hover-overlay (ikke separat kamera-knapp), drag-and-drop for upload
9. **Post-typer** — profil-poster viser kontakt med avatar øverst, aktivitets-poster viser dato + tags
10. **Label-verdi-par** — label og verdi plasseres nær hverandre med fast gap, aldri `justify-content: space-between` over full bredde. Label har `min-width` for justering, verdien følger rett etter.
11. **Dropdowns** — solid hvit bakgrunn (`var(--color-surface)`), ingen glass-effekt. WCAG-krav til kontrast.
12. **Kontakt-rader** — alle lister/søk som viser kontakter bruker `.contact-row`-komponenten (`contact-row.js` + `contactRowHtml()`). 32px avatar, navn, valgfri meta-tekst under. Samme hover-effekt (`rgba(0,0,0,0.04)`) overalt. Aldri lag egne avatar+navn-strukturer — bruk denne komponenten.

## Navigasjonsstruktur (implementert)

```
Navbar (sticky top, glass-effect):
├── Logo "WhoareYou" (→ dashboard)
├── Søkefelt (kontaktsøk, "/" snarvei, autocomplete dropdown)
├── Timeline | Contacts | Map
├── Varsler (bjelle, placeholder)
└── Bruker-avatar (→ dropdown: navn, tenant, settings, system admin, logout)

Sider:
├── / (Dashboard) — tidslinje + sidebar (recently viewed/added)
├── /contacts — kontaktliste med søk, filter, sortering
├── /contacts/:uuid — profil: poster + sidebar (info, relasjoner, adresse, kart, labels)
├── /contacts/:uuid/posts — kontaktens poster
├── /map — fullskjerm Leaflet-kart med alle kontakter
├── /settings — brukerinfo, lenker til admin-sider
├── /admin/tenant — administrere medlemmer i tenanten
├── /admin/system — tenant-oversikt + bytte tenant (kun system admin)
└── /login — innlogging/registrering med tabs

Profil-layout (/contacts/:uuid):
├── Venstre (main): profilkort → quick-post → poster (via post-list komponent)
└── Høyre (sidebar, sticky): how we met, notater, kontaktinfo, relasjoner, adresser, minikart, labels
```

## Sidelayouts

### Dashboard (`/`)
- `dashboard-layout`: grid med main (tidslinje) + sidebar (280px)
- Sidebar: "Recently viewed" og "Recently added" med kompakte kontakt-rader
- Responsivt: sidebar under main på mobil

### Kontaktprofil (`/contacts/:uuid`)
- `profile-layout`: grid med main (poster) + sidebar (320px)
- Avatar med hover-overlay, photo strip ved flere bilder
- Quick-post med @-mention
- Sidebar sticky på desktop, statisk på mobil

### Kontaktliste (`/contacts`)
- Toolbar: søk + filter-tabs + sort-select
- Glass-card liste med avatar, navn, favoritt-stjerne
- Modal for ny kontakt

### Kart (`/map`)
- Fullskjerm Leaflet med flytende glass-card toolbar
- `map-fullwidth` klasse fjerner max-width og padding fra app-content
