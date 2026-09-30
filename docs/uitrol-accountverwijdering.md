# Uitrol: opzeggen, deactiveren, resettokens en logs

Branch `fix/accountverwijdering-bv`. Niets hiervan staat op productie.

## Drie acties, drie betekenissen

| Actie | Wie | Wat er gebeurt | Veld |
| --- | --- | --- | --- |
| **Abonnement opzeggen** (Instellingen → Abonnement) | Alleen de eigenaar | Verlenging stopt. Iedereen werkt door tot het einde van de betaalde periode. Daarna meldt Stripe `canceled` en blokkeert de server **nieuw werk en versturen** (zie hieronder wat precies). Niemand wordt gedeactiveerd. | `subscriptions.stripe_status` / `status` (webhook) |
| **Bedrijf sluiten** (Mijn profiel → Gevarenzone) | Alleen de eigenaar | Toegang van het hele team stopt direct (ook in een betaalde periode), verlenging wordt gestopt, gegevens blijven. | `companies.status = 'opgezegd'`, `opgezegd_op` |
| **Account deactiveren** (Mijn profiel → Gevarenzone) | Iedereen, alleen voor zichzelf | Eigen toegang stopt direct; het bedrijf en het werk blijven. | `profiles.actief`, `verwijderd_op` |
| **Verwijdering aanvragen** | Iedereen | Een e-mail naar info@bossbase.nl; afhandeling volgens de procedure. Niets automatisch. | — |

De webhook schrijft nooit `companies.status`; `cancel_company_account` nooit
`subscriptions`. `companies.status = 'opgezegd'` betekent dus altijd "gesloten",
een opgezegd abonnement staat alleen in `subscriptions`. Een aparte status was
daarom niet nodig; de verwarring zat in de knop, die beide deed.

## Na afloop van een opgezegd abonnement: wat blijft, wat stopt

Dit is **geen** alleen-lezen: bestaande gegevens wijzigen en verwijderen kan nog.
In de code heet het "readonly" (`bb_readonly_reden`); in teksten voor klanten
noemen we het zo niet. Het bestaande gedrag blijft voorlopig zo; een bredere
blokkade vraagt een besluit.

Getest lokaal (echte PostgREST en functiecode; `test_functies.mjs` en
`test.mjs`, groep "na afloop"):

| Blijft beschikbaar | Wordt geblokkeerd |
| --- | --- |
| Gegevens lezen, zoeken en exporteren (database, RPC) | Nieuwe rijen in 28 tabellen: klanten, leveranciers, offertes en regels, facturen en regels, werkbonnen met taken/materiaal/dagen/foto's/notities, projecten met kosten/notities/foto's, deals en notities, activiteiten, agenda, uren (urenregistratie), materialen, voertuigen, teamleden uitnodigen |
| Bestaande gegevens **wijzigen en verwijderen** (UPDATE/DELETE) | Uren boeken op een werkbon (`werkbon_uren`) — **was open**, dicht door `20260930183000_nieuw_werk_dicht_werkbon_uren.sql` |
| Facturen op betaald zetten; creditfactuur (uitzonderingen van 20260803120000) | Bestanden uploaden in de buckets van werkbonfoto's, kostenbijlagen en projectfoto's |
| Binnenkomende aanvragen van de eigen website (service_role) | Een offerte of factuur op "verzonden" zetten (trigger `bb_blokkeer_versturen`) |
| Opnieuw abonneren (`billing-checkout`, eigenaar) | Mail versturen via `send-email` |
| Verwijdering aanvragen (e-mail) | |
| Overige Edge Functions en RPC's met security definer: **niet** apart op deze beperking gecontroleerd | |

Hoe lang dit duurt, is **niet besloten**. Er is geen einddatum en geen
automatische verwijdering, en de app belooft ook geen onbeperkte toegang.

## Wat direct geblokkeerd is en wat (nog) niet bewezen is

Na "Account deactiveren" of "Bedrijf sluiten" (M2 + M3 uitgerold). "Bewezen"
betekent hier: lokaal getest met echte PostgREST en echte functiecode. Een
controle tegen de broncode of met een stand-in is geen integratietest.

