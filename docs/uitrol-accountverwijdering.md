# Uitrol: opzeggen, deactiveren, resettokens en logs

Branch `fix/accountverwijdering-bv`. Niets hiervan staat op productie.

## Drie acties, drie betekenissen

| Actie | Wie | Wat er gebeurt | Veld |
| --- | --- | --- | --- |
| **Abonnement opzeggen** (Instellingen → Abonnement) | Alleen de eigenaar | Verlenging stopt. Iedereen werkt door tot het einde van de betaalde periode. Daarna meldt Stripe `canceled` en wordt het bedrijf **alleen-lezen** (bekijken en exporteren, niets nieuws vastleggen). Niemand wordt gedeactiveerd. | `subscriptions.stripe_status` / `status` (webhook) |
| **Bedrijf sluiten** (Mijn profiel → Gevarenzone) | Alleen de eigenaar | Toegang van het hele team stopt direct (ook in een betaalde periode), verlenging wordt gestopt, gegevens blijven. | `companies.status = 'opgezegd'`, `opgezegd_op` |
| **Account deactiveren** (Mijn profiel → Gevarenzone) | Iedereen, alleen voor zichzelf | Eigen toegang stopt direct; het bedrijf en het werk blijven. | `profiles.actief`, `verwijderd_op` |
| **Verwijdering aanvragen** | Iedereen | Een e-mail naar info@bossbase.nl; afhandeling volgens de procedure. Niets automatisch. | — |

De webhook schrijft nooit `companies.status`; `cancel_company_account` nooit
`subscriptions`. `companies.status = 'opgezegd'` betekent dus altijd "gesloten",
een opgezegd abonnement staat alleen in `subscriptions`. Een aparte status was
daarom niet nodig; de verwarring zat in de knop, die beide deed.

Productbesluit (open): na afloop van een opgezegd abonnement blijft het bedrijf
onbeperkt alleen-lezen bereikbaar (zo ontworpen in 20260803120000, om gegevens
te kunnen exporteren). Wil je dat de toegang na een bepaalde tijd stopt, dan is
dat een besluit en een aparte wijziging.

## Wat direct geblokkeerd is en wat geldig blijft tot een vervaltijd

Na "Account deactiveren" of "Bedrijf sluiten" (M2 + M3 uitgerold):

| Route | Wanneer geblokkeerd | Bron |
| --- | --- | --- |
| Opnieuw inloggen | Direct | account geblokkeerd; GoTrue `token.go` (lokaal: nagebootst) |
| Refresh token | Direct | sessies verwijderd; GoTrue `tokens/service.go` (nagebootst) |
| Bestaand access token → database, RPC (PostgREST) | Direct | restrictive policies + pre-request (lokaal met echte PostgREST getest) |
| Bestaand access token → Edge Functions | Direct | `auth.getUser` faalt zonder sessie (GoTrue `auth.go`); functies met service_role controleren daarnaast zelf profiel en bedrijf (`_shared/actieveGebruiker.ts`, getest) |
| Bestaand access token → Storage, geautoriseerd verzoek | Direct, volgens de policy op `storage.objects` | policy getest; de echte storage-api niet |
| Bestaand Realtime-kanaal | Verwacht direct voor nieuwe wijzigingen (RLS per wijziging), kanaal zelf tot het token verloopt | **niet getest** |
| Het access token zelf | Blijft cryptografisch geldig tot de vervaltijd (standaard 1 uur; de ingestelde waarde is niet uitgelezen) | — |
| **Bestaande signed URLs** | **Niet geblokkeerd tot hun vervaltijd.** Handtekeningen en ondertekende PDF's krijgen 10 jaar, overige 10 minuten tot 1 uur | signed URLs controleren geen gebruiker |
| **Openbare buckets** (`avatars`, `bedrijf-logos`) | Nooit: iedereen met de link | publiek by design |

Beloof dus geen "onmiddellijke" blokkade van bestanden: een eerder gekopieerde
link naar een handtekening of ondertekende PDF blijft werken.

## Onderdelen

**Zelfstandig uit te rollen, geen beleidsbesluit nodig:**

| Code | Wat | Afhankelijk van |
| --- | --- | --- |
| F1 | `billing-cancel`, `-portal`, `-checkout`, `-wijzig` (`_shared/billing.ts`): alleen de eigenaar, vóór elke Stripe-aanroep | niets — dicht de bestaande billingrechtenfout |
| M1 | `20260930120000`: `email` optioneel, tabelrechten weg (alleen uitbreidend) | niets |
| F2 | `request-password-reset`, `apply-password-reset` | M1 |
| F3 | AFAS-functies: geen relatiegegevens of tokens in logs | niets |
| F4 | 14 functies met service_role controleren profiel en bedrijf (`_shared/actieveGebruiker.ts`) | niets |
| M2 | `20260930160000`: blokkeren bij deactiveren, eigenaarregel, bewaking eigenaar/status, correcties opschoonjob (die pas iets doen als de cron ooit aangaat) | F1 |
| M3 | `20260930170000`: policies, pre-request, `bb_mag_abonnement_beheren` | niets |
| FE | Frontend: drie acties gescheiden, teksten, demo-correctie | liefst na F1 |

**Apart, expliciet, niet in deze release:**

- **M1b** `20260930120500_resettoken_opruimen.sql.pending` (destructief). Alleen
  als de vier voorwaarden in dat bestand aantoonbaar gelden.
- **Opschooncron** `20260930083835_opschonen_cron.sql.pending`. Vereist een besluit
  over de termijn(en), een beoordeelde droogloop via de echte functie en
  duidelijkheid over back-ups.

## Volgorde

1. **F1** deployen (eventueel meteen, los van de rest).
2. `supabase db push --dry-run` → alleen **M1** → push → `npm run migratie:check -- password_reset_tokens`.
3. **F2**, **F3** en **F4** deployen.
4. `supabase db push --dry-run` → **M2** en **M3** → push →
   `npm run migratie:check -- companies profiles customers`; controleer dat een
   gewone ingelogde gebruiker gegevens ziet (pre-request actief).
5. **FE**: merge naar `main`.
6. Later en apart: M1b (voorwaarden), cron (besluit).

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
- **M2 terugzetten:** `supabase/rollback/20260930160000_…rollback.sql` (lokaal
  getest). Accounts die intussen zijn gedeactiveerd blijven geblokkeerd; per
  account heractiveren.
- **M3 terugzetten:** `supabase/rollback/20260930170000_…rollback.sql`: eerst de
  rolinstelling, dan de functie. Weigert PostgREST alles:
  `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`
- **FE:** vorige deployment terugzetten in Vercel.
- **M1b en de opschoonjob:** niet terug te draaien; alleen uit een back-up.
