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
| Image cropper | `js/components/image-cropper.js` | Pan + zoom + firkantet viewport (avrundede hjørner), 450px area, "Last opp original"-knapp, i18n |
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
| Subtle link | `css/base.css` (.subtle-link) | Dempet lenke uten understrek — hover gir primærfarge. Brukes for sekundære navigasjonslenker (f.eks. "Se adresse") |
| Media button | `css/base.css` (.post-media-btn) | Ikon-knapp uten border — subtil hover med bakgrunn. Brukes for bilde-upload o.l. i compose |
| Contact fields | `js/components/contact-fields.js`, `css/components/card.css` | Kontaktfelt gruppert etter kategori (kontakt, nett, sosiale medier) med luft mellom grupper (ingen border). Nettsider vises som ikon + label/domene |
| Contact chip | `css/components/timeline.css` (.contact-chip) | Pill med avatar + navn for tagging av kontakter. Hvit bakgrunn, tynn border, avrundede ender, hover gir primærfarge. `.contact-chip-remove` for fjerning. Brukes i post-tags, livshendelser-dialog, timeline compose |
| Mention link | `css/components/timeline.css` (.mention-link) | Klikkbar kontaktlenke i løpende tekst. Primærfarge + medium font-weight. Brukes i post-body (linkifyPost) og livshendelser-kort |
| Life event card | `js/components/post-list.js`, `css/components/timeline.css` | Tidslinje-kort med ikon, type, dato, beskrivelse og "sammen med"-lenker. Per-type preposisjoner (med/fra/sammen med). Filtrerer bort profil-kontakten |
| Settings card grid | `css/base.css` (.settings-grid, .settings-card) | Admin-navigasjon med fargerike ikoner i kort-grid. Hover-lift-effekt. Brukes på settings-siden for undersider |
| Session item | `css/base.css` (.session-item) | Sesjonsliste med enhet-ikon, device-label, IP, tidspunkt. Markerer aktiv sesjon. Brukes i admin/security |
| Product picker | `js/components/product-picker.js`, `css/components/gifts.css` | Søk/opprett produkter inline med debounced søk, URL-paste auto-hent, "Opprett «X»"-alternativ. Gjenbrukes i gave-form og ønskeliste. Dropdown bruker `.product-picker-dropdown` (solid hvit bakgrunn, som andre dropdowns) |
| Gift sub-nav | `css/components/gifts.css` (.gift-sub-nav) | Tab-navigasjon innad i gave-seksjonen: Dashboard, Hendelser, Produkter. Pill-stil med aktiv markering |
| Gift status badge | `css/components/gifts.css` (.gift-status-badge) | Klikkbar badge som cycler status (idea → purchased → given). Fargekodet: idea=grå, reserved=blå, purchased=oransje, wrapped=lilla, given=grønn |
| Gift modal | Standard Bootstrap modal | Gaveoppretting via modal (erstatter inline quick-add). Produkt-picker, fra/til-chips, pris, status, retning, notater |
| Gift card | `css/components/gifts.css` (.gift-card) | Kompakt rad: 40px produktbilde/placeholder + tittel + mottaker/giver + pris + status-badge + ellipsis. Idéer har dashed border og lavere opacity |
| Gift direction tabs | `.filter-tabs` (gjenbrukt fra contacts) | Gir/Mottar-toggle på event-detalj. Bruker eksisterende `.filter-tabs`/`.filter-tab`-komponent. Mottar-visning grupperer gaver per mottaker (familiemedlem) |
| Gift product card | `css/components/gifts.css` (.gift-product-card) | Følger contact-card-mønsteret: 48px rund avatar (produktbilde eller gave-ikon placeholder) + navn + pris/url meta. Grid med min 280px. Aldri store bildekort for lister som kan bli store |
| Product detail modal | `js/components/product-detail-modal.js` | Nettbutikk-layout: `modal-lg` med bilde venstre + info høyre (grid 50/50). Tittel, pris (heltall), beskrivelse, produktlenker med butikk-ikon. Under: gavehistorikk + ønskelister med notater. Footer: slett + rediger. Dispatches `product-updated` event ved lukking |
| Product edit modal | `js/pages/gift-products.js` (showProductEditModal) | Redigering med dropzone for bilde (drag-and-drop fra nettside/desktop + klikk), navn, beskrivelse, pris, butikklenker med scrape-preview. Inline feilmelding under dropzone |
| Contact gallery | `css/components/card.css` (.contact-gallery-grid) | Kvadratisk thumbnail-grid (150px min) med hover-zoom, likes/kommentar-overlay. Lazy-loading. Tab-switching mellom Innlegg og Bilder på kontaktprofil |
| Gallery lightbox | `js/pages/contact-detail.js` (showGalleryLightbox) | `modal-xl` med bilde venstre (svart) + hvit sidebar høyre (300px). Sidebar: bildnummer, dato, posttekst, likes/kommentarer (lazy-loaded), "Se innlegg"-lenke. Navigasjon på tvers av alle kontaktens bilder. Tastatur + pilknapper |
| Add contact modal | `js/components/add-contact-modal.js` | Gjenbrukbar ny-kontakt-modal med navn, kallenavn, fødselsdato (dag/måned/år), hvordan vi møttes, visibility. Brukes fra tidslinje og kontaktliste |
| Family tree modal | `js/pages/contact-detail.js` (showFamilyTree/renderTreeContent) | Persistent SVG-basert slektstre med pan/zoom (drag+scroll+pinch), visningsmodus-dropdown (hele familien/direkte linje/forfedre/etterkommere), kategorifilter (familie/sosialt/jobb), dybde-slider (1-6). 90vw×85vh modal. Inline re-render uten å lukke modal. Relasjonslabels på kanter, hover-highlight, klikk-navigasjon |

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
4. **Dropdowns/søkeresultater** — solid hvit bakgrunn (`var(--color-surface)`), aldri gjennomsiktig. Truncer lange tekster. Kontaktresultater bruker ALLTID `contactRowHtml()` (`contact-row.js`) for konsistent visning med 32px avatar + navn. Aldri lag egne avatar+navn-strukturer i dropdowns.
5. **Keyboard-navigasjon** — alle søk/dropdowns støtter piltaster + Enter + Escape
6. **Universell utforming** — nok kontrast i overlays, fokus-synlighet
7. **Konsistente action-knapper** — bruk `.edit-action` / `.edit-action-primary` kun i inline edit-modus (f.eks. post-redigering). I modaler: bruk standard Bootstrap-knapper (`btn btn-outline-secondary btn-sm` for avbryt, `btn btn-primary btn-sm` for primærhandling)
8. **Avatar-interaksjon** — hover-overlay (ikke separat kamera-knapp), drag-and-drop for upload
9. **Post-typer** — profil-poster viser kontakt med avatar øverst, aktivitets-poster viser dato + tags
10. **Label-verdi-par** — label og verdi plasseres nær hverandre med fast gap, aldri `justify-content: space-between` over full bredde. Label har `min-width` for justering, verdien følger rett etter.
11. **Dropdowns** — alle dropdown/søkeresultater bruker `background: var(--color-surface)` (solid hvit), ingen glass/transparency. Gjelder `.glass-dropdown`, `.navbar-search-results`, `.notification-dropdown`. Søkeresultater trunceres (max 2 linjer).
12. **Kontakt-rader** — alle lister/søk som viser kontakter bruker `.contact-row`-komponenten (`contact-row.js` + `contactRowHtml()`). 32px avatar, navn, valgfri meta-tekst under. Samme hover-effekt (`rgba(0,0,0,0.04)`) overalt. Aldri lag egne avatar+navn-strukturer — bruk denne komponenten.
13. **Kontaktliste** — individuelle kort (`.contact-card`) i grid-layout, ikke én sammenhengende liste. Hvert kort har avatar, navn, meta, og visibility/favoritt-indikatorer.
14. **Visibility-pill** — bruk pill-toggle (`visibility-pill`) overalt for shared/private-valg, aldri vanlig knapp. Konsistent design: shared (blå aktiv) | private.
15. **Bilde-viewer** — alle bilder (profilbilder og post-bilder) åpnes i samme lightbox-design: svart bakgrunn, hvit footer, pil-navigasjon, tastaturstøtte. Aldri åpne bilder i ny tab. Gjenbruk `photo-viewer`-CSS-klassene.
16. **Aldri modal-i-modal for søk/valg** — Når en modal trenger kontaktvalg, produktvalg eller lignende, bruk et inline søkefelt med dropdown (`.product-picker-dropdown`-mønsteret) direkte i modalen. `contactSearchDialog()` åpner en ny modal og skal ALDRI kalles fra en modal. Eneste unntak: bekreftelsesdialoger (f.eks. "Er du sikker på at du vil slette?") som er korte ja/nei-spørsmål. Regelen: Søk/valg = inline i modalen. Bekreftelse = OK som ny modal.
17. **Auto-fill på hendelsestype** — ved valg av type (jul, bursdag) fylles dato og navn automatisk med fornuftige standardverdier. Skjul irrelevante felt (f.eks. jubilant for jul).
18. **Gave-synlighet** — gaver er `private` som standard (ulikt resten av appen). Auto-switches til `shared` når status settes til `given`. Delte gaver skjules automatisk fra mottakere som er brukere.
19. **Quick-add-mønster** — for rask dataregistrering (gaver, etc.): kompakt inline-form med kun essensielle felt synlige. Avanserte valg bak "Flere valg"-toggle. Etter opprettelse tømmes feltet, klart for neste — gjør det mulig å registrere mange elementer raskt etter hverandre.
20. **Listevisning for store datasett** — for lister som kan vokse til hundrevis/tusenvis (produkter, kontakter): bruk contact-card-mønsteret (48px rund avatar + navn + meta i én rad, grid med min 280px). Aldri store bildekort/tiles for slike lister — det skalerer ikke.
21. **Runde avatarer/bilder overalt** — alle miniatyrbilder bruker `border-radius: var(--radius-full)` (sirkulære). Gjelder kontakt-avatarer, produktbilder i lister, gave-kort-bilder, etc. Aldri firkantede miniatyrbilder i rader/kort — kun firkantede bilder i dedikerte gallerier/lightbox.
22. **Modaler** — alle modaler bruker `modal-dialog-centered` (vertikal sentrering). **Standard bredde (ingen størrelses-klasse) er default for alle nye modaler.** `modal-sm` skal aldri brukes med mindre det er eksplisitt godkjent per modal (dokumentert unntak). `modal-lg` for innhold som trenger plass. `modal-xl` for side-ved-side layout (galleri-lightbox med sidebar). Godkjente `modal-sm`-unntak: `confirmDialog` (dialogs.js), passord-prompt for 2FA-deaktivering (profile.js).

## Navigasjonsstruktur (implementert)

```
Navbar (sticky top, glass-effect):
├── Logo "WhoareYou" (→ dashboard)
├── Søkefelt (kontaktsøk, "/" snarvei, autocomplete dropdown)
├── Timeline | Contacts | Map | Companies | Gifts
├── Varsler (bjelle)
└── Bruker-avatar (→ dropdown: navn, tenant, settings, system admin, logout)

Sider:
├── / (Dashboard) — tidslinje + sidebar (recently viewed/added)
├── /contacts — kontaktliste med søk, filter, sortering
├── /contacts/:uuid — profil: poster + sidebar (info, relasjoner, adresse, kart, labels)
├── /contacts/:uuid/posts — kontaktens poster
├── /map — fullskjerm Leaflet-kart med alle kontakter
├── /companies — bedriftsliste
├── /companies/:uuid — bedriftsdetalj med ansatte
├── /gifts — gave-dashboard (kommende hendelser, siste gaver)
├── /gifts/events — hendelsesliste gruppert etter år
├── /gifts/events/:uuid — hendelsesdetalj med gaveliste + quick-add
├── /gifts/products — produktbibliotek med søk
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