| Route | Status |
| --- | --- |
| Database en RPC (PostgREST), ook met een eerder uitgegeven access token | **Bewezen direct geblokkeerd** |
| Edge Functions met service_role (15 functies, incl. `document-url`): gedeactiveerd profiel of gesloten bedrijf | **Bewezen geweigerd**, vóór elke externe aanroep of databasewijziging (exact gemeten met een schrijflog-trigger) |
| Opnieuw inloggen | Niet bevestigd — alleen broncode (GoTrue `token.go`) en stand-in |
| Refresh token | Niet bevestigd — alleen broncode (`tokens/service.go`) en stand-in |
| `auth.getUser` met een token zonder sessie | Niet bevestigd — alleen broncode (`auth.go`) en stand-in |
| Storage API, geautoriseerd verzoek | Niet bevestigd — de policy op `storage.objects` is getest, de echte storage-api niet |
| Bestaand Realtime-kanaal | Niet bevestigd — niet getest |
| Het access token zelf | Blijft geldig tot de vervaltijd (standaard 1 uur; ingestelde waarde niet uitgelezen) |
| **Bestaande signed URLs** | **Blijven geldig tot hun vervaltijd** (zie hieronder, tot 10 jaar) |
| Openbare buckets (`avatars`, `bedrijf-logos`) | Nooit geblokkeerd: publiek |

## Links van tien jaar

**Waar ze ontstonden** (tot deze branch): `sign-offerte` (handtekening →
`offertes.signature_url`, PDF → `offertes.signed_pdf_url`), `sign-werkbon`
(handtekening → `werkbonnen.handtekening_url`, PDF →
`werkbonnen.ondertekende_pdf_url`) en `getekende-pdf-nazenden` (PDF). Klanten
krijgen de PDF als **bijlage** per mail, niet als link.

**Waar ze gebruikt werden:** de knop "Ondertekende bon" (link rechtstreeks),
het tekenen van de handtekening in een opnieuw gemaakte PDF (app en
klantpagina), en `offerte-pdf-url` (haalt alleen het pad eruit en geeft al een
link van 10 minuten).

**Nieuwe lange links voorkomen (deze branch):**
- `document-url` (nieuw): link van 10 minuten, alleen voor een actief profiel
  van hetzelfde bedrijf, of met het teken-token van precies dat document.
  Werkt ook met oude rijen: het pad wordt uit de lange URL gehaald.
- De app vraagt links op het moment van openen op (`documentService.js`), met
  terugval op de opgeslagen link zolang die geldig is.
- `sign-offerte`, `sign-werkbon` en `getekende-pdf-nazenden` zetten in de
  database een ondertekende link van **24 uur** in plaats van 10 jaar. Tijdelijke
  compatibiliteit: een app-tabblad van vóór de nieuwe frontend gebruikt die
  waarde rechtstreeks en breekt dus niet; de nieuwe app en `document-url` halen
  er het pad uit.

**Getest (lokaal, stand-ins voor Auth en Storage):** de volledige route
"Ondertekende bon" in de app (knop → `document-url` → het juiste document, met
een nieuwe link van 10 minuten); een teken-token geeft alleen toegang tot zijn
eigen document (niet tot een ander document, niet tot een offerte).

**Oude links niet meer gebruiken ≠ intrekken.** Er is niets ingetrokken.
- *Niet meer gebruiken* (kan zonder risico): de app opent documenten via
  `document-url`, niet via de opgeslagen lange link. Ook het vervangen van de
  opgeslagen waarden in de database valt hieronder: de app toont ze dan niet
  meer, maar **een eerder gekopieerde link blijft werken** tot zijn vervaltijd.
- *Werkelijk intrekken* (niet gedaan, alleen na overleg):
  1. het bestand naar een nieuw pad verplaatsen en de verwijzing bijwerken; de
     oude link geeft dan 404. Wijzigt productieobjecten.
  2. de JWT-sleutel van het project roteren: trekt alle ondertekende links in,
     maar ook alle sessies en de anon- en service-sleutels.

