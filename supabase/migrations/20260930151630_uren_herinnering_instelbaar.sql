-- Urenherinnering instelbaar per bedrijf
-- ──────────────────────────────────────────────────────────────────────────────
-- De herinnering "Vul je werkdag in" kende één knop: het herhaalinterval
-- (uren_herinnering_interval_min, 0 = uit). Hier komt bij: voor wie, wanneer, op
-- welke dagen, en of hij ook per mail gaat.
--
-- De standaardwaarden zijn precies het gedrag van vóór deze migratie — iedereen,
-- vanaf de dag erna, elke dag, alleen in de app — zodat er voor een bestaand
-- bedrijf niets verandert. Dat geldt ook voor bedrijven zonder rij in
-- bedrijfsinstellingen: de frontend valt op dezelfde waarden terug.
--
-- Rechten: bedrijfsinstellingen is leesbaar voor het hele bedrijf en alleen door
-- de admin te wijzigen (bestaande policies). De medewerker moet de instelling
-- kunnen lezen, want de pop-up beslist in zijn browser.


alter table public.bedrijfsinstellingen
  add column if not exists uren_herinnering_moment text not null default 'volgende_ochtend'
    check (uren_herinnering_moment in ('na_werkdag', 'einde_dag', 'volgende_ochtend')),
  -- ISO-weekdagen waarop herinnerd wordt: 1 = maandag … 7 = zondag.
  add column if not exists uren_herinnering_dagen smallint[] not null default '{1,2,3,4,5,6,7}',
  add column if not exists uren_herinnering_mail boolean not null default false,
  -- Wie GEEN herinnering krijgt. Een uitsluitlijst en geen "wie wel"-lijst, zodat
  -- een nieuwe medewerker vanzelf meedoet.
  add column if not exists uren_herinnering_uitgesloten uuid[] not null default '{}';

-- ── Welke dag is al gemaild ──────────────────────────────────────────────────
-- Eén mail per medewerker per werkdag. De pop-up in de app herhaalt zich op het
-- interval; post doet dat niet.
create table if not exists public.uren_herinnering_mails (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  datum        date not null,
  company_id   uuid not null references public.companies(id) on delete cascade,
  verstuurd_op timestamptz not null default now(),
  primary key (profile_id, datum)
);
create index if not exists uren_herinnering_mails_company_idx
  on public.uren_herinnering_mails (company_id);

-- Alleen de cron (service_role) komt hier. RLS aan zonder policies, en de
-- tabelrechten van anon/authenticated eraf.
alter table public.uren_herinnering_mails enable row level security;
revoke all on table public.uren_herinnering_mails from public, anon, authenticated;
grant select, insert, delete on table public.uren_herinnering_mails to service_role;

