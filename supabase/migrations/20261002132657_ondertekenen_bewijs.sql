-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, H4 en D3/P5.
--
-- 1. Bewijs van ondertekening. Het "ondertekende exemplaar" kwam uit de browser
--    van de ondertekenaar en werd ongezien bewaard. Voortaan maakt de server het
--    (supabase/functions/_shared/ondertekendExemplaar.ts) en legt hij hier vast
--    wat er is ondertekend: SHA-256 van de inhoud en van het PDF-bestand, naam,
--    e-mail, tijdstip, IP-adres en browser, plus de bedragen. Zo is achteraf te
--    controleren of een PDF die iemand laat zien het getekende stuk is.
--
-- 2. De publieke offertelink gaf meer terug dan de klant hoort te zien: de
--    interne marge (marge_pct), company_id, customer_id en sent_to_email. Die
--    kolommen gaan eruit. Het retourtype wijzigt, dus drop-and-create (42P13) —
--    en dan zijn de grants weg. Ze worden hieronder expliciet teruggezet:
--    anon en authenticated mogen ze uitvoeren (de pagina heeft geen login),
--    zoals vóór deze migratie.
--
-- 3. get_offerte_items_by_token krijgt btw_pct, btw_regime en type erbij: de
--    voorbeeld-PDF op de ondertekenpagina las die velden al, maar kreeg ze niet.

begin;

alter table public.offertes   add column if not exists ondertekening_bewijs jsonb;
alter table public.werkbonnen add column if not exists ondertekening_bewijs jsonb;

comment on column public.offertes.ondertekening_bewijs is
  'Vastgelegd door sign-offerte: sha256 van inhoud en PDF, naam, e-mail, tijdstip, IP, user-agent, bedragen.';
comment on column public.werkbonnen.ondertekening_bewijs is
  'Vastgelegd door sign-werkbon: sha256 van inhoud en PDF, naam, e-mail, tijdstip, IP, user-agent.';

drop function if exists public.get_offerte_by_sign_token(uuid);
create function public.get_offerte_by_sign_token(p_token uuid)
returns table(id uuid, nummer text, omschrijving text, status text, totaal_excl numeric, totaal_incl numeric,
              geldig_tot date, signed_at timestamptz, sign_token uuid, btw_pct numeric, created_at timestamptz,
              vervangen_op timestamptz, vervangen_door_nummer text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return query
    select o.id, o.nummer, o.omschrijving, o.status,
           o.totaal_excl, o.totaal_incl, o.geldig_tot,
           o.signed_at, o.sign_token, o.btw_pct, o.created_at,
           o.vervangen_op, o.vervangen_door_nummer
      from offertes o
     where o.sign_token = p_token;
end;
$function$;

drop function if exists public.get_offerte_items_by_token(uuid);
create function public.get_offerte_items_by_token(p_token uuid)
returns table(id uuid, omschrijving text, eenheid text, aantal numeric, prijs_per numeric, subtotaal numeric,
              volgorde integer, btw_pct numeric, btw_regime text, type text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return query
    select oi.id, oi.omschrijving, oi.eenheid, oi.aantal,
           oi.prijs_per, oi.subtotaal, oi.volgorde, oi.btw_pct, oi.btw_regime, oi.type
      from offerte_items oi
      join offertes o on o.id = oi.offerte_id
     where o.sign_token = p_token
     order by oi.volgorde;
end;
$function$;

revoke all on function public.get_offerte_by_sign_token(uuid) from public, anon, authenticated;
revoke all on function public.get_offerte_items_by_token(uuid) from public, anon, authenticated;
grant execute on function public.get_offerte_by_sign_token(uuid) to anon, authenticated, service_role;
grant execute on function public.get_offerte_items_by_token(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select p.proname, string_agg(r.rolname, ',' order by r.rolname) as mag_uitvoeren
  from pg_proc p, pg_roles r
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('get_offerte_by_sign_token', 'get_offerte_items_by_token')
   and r.rolname in ('anon', 'authenticated', 'service_role')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
 group by p.proname;

commit;
