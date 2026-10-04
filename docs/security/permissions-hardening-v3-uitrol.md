# Permissions hardening v3: model en uitrolplan

Stand 4 oktober 2026. Branch `security/permissions-hardening-v3`, opnieuw opgebouwd vanaf `origin/main` `3cee394`. De oude branch `security/permissions-hardening-v2` blijft ongewijzigd staan als referentie; daarvan is niets gemerged. **Niets hiervan is uitgerold.**

## Het model (productbesluit 4 oktober 2026)

| Wie | Wat |
|---|---|
| Admin | Alles binnen het eigen bedrijf, en het rechtenbeheer. |
| Medewerker | Toegewezen werk, eigen uren, het standaardrecht `projecten`. Financieel alleen met een expliciet recht. |
| Recht `planning` | Teamuren bekijken en beheren, agenda en planning. De rol planner bestaat niet meer (`20261002135952`). |
| Groei, tweede persoon | Als medewerker, plus de gedeelde werkruimte: agenda, projecten, werkbonnen, taken, materialen, dagen, foto's. Geen pipeline, offertes, facturen, kosten, omzet of andermans uren zonder recht. De beheerder kent rechten toe onder Team → Rechten. |
| Ander bedrijf | Nooit. Een recht telt alleen binnen het eigen bedrijf; een beheerder kan alleen rechten zetten voor zijn eigen mensen. |

## Wat `main` al had, en wat v3 toevoegt

Op 2 en 3 oktober is op `main` en productie al uitgerold: geen rol planner meer (bypass, 21 rolpolicies en `bb_mag_werkbon_uren_beheren`), actiefcontrole in de rechtenfuncties, `mark_factuur_betaald()` op recht, `factuur_regels` op recht, schrijven op `werkbon_uren` aan zeggenschap gebonden (`bb_mag_uren_voor_ander`), `user_permissions` alleen eigen rijen of admin. Dat is overgenomen zoals het is.

v3 voegt toe, in deze volgorde:

1. `20261004190000_groei_rollen_rechten.sql` — Groei krijgt `rollen_rechten`; de insert- en update-policy op `user_permissions` eisen dat de ontvanger bij het eigen bedrijf hoort.
2. `20261004200000_rechten_binnen_eigen_bedrijf.sql` — `bb_has_permission()`, `bb_is_admin_or_permission()` en `bb_mag_inkoopprijs_zien()` tellen een recht alleen binnen het eigen bedrijf (met behoud van de actiefcontrole); de gedeelde werkruimte gaat uit veertien financiële policies (deals, dealnotities, offertes en regels, facturen en regels, vier op `job_costs`, klanttijdlijn, mailarchief, en in de opslag factuur-PDF's en kostenbijlagen).
3. `20261004201000_werkbon_uren_eigen_of_planning.sql` — lezen en verwijderen van werkbonuren: eigen regels, of zeggenschap (`bb_mag_uren_voor_ander`: admin, recht `planning`, verantwoordelijke van die bon).

Frontend: `INZAGE_RECHTEN` zonder de zes financiële rechten (menu, routebewaking en dashboardtegels volgen die ene lijst), `rollen_rechten` in de Groei-matrix, het laatste `['admin','planner']`-restant weg, en `public-website-inquiry` stuurt geen melding meer naar een planner op rolnaam.

**Eén bewuste afwijking van regel 7:** de verantwoordelijke van een bon ziet op díe bon de uren van zijn ploeg. Zonder die tak kan hij ze wel boeken (schrijfpolicy van 2 oktober) maar niet terugzien. Strenger kan door `bb_mag_uren_voor_ander()` aan te passen; dat raakt dan ook het boeken.

## Impact op productie, gemeten 4 oktober (alleen aantallen)

7 Groei-bedrijven (4 test), 2 met meer dan één actieve gebruiker, 9 niet-admins (allen medewerker), 8 met rijen in `user_permissions`, 0 planners, 0 rechten over de bedrijfsgrens. Medewerkers in Groei zonder financieel recht als rij verliezen pipeline, offertes, facturen en kosten tot de beheerder het toekent; elke medewerker zonder `planning` of zeggenschap ziet alleen eigen werkbonuren.

## Uitrol

Geen onderhoudsmodus: alles is `ALTER POLICY` en `CREATE OR REPLACE` in transacties. Volgorde: catalogusbackup (read-only) → `supabase functions deploy public-website-inquiry` → `supabase db push --dry-run` (precies drie) → `supabase db push` → `npm run migratie:check -- user_permissions werkbon_uren facturen` → live verificatie → frontend naar `main`. Rollbacks in omgekeerde volgorde in `supabase/rollback/`; alle drie lokaal getest tegen een database die hash-gelijk is aan productie.

## Wat dit niet dekt

- Bedragkolommen volgen de rij: `20261003093845` heeft de projectbedragen al op kolomniveau afgeschermd, materiaalprijzen op `werkbon_materialen` niet.
- Rechten in het menu verversen pas bij herladen; de database weigert direct.
- `setUserPermissions()` verwijdert en herschrijft in twee aanroepen (bestond al).
- Kolomrechten op `accounting_connections` wijken lokaal af van productie (18 regels, buiten dit werk); de baseline van 9 september kent ze niet.