## Onderdelen

**Nu al uitrolbaar, bewezen, los van de rest: `fix/billing-eigenaar`** (commit
2aa72d1, alleen `_shared/billing.ts`). Dicht de bestaande billingrechtenfout.
Geen migratie nodig; getest op de huidige productiestructuur (8/8).

**Op `fix/accountverwijdering-bv`, geen beleidsbesluit nodig, wel nog de
beperkingen hierboven:**

| Code | Wat | Afhankelijk van |
| --- | --- | --- |
| F1 | billing (identiek aan `fix/billing-eigenaar`) | niets |
| M1 | `20260930180000`: `email` optioneel, tabelrechten weg | niets |
| F2 | resetfuncties | M1 |
| F3 | AFAS-functies: geen relatiegegevens of tokens in logs | niets |
| F4 | 14 functies met service_role controleren profiel en bedrijf | niets |
| F5a | `document-url` (nieuw) | niets — vóór de FE |
| F5b | `sign-offerte`, `sign-werkbon`, `getekende-pdf-nazenden`, `offerte-pdf-url`: links van 24 uur i.p.v. 10 jaar | FE |
| M2 | `20260930181000` | F1 |
| M3 | `20260930182000` | niets |
| M4 | `20260930183000`: nieuw werk ook dicht voor `werkbon_uren` | niets |
| FE | Frontend | na F5a, vóór F5b |

**Apart, expliciet, niet in deze release:** M1b (destructief, vier voorwaarden
in het bestand).

**Let op, al op productie:** de opschooncron draait sinds 30-09-2026 dagelijks om
03:30 (Niels, migratie `20260930160803`). Hij verwijdert nu verlopen
aanmeldcodes en resettokens (24 uur) en zou oude contactformulieren (1 jaar),
Boss-gesprekken (12 maanden) en meldingen (2 jaar) verwijderen — voorstellen,
niet goedgekeurd. Een bedrijf komt op zijn vroegst in augustus 2028 in
aanmerking; vóór dat moment moet M2 (correcties op de job) live staan.

## Billingfix los uitrollen: `fix/billing-eigenaar`

- **Commit:** `2aa72d1` (bovenop main `cfbd7d1`). Eén bestand:
  `supabase/functions/_shared/billing.ts`.
- **Deployen (vier functies, volledige namen):**
  `supabase functions deploy billing-cancel billing-portal billing-checkout billing-wijzig`
- **Nemen alle vier de helper mee?** Ja: elk importeert
  `eisAbonnementsbeheerder` uit `../_shared/billing.ts` en roept hem aan vóór de
  eerste Stripe-aanroep; de CLI bundelt `_shared` mee. `billing-webhook` gebruikt
  de helper niet en hoeft niet mee.
- **Meegenomen van main:** productie draait nog een oudere `_shared/billing.ts`
  (zonder het vastleggen van mislukte mails in `stuurBossBaseMail`, main
  a9e6876). Die komt nu mee; de vier functies gebruiken `stuurBossBaseMail` niet
  en de tabel `mail_fouten` bestaat. `stripe.ts` en de vier `index.ts` zijn
  gelijk aan productie (vergeleken 30-09-2026).
- **Controle na deployment** (alleen aangewezen testaccounts, geen echt
  abonnement opzeggen):
  1. `supabase functions list`: de vier hebben een nieuw versienummer;
     `supabase functions download billing-cancel --use-api` bevat
     `weigerAbonnementsbeheer`.
  2. Als tweede beheerder van het testbedrijf: Instellingen → Abonnement →
     "Facturen en betaalmethode" (billing-portal). Verwacht: melding "Alleen de
     eigenaar van het bedrijf kan het abonnement beheren", geen Stripe-portal.
  3. Als eigenaar van hetzelfde testbedrijf: dezelfde knop. Verwacht: geen
     eigenaarsmelding (een testbedrijf zonder Stripe-klant krijgt een andere,
     inhoudelijke melding; dat is goed).
  4. Stripe-dashboard: geen nieuwe portalsessie of wijziging bij stap 2.
