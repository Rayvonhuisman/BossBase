-- De ondertekenpagina kreeg de handtekening niet terug.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- get_werkbon_by_sign_token gaf wél ondertekend_op en de naam terug, maar niet
-- handtekening_url en niet het e-mailadres. Gevolg: opent de klant zijn link
-- later opnieuw en downloadt hij de bon, dan staat er een handtekeningblok met
-- naam en datum maar zonder de handtekening zelf — het enige onderdeel dat het
-- document tot bewijsstuk maakt.
--
-- Beide velden zijn van de ondertekenaar zelf en alleen te bereiken met het
-- sign_token, dus dit verruimt niets wat de klant niet al per mail kreeg. De
-- rest van de afscherming blijft ongemoeid: geen bedragen, geen inkoopprijzen,
-- geen medewerkersnamen, geen interne notities.

-- Eerst weg: CREATE OR REPLACE kan het retourtype van een tabelfunctie niet
-- wijzigen (SQLSTATE 42P13), en er komen twee kolommen bij.
drop function if exists public.get_werkbon_by_sign_token(uuid);

create function public.get_werkbon_by_sign_token(p_token uuid)
returns table(
  id uuid, company_id uuid, customer_id uuid, nummer text, titel text,
  omschrijving text, locatie text, gepland_op date, gestart_op timestamptz,
  afgerond_op timestamptz, status text, ondertekend_op timestamptz,
  ondertekend_door_naam text, ondertekend_door_email text,
  handtekening_url text, verstuurd_naar_email text
)
language sql
security definer
set search_path to 'public'
as $$
  select w.id, w.company_id, w.customer_id, w.nummer, w.titel,
         w.omschrijving, w.locatie, w.gepland_op, w.gestart_op,
         w.afgerond_op, w.status, w.ondertekend_op,
         w.ondertekend_door_naam, w.ondertekend_door_email,
         w.handtekening_url, w.verstuurd_naar_email
  from public.werkbonnen w
  where w.sign_token = p_token;
$$;

-- De returns-lijst is gewijzigd, dus de rechten opnieuw zetten.
revoke all on function public.get_werkbon_by_sign_token(uuid) from public;
grant execute on function public.get_werkbon_by_sign_token(uuid) to anon, authenticated, service_role;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Vaste afsluiting van elke migratie; zie CLAUDE.md, "Database en migraties".
-- Extra van belang hier: deze migratie eindigt op GRANT/REVOKE, en juist die
-- commando's staan niet in de lijst waar pgrst_ddl_watch op luistert.
notify pgrst, 'reload schema';
