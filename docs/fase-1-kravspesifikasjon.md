# Fase 1 — Kravspesifikasjon

## Visjon

En personlig "Facebook" — et verktøy for å holde oversikt over mennesker i livet ditt. Navnet, ansiktet, relasjonen, historien. Bygget for folk som er dårlige på navn og ansikter, og som vil ha et privat, self-hosted alternativ.

## Designprinsipp: Forenkling

Et bevisst valg bort fra Monicas tilnærming med mange separate felttyper (aktiviteter, møter, dagbok, notater, etc.). I stedet bruker vi én **universell post-modell** — inspirert av en Facebook-post:

- Skriv fritekst om hva som helst (middag, møte, notat, hendelse, tanke)
- **Tagg kontakter** som er involvert
- Legg ved bilder eller dokumenter
- Legg til dato (default: nå)
- Systemet utleder kontekst fra tags og innhold

Dette erstatter: aktivitetslogg, møteregistrering, dagbok, og friteksnotater — alt i ett.

## Funksjonelle krav

### Kontakthåndtering (kjerne)
- Registrere og administrere kontakter (venner, bekjente, naboer, kolleger, etc.)
- Profilbilde / foto av kontakt
- Registrere hvordan du møtte noen
- Favoritt-markering av kontakter
- Labels / tags for å organisere kontakter
- Søk og filtrering

### Profilbilder og galleri
- **Flere profilbilder per kontakt** — se personer over tid (ikke bare ett statisk bilde)
- Ett bilde settes som "aktivt" profilbilde, men historikk bevares
- God bildehåndtering — dette var en svakhet i Monica (lav oppløsning, dårlig støtte)
- Bilder på poster (sammenkomster, hendelser)
- Ingen ansiktsgjenkjenning — manuell kobling av bilder til kontakter

### Tidslinje / poster (kjerne)
- Opprette poster med fritekst (erstatter aktiviteter, møter, dagbok, notater)
- Tagge én eller flere kontakter i en post
- Legge ved ett eller flere bilder og dokumenter
- Poster vises i tidslinje — både global og per kontakt
- "Sist kontaktet"-oversikt utledes automatisk fra poster der kontakten er tagget

### Relasjoner og familie
- Definere relasjoner mellom kontakter (venn, nabo, kollega, etc.)
- Familierelasjoner med detaljer: foreldre, barn, søsken, ektefelle, etc.
- Visualisering av familierelasjoner (ikke et slektforskningsprogram, men nok detaljer til å se familiestruktur)
- Navigere mellom relaterte kontakter

### Adresser og nabolag
- Registrere adresser på kontakter
- **Kartvisning med OpenStreetMap/Leaflet** — se kontakter plassert på kart
- Finne hvem som bor på en gitt adresse (omvendt oppslag)
- Nabolagsoversikt — "hvem bor i gata mi?"
- Historikk på adresser (hvem bodde der før, hvem flyttet inn)

### Kontaktinformasjon
- Telefonnumre, e-post, sosiale medier, etc.
- Fleksible kontaktfelt (brukerdefinerte typer)

### Påminnelser
- Bursdager med automatiske påminnelser
- Egendefinerte påminnelser

### Varslingssystem
- **In-app varsler** (bjelle-ikon) som primærkanal
- Bygget som et generisk varslingssystem som kan utvides med:
  - Push-notifikasjoner (for fremtidig app)
  - E-postvarsler
- Påminnelser leveres gjennom varslingssystemet

### Oppgaver
- Oppgaveliste knyttet til kontakter (f.eks. "husk å spørre om...")

### API
- Appen bygges med et **API-first-prinsipp**
- REST API som frontend konsumerer
- Samme API kan brukes av fremtidige mobilapper eller tredjepartsintegrasjoner
- API-dokumentasjon

## Ikke-funksjonelle krav

### Plattform
- **Web-applikasjon** — mobile-first responsivt design, bygges og testes primært på desktop
- **Self-hosted** som primærmål
- **Docker** — alt (API + frontend) i én container for enkel deployment

