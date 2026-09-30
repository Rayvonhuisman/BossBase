# Juridische documenten BossBase — onderzoek en voorstel

> **CONCEPT — door een jurist laten nakijken vóór publicatie.** Dit document en de
> vier concepten ernaast zijn opgesteld op basis van de code en de database (stand
> 23 en 29 september 2026) en openbare bronnen. Ze zijn geen juridisch advies.
> Plekken tussen [vierkante haken] moeten nog worden ingevuld of besloten.

## Stand 30 september 2026

**Afspraken:**
- De privacyverklaring en de verwerkersovereenkomst zijn die van de compagnon
  (`privacyverklaring-CONCEPT.md`, `verwerkersovereenkomst-CONCEPT.md`, met zijn
  `README.md`). Die zijn niet aangepast. Wat erin moet voor Vercel Web Analytics
  staat in `aanvulling-vercel-analytics.md`.
- Van dit spoor blijven `algemene-voorwaarden.md` en `cookiebeleid.md`.
- Analytics: **Vercel Web Analytics**, geen Google Analytics. Geen cookies, niets op
  het apparaat; de cookiebanner is weg (`src/lib/analytics.js`).
- Bewaren na opzeggen: **2 jaar**. Geen beschikbaarheidspercentage.

| Bestand | Van | Waar op de site |
|---|---|---|
| `privacyverklaring-CONCEPT.md` | compagnon | `/privacy` |
| `verwerkersovereenkomst-CONCEPT.md` | compagnon | `/verwerkersovereenkomst` |
| `algemene-voorwaarden.md` | dit spoor | `/voorwaarden` |
| `cookiebeleid.md` | dit spoor | `/cookieverklaring` |
| `aanvulling-vercel-analytics.md` | dit spoor, voorstel voor de compagnon | — |

**Vóór publicatie nog waar te maken:**

