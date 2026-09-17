-- Nelsi schilder en QA Demo Schilderwerken ook als testbedrijf markeren.

-- ── Waarom apart van 20260918120000 ─────────────────────────────────────────
-- Die migratie markeerde bedrijven waar een BossBase-test- of beheeradres lid
-- is. Deze twee matchen op GEEN ENKEL adres (gemeten: nul treffers) en vielen
-- dus buiten die regel, maar zijn volgens de eigenaar wel degelijk test- en
-- demo-omgevingen. Dat is een beslissing, geen patroon — vandaar hardcoded op
-- id, met de naam als tweede slot zodat een hernoeming niets stilletjes wijzigt.
--
-- Gevolg: de afspraakherinnering slaat deze bedrijven voortaan over. De cron
-- filtert generiek op is_testbedrijf, dus daar hoeft niets voor te veranderen.
--
-- Glasmeesters blijft nadrukkelijk BUITEN deze lijst: dat is een echte klant,
-- die moet zijn klantmail gewoon blijven versturen.

update public.companies
set is_testbedrijf = true
where (id = '2e5c3d90-f9d6-4421-bee7-4bc522caea38'::uuid and name = 'Nelsi schilder')
   or (id = '8de3a45f-78e6-44d3-a735-9ce854ae8d5e'::uuid and name = 'QA Demo Schilderwerken');

-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- companies
notify pgrst, 'reload schema';
