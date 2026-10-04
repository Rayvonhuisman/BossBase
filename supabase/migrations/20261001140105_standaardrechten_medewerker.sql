-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Het recht 'projecten' hoort standaard aan te staan voor een nieuwe medewerker
-- (DEFAULT_MEDEWERKER_PERMISSIONS in src/config/permissions.js, met de reden
-- erbij). Migratie 20260912160000 gaf het aan iedereen die toen al bestond, maar
-- voor wie daarna binnenkwam deed niemand het: die constante werd nergens
-- gebruikt. Een nieuwe monteur zag de Projecten-pagina dus niet, tot de
-- beheerder het recht met de hand aanzette.
--
-- Nu zet de database het standaardrecht zelf, op het moment dat een medewerker
-- ontstaat, langs welke weg dan ook (uitnodiging accepteren, of een beheerder die
-- de rol terugzet naar medewerker; een admin heeft geen rijen nodig, can() geeft
-- hem alles). Daarna is het een gewoon recht: uitzetten bij Team → Rechten werkt
-- zoals bij elk ander recht en wordt niet teruggedraaid, want de trigger vuurt
-- alleen bij het ontstaan van de medewerker, niet bij het opslaan van rechten.
--
-- Bestaande data, gemeten 2026-10-01: twee medewerkers zijn na 12-09 aangemaakt
-- en hebben géén enkele rij in user_permissions (ook niet uitgezet: opslaan bij
-- Team vervangt de rijen, dus "alles uit" laat ook nul rijen achter). Zij krijgen
-- het standaardrecht alsnog. Medewerkers met minstens één rij zijn bewust
-- ingesteld en blijven ongemoeid.

begin;

create or replace function public.bb_standaardrechten_medewerker()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.company_id is null or new.role = 'admin' then
    return new;
  end if;
  -- Alleen bij het ontstaan van een medewerker: nieuw profiel, eerste koppeling
  -- aan een bedrijf, of een admin die medewerker wordt.
  if tg_op = 'UPDATE'
     and old.company_id is not distinct from new.company_id
     and old.role is distinct from 'admin' then
    return new;
  end if;

  -- Moet gelijk blijven aan DEFAULT_MEDEWERKER_PERMISSIONS.
  insert into public.user_permissions (company_id, user_id, permission, granted)
  values (new.company_id, new.id, 'projecten', true)
  on conflict (user_id, permission) do nothing;

  return new;
end;
$$;

revoke all on function public.bb_standaardrechten_medewerker() from public, anon, authenticated;

drop trigger if exists bb_standaardrechten_medewerker on public.profiles;
create trigger bb_standaardrechten_medewerker
  after insert or update of role, company_id on public.profiles
  for each row execute function public.bb_standaardrechten_medewerker();

-- Inhalen voor wie na 20260912160000 binnenkwam en nog niets heeft.
insert into public.user_permissions (company_id, user_id, permission, granted)
select p.company_id, p.id, 'projecten', true
  from public.profiles p
 where p.role is distinct from 'admin'
   and p.company_id is not null
   and p.created_at > '2026-09-12'
   and not exists (select 1 from public.user_permissions u where u.user_id = p.id)
on conflict (user_id, permission) do nothing;

-- ── De uitkomst ─────────────────────────────────────────────────────────────
select
  (select count(*) from public.profiles p
    where p.role is distinct from 'admin' and p.company_id is not null
      and p.created_at > '2026-09-12'
      and not exists (select 1 from public.user_permissions u
                       where u.user_id = p.id and u.permission = 'projecten')) as nieuw_zonder_projecten,
  (select count(*) from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'bb_standaardrechten_medewerker') as trigger_staat,
  (select string_agg(r.rolname, ',') from pg_roles r
    where r.rolname in ('anon', 'authenticated')
      and has_function_privilege(r.rolname, 'public.bb_standaardrechten_medewerker()', 'EXECUTE')) as uitvoerbaar_voor;

commit;

notify pgrst, 'reload schema';
