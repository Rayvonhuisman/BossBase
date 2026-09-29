# Oplevering SEO en indexering — branch `seo/indexering`

Datum: 29 september 2026. Basis: `main` op commit 85d7d6f. Dat is aantoonbaar de
productieversie: een lokale build van die commit geeft dezelfde bundelhash
(`index-BaCoMKQc.js`) als www.bossbase.nl.

Nog niet gepubliceerd. Zie `uitrol-en-search-console.md` voor de stappen.

## 1. Bevindingen, hercontroleerd

| Bevinding | Soort | Stand |
| --- | --- | --- |
| Elke URL gaf dezelfde lege HTML met status 200; onbekende paden toonden de homepage (soft 404) | Bevestigd op productie | Opgelost |
| `/privacy` en `/voorwaarden` bestaan niet; de footer linkte ernaar | Bevestigd op productie en in code | Links verwijderd; 404. Teksten ontbreken (open punt) |
| `/registreer` kwam bij direct openen op de homepage uit | Bevestigd op productie | 308 naar `/register`; alle links naar `/register` |
| Eén vaste title, geen beschrijving, canonical, og-tags; `lang="en"` | Bevestigd op productie | Opgelost, per pagina in de geleverde HTML |
| Geen robots.txt en geen sitemap | Bevestigd op productie | Opgelost |
| **Contactformulier verstuurde niets** maar toonde "Bericht ontvangen" | Bevestigd in code (`main`) | Formulier zet het bericht nu klaar in het eigen mailprogramma |
| "200+ vakbedrijven", "4.9", drie testimonials, branchecijfers | Bevestigd op productie; geen bron | Verwijderd |
| Onjuiste functie- en koppelingsclaims (Gmail/Outlook, API, import, terugkerende afspraken, verlof, mobiel, factuurbetaling, downgraden, "rechtsgeldig", gebruikerslimieten) | Bevestigd in code | Gecorrigeerd |
| Werkbon → factuur | Gecontroleerd: bestaat **niet** | Nergens beloofd; staat expliciet in FAQ's |
| Demo-data met echte organisatie (Gemeente Zwolle, nummer 14 038, stadhuis- en ziekenhuisadres) | Bevestigd op productie (voorbeeldscherm homepage) | Vervangen door fictieve gegevens |
| Search Console niet ingericht | **Vermoeden** — ontbrekende DNS/HTML-tag bewijst dat niet | Eerst controleren (zie uitroldocument) |
| Google kan de React-site niet indexeren | **Niet beweerd** — Google rendert JavaScript meestal wel | Nu staat de inhoud hoe dan ook in de HTML |

## 2. Gemaakte en gewijzigde pagina's

Nieuw (26):

- Functies: `/werkbonnen`, `/offertes`, `/planning`, `/urenregistratie`,
  `/facturen`, `/klantbeheer`
- Branches: `/voor-wie/installateurs`, `/voor-wie/schilders`,
  `/voor-wie/hoveniers`, `/voor-wie/aannemers-en-klusbedrijven`
- Koppelingen: `/integraties`, `/integraties/moneybird`,
  `/integraties/snelstart`, `/integraties/stripe-betaallink`
- Kennisbank: `/kennisbank` en 12 artikelen onder `/kennisbank/…`
- Foutpagina (404, noindex)

Gewijzigd: `/`, `/functies` (nu overzicht), `/prijzen`, `/voor-wie`, `/over`,
`/contact`, `/faq`, navigatie en footer.

Niet gemaakt: `/privacy`, `/voorwaarden`, `/verwerkersovereenkomst` (geen
goedgekeurde teksten; concept in `docs/juridisch/`). Geen Google
Agenda-pagina (koppeling niet beschikbaar voor klanten).

## 3. Technisch

- **Prerendering** binnen Vite, zonder frameworkwissel: een SSR-build van
  `src/marketing/entry-server.jsx` en `scripts/prerender.mjs` schrijven elke
  websitepagina als HTML met eigen head en inhoud. In de browser wordt die
  HTML gehydrateerd; navigeren binnen de site gaat zonder herladen en werkt
  title, beschrijving, canonical en structured data bij.
- **Twee bundels.** Website (`src/marketing/entry-client.jsx`) en app
  (`src/app-entry.jsx`); `src/main.jsx` kiest op pad. Eén lijst app-routes:
  `src/lib/appRoutes.js`.
