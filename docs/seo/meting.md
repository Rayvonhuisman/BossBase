# Meting: organisch verkeer, klikken naar registratie en proefaccounts

## Wat er nu is (gecontroleerd 29 september 2026)

- Geen analysedienst: geen Google Analytics, Tag Manager, Vercel Analytics,
  Plausible of pixel.
- Een cookiebanner (`src/components/CookieBanner.jsx`) met "Alleen
  noodzakelijk" en "Alles accepteren". De keuze wordt bewaard, maar niets
  gebruikt hem. Hij staat alleen in de app, niet op de website.
- De cookieverklaring is een lege placeholder.

## Wat deze release toevoegt

`src/lib/meting.js` met één functie, `meet(gebeurtenis, gegevens)`. Zonder
aangesloten dienst doet hij niets. Hij zet geen cookies en schrijft niets in
de browseropslag. Twee meetpunten zijn aangesloten:

| Gebeurtenis | Waar | Wat het betekent |
| --- | --- | --- |
| `registratie_klik` | `src/marketing/MarketingApp.jsx`, elke klik op een link naar `/register` | Iemand klikt op "Start gratis". Dit is **geen** aanmelding. |
| `proefaccount_aangemaakt` | `src/App.jsx`, `onDone` van `RegisterFlow` | De registratie is gelukt (na eventuele e-mailverificatie). |

## Wat je nu al kunt meten, zonder extra dienst

- **Organische bezoeken per landingspagina**: Search Console → Prestaties →
  tabblad Pagina's (klikken en vertoningen uit Google Zoeken).
- **Aantal proefaccounts per dag**: in de database (tabel met abonnementen of
  bedrijven, per aanmaakdatum). De herkomst per landingspagina zie je daar niet.

## Wat een besluit vraagt

Proefaccounts per organische landingspagina koppelen kan alleen met een
analysedienst. Kies één van deze en leg het besluit vast in de privacyverklaring:

1. **Privacyvriendelijke dienst zonder cookies** (bijvoorbeeld Plausible of
   Vercel Web Analytics). Meet paginabezoek en gebeurtenissen zonder
   persoonsgegevens. Of hiervoor toestemming nodig is, hangt af van de
   configuratie: laat dit juridisch toetsen.
2. **Google Analytics 4**: alleen laden na toestemming via de cookiebanner
   ("Alles accepteren"), met Consent Mode. Meer instellingen en een
   verwerkersovereenkomst met Google nodig.

Aansluiten gaat in één stap: registreer een functie `window.bbMeter` die de
gebeurtenis doorgeeft aan de gekozen dienst, en laad het script van die dienst
(bij optie 2 pas na toestemming). Zet `proefaccount_aangemaakt` in de dienst
als conversiedoel.

## Wat succes is

Primair: aangemaakte proefaccounts uit organisch verkeer, per landingspagina.
Daarnaast: organische klikken op pagina's die niet over het merk gaan (filter
in Search Console op zoekopdrachten zonder "bossbase"), het aantal
geïndexeerde pagina's uit de sitemap, vertoningen en klikken.
