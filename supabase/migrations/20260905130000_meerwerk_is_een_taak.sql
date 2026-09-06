-- Meerwerk wordt een taak met een vlaggetje.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- werkbon_meerwerk was een tweede tabel met hetzelfde doel als werkbon_taken:
-- een omschrijving van werk. Maar hij miste alles wat werkbon_taken wél heeft.
-- Het scherpst: er was géén UPDATE-policy, dus meerwerk kon niet eens worden
-- afgevinkt. Wilden we dat toevoegen, dan moesten er een afgerond-kolom, een
-- volgorde, een UPDATE-policy, een slottrigger, een sign-token-functie en een
-- toggle bij — stuk voor stuk een kopie van iets dat al bestaat en werkt.
--
-- Twee implementaties van hetzelfde lopen uit elkaar. Dus: één tabel, één
-- vlaggetje. Meerwerk gedraagt zich vanaf nu exact als een taak — afvinken, op
-- slot na ondertekenen, alleen afgevinkte regels op de PDF — en staat alleen in
-- een eigen blok, zodat de klant ziet dat het niet in de opdracht zat.
--
-- Wat er daarmee vervalt: prijs, akkoordstatus, afwijzen. De handtekening ís het
-- akkoord; wat het kost is een zaak tussen bedrijf en klant, buiten BossBase om.

-- ── 1. Het vlaggetje ────────────────────────────────────────────────────────

alter table public.werkbon_taken
  add column if not exists is_meerwerk boolean not null default false;

comment on column public.werkbon_taken.is_meerwerk is
  'true = tijdens de klus erbij gevraagd, zat niet in de oorspronkelijke opdracht. Staat in een eigen blok op de werkbon en telt NIET mee in de taakvoortgang.';

-- De tellers vragen om "hoeveel taken, hoeveel af" per werkbon; meerwerk hoort
-- daar niet in. Deze index bedient precies die vraag.
create index if not exists idx_werkbon_taken_soort
  on public.werkbon_taken (werkbon_id, is_meerwerk);


-- ── 2. De bestaande meerwerkregel verhuizen ─────────────────────────────────
-- Gemeten vóór het draaien: 1 rij. "kozijn verven" op WB-006 bij Dakdekker
-- Niels, aangemaakt 05-09-2026 18:26. Nog niet afgevinkt, dus die gaat over als
-- afgerond = false — dat is de werkelijke stand.
--
-- Achteraan in de volgorde van die werkbon, zodat hij niet tussen de
-- oorspronkelijke taken belandt.

insert into public.werkbon_taken (werkbon_id, company_id, omschrijving, afgerond, volgorde, is_meerwerk, created_at)
select m.werkbon_id,
       m.company_id,
       m.omschrijving,
       false,
       coalesce((select max(t.volgorde) from public.werkbon_taken t where t.werkbon_id = m.werkbon_id), -1)
         + row_number() over (partition by m.werkbon_id order by m.created_at),
       true,
       m.created_at
from public.werkbon_meerwerk m;


-- ── 3. Wat de klant ziet ────────────────────────────────────────────────────
-- Het vlaggetje moet mee, zodat de ondertekenpagina en de PDF twee blokken
-- kunnen tekenen uit één lijst. Nog steeds alleen de afgevinkte regels: de klant
-- tekent voor uitgevoerd werk, niet voor een lijst met wat er nog open staat.
--
-- Retourtype wijzigt, dus drop-and-create. Let op de grants hieronder: een
-- nieuwe functie krijgt via de default privileges automatisch EXECUTE voor anon
-- en authenticated, en hier is dat precies de bedoeling — maar zet het expliciet,
-- zodat het een keuze is en geen toeval. Zie CLAUDE.md.

drop function if exists public.get_werkbon_taken_by_sign_token(uuid);

create function public.get_werkbon_taken_by_sign_token(p_token uuid)
returns table(omschrijving text, afgerond boolean, volgorde integer, is_meerwerk boolean)
language sql
security definer
set search_path to 'public'
as $$
  select t.omschrijving, t.afgerond, t.volgorde, t.is_meerwerk
  from public.werkbon_taken t
  join public.werkbonnen w on w.id = t.werkbon_id
  where w.sign_token = p_token
    and t.afgerond = true
  order by t.is_meerwerk, t.volgorde, t.created_at;
$$;

revoke all on function public.get_werkbon_taken_by_sign_token(uuid) from public, anon, authenticated;
grant execute on function public.get_werkbon_taken_by_sign_token(uuid) to anon, authenticated, service_role;


-- ── 4. De oude tabel weg ────────────────────────────────────────────────────
-- Pas ná de verhuizing hierboven. Er hangen geen foreign keys aan, en de app
-- leest hem na deze release niet meer.

drop table if exists public.werkbon_meerwerk;


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Onmisbaar: er verdwijnt een tabel, er komt een kolom bij, en de migratie
-- eindigt op GRANT — precies waar pgrst_ddl_watch niet op luistert.
notify pgrst, 'reload schema';
