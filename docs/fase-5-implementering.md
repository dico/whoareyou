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

## MVP-definisjon

MVP ble nådd i milepæl 1. Applikasjonen er i daglig bruk.

## Gjenstående arbeid

Se "Neste" og "Senere" i [README.md](README.md) for prioritert liste.
