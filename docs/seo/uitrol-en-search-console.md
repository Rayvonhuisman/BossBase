# Uitrol naar productie en daarna Google Search Console

Search Console is geen keuring. Het laat zien wat Google van de site kent.
Drie begrippen die je uit elkaar houdt:

- **Crawlen**: Google haalt een URL op. Hiervoor zorgen robots.txt, de sitemap
  en gewone links.
- **Indexeren**: Google besluit een pagina op te nemen. Een sitemap of een
  indexeringsverzoek garandeert dat niet.
- **Ranken**: waar een pagina verschijnt voor een zoekopdracht. Daar is geen
  knop voor; dat volgt uit inhoud, relevantie en tijd.

## A. Vóór de publicatie

1. **Datum zetten.** In `src/marketing/site.js` staat `RELEASE_DATUM`. Zet die
   op de dag van publicatie. Hij wordt gebruikt als publicatie- en
   wijzigingsdatum van de artikelen en als `lastmod` in de sitemap.
2. **Inhoud nalopen.** Laat iemand die de app goed kent de functie-, branche- en
   integratiepagina's lezen tegen `docs/seo/productfeiten.md`.
3. **Build en controles lokaal:**
   ```
   npm ci
   npm run build        # faalt bij kapotte links, dubbele titels of H1-fouten
   npm run seo:check    # head, structured data, sitemap, geheimen
   node scripts/serve-dist.mjs 4173   # bootst vercel.json na
   ```

## B. Previewdeploy op Vercel controleren

Push de branch; Vercel bouwt een preview. Controleer op de preview-URL:

- `/`, `/werkbonnen`, `/kennisbank/wat-moet-er-op-een-factuur`: status 200 en de
  eigen title (bekijk de paginabron, niet alleen het scherm).
- `/functies/` geeft een 308 naar `/functies`; `/registreer` een 308 naar
  `/register`; `/over-ons` naar `/over`.
- `/bestaat-niet` en `/privacy` geven **404** met de foutpagina.
- `/login`, `/register`, `/dashboard`, `/demo`, `/offerte/x`, `/werkbon/x`,
  `/betaal/x`: de app laadt, met header `X-Robots-Tag: noindex, nofollow`.
- `/api/snelstart/webhook` werkt nog (Vercel-functie; de rewrites raken `/api`
  niet).
- Preview-URL's zelf: Vercel zet op `*.vercel.app`-previews standaard
  `X-Robots-Tag: noindex`. Controleer dat met `curl -I`. Alle canonicals wijzen
  naar `https://www.bossbase.nl`, dus de preview is nooit de canonieke versie.
  **Dien nooit een preview-URL in bij Google.**
- Inloggen, registreren, wachtwoord herstellen, een uitnodigingslink, een
  offerte- en werkbonlink en een betaallink van een testaccount.

## C. Publiceren

1. Merge naar `main`; Vercel bouwt productie. Er zijn geen databasemigraties
   en geen edge functions in deze release.
2. **Vercel-instelling (niet in code):** Project → Settings → Domains →
   `bossbase.nl` → "Redirect to www.bossbase.nl" met **308 Permanent
   Redirect** (nu 307 tijdelijk).
3. Controleer na de deploy met `curl -I`:
   - `https://www.bossbase.nl/robots.txt` → 200, `text/plain`
   - `https://www.bossbase.nl/sitemap.xml` → 200, 34 URL's
   - `https://www.bossbase.nl/bestaat-niet` → 404
   - `http://bossbase.nl/` → permanente redirect naar `https://www.bossbase.nl/`
   - productiepagina's hebben **geen** `X-Robots-Tag: noindex`.

## D. Search Console

Mijn controle (29 september 2026): in de DNS staat geen
`google-site-verification`-record en in de HTML geen verificatietag. Dat
bewijst niet dat er geen property is: verificatie kan ook via een ander account
of via een HTML-bestand zijn gedaan. Kijk eerst of er al een property bestaat.

1. Ga naar https://search.google.com/search-console en log in met het account
   dat de beheerder van BossBase gebruikt.
2. **Bestaat er al een property** voor `bossbase.nl` of
   `https://www.bossbase.nl/`? Gebruik die. Staat er alleen een
   URL-voorvoegsel-property, voeg dan ook een domeinproperty toe.
3. **Nieuwe domeinproperty:** "Property toevoegen" → "Domein" → vul
   `bossbase.nl` in (zonder www). Google toont een TXT-record van de vorm
   `google-site-verification=…`. **Gebruik exact die waarde.**
4. Zet dat TXT-record bij de DNS-beheerder van bossbase.nl. Wie dat is, zie je
   via de registrar van het domein of met `dig NS bossbase.nl`. Laat het record
   na verificatie staan.
5. Klik in Search Console op "Verifiëren". DNS-wijzigingen kunnen even duren.
6. Voeg een tweede eigenaar toe (Instellingen → Gebruikers en rechten).
7. **Sitemap indienen:** Sitemaps → `https://www.bossbase.nl/sitemap.xml` →
   Indienen. Status moet "Geslaagd" worden.
8. **URL-inspectie** van deze adressen. Kies "Live URL testen" en bekijk de
   gerenderde HTML en de screenshot. Controleer: "URL kan worden geïndexeerd",
   de door Google gekozen canonical is gelijk aan de door jou opgegeven
   canonical, en title en inhoud kloppen.
   - `https://www.bossbase.nl/`
   - `/functies`, `/werkbonnen`, `/offertes`, `/prijzen`
   - `/voor-wie/installateurs`, `/integraties/moneybird`, `/kennisbank`
   - één artikel, bijvoorbeeld `/kennisbank/wat-moet-er-op-een-factuur`
9. **Indexering aanvragen** voor de homepage en de nieuwe commerciële pagina's
   (er geldt een daglimiet; de rest vindt Google via de sitemap en de links).
10. **Nulmeting** (de eerste dag): exporteer Prestaties (laatste 3 maanden) en
    het rapport Pagina-indexering.

## E. Volgen

**Wekelijks de eerste 8 weken:**

- Pagina-indexering: aantal geïndexeerd, "Soft 404", "Duplicaat zonder door
  gebruiker geselecteerde canonieke versie", "Gecrawld – momenteel niet
  geïndexeerd". Oude URL's (zoals `/over-ons`) mogen als "Pagina met
  omleiding" verschijnen; dat is goed.
- Controleer dat er geen `/dashboard`-, `/offerte/`-, `/werkbon/`- of
  `/demo`-URL's in de index komen.
- Prestaties: klikken, vertoningen, CTR en positie per pagina. Filter op
  zoekopdrachten **zonder** "bossbase" voor het niet-merkverkeer.

**Maandelijks daarna.** Proefaccounts per landingspagina meten vraagt een
analysedienst: zie `docs/seo/meting.md`.

## Officiële bronnen

- Property toevoegen: https://support.google.com/webmasters/answer/34592
- Sitemaps-rapport: https://support.google.com/webmasters/answer/7451001
- URL-inspectie: https://support.google.com/webmasters/answer/9012289
- Pagina-indexering: https://support.google.com/webmasters/answer/7440203
- Prestaties: https://support.google.com/webmasters/answer/7576553
- JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- robots.txt: https://developers.google.com/search/docs/crawling-indexing/robots/intro
