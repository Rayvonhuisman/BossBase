# Publicatiechecklist en Google Search Console

Branch: `seo/indexering` in `/Users/macbook/BossBase-seo`. De definitieve
commit staat in `docs/seo/OPLEVERING.md`.

Drie begrippen die je uit elkaar houdt: **crawlen** (Google haalt een URL op),
**indexeren** (Google neemt een pagina op; een sitemap of verzoek garandeert dat
niet) en **ranken** (de positie voor een zoekopdracht; daar is geen knop voor).

## 1. Vóór de merge

- [ ] Branch gepusht en de Vercel-preview gebouwd (zie `OPLEVERING.md`, GitHub).
- [ ] Preview getest met de lijst in stap 2.
- [ ] Iemand die de app kent heeft de functie-, branche- en koppelingspagina's
      gelezen tegen `docs/seo/productfeiten.md`.

## 2. Test op de Vercel-preview

Open de preview-URL uit Vercel. **Dien een preview-URL nooit in bij Google.**

- [ ] `curl -sI <preview>/` toont `x-robots-tag: noindex` (zowel de standaard
      van Vercel als onze eigen regel voor `*.vercel.app`).
- [ ] Openbare routes direct openen én vernieuwen: `/`, `/functies`,
      `/werkbonnen`, `/offertes`, `/planning`, `/urenregistratie`, `/facturen`,
      `/klantbeheer`, `/prijzen`, `/voor-wie`, de vier `/voor-wie/…`,
      `/integraties` en de drie `/integraties/…`, `/kennisbank` en een artikel,
      `/over`, `/contact`, `/faq`.
- [ ] Redirects (308): `/functies/` → `/functies`, `/registreer` → `/register`,
      `/over-ons` → `/over`, `/website` → `/`.
- [ ] Echte 404: `/bestaat-niet`, `/privacy`, `/voorwaarden`.
- [ ] App-routes laden de app, met `x-robots-tag: noindex, nofollow`:
      `/login`, `/register`, `/reset-password?token=x`, `/dashboard`,
      `/dashboard/aanvragen`, `/demo`, `/offerte/x`, `/werkbon/x`, `/betaal/x`,
      `/uitnodiging/x`.
- [ ] `POST <preview>/api/snelstart/webhook` komt bij de Vercel-functie uit (geen
      HTML van de website terug).
- [ ] Paginabron van `/werkbonnen`: eigen `<title>`, `description`, canonical
      `https://www.bossbase.nl/werkbonnen`, JSON-LD.