### Autentisering
- **Eget brukersystem** (registrering, innlogging, passord-reset)
- Sikker passordlagring (bcrypt/argon2)
- Sesjonsbasert eller token-basert (JWT) for API-tilgang

### Flerbruker og multi-tenancy
- Fleksibel grunnstruktur som støtter hosting for andre
- Den som hoster løsningen kan registrere flere familier/husholdninger
- Hver familie/bruker har isolerte data
- Rollestyring innad i en familie (f.eks. to foreldre deler kontaktlisten)

### Synlighet og privat/delt data
Innad i en tenant (familie) kan data ha ulik synlighet:

- **Privat** — kun synlig for brukeren som opprettet det
- **Delt** — synlig for alle brukere i samme tenant

Gjelder for:
- **Kontakter** — private kontakter (f.eks. jobbkontakter fra et seminar) er kun synlige for deg. Delte kontakter (venner, familie) er synlige for hele familien.
- **Poster** — private poster fungerer som personlig dagbok. Delte poster er synlige for resten av familien.
- **Labels/grupper** — kan være private eller delte

Eksempler på bruk:
- Du deler appen med familien. Felles venner og naboer er "delt" — alle ser dem.
- Du har møtt folk på jobbseminar og vil huske dem til neste gang. Disse er "privat" — familien trenger ikke se dem.
- Du skriver en dagbokpost om noe personlig — "privat". Du skriver om en familiemiddag — "delt".

Standardverdi: **delt** (slik at appen fungerer som før for eksisterende data).

### Internasjonalisering (i18n)
- Støtte for oversettelse til flere språk fra start
- **Engelsk som standardspråk**
- Struktur som gjør det enkelt for community å bidra med oversettelser

### Sikkerhet
- **Personvern er kritisk** — systemet lagrer potensielt svært sensitiv informasjon
- Alt fra enkle telefonlister til personlige hemmeligheter kan lagres
- Kryptering av data at rest (vurderes)
- Kryptering i transit (HTTPS påkrevd)
- Streng tilgangskontroll — ingen data-lekkasje mellom tenants
- Input-validering på alle endepunkter (OWASP Top 10)
- Rate limiting på autentisering
- Audit log på sensitive operasjoner (innlogging, eksport, sletting)
- Regelmessig sikkerhetsgjennomgang som del av utviklingsprosessen

### Kodekvalitet og vedlikehold

#### Frontend
- **Designsystem basert på Bootstrap**, tilpasset med eget tema
- Alle UI-komponenter dokumentert og gjenbrukbare
- **Ingen inline styles** — alt styling gjennom CSS-klasser/variabler
- Endringer i designet (f.eks. skygge på bokser) skal gjenspeiles konsistent i hele appen
- Komponent-bibliotek med modal, skjema-elementer, kort, varsler, etc.

#### Backend
- Gjenbrukbare hjelpefunksjoner for vanlige operasjoner (validering, formatering)
- Én måte å gjøre ting på — f.eks. én validering for e-postadresser, ikke tre forskjellige
- Konsistent feilhåndtering og respons-format på tvers av API
- Delt valideringslogikk mellom frontend og backend der mulig

### Kvalitet
- Enkel å installere og drifte (self-hosted fokus)
- God ytelse med mange kontakter
- Backup overlates til hoster (innebygd eksport vurderes langt frem i tid)

## Avgrensninger

- **Ikke** et slektforskningsprogram — familierelasjoner er en tilleggsfunksjon, ikke hovedfokus
- **Ikke** et CRM for business — dette er personlig bruk
- **Ikke** et sosialt nettverk — ingen kommunikasjon mellom brukere
- **Ikke** et bildeadministrasjonssystem — bilder er knyttet til kontakter og poster, ikke selvstendig

## Inspirasjon fra Monica (vurderes senere)

Følgende funksjoner kan vurderes for inkludering, men er ikke prioritert:

- [ ] Kjæledyr-registrering
- [ ] Egendefinerte kjønn
- [ ] Konfigurerbare seksjoner på kontaktkortet
- [ ] Flere valutaer
- [ ] Eksport-funksjoner (data, kontakter, etc.)

## Beslutninger tatt

| # | Beslutning | Begrunnelse |
|---|-----------|-------------|
| 1 | Universell post-modell i stedet for separate felttyper | Monicas mange felttyper (aktivitet, møte, dagbok, notat) var forvirrende. Én post med tagging er enklere og mer fleksibelt. |
| 2 | OpenStreetMap/Leaflet for kart | Gratis, self-hosted-vennlig, ingen API-nøkler nødvendig |
| 3 | Generisk varslingssystem | Starter med in-app (bjelle), men bygget for å utvides til push/e-post senere |
| 4 | Monica-import ikke prioritert nå | Har data fra Monica, men import lages når rammeverk og funksjonalitet er på plass |
| 5 | Eget autentiseringssystem | Enklere for self-hosted, ingen avhengighet til eksterne tjenester |
| 6 | API-first arkitektur | Frontend bruker samme API som fremtidige apper/integrasjoner |
| 7 | Backup overlates til hoster | Eksport-funksjoner vurderes langt frem i tid |
| 8 | Flere profilbilder per kontakt | Se personer over tid, ikke bare ett statisk bilde. Løser Monicas svake bildestøtte. |
| 9 | Bootstrap som designgrunnlag | Gir ferdige komponenter (modal, grid, etc.) som tilpasses med eget tema. Konsistent design. |
| 10 | Moderne glass-effect design (iOS 26-inspirert) | 2026-aktig, rent, "less is more" — skjul handlinger bak ellipsis, fokus på innhold |
| 11 | Mobile-first, test på desktop | Responsivt grunnprinsipp selv om desktop er primær utviklingsplattform |
| 12 | Lokal bildelagring med auto-komprimering | Lavt volum, enkel drift, ingen S3-avhengighet |
| 13 | Enkel DB-søk (LIKE) | Tilstrekkelig for forventet volum (~1000 kontakter, ~5000 poster) |
| 14 | Docker-container for app, ekstern database | App i Docker, database separat (brukers eksisterende MySQL-server) |
| 15 | MySQL som database | Bruker har dedikert MySQL-server hjemme. Skriv database-agnostisk SQL der mulig. |
| 16 | Node.js + Express backend | Samme språk (JS) hele veien, minimalistisk, Knex.js for DB |
| 17 | Vanilla JS frontend (ingen React) | Native ES6 moduler, null byggesteg, ingen dependency-helvete |
| 18 | GitHub → DockerHub/GHCR CI/CD | Push til git trigger image-bygg for produksjon |
| 19 | Profil-poster vs aktivitets-poster | Poster skrevet "om" en kontakt viser kontaktens navn/avatar øverst. Aktivitets-poster viser tags nederst. |
| 20 | Crop ved upload | Alle bilde-opplastinger går gjennom cropper (pan + zoom, sirkulært viewport) |
| 21 | Synlighet: privat/delt | Kontakter, poster og labels kan være private (kun deg) eller delt (hele familien). Default: delt. |

### Bildelagring
- Lokal upload-mappe (enkel, passer self-hosted)
- **Automatisk konvertering/komprimering** — bilder lagres ikke i original størrelse
- Generering av thumbnails for lister og preview
- Forventet volum: lavt (kanskje et bilde per dag i verste fall, typisk mye mindre)

### Søk
- **Enkel database-søk** — tilstrekkelig for forventet volum
- Maks ~1000 kontakter, ~5000 poster over 10 år, lite tekst per post
- MySQL `LIKE` / `FULLTEXT INDEX` tilgjengelig om behov oppstår

## Åpne spørsmål

*Ingen åpne spørsmål på kravspesifikasjon. Teknologivalg diskuteres i [Fase 2](fase-2-arkitektur.md).*