-- ── Wie is er aan de beurt ───────────────────────────────────────────────────
-- Zelfde regels als de pop-up (UrenHerinneringModal.jsx): gepland = werkbondagen
-- waarop je in de (dag)ploeg staat + activiteiten die aan je zijn toegewezen;
-- ingevuld = een werkdag in urenregistratie. Niet de admin, en alleen als het
-- bedrijf meer dan één actief lid heeft. Veertien dagen terug, net als de pop-up.
--
-- Mail gaat alleen tussen 07:00 en 21:00 Nederlandse tijd, op een dag die het
-- bedrijf heeft aangevinkt. Valt het moment op een dag die uit staat, dan gaat
-- hij mee op de eerstvolgende dag die aan staat.
create or replace function public.bb_uren_herinnering_kandidaten(p_nu timestamptz default now())
returns table (company_id uuid, profile_id uuid, datum date)
language sql
stable
security definer
set search_path = ''
as $$
  with klok as (
    select (p_nu at time zone 'Europe/Amsterdam') as nu
  ),
  inst as (
    select b.company_id, b.uren_herinnering_moment as moment, b.uren_herinnering_uitgesloten as uit
    from public.bedrijfsinstellingen b, klok k
    where b.uren_herinnering_interval_min > 0
      and b.uren_herinnering_mail
      and extract(isodow from k.nu)::smallint = any (b.uren_herinnering_dagen)
      and k.nu::time >= time '07:00'
      and k.nu::time <  time '21:00'
      and (select count(*) from public.profiles p
            where p.company_id = b.company_id and p.actief
              and coalesce(p.full_name, '') <> '') > 1
  ),
  wie as (
    select p.id as profile_id, p.company_id, i.moment
    from inst i
    join public.profiles p on p.company_id = i.company_id
    where p.actief
      and p.verwijderd_op is null
      and p.role <> 'admin'
      and not (p.id = any (i.uit))
  ),
  gepland as (
    -- Werkbondagen: de dagploeg als die er is, anders de ploeg van de werkbon.
    select w.profile_id, w.company_id, w.moment, d.datum,
           coalesce(
             nullif(d.medewerker_tijden -> w.profile_id::text ->> 'eindtijd', '')::time,
             d.eindtijd, wb.eindtijd) as eind
    from wie w
    join public.werkbonnen wb on wb.company_id = w.company_id
    join public.werkbon_dagen d on d.werkbon_id = wb.id
    where case
            when d.medewerker_ids is not null then w.profile_id = any (d.medewerker_ids)
            when coalesce(cardinality(wb.assigned_to_ids), 0) > 0 then w.profile_id = any (wb.assigned_to_ids)
            else w.profile_id = wb.assigned_to
          end
    union all
    -- Werkbon zonder dagenlijst: terugval op gepland_op.
    select w.profile_id, w.company_id, w.moment, wb.gepland_op, wb.eindtijd
    from wie w
    join public.werkbonnen wb on wb.company_id = w.company_id
    where wb.gepland_op is not null
      and not exists (select 1 from public.werkbon_dagen d where d.werkbon_id = wb.id)
      and case
            when coalesce(cardinality(wb.assigned_to_ids), 0) > 0 then w.profile_id = any (wb.assigned_to_ids)
            else w.profile_id = wb.assigned_to
          end
    union all
    select w.profile_id, w.company_id, w.moment,
           (a.due_at at time zone 'Europe/Amsterdam')::date, a.end_time
    from wie w
    join public.activities a on a.company_id = w.company_id
    where a.due_at is not null
      and case
            when coalesce(cardinality(a.assigned_to_ids), 0) > 0 then w.profile_id = any (a.assigned_to_ids)
            else w.profile_id = a.assigned_to
          end
  ),
  per_dag as (
    select g.profile_id, g.company_id, g.moment, g.datum, max(g.eind) as eind
    from gepland g, klok k
    where g.datum >= k.nu::date - 14
      and g.datum <= k.nu::date
    group by g.profile_id, g.company_id, g.moment, g.datum
  )
  select pd.company_id, pd.profile_id, pd.datum
  from per_dag pd, klok k
  where k.nu >= case pd.moment
                  when 'volgende_ochtend' then (pd.datum + 1) + time '07:00'
                  when 'einde_dag'        then pd.datum + time '17:00'
                  -- na_werkdag: het laatste geplande eind; zonder eindtijd 17:00.
                  else pd.datum + coalesce(pd.eind, time '17:00')
                end
    and not exists (select 1 from public.urenregistratie u
                     where u.profile_id = pd.profile_id and u.datum = pd.datum and u.uren > 0)
    and not exists (select 1 from public.uren_herinnering_mails m
                     where m.profile_id = pd.profile_id and m.datum = pd.datum)
  order by pd.company_id, pd.profile_id, pd.datum;
$$;

-- Default privileges geven EXECUTE aan anon en authenticated; `from public`
-- alleen haalt dat er niet af (zie CLAUDE.md).
revoke all on function public.bb_uren_herinnering_kandidaten(timestamptz) from public, anon, authenticated;
grant execute on function public.bb_uren_herinnering_kandidaten(timestamptz) to service_role;

-- ── Cron ─────────────────────────────────────────────────────────────────────
-- Elk kwartier, zodat "na afloop van de werkdag" ook ongeveer dan aankomt. De
-- edge function wordt alleen aangeroepen als er iemand aan de beurt is: zolang
-- geen bedrijf de mail aanzet, gaat er geen enkel verzoek de deur uit.
select cron.unschedule('uren-herinnering-mail')
 where exists (select 1 from cron.job where jobname = 'uren-herinnering-mail');

select cron.schedule(
  'uren-herinnering-mail',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/uren-herinnering',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_key')
    ),
    body := jsonb_build_object('scheduled', true)
  )
  where exists (select 1 from public.bb_uren_herinnering_kandidaten());
  $cron$
);


notify pgrst, 'reload schema';
