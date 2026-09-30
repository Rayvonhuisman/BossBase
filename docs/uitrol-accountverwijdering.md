# Uitrol: opzeggen, deactiveren, resettokens en logs

Branch `fix/accountverwijdering-bv`. Niets hiervan staat op productie. De
opschooncron (`20260930083835_opschonen_cron.sql.pending`) hoort hier **niet**
bij.

## Onderdelen

| Code | Wat | Afhankelijk van |
| --- | --- | --- |
| F1 | Edge Functions `billing-cancel`, `billing-portal`, `billing-checkout`, `billing-wijzig` (via `_shared/billing.ts`): alleen de eigenaar, gecontroleerd vóór elke Stripe-aanroep | niets (werkt op de huidige database, getest) |
| M1 | `20260930120000_resettoken_afronding.sql`: `email` optioneel, tabelrechten van anon/authenticated weg. Alleen uitbreidend | niets |
| F2 | `request-password-reset`, `apply-password-reset`: eenmalige claim, geen e-mailadres meer in de tabel | M1 (schrijft geen `email` meer) |
| F3 | `afas-sync-contacten`, `afas-test`, `afas-import-kosten`: geen relatiegegevens of tokens in logs | niets |
| M2 | `20260930160000_accountverwijdering_correcties.sql`: blokkeren + sessies intrekken bij deactiveren, alleen de eigenaar zegt op, bewaking van eigenaar/opzegstatus, correcties opschoonjob | F1 (zie gemengde versies) |
| M3 | `20260930170000_toegang_na_deactivatie.sql`: restrictive policies op alle tabellen en `storage.objects`, pre-request voor PostgREST, eigenaarregel in `bb_mag_abonnement_beheren` | niets |
| FE | Frontend (Vercel): knoppen per rol, teksten, demo-correctie | niets |
| M1b | `20260930120500_resettoken_opruimen.sql.pending`: kolom `token` weg, `email` leeg | F2 draait minstens een uur zonder fouten |

## Volgorde

1. **F1** deployen. Dit dicht nu al een bestaand lek: met de functies van main
   kan een beheerder die geen eigenaar is het Stripe-abonnement opzeggen en het
   Stripe-portal openen (lokaal aangetoond, `gemengd.sh` scenario 2).
2. `supabase db push --dry-run` → alleen **M1** → `supabase db push`, daarna
   `npm run migratie:check -- password_reset_tokens`.
3. **F2** en **F3** deployen.
4. `supabase db push --dry-run` → **M2** en **M3** → `supabase db push`, daarna
   `npm run migratie:check -- companies profiles customers`. Controleer ook dat
   een gewone ingelogde gebruiker nog gegevens ziet (PostgREST met pre-request).
5. **FE**: merge naar `main`; Vercel bouwt.
6. Na minstens een uur zonder resetfouten: **M1b** hernoemen naar `.sql` en
   pushen.

## Gemengde versies

Rijen 1 en 2 zijn getest (`supabase/tests/lokaal/gemengd.sh`); rij 3 volgt uit
twee geteste weigeringen (`test.mjs`); rijen 4 en 5 zijn afgeleid, niet getest.

| Situatie | Uitkomst |
| --- | --- |
| Nieuwe F1 op de huidige database | Veilig: medewerker en niet-eigenaar-beheerder geweigerd, eigenaar mag, geen Stripe-aanroep bij weigering |
| Huidige functies op de nieuwe database | **Onveilig**: niet-eigenaar-beheerder zegt Stripe op en opent het portal. Daarom F1 vóór M2 |
| Oude frontend (open tabblad) na F1 en M2 | Eigenaar: werkt. Niet-eigenaar-beheerder: `billing-cancel` weigert vóór Stripe, dus het account wordt niet gedeactiveerd. Medewerker: eigen account, zoals bedoeld |
| Nieuwe frontend op de huidige backend | Werkt; niet-eigenaar-beheerder krijgt "Account deactiveren" (alleen zichzelf) |
| M3 zonder M2 | Veilig; een gedeactiveerde gebruiker wordt door de database geweigerd, maar kan zonder M2 nog inloggen (de app logt hem direct uit) |

## Herstel bij een gedeeltelijk mislukte uitrol

- **Een migratie faalt halverwege:** elke migratie draait in één transactie;
  er is dan niets veranderd. Oorzaak oplossen en opnieuw.
- **F1, F2 of F3 terugzetten:** de vorige versie uit `main` opnieuw deployen.
  Alleen code, geen gegevens. F2 terug kan zolang M1b niet is gedraaid.
- **M1 terugzetten:** rechten terug met `grant`. `email` weer verplicht maken
  kan alleen als er geen rijen zonder e-mailadres zijn; in die tabel staan alleen
  resettokens van maximaal 24 uur, dus eventueel die rijen eerst laten verlopen.
- **M2 terugzetten:** `supabase/rollback/20260930160000_…rollback.sql`
  (lokaal getest: functies daarna identiek aan productie). **Niet terug:**
  accounts die in de tussentijd zijn gedeactiveerd blijven geblokkeerd en hun
  sessies zijn weg; per account heractiveren (zie het rollbackbestand).
- **M3 terugzetten:** `supabase/rollback/20260930170000_…rollback.sql`. Eerst de
  rolinstelling weg, dan de functie. Weigert PostgREST na een fout ineens álle
  verzoeken, dan is dat de oorzaak:
  `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`
- **FE terugzetten:** in Vercel de vorige productie-deployment terugzetten.
- **M1b:** niet terug te draaien (kolom en adressen weg). Daarom pas na stap 6.
- **Opschoonjob:** verwijderde rijen, bestanden en inlogaccounts komen alleen
  terug uit een back-up. Controleer vóór het aanzetten van de cron welke
  back-ups er zijn (plan en bewaartermijn); dat is niet vastgesteld.

## Wat na de uitrol op productie te controleren is (met testaccounts)

1. Een testbedrijf met eigenaar, tweede beheerder en medewerker.
2. Tweede beheerder: Instellingen → Abonnement toont geen knoppen;
   Gevarenzone toont "Account deactiveren".
3. Medewerker: "Account deactiveren" → uitgelogd; opnieuw inloggen meldt
   "gedeactiveerd".
4. Eigenaar van het testbedrijf (zonder echt Stripe-abonnement, of in
   Stripe-testmodus): "Bedrijf opzeggen".
