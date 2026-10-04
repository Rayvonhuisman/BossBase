# Databasebaseline en migratiestrategie

**Opgesteld:** 9 september 2026 · **Fase:** 0B van het AI-project · **Status:** vastgelegd, cutover nog niet uitgevoerd

Dit document beschrijft waarom `supabase/migrations/` de BossBase-database niet kan herbouwen, wat er in plaats daarvan is vastgelegd, en hoe we daar op termijn uit komen. Alles hierin is geverifieerd tegen de live database met alleen-lezen query's; er staan geen gegevens, sleutels of adressen in.

---

## 1. Waarom het migratiearchief niet volstaat

Op 9 september 2026 staan er 172 migraties in `supabase/migrations/`, en dezelfde 172 versies staan geregistreerd in `supabase_migrations.schema_migrations`. Lokaal en live lopen dus gelijk — en tóch is een herbouw vanaf nul onmogelijk.

De reden is simpel: **de oudste tabellen zijn nooit door een migratie aangemaakt.** Ze zijn in de begintijd via het Supabase-dashboard ontstaan, vóórdat er met migraties werd gewerkt. De migraties die er later bij kwamen doen wél `ALTER TABLE` en `CREATE POLICY` op die tabellen, maar er is geen enkele `CREATE TABLE`.

Draai je `supabase db reset` of bouw je een verse database met alleen de migraties, dan valt de eerste migratie die `ALTER TABLE public.companies` doet meteen om.

Dit is geen theoretisch risico. Het betekent concreet dat we vandaag:

- geen wegwerp-testdatabase kunnen opzetten om een RLS-wijziging veilig te proberen;
- geen tweede omgeving (staging) kunnen opbouwen;
- bij dataverlies alleen kunnen terugvallen op een Supabase-backup, niet op de repository;
- geen enkele automatische controle hebben die merkt dat het schema is weggelopen.

Punt 1 is wat dit voor het AI-project blokkeert: fase 0C wil `bb_has_permission()` en de policy op `werkbon_uren` aanpassen, en dat hoor je niet als eerste op productie te proberen.

## 2. Welke tabellen buiten de migraties zijn ontstaan

Elf tabellen in `public` hebben geen enkele `CREATE TABLE` in de migratiehistorie. Ze zijn wel volop aanwezig in latere migraties — de aantallen hieronder zijn het aantal migratiebestanden waarin de naam voorkomt:

| Tabel | Genoemd in | Rol |
|---|---:|---|
| `profiles` | 71 | gebruiker, rol, bedrijfskoppeling |
| `companies` | 59 | het tenantanker |
| `facturen` | 37 | facturatie |
| `customers` | 24 | klanten |
| `deals` | 16 | verkooppijplijn |
| `activities` | 12 | taken en afspraken |
| `calendar_events` | 12 | agenda |
| `pipeline_stages` | 11 | dealfasen |
| `factuur_regels` | 6 | factuurregels |
| `job_costs` | — | kosten (heet níet `kosten`) |
| `notes` | — | losse notities |

Dat zijn precies de tabellen waar de AI-assistent uit fase 1 op moet leunen. Voor die tabellen was de code dus nooit de bron van waarheid.

## 3. Waarom de live database de bron van waarheid was

Drie onafhankelijke redenen:

1. **De kerntabellen staan nergens anders.** Zie §2.
2. **De live database liep vooruit op git.** Migratie `20260907210753 urenregistratie_werkbon_koppeling` was op productie toegepast en stond in geen enkele branch. Zonder de ledger uit te lezen was die definitie verloren geweest.
3. **De ledger bewaart de werkelijk uitgevoerde SQL.** `supabase_migrations.schema_migrations` heeft een kolom `statements` met de statements zoals ze zijn gedraaid. Dat maakt herstel exact in plaats van een gok.

Er is één historische onvolkomenheid die dit onderstreept. De ledger registreert bij versie `017` de naam `projects` en bij `018` de naam `profile_avatars`, terwijl de lokale bestanden `017_cron_afas_sync.sql` en `018_company_logo.sql` heten. Wat er is gebeurd: `projects` en `profile_avatars` zijn oorspronkelijk als 017 en 018 geschreven (hun eigen bestandskop zegt dat nog), later hernoemd naar 025 en 026, en daarna opnieuw toegepast — beide idempotent, dus onschadelijk. De nieuwe 017 en 018 zijn wél uitgevoerd maar hebben nooit een eigen ledgerrij gekregen.

