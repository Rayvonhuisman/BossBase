-- Uren per project optellen in de database.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De projectlijst haalde álle werkbonuren en álle werkbonnen op en telde ze in
-- de browser bij elkaar. PostgREST geeft per verzoek hooguit 1000 rijen, en
-- meldt niet dat er meer waren. Een bedrijf met meer dan 1000 urenregels (of
-- meer dan 1000 werkbonnen) kreeg dus te weinig uren in de nacalculatie, zonder
-- dat er iets opviel — pas bij een groot project, en dan klopt juist díe
-- nacalculatie niet.
--
-- Deze functie telt op in de database en geeft één waarde terug: een object
-- { project_id: uren }. Eén rij, dus geen grens die kan knippen.
--
-- ── Rechten ─────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: de RLS van werkbon_uren en werkbonnen blijft gelden, net als
-- toen de browser het optelde. Wie een werkbon niet mag zien, telt zijn uren
-- ook nu niet mee — dat gedrag verandert hier bewust niet.
--
-- ── Bestaande data ──────────────────────────────────────────────────────────
-- Raakt geen data. Gemeten vóór deze migratie: 403 urenregels over alle
-- bedrijven, het meest bij het testaccount "TEST Stamvol Bouw BV" (397 regels,
-- 220 werkbonnen, 69 projecten). Niemand zat dus al boven de grens: de getallen
-- tot nu toe klopten. De droogloop gaf per project hetzelfde als een handmatige
-- som, een ander bedrijf kreeg {} en anon werd geweigerd.

create or replace function public.bb_uren_per_project()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(t.project_id, t.uren), '{}'::jsonb)
  from (
    select w.project_id, sum(u.uren) as uren
      from werkbon_uren u
      join werkbonnen w on w.id = u.werkbon_id
     where w.project_id is not null
     group by w.project_id
  ) t
$function$;

-- Ingelogde gebruikers wel, anon niet. anon en authenticated met naam: de
-- default privileges geven een nieuwe functie aan allebei (zie CLAUDE.md).
revoke all on function public.bb_uren_per_project() from public, anon, authenticated;
grant execute on function public.bb_uren_per_project() to authenticated;

notify pgrst, 'reload schema';

-- Uitkomst, omdat NOTICE-regels via de Management API niet terugkomen.
select
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
      and has_function_privilege(r.rolname, 'public.bb_uren_per_project()', 'EXECUTE')) as uitvoerbaar_door,
  (select count(*) from public.werkbon_uren) as urenregels_totaal;
