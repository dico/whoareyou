# Fase 5 — Implementering

## Status: Aktiv utvikling

Applikasjonen er funksjonell og i daglig bruk. Utviklingen foregår iterativt med AI-assistert koding (Claude Code).

## Milepæler

### Milepæl 1: Grunnmur ✅ (dag 1)
- Prosjektskjelett (Docker, Nginx, Express, Knex)
- 19 databasetabeller + seeds
- Auth-system (register, login, JWT, refresh)
- Kontakt-CRUD med søk, filtrering, sortering
- Post/tidslinje med @-mention og tagging
- Relasjoner, adresser, geocoding, kart
- Profilbilder med crop og sharp-prosessering
- Monica-import (422 kontakter, 356 bilder)
- Designsystem med glass-effect

### Milepæl 2: Synlighet og administrasjon ✅
- Privat/delt synlighet på kontakter, poster, labels
- Admin-sider (settings, tenant, system admin)
- Kontaktfelt CRUD (telefon, e-post, SoMe)
- Grupper/labels med filter og split-view admin
- Brukerprofil (rediger navn, passord, språk)

### Milepæl 3: i18n og standardisering ✅
- Komplett i18n (en + nb) med 200+ nøkler
- Standardisert contact-row komponent
- Kontaktkort-grid layout
- Konsistente dropdowns og visibility-pill
- Locale-aware datoformatering

### Milepæl 4: Relasjoner og adresser ✅
- Redigering av adresser og relasjoner
- Household-seksjon med adresse-deling
- Adresse-side med beboerhistorikk
- Move-out/move-in med historikk
- Adresse-merge for duplikater
- 19 relasjonstyper med begge retninger

### Milepæl 5: Innhold og varsler ✅
- Bilder i poster med drag-and-drop
- Påminnelser med årlig gjentakelse
- Varslingssystem med bjelle-ikon
- Kommende bursdager på dashboard
- Globalt søk (kontakter + poster + bedrifter)
- Post-highlight ved navigasjon fra søk

### Milepæl 6: Bedrifter og livshendelser ✅
- Bedrifter med ansatte og stillingstittel
- Livshendelser med 10 typer og ikoner
- Merkedager integrert som årlige påminnelser
- Interesser/hobbyer via label-kategorier
- Slektstre-visualisering med SVG
- Relasjonsforslag (utleder manglende relasjoner)
- Opprett kontakt direkte fra relasjonsdialog

### Milepæl 7: Sikkerhet ✅
- Sesjonsbasert auth med refresh tokens
- 2FA (TOTP) med QR-kode og backup-koder
- Trusted IP-ranges (hopp over 2FA lokalt)
- Sesjonsvisning og -revokering
- Bildebeskyttelse (auth på /uploads/)
- Rate limiting på alle endepunkter
- PWA-støtte for hjemskjerm-app

### Milepæl 8: E-post og SMTP ✅
- SMTP-konfigurasjon i system admin (host, port, user, pass, from)
- nodemailer-integrasjon med dynamisk config fra system_settings
- E-postvarsling ved ny pålogging (fire-and-forget, blokkerer aldri login)
- Test-e-post-funksjon
- Login-varsler kan slås av/på

### Milepæl 9: Gaver (fase 1) ✅
- 7 nye tabeller (gift_events, gift_products, gift_product_links, gift_orders, gift_order_participants, gift_wishlists, gift_wishlist_items)
- Gavehendelser med auto-fill (jul → 24.12 + nåværende år)
- Produktkatalog med inline søk/opprett og URL-scraping
- Gaverregistrering med avsender/mottaker-kontakter
- Status-lifecycle (idea → purchased → given) med klikk-cycling
- Synlighet: private under planlegging, auto-shared ved gitt, skjult fra mottaker
- Product-picker komponent (gjenbrukbar)
- Navbar-lenke, sub-navigasjon, dashboard
- Ønskelister per familiemedlem med add/delete items, mark fulfilled
- Global planleggingsliste for gaveidéer uten event, overfør til event-modal
- Gir/Mottar filter-tabs på event-detalj, mottar gruppert per familiemedlem
- Migrering fra mygifts-database (140 gaver, 89 produkter, 4 ønskelister)
- Gave-modal i stedet for inline quick-add

### Milepæl 10: Brukerkobling og fødselsdato ✅ (dag 3)
- Delt opp fødselsdato — tre separate felt (dag/måned/år) med migrering av eksisterende data
- Gjenbrukbar ny-kontakt-modal brukt fra forsiden og kontaktliste
- Husstandsmedlemmer uten innlogging — "Legg til medlem" med kan-logge-inn-toggle, auto-generert passord, valgfri velkomst-e-post
- Bruker-kontakt-synk — navbar og medlemsliste viser kontaktens profilbilde som avatar
- Auto-foreslå kontaktkobling — matcher ukoblede brukere mot kontakter via e-post eller navn, ett-klikks kobling
- Slektstre forbedringer — pan/zoom (drag+scroll+pinch), dybde-kontroll (1-6), kategorifilter (familie/sosialt/jobb), visningsmodus (hele familien/direkte linje/forfedre/etterkommere), relasjonslabels, auto-fit, 90vw×85vh modal, persistent modal med inline re-render
- Navbar-søk husker siste søk — fokus viser forrige resultater uten ny forespørsel
- Dokumentvedlegg i poster — PDF, Word, Excel, TXT, CSV i post-media. Bilder via sharp, dokumenter som-de-er. PDF/TXT preview i iframe-modal, andre som nedlasting. Drag-and-drop med dokumentstøtte

## MVP-definisjon

MVP ble nådd i milepæl 1. Applikasjonen er i daglig bruk.

## Gjenstående arbeid

Se "Neste" og "Senere" i [README.md](README.md) for prioritert liste.