Structureel is er niets mis: de effecten van álle vier zijn live aanwezig (cron-jobs `afas-import-kosten` en `afas-sync-contacten` bestaan, `companies.logo_url` bestaat, tabel `projects` bestaat, `profiles.avatar_url` bestaat). Alleen de etiketten in de ledger kloppen niet. Rechtzetten vraagt `migration repair`, en dat is het niet waard — het staat als informatief punt in de driftcontrole zodat niemand er nog een keer over struikelt.

## 4. Hoe de baseline is gemaakt

`supabase db dump` viel af: die start een Docker-container en er is geen Docker op de werkplek. `pg_dump` en `psql` zijn er evenmin, en er staat geen databasewachtwoord opgeslagen. Wat wél werkt is de route uit `CLAUDE.md`:

```
supabase db query --linked -f <script.sql>
```

Dat gaat via de Management API met het CLI-token en is voor `select`-query's volledig read-only.

De baseline is opgebouwd uit dertien afzonderlijke catalogusquery's, elk verantwoordelijk voor één soort object, waarna de resultaten in afhankelijkheidsvolgorde aan elkaar zijn geschreven. Waar Postgres een officiële DDL-generator heeft, is die gebruikt: `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_viewdef`, `pg_get_expr` voor defaults. Tabellen en policies zijn samengesteld uit `pg_attribute` respectievelijk `pg_policies`, omdat Postgres daar geen kant-en-klare generator voor heeft.

Elke functie krijgt twee machine-leesbare regels mee:

```
-- @signature bb_has_feature(p_company_id uuid, p_feature text)
-- @returns   boolean
```

Die komen uit `pg_get_function_identity_arguments()` en `pg_get_function_result()`. Ze staan er omdat de `CREATE`-regel zelf niet betrouwbaar te vergelijken is: `pg_get_functiondef()` zet `DEFAULT`-waarden in de argumentenlijst — twaalf functies hier hebben die — en breekt soms af over meerdere regels. De identity arguments zijn precies wat een functie uniek maakt. `scripts/db-drift-check.mjs` vergelijkt op deze markers.

**Bestand:** `supabase/baseline/live_public_schema_20260909.sql` — 296 kB, 7.052 regels, 1.359 statements.

Er bestond nog geen conventie voor schemasnapshots in dit project. `supabase/baseline/` sluit aan bij de bestaande buren `supabase/migrations/`, `supabase/tests/`, `supabase/rollback/` en `supabase/demo-data/`. Belangrijker: `supabase db push` leest uitsluitend `supabase/migrations/`, dus een bestand hierbuiten kan nooit per ongeluk als openstaande migratie meeliften. Dat is bewuster dan de `.sql.pending`-truc uit `CLAUDE.md`, die alleen nodig is voor bestanden die wél in de migratiemap staan.

### Objectaantallen — baseline tegenover live

| Objectsoort | Baseline | Live | |
|---|---:|---:|---|
| extensions | 6 | 6 | gelijk |
| enums / custom types | 0 | 0 | gelijk |
| losse sequences | 0 | 0 | gelijk |
| tabellen | 67 | 67 | gelijk |
| primary/unique/check | 103 | 103 | gelijk |
| functiesignatures | 121 | 121 | gelijk |
| — waarvan unieke namen | 109 | 109 | gelijk |
| views + matviews | 0 | 0 | gelijk |
| foreign keys | 130 | 130 | gelijk |
| indexen (los) | 96 | 96 | gelijk |
| triggers | 36 | 36 | gelijk |
| tabellen met RLS aan | 67 | 67 | gelijk |
| RLS-policies | 226 | 226 | gelijk |
| grants | 507 | 507 | gelijk |

Nul afwijkingen. Twee getallen die uitleg verdienen, allebei geen afwijking:

- Van de 177 indexen live zijn er 81 automatisch aangemaakt door een primary key of unique constraint; die staan niet apart in de baseline omdat de constraint ze zelf maakt.
- 121 functiesignatures op 109 unieke namen. Twaalf functies zijn overloaded: `bb_downgrade_blokkades`, `bb_effective_tier`, `bb_has_feature`, `bb_is_readonly`, `bb_is_trial`, `bb_limit`, `bb_mag_wisselen`, `bb_periode_start`, `bb_plan_geconfigureerd`, `bb_readonly_reden`, `bb_usage` en `bb_within_limit`. Elk heeft een variant met een expliciete `p_company_id` en een variant die het eigen bedrijf zelf opzoekt. Op namen tellen levert 109 op, op signatures 121 — en alleen die tweede telling is bruikbaar voor driftdetectie.

Negen tabellen hebben RLS aan en géén policies. Dat is opzet — ze zijn uitsluitend voor de `service_role`: `boss_rate_limit`, `boss_doorzet_limiet`, `email_send_attempts`, `email_verification_attempts`, `email_verification_codes`, `google_calendar_connections`, `password_reset_attempts`, `password_reset_tokens`, `stripe_billing_events`. Baseline en live komen ook hier exact overeen.

## 5. Wat er wel en niet in de baseline staat

**Wel:** extensions, tabellen met kolommen, types, defaults en NOT NULL, primary keys, unique en check constraints, foreign keys, indexen, functies met hun volledige definitie inclusief `SECURITY DEFINER`/`INVOKER` en `search_path` plus een `@signature`- en `@returns`-marker per functie, triggers, de RLS-status per tabel, alle policies, en alle grants voor `anon`, `authenticated` en `service_role`.

**Niet:**

- Geen rijen. Nul `INSERT`, `UPDATE`, `DELETE`, `COPY` of `TRUNCATE` op topniveau — automatisch gecontroleerd, zie §8.
- Geen auth-gebruikers, geen storage-objecten, geen vault-inhoud.
- Geen secrets. Gescand op JWT's, `sk_live`/`sk_test`/`pk_live`, `whsec_`, `sk-ant`, Resend-sleutels, private keys, bearer-tokens: nul treffers. Geen e-mailadressen, geen UUID-literalen, geen URL's, geen projectverwijzing.
- Geen Supabase-eigen schema's (`auth`, `storage`, `vault`, `realtime`, `graphql`, `extensions`, `cron`). Verwijzingen erheen blijven staan waar een `public`-definitie ze nodig heeft — `auth.users` in een foreign key, `auth.uid()` in een policy — want zonder die verwijzing is de definitie onvolledig.
- Geen `cron.job`-inhoud. De crons worden aangemaakt door migraties en bevatten een project-URL; ze horen niet in een schemasnapshot.
- **Geen configuratiedata** — en dat is de belangrijkste beperking van dit bestand, zie hieronder.

### De baseline reproduceert het schema, niet het gedrag

Vijf tabellen in de baseline zijn geen klantdata maar **configuratie**, en het rechtenmodel hangt ervan af: `plan_feature_defs`, `plan_features`, `plan_limits`, `plan_modules` en `plan_module_tiers`.

`bb_has_feature()` heeft een veiligheidsklep:

```sql
NOT bb_plan_geconfigureerd(company) AND NOT <feature is intern>   →  true
```

Staat `plan_features` leeg, dan is **elke** feature aan. Inclusief `gedeelde_werkruimte`, die in de RLS-policies van `werkbonnen`, `activities`, `calendar_events` en `projects` de hele rechtencontrole buitenspel zet: iedereen binnen het bedrijf ziet dan alles.

Dat is op 15 september 2026 echt gebeurd. De securitytests draaiden op een verse baselinedatabase en een medewerker "zag" de werkbon van zijn collega. Geen bug in de policy — een lege configuratietabel. De tests hadden grotendeels groen kunnen kleuren zonder iets te meten.

Daarom is de configuratieseed geen optionele stap maar een **verplicht onderdeel** van het opbouwen van een testdatabase, en controleert `supabase/tests/ai_permission_prerequisites_test.sql` als eerste blok of de matrix gevuld is voordat hij ook maar iets meet.

Woorden als `secret`, `password` en `token` komen wel voor in het bestand, maar uitsluitend als kolom-, tabel- of constraintnaam (`password_reset_tokens`, `stripe_payment_token`, `api_token`). Nooit als waarde.