- **Herstel:** vanaf main (`cfbd7d1`) dezelfde vier functies opnieuw deployen.
  Alleen code; geen gegevens of migraties.

## Volgorde

1. **`fix/billing-eigenaar`** (zie het billingoverzicht hieronder).
2. `supabase db push` pusht alles wat klaarstaat. Hernoem voor deze stap
   `181000`, `182000` en `183000` tijdelijk naar `.sql.pending`; dan
   `supabase db push --dry-run` (moet alleen **M1**, `20260930180000`, tonen) →
   push → `npm run migratie:check -- password_reset_tokens`. Daarna terug naar
   `.sql`. (Gecontroleerd 30-09: zonder hernoemen toont de dry-run precies de
   vier migraties van deze branch.)
3. **F2, F3, F4** deployen, en **`document-url`** (nieuw; werkt met bestaande
   gegevens, raakt niets).
4. `supabase db push --dry-run` → **M2, M3, M4** (`181000`, `182000`, `183000`) → push →
   `npm run migratie:check -- companies profiles customers werkbon_uren`; controleer dat een gewone ingelogde gebruiker gegevens ziet.
5. **FE** (merge naar `main`).
6. **F5**: `sign-offerte`, `sign-werkbon`, `getekende-pdf-nazenden`,
   `offerte-pdf-url` (slaan links van 24 uur op).
7. Later en apart: M1b; eventueel oude links niet meer gebruiken of intrekken.

Gemengde versies bij de documenten: `document-url` vóór de FE is veilig (de oude
app roept hem niet aan); de nieuwe FE met de oude sign-functies werkt (pad uit
de lange link); de oude FE met de nieuwe sign-functies werkt 24 uur per nieuw
document (daarna de pagina herladen = nieuwe FE).

## Gemengde versies

Rijen 1–2 getest met `supabase/tests/lokaal/gemengd.sh`; rij 3 volgt uit geteste
weigeringen; rijen 4–5 zijn afgeleid.

| Situatie | Uitkomst |
| --- | --- |
| Nieuwe F1 op de huidige database | Veilig |
| Huidige functies op de nieuwe database | **Onveilig** (niet-eigenaar zegt Stripe op): daarom F1 eerst |
| Oude frontend na F1 en M2 | Eigenaar: "Bedrijf opzeggen" werkt als sluiten. Niet-eigenaar-beheerder: geweigerd vóór Stripe, niets gedeactiveerd |
| Nieuwe frontend op de huidige backend | Werkt; "Bedrijf sluiten" deactiveert dan nog zonder blokkade in Auth |
| M3 zonder M2 | Veilig voor de database; inloggen van een gedeactiveerde gebruiker wordt dan alleen door de app afgevangen |

## Herstel bij een gedeeltelijk mislukte uitrol

- **Migratie faalt halverwege:** één transactie per migratie, er is niets
  veranderd.
- **F1–F4 terugzetten:** vorige versie uit `main` opnieuw deployen (alleen code).
- **M1 terugzetten:** rechten terug met `grant`; `email` weer verplicht kan alleen
  zonder rijen zonder e-mailadres (tokens verlopen binnen 24 uur).
- **M2 terugzetten:** `supabase/rollback/20260930181000_…rollback.sql` (lokaal
  getest). Accounts die intussen zijn gedeactiveerd blijven geblokkeerd; per
  account heractiveren.
- **M3 terugzetten:** `supabase/rollback/20260930182000_…rollback.sql`: eerst de
  rolinstelling, dan de functie. Weigert PostgREST alles:
  `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`
- **FE:** vorige deployment terugzetten in Vercel.
- **F5b terugzetten:** de vorige sign-functies maken weer links van 10 jaar;
  rijen met een link van 24 uur werken met de nieuwe FE (via `document-url`).
  Laat `document-url` staan als de FE nieuw blijft.
- **M4 terugzetten:** `drop policy readonly_werkbon_uren on public.werkbon_uren;`
- **M1b en de opschoonjob:** niet terug te draaien; alleen uit een back-up.