- [ ] `/robots.txt` (text/plain) en `/sitemap.xml` (34 URL's).
- [ ] Mobiel (390 px) en desktop: menu, footer, een artikel, de prijzen.
- [ ] Inloggen, registreren (tot het formulier), wachtwoord vergeten.
- [ ] Contactformulier: op de preview geeft het de melding "Het formulier is
      vanaf dit adres niet beschikbaar". Dat is juist: de toegestane herkomsten
      van het formulier zijn `https://bossbase.nl`, `https://www.bossbase.nl` en
      localhost. Wil je het op de preview testen, voeg dan het previewdomein toe
      aan `website_forms.allowed_domains` (een productiewijziging; alleen als je
      dat wilt).

## 3. Publiceren

- [ ] `npm run publicatiedatum -- JJJJ-MM-DD` met de datum van vandaag; commit.
      Dat zet de publicatiedatum in de twaalf artikelen. Een build doet dat nooit
      zelf.
- [ ] Merge `seo/indexering` naar `main`. Vercel bouwt productie.
      Geen databasemigratie en geen Edge Function nodig: wat het
      contactformulier gebruikt, staat al op productie (migratie
      20260915180001, functie `public-website-inquiry` v3). De
      `supabase db push --dry-run` op deze branch meldt "Remote database is up
      to date".
- [ ] Geen omgevingsvariabele nodig. `VITE_BOSSBASE_FORM_TOKEN` mag, maar het
      openbare formuliertoken staat al in de code.
- [ ] **Vercel-instelling (niet in code):** Project → Settings → Domains →
      `bossbase.nl` → redirect naar `www.bossbase.nl` met **308 Permanent**
      (nu 307).

## 4. Controle productie na de deploy

- [ ] `curl -sI https://www.bossbase.nl/` bevat **geen** `x-robots-tag`.
- [ ] `curl -sI https://www.bossbase.nl/werkbonnen` → 200, geen noindex.
- [ ] `curl -sI https://www.bossbase.nl/bestaat-niet` → 404.
- [ ] `curl -sI http://bossbase.nl/` → één permanente redirect naar
      `https://www.bossbase.nl/`.
- [ ] `https://www.bossbase.nl/robots.txt` en
      `https://www.bossbase.nl/sitemap.xml` bereikbaar.
- [ ] Contactformulier één keer echt invullen (met "TEST" in het bericht) en
      controleren dat de aanvraag onder Aanvragen in het dashboard staat. Zet hem
      daarna op spam of afgewezen.

## 5. Google Search Console

**Definitieve sitemap:** `https://www.bossbase.nl/sitemap.xml`

1. Ga naar https://search.google.com/search-console en kijk of er al een
   property is voor `bossbase.nl` (domein) of `https://www.bossbase.nl/`.
   Ontbrekende verificatiecodes in DNS of HTML bewijzen niet dat er geen is.
2. **Geen domeinproperty?** "Property toevoegen" → "Domein" → `bossbase.nl`
   (zonder www). Google toont een TXT-record `google-site-verification=…`.
   Gebruik exact die waarde; zet hem als TXT-record op `bossbase.nl` bij de
   beheerder van de DNS (opzoeken met `dig NS bossbase.nl` of bij de registrar).
   Klik op Verifiëren. Laat het record staan. Voeg een tweede eigenaar toe.
3. Sitemaps → `https://www.bossbase.nl/sitemap.xml` → Indienen.
4. URL-inspectie → "Live URL testen" → gerenderde HTML en screenshot bekijken,
   daarna "Indexering aanvragen" (daglimiet):
   - `https://www.bossbase.nl/`
   - `https://www.bossbase.nl/functies`
   - `https://www.bossbase.nl/werkbonnen`
   - `https://www.bossbase.nl/offertes`
   - `https://www.bossbase.nl/prijzen`
   - `https://www.bossbase.nl/voor-wie/installateurs`
   - `https://www.bossbase.nl/integraties/moneybird`
   - `https://www.bossbase.nl/kennisbank`
   - `https://www.bossbase.nl/kennisbank/wat-moet-er-op-een-factuur`
5. Nulmeting: exporteer Prestaties (3 maanden) en Pagina-indexering.
6. Wekelijks, de eerste 8 weken: soft 404's, duplicaten, "gecrawld, niet
   geïndexeerd", geen `/dashboard`-, `/demo`-, `/offerte/`- of
   `/werkbon/`-URL's in de index; klikken en vertoningen zonder "bossbase" in
   de zoekopdracht.

## 6. Herstelprocedure

- **Snel terug:** Vercel → Deployments → de vorige productie-deployment →
  "Promote to Production" (Instant Rollback). De website staat dan binnen een
  minuut weer op de vorige versie. Er is niets in de database of in Edge
  Functions veranderd, dus daar hoeft niets terug.
- **Blijvend terug:** `git revert -m 1 <merge-commit>` op `main` en pushen.
- **Alleen één pagina fout:** corrigeer het Markdown-bestand of de pagina,
  `npm run build` (controleert links en titels), pushen.
- Na een rollback: niets in Search Console hoeft teruggedraaid; de sitemap
  wordt opnieuw gelezen bij de volgende publicatie.

## Officiële bronnen

- Property toevoegen: https://support.google.com/webmasters/answer/34592
- Sitemaps-rapport: https://support.google.com/webmasters/answer/7451001
- URL-inspectie: https://support.google.com/webmasters/answer/9012289
- Pagina-indexering: https://support.google.com/webmasters/answer/7440203
- JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Vercel Instant Rollback: https://vercel.com/docs/instant-rollback