## 6. Hoe de ontbrekende migratie is hersteld

`20260907210753_urenregistratie_werkbon_koppeling` stond live geregistreerd maar ontbrak in git. De originele SQL is teruggehaald met één alleen-lezen query op de `statements`-kolom van de ledger — één statement, 1.481 tekens.

Het is dus **geen reconstructie**. Het bestand `supabase/migrations/20260907210753_urenregistratie_werkbon_koppeling.sql` bevat de originele SQL byte-voor-byte, met alleen een toelichtende kop erboven. Er is niets herschreven, samengevoegd of aangevuld — ook niet de `notify pgrst, 'reload schema';` die `CLAUDE.md` voorschrijft, want die stond niet in het origineel en het bestand moet weergeven wat er werkelijk is gedraaid.

Daarna is read-only geverifieerd dat alle negen objecten die de migratie oplevert ook echt live staan: drie kolommen (`werkbon_id`, `customer_id`, `deal_id` op `urenregistratie`), drie foreign keys met `ON DELETE SET NULL`, drie indexen. Negen van de negen aanwezig. De migratie raakt geen functies, triggers of policies.

Na het herstel meldt `supabase migration list --linked`: 172 aan beide kanten, 0 openstaand, 0 ontbrekend.

> **Voor de volgende keer.** De CLI heeft `supabase migration fetch --linked`, dat migratiebestanden uit de ledger terugschrijft. Hier is dat bewust níet gebruikt: het schrijft *alle* migraties weg en zou de 171 bestaande lokale bestanden overschrijven met de kale ledgerversie — zonder de koppen en toelichtingen die dit project consequent bijhoudt. Voor één ontbrekende migratie is een gerichte query veiliger. Voor een lege repository is `migration fetch` juist wél het aangewezen middel.

## 7. Hoe je voortaan een migratie maakt

Ongewijzigd ten opzichte van `CLAUDE.md`; hier alleen wat er met de baseline bij komt.

1. Kopieer `supabase/migrations/_TEMPLATE.sql`.
2. Sluit af met `notify pgrst, 'reload schema';`.
3. Zet bij elke nieuwe functie zelf de rechten: `revoke all ... from public, anon, authenticated;` — die drie moeten er letterlijk staan — en daarna een gerichte `grant execute`.
4. Droogloop eerst in een teruggedraaide transactie (`begin; … rollback;` werkt ook voor DDL via de Management API).
5. `supabase db push --dry-run`, controleren dat er precies staat wat je verwacht, dan pas `supabase db push`.
6. `npm run migratie:check -- <tabellen>`.
7. **Nieuw:** `npm run db:drift`. Die meldt of het schema nu afwijkt van de baseline.
8. **Nieuw:** wijkt het schema structureel af, regenereer dan de baseline en commit hem in dezelfde pull request als de migratie. De baseline hoort bij de wijziging, niet erna.
9. **Nieuw:** raakt de migratie de feature- of limietmatrix, pas dan `src/lib/features.js` of `src/lib/tiers.js` aan — dat is de bron — en genereer de seed-SQL met `node scripts/gen-plan-matrix.mjs`. Nooit rijen met de hand in `plan_features` zetten: dan lopen de UI, de database en `npm run db:seed:local` uit elkaar.

Wil je een migratie bewust nog niet uitrollen, hernoem hem dan naar `.sql.pending`; `db push` slaat hem over en meldt dat ook. Op dit moment staat `20260828170000_moneybird_sync_targets_fix.sql.pending` zo geparkeerd.

## 8. Hoe schema drift voortaan wordt gecontroleerd

```
npm run db:drift
```

`scripts/db-drift-check.mjs`, in dezelfde stijl als `scripts/migratie-check.mjs`. Volledig read-only: het leest catalogusinformatie via `supabase db query --linked` en raakt geen enkele rij uit een klanttabel aan. Er wordt geen sleutel gelezen of geprint.

Vier controles:

| | Wat | Bij afwijking |
|---|---|---|
| A | Live migratieversies tegenover `supabase/migrations/*.sql`, beide richtingen | **fout** als live iets heeft dat git mist; **let op** als lokaal iets openstaat |
| B | Live schema-objecten tegenover de baseline: tabellen, **functiesignatures** (niet functienamen), indexen, triggers, policies, foreign keys, RLS-status | **fout** bij een object dat live bestaat en in de baseline niet |
| C | RLS op 31 tenanttabellen, los van de baselinevergelijking | **fout** — dit mag nooit verdwijnen, ook niet als de baseline is bijgewerkt |
| D | Baseline-hygiëne: staat er alleen DDL in het baselinebestand | **fout** bij een statement dat geen DDL is |

Controle D splitst het bestand op top-level puntkomma's met respect voor `$tag$`-blokken en `'`-strings. Zonder die splitsing valt elke plpgsql-functie met een `INSERT` in zijn body ten onrechte door de mand.

Controle B vergelijkt functies op **signature**, niet op naam. De eerste versie van dit script telde unieke namen en meldde daardoor 109 aan beide kanten, terwijl de baseline er 121 bevat. Dat was niet alleen verwarrend maar ook onveilig: verdwijnt één van de twaalf overloads — bijvoorbeeld `bb_has_feature(p_feature text)` terwijl `bb_has_feature(p_company_id uuid, p_feature text)` blijft — dan verandert de namenverzameling niet en bleef dat onzichtbaar. De controle is aantoonbaar op precies dat scenario getest. De naamtelling staat er nog wel bij als tweede regel, zodat het verschil tussen 121 en 109 zichtbaar blijft.

Een baseline zonder `@signature`-markers stamt van vóór 10 september 2026; het script meldt dat als **fout** in plaats van stilzwijgend een zwakkere vergelijking te doen.

Exitcodes: `0` geen drift, `1` drift gevonden, `2` het script kon zijn werk niet doen. Wat het script níet mag en niet doet: geen `db push`, geen `migration repair`, geen DDL, geen enkele write.

De twee naamverschillen bij 017 en 018 komen terug als **info** en beïnvloeden de exitcode niet.

## 9. Een nieuwe lokale of testdatabase opbouwen

De vaste keten, in deze volgorde:

```
lege lokale Supabase-stack
   → schema-baseline            supabase/baseline/live_public_schema_20260909.sql
   → verplichte configuratieseed  npm run db:seed:local
   → migraties ná de cutoff     alles met een versie > 20260907210753
   → tests                      supabase/tests/*.sql
```

Sla je stap drie over, dan meet je niets (zie §5). Sla je stap vier over, dan mis je alles wat na de foto is gebeurd; `npm run db:drift:local` meldt precies welke migraties dat zijn.

**In één keer (sinds 1 oktober 2026):** staat de lokale stack al aan, dan doet `npm run db:bootstrap:local` de hele keten hieronder: `public` leegmaken, baseline, uitvoerrechten, standaardrechten, seed, alle migraties ná de cutoff, seed opnieuw. Host en poort staan in het script vast op `127.0.0.1:54322`. Daarna `npm run db:test:security`.

Twee dingen doet dat script die in de handmatige stappen hieronder ontbraken, en die allebei pas zichtbaar werden door de lokale database rechtstreeks met productie te vergelijken (policies, functies, tabelrechten en uitvoerrechten per functie, als hash):

- **`REVOKE ... FROM PUBLIC` op elke baselinefunctie.** Postgres geeft een nieuwe functie EXECUTE aan PUBLIC; de baseline bevat wel de GRANTs maar geen REVOKE. Zonder die stap was lokaal elke functie voor iedereen uitvoerbaar: 72 verschillen met productie, waaronder `bb_factuurtotalen()`.
- **De standaardrechten van Supabase terugzetten ná de baseline.** Die hangen aan het schema en verdwijnen met `drop schema public cascade`. Zonder die stap kregen tabellen uit latere migraties lokaal geen rechten voor `authenticated`: 33 verschillen.

Met beide stappen: 0 verschillen op 343 policies, 192 functies, tabelrechten en uitvoerrechten (gemeten 1-10-2026 tegen `origin/main` `e7f6a97`). `npm run db:drift:local` vergelijkt met de baseline van 9 september en meldt dus terecht alles wat de 72 latere migraties hebben toegevoegd; dat is geen fout van de opbouw.

**Stap voor stap, met de hand:**

1. `supabase start`. Let op: de CLI probeert daarbij de 172 historische migraties af te spelen en die vallen om op `ALTER TABLE public.companies` — precies het probleem uit §1. Zet `supabase/migrations/` daarom tijdelijk opzij, bijvoorbeeld met een `trap` die de map hoe dan ook terugzet:

   ```bash
   MIG=supabase/migrations; TMP=supabase/_migrations_tijdelijk_lokaal
   restore() { [ -d "$TMP" ] && mv "$TMP" "$MIG"; }; trap restore EXIT INT TERM
   mv "$MIG" "$TMP"
   supabase start -x storage-api,imgproxy,studio,logflare,vector,edge-runtime,mailpit,realtime,supavisor,postgres-meta
   ```

   De uitgesloten diensten zijn niet nodig voor RLS-tests; `storage-api` werd bovendien unhealthy en trok de hele stack neer.

2. Controleer dat `public` leeg is en dat `auth.users` bestaat. Zo niet, maak `public` leeg:

   ```sql
   drop schema if exists public cascade;
   create schema public;
   alter schema public owner to pg_database_owner;
   grant usage on schema public to anon, authenticated, service_role;
   ```

3. De baseline laden. `supabase db query -f` werkt hier níet: die stuurt het bestand als één prepared statement en struikelt over meerdere commando's. Gebruik `psql` in de container:

   ```bash
   docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
     < supabase/baseline/live_public_schema_20260909.sql
   ```

4. `npm run db:seed:local` — de configuratieseed. Deterministisch, herhaalbaar, en hij weigert elke niet-lokale host.

5. Migraties ná de cutoff los overheen draaien, op volgorde van versie.

6. `npm run db:drift:local` en daarna de tests.

Optioneel: `supabase/demo-data/*.sql` voor testgegevens (schilderbedrijf, aannemer, leads).

Wat deze database **niet** heeft: de Supabase-eigen schema's zijn leeg (`auth.users` bestaat maar bevat niets), er zijn geen cron-jobs, geen storage-buckets en geen secrets. Voor een RLS-test is dat genoeg — je maakt zelf twee testbedrijven aan, zoals `readonly_test.sql` en `ai_permission_prerequisites_test.sql` dat doen. Voor een end-to-end-test van de betaalflow is het niet genoeg.

**De baseline heeft één blinde vlek** die je moet kennen: hij is gegenereerd op peilmoment 9 september 2026. Elke migratie die daarna is toegepast staat er niet in. `npm run db:drift:local` is precies de controle die dat aan het licht brengt.

## 10. Wat er nodig is voor een officiële baseline in de migratiehistorie

De baseline is nu documentatie plus een bootstrapscript. Officieel wordt hij pas als `supabase db reset` en `supabase db push` op een lege database uit zichzelf tot het juiste schema leiden. Daarvoor moet er een migratiebestand komen dat vóór `001_add_operations_modules.sql` draait — bijvoorbeeld `00000000000000_initial_schema.sql` — dat de elf ontbrekende kerntabellen aanmaakt in de vorm die ze hádden vóór migratie 001, niet in de vorm van vandaag.

Dat laatste is het echte werk. De huidige baseline beschrijft de eindtoestand: `customers` mét `snelstart_id`, `facturen` mét de Stripe-kolommen. Zet je die als beginpunt neer en draait daarna migratie 010 die `facturen.externe_referentie` toevoegt, dan botst dat. Er zijn twee uitwegen: elke latere migratie idempotent maken (`ADD COLUMN IF NOT EXISTS`, wat de meeste al zijn), of de kerntabellen terugrekenen naar hun oervorm.

En op productie moet die nieuwe versie als "reeds toegepast" geregistreerd worden zonder te draaien — dat is `supabase migration repair --status applied`, een schrijfactie op de ledger.

## 11. Waarom die stap nu niet is gezet

Vier redenen, in volgorde van gewicht.

1. **`migration repair` schrijft in de migratieadministratie van productie.** Gaat dat mis, dan denkt de CLI dat er migraties zijn toegepast die dat niet zijn, of andersom. Het is geen ramp die je niet kunt herstellen, maar het is wel een schrijfactie op het enige register dat vertelt wat er met de database is gebeurd. Dat doe je niet als bijzaak in een fase die over documentatie gaat.
2. **De juiste vorm van de baseline is nog niet vastgesteld** (§10, de eindtoestand-versus-oervorm-vraag). Zonder die keuze registreer je iets waarvan je niet weet of het klopt.
3. **De aanname is niet getest.** "Deze baseline plus de 172 migraties levert het huidige schema op" is een bewering. Die hoor je te bewijzen op een lege database, en dan te vergelijken met de live catalogus. Die reproductietest is de logische volgende stap, niet de repair.
4. **Het is niet nodig voor het AI-project.** Fase 0C heeft een testomgeving nodig, en die kan vandaag al met §9.

De opdracht voor fase 0B was expliciet: geen `db push`, geen `migration repair`, geen live wijzigingen. Dat is gevolgd.

## 12. Rollback en herstel

**De baseline en de driftcontrole zijn niet-destructief.** Het zijn een tekstbestand en een leesscript; er is niets aan terug te draaien. Weghalen is `rm` en verder niets.

**Het herstelde migratiebestand** `20260907210753_...sql` is eveneens onschadelijk: die versie staat live al als toegepast geregistreerd, dus `db push` slaat hem over. Zou hij ooit tóch draaien, dan is elk statement idempotent (`ADD COLUMN IF NOT EXISTS`, een `pg_constraint`-controle voor de foreign keys, `CREATE INDEX IF NOT EXISTS`). Weghalen brengt je terug in de situatie waarin productie een migratie heeft die git niet kent — precies wat we wilden oplossen.

**Als een toekomstige baseline-cutover misgaat:**

| Wat er misging | Herstel |
|---|---|
| `migration repair` heeft de verkeerde versie gemarkeerd | Repair opnieuw met de juiste `--status`; de ledger is een gewone tabel, geen eenrichtingsverkeer. Noteer vooraf de oorspronkelijke rij. |
| De baseline blijkt onvolledig op een verse database | Geen productie-impact — het gebeurt op een wegwerpdatabase. Regenereer met de dertien query's uit §4 en probeer opnieuw. |
| Een squash heeft lokale migraties samengevoegd die je terug wilt | De originele bestanden staan in git. `git revert` of `git checkout <commit> -- supabase/migrations/`. |
| Onduidelijk of productie nog klopt | `npm run db:drift`. Bij twijfel: de baseline is de foto van 9 september 2026, en de Supabase point-in-time backup is de echte vangrail. |

Voor deze fase specifiek: alles staat op de branch `chore/ai-database-baseline`, met `main` op `cc0e998` en de backupbranch `backup/pre-ai-sync-20260909` ongemoeid. De branch weggooien wist alles wat hier is gemaakt en raakt niets anders.

---

## Bijlage — de cutover-opties afgewogen

Zes routes naar een officiële baseline. Geen ervan is uitgevoerd.

### Optie 1 — Baseline registreren met een historische versie

Een `00000000000000_initial_schema.sql` toevoegen die vóór alle bestaande migraties sorteert, en die op productie met `migration repair --status applied` als toegepast markeren.

**Voordelen** — Kleinste ingreep. De 172 bestaande migraties blijven ongewijzigd en leesbaar; de historie blijft de historie. Nieuwe omgevingen kunnen `db reset`.
**Risico's** — Vraagt de oervorm-versus-eindtoestand-keuze uit §10. Eén schrijfactie op de productie-ledger. Als latere migraties niet idempotent zijn, breekt de keten op een verse database — dat merk je pas bij de reproductietest.
**Impact productie** — Alleen op `supabase_migrations.schema_migrations`. Geen schema, geen data.
**Impact lokale migraties** — Geen. Er komt er één bij, vooraan.
**Rollback** — De toegevoegde rij weer verwijderen en het bestand weghalen.

### Optie 2 — `supabase migration squash`

De 172 migraties samenpersen tot één bestand.

**Voordelen** — Eén schoon startpunt, geen dubbele historie. Officieel CLI-commando.
**Risico's** — Groot, en het weegt hier zwaar. Deze migraties zijn geen droge DDL: `20260803120000_readonly.sql` legt in veertig regels commentaar uit waarom read-only geen lockout is, `20260903120000_kruistenant_gaten_dichten.sql` documenteert drie gemeten beveiligingsgaten met de gemeten responses erbij, en `CLAUDE.md` verwijst naar migratienummers als bewijsmateriaal. Squashen gooit dat weg. Bovendien lost het het kernprobleem niet op: de squash vertrekt vanuit de lokale migraties, en die missen juist de elf kerntabellen.
**Impact productie** — `--linked` herschrijft de productieledger.
**Impact lokale migraties** — Alle 172 verdwijnen uit de map.
**Rollback** — Via git, maar de ledger op productie moet apart terug.
**Oordeel** — Afgeraden. De prijs is het projectgeheugen.

### Optie 3 — Aparte initial-schema-procedure (de huidige situatie, vastgelegd)

De baseline blijft buiten `supabase/migrations/` staan; opbouw vanaf nul is een gedocumenteerde tweetrapsprocedure (§9).

**Voordelen** — Nul risico. Werkt vandaag al. Geen enkele schrijfactie op productie. De migratiehistorie blijft intact.
**Risico's** — `supabase db reset` werkt nog steeds niet uit zichzelf; het blijft handwerk dat mensen kunnen vergeten. De baseline kan verouderen — daar is `npm run db:drift` voor.
**Impact productie** — Geen.
**Impact lokale migraties** — Geen.
**Rollback** — Niet van toepassing.

### Optie 4 — Declarative schema management

De geïnstalleerde CLI (2.98.2) heeft `supabase db schema declarative`. Je beschrijft de gewenste eindtoestand in `supabase/schemas/`, en `supabase db diff` genereert de migratie.

**Voordelen** — Past goed bij een project waar de eindtoestand al beschreven is: de baseline is bijna een declaratief schema. Op termijn minder handgeschreven DDL en minder kans op een vergeten `IF NOT EXISTS`.
**Risico's** — Een grote wijziging in werkwijze, midden in een project met 172 migraties die de andere aanpak volgen. De gegenereerde diffs moeten toch met de hand worden nagelopen, zeker bij RLS-policies. Het lost het herbouwprobleem niet op zolang de bestaande historie niet is opgeschoond.
**Impact productie** — Geen, zolang je alleen `db diff` draait.
**Impact lokale migraties** — Naast elkaar bestaan kan, maar dat is verwarrend.
**Oordeel** — Interessant voor later, niet nu. Eerst een herbouwbare database, dan pas de werkwijze omgooien.

### Optie 5 — `migration repair` als losse actie

Alleen de ledger rechtzetten, bijvoorbeeld de naamverschillen bij 017 en 018.

**Voordelen** — Maakt `migration list` cosmetisch schoon.
**Risico's** — Een schrijfactie op productie voor een probleem dat aantoonbaar geen gevolgen heeft (§3). De duplicaten bij 025 en 026 zijn idempotent geweest.
**Oordeel** — Niet doen. Documenteren is hier genoeg, en dat is gebeurd.

### Optie 6 — Reproductietest op een lege database

Baseline plus alle migraties op een verse database draaien, en de catalogus daarna objectvoor-object vergelijken met productie.

**Voordelen** — Dit is het enige dat de aanname uit §10 tot bewijs maakt. Levert meteen de testomgeving op die fase 0C nodig heeft. Nul productie-impact.
**Risico's** — Vraagt een lege Postgres of een tweede Supabase-project; Docker ontbreekt op de werkplek. Kost tijd.
**Impact productie** — Geen.
**Rollback** — Wegwerpdatabase.

### Aanbeveling

**Nu:** optie 3 aanhouden — dat is de situatie die dit document vastlegt. Nul risico, en de testomgeving die fase 0C nodig heeft is er daarmee.

**Daarna, als eigen klus:** optie 6, de reproductietest. Die is risicoloos en levert het bewijs dat optie 1 nodig heeft.

**Pas daarna:** optie 1, en dan met een uitgeschreven en goedgekeurd plan voor de ene `migration repair`-aanroep op productie.

**Niet doen:** optie 2 (squash) en optie 5 (repair om cosmetische redenen). Optie 4 is een aparte discussie voor als de database wél herbouwbaar is.
