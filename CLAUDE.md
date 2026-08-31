# BossBase — werkafspraken

Dit bestand wordt bij elke sessie ingelezen. Alles hierin is in de praktijk
tegengekomen en geverifieerd; het is geen wenslijst.

## Database en migraties

Supabase-project `mawzqpnsluljxpbarhng`. Er is **geen psql en geen Docker**, en
er staat geen databasewachtwoord opgeslagen. SQL tegen productie draait via de
Management API met het CLI-token:

```
supabase db query --linked "select ..."
supabase db query --linked -f pad/naar/script.sql
```

Twee dingen om te weten bij die route: transacties werken écht
(`begin; … rollback;` draait terug, ook DDL — een droogloop tegen productie is
daarmee veilig), en NOTICE-regels komen niet terug, alleen de resultaatrijen van
de láátste statement. Bouw dus een afsluitende `select` met de uitkomst in,
anders is "geen foutmelding" het enige signaal dat je hebt.

### Een migratie schrijven

Kopieer `supabase/migrations/_TEMPLATE.sql`. Dat bestand wordt door
`supabase db push` overgeslagen (de naam matcht het timestamp-patroon niet), dus
het kan veilig in die map blijven staan.

**Altijd eerst `supabase db push --dry-run`** en controleren dat er precies
staat wat je verwacht. Er zijn eerder migraties meegelift die nog niet klaar
waren. Wil je er één bewust buiten houden, hernoem hem dan naar `.sql.pending` —
`db push` slaat hem dan over en meldt dat ook.

### Sluit elke migratie af met een schema-reload

```sql
notify pgrst, 'reload schema';
```

PostgREST houdt een schema-cache. Staat een nieuwe tabel of kolom daar nog niet
in, dan geeft de REST-API een **404 op iets dat wél bestaat**. Dat leest als een
bug in de frontend terwijl er niets mis is, en het is in één week drie keer
gebeurd (`accounting_sync_runs`, `uursoorten`, `werkbon_uren`).

Supabase heeft hiervoor de event trigger `pgrst_ddl_watch` en die stáát aan.
Toch die regel erbij, om twee redenen:

1. Die trigger luistert op een vaste lijst commando's waar **`CREATE POLICY`,
   `GRANT` en `REVOKE` niet in staan**. PostgREST leest rechten wél mee in zijn
   cache, dus een migratie die alleen rechten wijzigt kan een verouderde cache
   achterlaten zonder dat er iets terugmeldt.
2. Een NOTIFY kost niets. Twee keer sturen is niet erger dan één keer.

**Maar het is geen garantie, en dat is de kern.** Beide notifies vertrekken bij
dezelfde commit. Hoort PostgREST ze op dat moment niet — verbroken listener,
herstartende instantie — dan blijft de cache oud. Wat de drie keren wél hielp
was een notify een minuut later. Draai daarom na het pushen:

```
npm run migratie:check -- <tabelnaam>
```

Dat probeert de tabel via de REST-API, stuurt zo nodig opnieuw een notify, en
eindigt met een exitcode die je kunt vertrouwen. Voeg dit toe aan je
uitrolvolgorde, niet aan je geheugen.

### Uitrolvolgorde

1. Edge functions deployen (als ze meeveranderen) — vóór de crons die ze
   aanroepen.
2. `supabase db push --dry-run`, dan `supabase db push`.
3. `npm run migratie:check -- <tabellen>`.
4. Frontend pushen naar `main`; Vercel bouwt automatisch.

Draai de migratie vóór de frontend als de frontend nieuwe kolommen schrijft.
Leest hij ze alleen, bouw dan een terugval in (zie `selectWithDealsFallback` in
`jobCostService.js` als patroon) zodat de volgorde niet uitmaakt.

## Uren

Twee soorten, twee tabellen, bewust gescheiden:

- **`urenregistratie`** — de werkdag van een medewerker: loon en verlof. Geen
  werkbon, project of klant. Bewerkbaar op de urenpagina.
- **`werkbon_uren`** — uren op een klus: nacalculatie, facturatie en de
  werkbon-PDF. Hangt aan de werkbon en heeft daarom géén eigen project- of
  klantkolom; die volgen uit de werkbon. Wie mag boeken bepaalt de werkbon
  (uitvoerder of verantwoordelijke, admin en planner als vangnet) via
  `bb_mag_werkbon_uren_beheren`.

Het totaal is altijd `eind − begin − pauze`, berekend in `berekenUren()`. De
nacalculatie draait uitsluitend op werkbonuren.

## Losse dingen die tijd kosten als je ze niet weet

- `supabase functions deploy <naam>` kent **geen** `--linked`-vlag; zonder vlag
  deployt hij naar het gekoppelde project.
- De waarde van een secret is niet uitleesbaar, maar `supabase secrets list`
  toont een sha256-digest. Wil je weten óf een secret een bepaalde waarde heeft,
  hash de kandidaat en vergelijk.
- De Supabase Auth **Site URL staat op `http://localhost:5173`** en productie
  staat niet in de redirect-allowlist. Geen enkele flow in de app gebruikt een
  Supabase-redirect (registratie loopt op een eigen 6-cijferige code,
  wachtwoordreset en uitnodigingen op eigen mails met een bossbase.nl-URL), dus
  het doet nu geen kwaad. Zet je ooit "Confirm email" aan, verhelp dit dan
  eerst.