| # | Het document zegt | Nu | Te doen |
|---|---|---|---|
| 1 | Na opzeggen 2 jaar bewaren, daarna definitief weg, ook bestanden; losse termijnen (contact 1 jaar, Boss 12 maanden, meldpunt 2 jaar, mails met de klant, tokens 24 uur) | Gebouwd: migratie 20260930083452 en edge function `opschonen`. Droogloop 30-09: 0 bedrijven, 2 verlopen aanmeldcodes | Gedaan: draait sinds 30-09 dagelijks om 03:30 (eerste run: 2 verlopen aanmeldcodes weg, 0 fouten) |
| 2 | Vercel Web Analytics zonder persoonsgegevens | Gebouwd en getest (geen cookies, geen opslag, tokens en id's uit de URL). Nog niet gedeployd | Web Analytics aanzetten in het Vercel-project; na deploy controleren dat er data binnenkomt |
| 3 | Alleen opslag die nodig is | Gecontroleerd: klopt. Het AFAS-logo staat sinds 30-09 lokaal (`public/brand/afas.png`); logo.clearbit.com bestond ook niet meer | Gedaan |
| 4 | Akkoord met voorwaarden vastgelegd | Registratie toont alleen uitleg, geen vinkje | Vinkje en tabel `juridisch_akkoord` (zie §2.2) |
| 5 | Pagina's `/privacy`, `/voorwaarden`, `/verwerkersovereenkomst`, `/subverwerkers`, `/cookieverklaring` | `/subverwerkers` bestaat (30-09, gelinkt in de footer). `/cookieverklaring` is nog een lege placeholder; de rest bestaat niet | De overige toevoegen in `src/marketing/routes.jsx` na goedkeuring van de teksten |

Keuzes die nog tussen haken staan in de algemene voorwaarden: betaaltermijn vóór
de blokkade van nieuw werk (5.3), reactietijd (6.3), vergoeding voor een export door ons (9.2),
termijn om aansprakelijkheid te melden (10.5).

> Wat hieronder staat is het oorspronkelijke onderzoek van 23 september. Waar het
> Google Fonts, GA of de oude banner noemt, is het achterhaald door de stand
> hierboven.

---

## 1. Onderzoek

### 1.1 Cookies en opslag in de browser

**Kort:** BossBase zet geen enkele cookie en gebruikt geen analytics, pixels of
trackers. Wel gebruikt de app opslag in de browser (localStorage en
sessionStorage). Voor de wet (Telecommunicatiewet art. 11.7a, EDPB-richtsnoeren
2/2023) telt die opslag net zo zwaar als een cookie, dus hij staat hieronder
allemaal.

Er is één externe partij die op élke pagina meekijkt: **Google Fonts**. Daarnaast
laadt het scherm Integraties één logo van **Clearbit**.

**Opslag die BossBase zelf zet**

| Naam | Wat | Waar | Hoe lang | Soort | Toestemming nodig? |
|---|---|---|---|---|---|
| `sb-mawzqpnsluljxpbarhng-auth-token` | Inlogsessie (Supabase): toegangs- en verversingstoken, e-mailadres | dashboard, inloggen, aanmelden, uitnodiging | tot uitloggen | strikt noodzakelijk | Nee |
| `bb.currentCompanyId` (sessie) | Welk bedrijf actief is | dashboard | tot tab sluit | strikt noodzakelijk | Nee |
| `bb.aanmeld.tier` (sessie) | Gekozen abonnement tijdens aanmelden | aanmelden | tot tab sluit | functioneel | Nee |
| `bb.upgrade.herkomst` (sessie) | Waar je vandaan kwam vóór de Stripe-betaalpagina | abonnement | tot tab sluit | functioneel | Nee |
| `cookie_consent` | Keuze in de cookiebanner | dashboard | blijvend | functioneel | Nee |
| `bb.sidebarCollapsed`, `customers_view`, `leveranciers_view`, `kosten_weergave`, `kosten_periode_type`, `customer_fullscreen`, `pipeline_hide_lost`, `bb.planning.legenda`, `bb_db_segments` | Weergavekeuzes die de gebruiker zelf maakt (zijbalk, lijst of tegels, filters) | dashboard | blijvend | voorkeur (functioneel) | Nee |
| `bb_uren_herinnering_snooze_<gebruiker>` | "Later herinneren" bij de urenherinnering | dashboard | blijvend | functioneel | Nee |
| `bb_demo_mode` | Demoweergave op het dashboard aan of uit | dashboard | blijvend | functioneel | Nee |

Weergavekeuzes die de gebruiker zelf maakt, vallen onder "strikt noodzakelijk voor
een dienst waar de gebruiker om vraagt". Dat is de categorie "user-interface
customisation" die de Europese privacytoezichthouders (WP29-advies 04/2012) al jaren
vrijstellen. Ze bevatten geen persoonsgegevens, behalve het gebruikers-id in de
naam van de urenherinnering.

**Externe partijen in de browser**

| Partij | Wat gebeurt er | Waar | Cookies? | Toestemming nodig? |
|---|---|---|---|---|
| **Google Fonts** (fonts.googleapis.com, fonts.gstatic.com) | Lettertypes laden; Google ontvangt IP-adres en browsergegevens | **elke pagina**, ook de ondertekenpagina voor eindklanten | Nee | **Discutabel.** Het is geen opslag, dus art. 11.7a geldt niet, maar het IP-adres gaat zonder grondslag naar Google (VS). Een Duitse rechter (LG München, 2022) gaf daar een boete voor. → **Zelf hosten.** |
| **Clearbit** (logo.clearbit.com) | Eén logo (AFAS) op het scherm Integraties; IP-adres naar Clearbit/HubSpot (VS) | dashboard, Instellingen → Integraties | Nee | Zelfde redenering. → **Logo zelf in de app zetten.** |
| **PDOK Locatieserver** (api.pdok.nl, Rijksoverheid) | Adres opzoeken tijdens het typen | dashboard, adresvelden | Nee | Nee; overheidsdienst in NL, alleen het getypte adres |
| **Stripe** | Doorverwijzing naar de betaalpagina van Stripe | abonnement afsluiten; betaallink voor eindklanten | Ja, op het domein van Stripe | Nee, niet voor ons: Stripe verantwoordt zijn eigen cookies |
| **Google** (accounts.google.com) | Inloggen bij Google om de agenda te koppelen | dashboard, alleen als de klant dat kiest | Ja, op het domein van Google | Nee, niet voor ons |

**Niet aanwezig** (gecontroleerd in `package.json`, `index.html` en de broncode):
Google Analytics, Tag Manager, Meta-pixel, Hotjar, Plausible, PostHog, Vercel
Analytics, Sentry, chatwidgets, reCAPTCHA, YouTube-embeds.

### 1.2 Kan de cookiebanner uit het dashboard?

> **Achterhaald op 29 september 2026:** er komt Google Analytics, op de site en in
> de app. Daarvoor is toestemming nodig, dus de banner blijft, op beide. Hij moet
> dan wel echt gaan werken (zie de lijst "Vóór publicatie", punt 2). De analyse
> hieronder geldt nog wel voor alle andere opslag: die heeft geen toestemming nodig.

**Ja, nadat twee kleine dingen zijn aangepast.** Onderbouwing:

1. Alle opslag hierboven is strikt noodzakelijk of functioneel (weergavekeuzes).
   Daarvoor is geen toestemming nodig (art. 11.7a lid 3 Tw). De Autoriteit
   Persoonsgegevens schrijft zelf: wie geen gegevens meer verzamelt waarvoor
   toestemming nodig is, "kunt u de cookiebanner verwijderen". Wel moet je
   **informeren**, en dat doet het cookiebeleid.
2. De huidige banner **regelt niets**. De keuze wordt opgeslagen, maar geen enkel
   stuk code leest hem (`hasConsent()` wordt nergens aangeroepen). Google Fonts
   laadt ook na "Alleen noodzakelijk". De banner wekt dus de indruk van een keuze
   die er niet is. Dat is erger dan geen banner.
3. De banner staat nu alleen in het dashboard, niet op de publieke site. Daar is
   hij juist overbodig: wie inlogt, gebruikt de dienst.

**Voorwaarden om hem weg te halen:**
- Google Fonts zelf hosten (bestanden in `public/fonts`, `@font-face` in de CSS, de
  links in `index.html` en de twee `@import`-regels weg).
- Het Clearbit-logo vervangen door een lokaal bestand.
- Daarna het cookiebeleid publiceren op `/cookieverklaring` en er vanuit de
  footer en het dashboard naar linken. In Instellingen wordt "Cookievoorkeuren
  wijzigen" dan een link "Cookiebeleid".

Komt er later analytics bij, dan kan dat zonder banner met Plausible of Matomo
(privacyvriendelijk ingesteld, geen cookies). Anders moet de banner terug, en dan
een banner die de scripts écht tegenhoudt.

### 1.3 Plancraft en Outsmart

| | Plancraft (GmbH, Hamburg) | OutSmart (B.V., onderdeel van Visma) |
|---|---|---|
| Algemene voorwaarden | Eigen voorwaarden. Maand- of jaarabonnement, stilzwijgend verlengd, opzeggen tot één dag voor het einde. | Eigen voorwaarden (okt 2024). Jaarcontract, stilzwijgend verlengd, 30 dagen opzegtermijn, tussentijds opzeggen uitgesloten. |
| Aansprakelijkheid | Per schadegeval maximaal de contractwaarde of één jaar abonnement. | Maximaal één jaar abonnement, **nooit meer dan € 100.000**. Indirecte schade uitgesloten. |
| Prijswijziging | Bij verlenging, 30 dagen vooraf, met recht om op te zeggen. | Jaarlijkse indexatie plus tot twee keer per jaar een wijziging met een maand vooraf. Stevig. |
| Beschikbaarheid | "Gemiddeld 95% per jaar". | Geen percentage, "naar vermogen". |
| Einde contract | Data 3 maanden bewaard, daarna verwijderd; export op verzoek. | De klant exporteert zelf. Lukt dat niet, dan eenmalig een export tegen betaling. Na 3 maanden verwijderd. **Goed model.** |
| Recht en rechter | **Duits recht, rechtbank Hamburg.** Niet overnemen. | Nederlands recht. |
| Verwerkersovereenkomst | Wordt bij registratie aangevinkt; de pdf is niet vindbaar op de site. | Bijlage 1 bij de voorwaarden. Melding van een datalek "zonder onredelijke vertraging", zonder vaste termijn. Subverwerkers in het Visma Trust Centre, 30 dagen bezwaartermijn. Audit maximaal 1x per jaar, op kosten van de klant; een ISAE- of ISO-rapport volstaat. |
| Privacyverklaring | Veel marketingtags (GA, Meta, TikTok, Hotjar) achter toestemming; veel Amerikaanse ontvangers. | Nette opzet met bewaartermijnen per groep: klanten 3 maanden na einde, IP-adressen 1 jaar. |
| Cookiebeleid | Banner op de marketingsite. | Banner met accepteren en weigeren; alleen over de website, niet over de app. |

**Wat we overnemen:**
- de exportregeling en de 3 maanden na het einde van OutSmart;
- een aansprakelijkheidsplafond van één jaar abonnement;
- Nederlands recht;
- de verwerkersovereenkomst als bijlage bij de voorwaarden, geaccepteerd in één
  keer bij het aanmelden.

**Waar we het beter doen:**
- een vaste meldtermijn voor datalekken (48 uur);
- een openbare lijst met subverwerkers;
- geen prijswijziging tijdens een lopende jaarperiode;
- in gewone taal.

### 1.4 Subverwerkers en waar de data staat

| Partij | Rechtspersoon | Waarvoor | Waar staat de data | Doorgifte buiten de EU |
|---|---|---|---|---|
| **Supabase** | Supabase Pte. Ltd. (Singapore) | Database, inloggen, bestanden, serverfuncties. **Alle klantdata.** | **Frankfurt, Duitsland** (eu-central-1; gecontroleerd met `supabase projects list`) | Beheer en ondersteuning vanuit de VS en elders; standaardcontractbepalingen (SCC's) |
| **Vercel** | Vercel Inc. (VS) | Hosting van de website en de app; één doorgeefluik voor SnelStart-meldingen (`api/snelstart/webhook`) | Website wereldwijd via het CDN. **Functies standaard in Washington (iad1)**, want `vercel.json` noemt geen regio | EU-US Data Privacy Framework (DPF) + SCC's. → **`"regions": ["fra1"]` toevoegen** |
| **Resend** | Plus Five Five, Inc. (VS) | Alle e-mail: offertes, facturen, werkbonnen, uitnodigingen, herinneringen | Verzendregio in te stellen (EU mogelijk: eu-west-1). **Account, metadata en logs staan altijd in de VS** | DPF + SCC's. → Verzenddomein op de EU-regio zetten [controleren in het Resend-dashboard] |
| **Stripe** | Stripe Payments Europe, Ltd. (Ierland) | (1) Het abonnement van onze klanten. (2) iDEAL-betaallinks van onze klanten aan hún klanten, via Stripe Connect | EU-entiteit, wereldwijde verwerking | DPF + SCC's |
| **Anthropic** | Anthropic Ireland, Ltd. | De assistent "Boss" in de app (model Claude Haiku). Krijgt alleen wat de gebruiker in de chat typt; geen klantgegevens automatisch | Niet vastgelegd; verwerking ook in de VS. Geen training op klantdata; na 30 dagen verwijderd | SCC's (DPF niet bevestigd) |
| **Google** | Google Ireland Ltd. / Google LLC | (1) Lettertypes (vervalt na zelf hosten). (2) **Alleen als de klant het koppelt:** Google Agenda | Wereldwijd | DPF + SCC's |

**Koppelingen die de klant zelf aanzet.** Dat zijn geen subverwerkers van
BossBase, maar partijen waarmee de klant zelf een overeenkomst heeft. BossBase
stuurt de gegevens door in opdracht van de klant. Zo staat het ook in de
verwerkersovereenkomst.

| Partij | Wat gaat erheen | Waar |
|---|---|---|
| Moneybird B.V. | Relaties, facturen, kosten | EER (AWS Duitsland, Google NL) |
| SnelStart B.V. | Relaties (incl. IBAN), verkoopboekingen, kosten | Azure Nederland, back-ups in Ierland |
| AFAS Software B.V. | Relaties, kosten | Nederland [controleren] |
| Google Agenda | Afspraken: titel, notities, adres van de klant | Google, wereldwijd |
| Stripe Connect (account van de klant) | Betalingen van eindklanten | Stripe, EU-entiteit |

### 1.5 Wat de code en de site nu beloven en niet waarmaken

Dit moet recht vóór of tegelijk met publicatie. Een privacyverklaring die iets
belooft wat de software niet doet, is een risico op zich.

1. **Account verwijderen wist niets.** `delete_own_account()` en
   `cancel_company_account()` zetten alleen een vlag. Het commentaar in de migratie
   belooft "2 jaar bewaard, daarna opschonen via een cron job", maar die cron job
   bestaat niet. De FAQ zegt: "Je gegevens worden dan verwijderd". → Een
   opschoonjob bouwen die past bij de termijnen in de concepten (voorstel: 3
   maanden na het einde van het abonnement, facturen 7 jaar), of de teksten
   aanpassen.
2. **Geen bewaartermijn voor:** chatgesprekken met Boss (`boss_conversations`),
   verzonden e-mails (`sent_emails`), meldingen via het meldpunt (incl.
   browsergegevens), handtekeningen en foto's.
3. **De FAQ en de featurepagina noemen een koppeling met Gmail en Outlook.** Die
   bestaat niet; alle mail loopt via Resend.
4. **Het contactformulier verstuurt niets.** Het toont "verzonden" maar er gaat
   geen bericht weg. Dat is geen privacyprobleem, maar wel een bedrijfsprobleem.
5. **De footer linkt naar `/privacy` en `/voorwaarden`**, maar die routes bestaan
   niet en sturen door naar de homepage. Een tweede footer heeft vier links naar `#`.
6. **Beheerders van BossBase kunnen alle klantdata inzien** (super-admin,
   `super-admin-data`). Dat mag, mits het in de verwerkersovereenkomst staat
   (support, alleen wanneer nodig) en vastgelegd wordt wie het mag. Het
   toegangsrecht staat nu hard in de code (twee e-mailadressen).
7. **Bij ondertekenen wordt geen IP-adres of tijdstempel met browsergegevens
   gelogd.** Dat is geen privacyprobleem (minder is beter), maar maakt een
   handtekening zwakker als bewijs. Afweging voor later.

---

## 2. Voorstel: in de app

### 2.1 Waar komen de documenten te staan

**Op de site**, als gewone pagina's in dezelfde stijl als de marketingsite, zonder
inlog:

| Route | Document |
|---|---|
| `/privacy` | Privacyverklaring |
| `/voorwaarden` | Algemene voorwaarden |
| `/verwerkersovereenkomst` | Verwerkersovereenkomst met de lijst van subverwerkers |
| `/subverwerkers` | Alleen de lijst (dan kun je hem bijwerken zonder de overeenkomst te wijzigen, en ernaar verwijzen) |
| `/cookieverklaring` | Cookiebeleid (de route bestaat al) |

Elk document krijgt bovenaan een **versienummer en ingangsdatum**, en onderaan een
link "Download als pdf". De tekst staat in de repo, zodat een wijziging een commit
met een datum is. Oude versies blijven bereikbaar op `/voorwaarden/2026-10`
enzovoort, zodat je altijd kunt laten zien wat iemand heeft geaccepteerd.

**Links:**
- **Footer van de site:** Privacy · Voorwaarden · Verwerkersovereenkomst · Cookies.
  Beide footers repareren (`MktShared.jsx` en `MarketingShell.jsx`).
- **Dashboard:** in Instellingen een blok "Juridisch" met de vier links, het
  geaccepteerde versienummer met datum, en een knop om de getekende
  verwerkersovereenkomst als pdf te downloaden. Die pdf vragen klanten vaak op
  voor hun eigen AVG-administratie.
- **Mails:** in de voettekst van de systeemmails een regel met een link naar de
  privacyverklaring.
- **Publieke pagina's voor eindklanten** (offerte ondertekenen, werkbon
  ondertekenen, betaallink): een kleine regel "Deze pagina wordt verzorgd door
  BossBase namens [bedrijf]. Privacy". Die eindklant is niet onze klant. Voor hem
  is de vakman de verwerkingsverantwoordelijke; wij verwijzen alleen naar hoe
  BossBase als verwerker met zijn gegevens omgaat.

### 2.2 Akkoord bij het aanmelden

**In het scherm:** op de laatste stap van het aanmelden, vóór de knop, één
**niet-aangevinkt** vakje:

> ☐ Ik ga akkoord met de [algemene voorwaarden] en de [verwerkersovereenkomst] van
> BossBase, en heb de [privacyverklaring] gelezen.

De links openen in een nieuw tabblad. Zonder vinkje is de knop uitgeschakeld.
De privacyverklaring "lezen" en niet "akkoord": voor de verwerking van zijn
eigen gegevens heb je geen toestemming nodig (grondslag is de overeenkomst). Een
privacyverklaring laten "accepteren" suggereert dat wel.

**In de database** — een nieuwe tabel, niet een kolom op `profiles`: je wilt elke
acceptatie apart bewaren, ook bij nieuwe versies.

```sql
create table public.juridisch_akkoord (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete set null,
  email        text not null,          -- blijft staan als het profiel verdwijnt
  document     text not null check (document in ('voorwaarden','verwerkersovereenkomst')),
  versie       text not null,          -- bv. '2026-10'
  sha256       text not null,          -- hash van de tekst die getoond werd
  geaccepteerd_op timestamptz not null default now(),
  ip           inet,                    -- uit x-forwarded-for, in de edge function
  user_agent   text,
  bron         text not null           -- 'aanmelden' | 'nieuwe_versie' | 'uitnodiging'
);
```

- **Schrijven:** in de edge function die het bedrijf aanmaakt (`verify-code`), met
  de service role, zodat de gebruiker het niet zelf kan vervalsen. De frontend
  stuurt mee welke versie hij toonde. De functie controleert dat het de huidige
  versie is en slaat de hash op.
- **Rechten:** `select` voor admins van het eigen bedrijf; geen `insert`,
  `update` of `delete` voor `authenticated`. Zie de werkafspraken over
  `revoke ... from anon, authenticated`.
- **Bevestigingsmail:** na het aanmelden de voorwaarden en de
  verwerkersovereenkomst als pdf-bijlage meesturen. Dat is de "terhandstelling"
  van art. 6:234 BW: vóór of bij het sluiten, in een vorm die de klant kan
  bewaren.
- **Bestaande klanten:** bij de eerste keer inloggen na de ingangsdatum één keer
  een venster met hetzelfde vakje. Met `bron = 'nieuwe_versie'`. Wie niet
  accepteert, kan niet verder. Voor bestaande klanten is dat de eerlijkste weg,
  omdat ze nooit iets hebben geaccepteerd.
- **Nieuwe versie later:** hetzelfde venster, 30 dagen vóór de ingangsdatum
  aangekondigd per mail (zo staat het in de voorwaarden).
- **Uitgenodigde medewerkers** accepteren de voorwaarden niet. Ze sluiten geen
  overeenkomst; hun werkgever doet dat. Zij krijgen alleen een link naar de
  privacyverklaring onder de knop "Account aanmaken".

### 2.3 Volgorde

1. Jurist kijkt de vier concepten na; bedrijfsgegevens invullen (KvK, adres).
2. Techniek, onafhankelijk van de jurist:
   - Google Fonts zelf hosten
   - het Clearbit-logo lokaal zetten
   - `regions: ["fra1"]` in `vercel.json`
   - Resend op de EU-regio
   - de Gmail/Outlook-claim en de verwijderclaim uit de FAQ halen
3. Opschoonjob voor opgezegde accounts en bewaartermijnen bouwen, passend bij wat de
   privacyverklaring zegt.
4. De pagina's `/privacy`, `/voorwaarden`, `/verwerkersovereenkomst` en
   `/subverwerkers` bouwen, en de footers en het dashboard laten linken.
5. De tabel `juridisch_akkoord`, het vakje bij aanmelden en het venster voor
   bestaande klanten.
6. Cookiebanner weg, cookiebeleid live.