- **vercel.json:** alleen app-routes naar `app.html` (met noindex); de rest is
  een bestaande pagina of een echte 404. `cleanUrls`, `trailingSlash: false`,
  308-redirects (`/registreer`, `/over-ons`, `/website`, `/index`),
  `X-Robots-Tag: noindex` op app-, login- en klantlinkroutes en op
  `*.vercel.app`, `immutable`-caching op `/assets`.
- **Sitemap** uit dezelfde routelijst, alleen canonieke indexeerbare pagina's.
- **Structured data:** Organization, WebSite, SoftwareApplication (prijzen, geen
  beoordelingen), BreadcrumbList, Article. Geen rich results beloofd.
- **Snelheid:** recharts en jsPDF niet meer op de website (manualChunks liet
  ze meeladen); Inter zelf gehost (drie ongebruikte fontfamilies en twee
  Google Fonts-imports weg); schermafbeeldingen als WebP 1600×1000 met vaste
  afmetingen.
- **Controles in de build:** kapotte interne links, dubbele titles of
  beschrijvingen, niet precies één H1, pagina's die nergens naartoe gelinkt
  zijn en ontbrekende rewrites laten de build falen. `npm run seo:check`
  controleert de gebouwde site.

## 4. Testresultaten

**Build.** `npm run build`: 34 pagina's, 404, app.html, sitemap met 34 URL's;
alle controles groen. `npm run seo:check`: 35 pagina's, 34 structured-data-
blokken, geen fouten, geen geheimen in buildbestanden. ESLint: geen fouten.

**Routes** (lokaal met `scripts/serve-dist.mjs`, dat vercel.json nabootst):
alle websitepagina's 200; `/functies/`, `/registreer`, `/over-ons`, `/website`,
`/index.html` → 308; `/privacy`, `/bestaat-niet` → 404; login, register,
dashboard, demo, offerte-, werkbon-, betaal- en uitnodigingslinks,
reset-password, superadmin, cookieverklaring, betaald → 200 met noindex.

**Browser** (Chrome, desktop 1440 en mobiel 390): 16 pagina's, geen console-
of hydratiefouten, één H1, juiste title en canonical, geen horizontale scroll.
Navigatie zonder herladen, terugknop, registratie, login en de demo-app werken.

**Lighthouse** — lab, mobiel, **lokaal zonder compressie**, oude en nieuwe
build onder dezelfde omstandigheden. Absolute tijden zijn niet die van
productie; het verschil wel betekenisvol. Geen veldgegevens.

| Pagina | Performance voor → na | SEO | FCP | LCP | Overdracht |
| --- | --- | --- | --- | --- | --- |
| Home | 52 / 50 → 82 / 82 | 82 → 100 | 15,5 → 3,3 s | 15,7 → 3,8 s | 2.773 → 478 KiB |
| Prijzen | 54 / 54 → 85 / 84 | 82 → 100 | 15,5 → 3,2 s | 15,7 → 3,5 s | 2.773 → 444 KiB |
| Functies | 54 → 81 | 82 → 100 | 15,6 → 3,2 s | 15,6 → 4,0 s | 2.773 → 563 KiB |
| Werkbonnen (nieuw) | – → 83 | 100 | 3,2 s | 3,8 s | 460 KiB |
| Artikel (nieuw) | – → 80 | 100 | 3,5 s | 3,9 s | 496 KiB |

Productie vóór (via internet, 29 sep): performance 63–64, SEO 82, LCP 6,0 s.

**Inhoud.** 29 externe bronlinks: alle 200. Steekproef tegen de bron: artikel
7:754 en 7:755 BW (letterlijk gelijk), wettelijke rente 10,4% / 4% en
minimale incassokosten € 40 (Rijksoverheid).

**Niet getest:** de echte Vercel-preview (geen Vercel-toegang vanaf hier),
Rich Results Test en URL-inspectie (vragen een openbare URL).

## 5. Interne links

Nav: Functies, Voor wie, Prijzen, Kennisbank, Over, Contact. Footer: alle
functie-, branche- en koppelingspagina's, drie artikelen, bedrijf. Kruimelpad
op alle subpagina's. 222 contextuele links in de lopende tekst en de "Lees
ook"-blokken; elke pagina heeft er minstens twee van buiten de navigatie. De
volledige matrix staat in `linkmatrix.md`.

## 6. Open punten

Zie het eindrapport in het gesprek; dezelfde lijst staat in
`uitrol-en-search-console.md` (stappen) en `docs/juridisch/README.md`.
