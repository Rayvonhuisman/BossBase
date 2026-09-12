-- Waarschuwingsplicht (Wkb) op de werkbon.
--
-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Sinds de Wet kwaliteitsborging moet een aannemer de opdrachtgever SCHRIFTELIJK
-- en ONDUBBELZINNIG waarschuwen als hij iets constateert dat gevolgen heeft:
-- houtrot, een ondeugdelijke ondergrond, een gebrek dat niet in de opdracht zat.
-- Gaat het later mis en is er niet gewaarschuwd, dan draait de aannemer ervoor op.
--
-- Twee dingen maken zo'n waarschuwing pas geldig:
--   1. WAT er is geconstateerd, en
--   2. WAT daarvan het gevolg kan zijn.
-- Alleen "houtrot gezien" is geen waarschuwing. Vandaar een apart veld `gevolg`
-- naast de notitietekst, en niet één vrij tekstvak met een hint eronder: op een
-- dak typt niemand uit zichzelf een tweede zin over gevolgen.
--
-- ── Waarom geen nieuwe tabel ────────────────────────────────────────────────
-- Een waarschuwing ís een notitie voor de klant, alleen dan verstuurd en
-- vastgelegd. Er staan al vier notitie-implementaties naast elkaar in deze app;
-- een vijfde tabel zou die rij verlengen zonder iets op te lossen. Een
-- klantnotitie mét `waarschuwing_verzonden_op` is de waarschuwing.

alter table public.werkbon_notities
  add column if not exists gevolg                       text,
  add column if not exists waarschuwing_verzonden_op    timestamptz,
  add column if not exists waarschuwing_verzonden_naar  text;

comment on column public.werkbon_notities.gevolg is
  'Wkb: wat het geconstateerde gebrek tot gevolg kan hebben. Zonder dit veld is een waarschuwing juridisch onvolledig.';
comment on column public.werkbon_notities.waarschuwing_verzonden_op is
  'Wkb: moment waarop de waarschuwing naar de klant is gemaild. Gevuld = verstuurd; dit is het bewijs.';
comment on column public.werkbon_notities.waarschuwing_verzonden_naar is
  'Wkb: e-mailadres waarnaar is verstuurd. Hoort bij waarschuwing_verzonden_op.';

-- Opzoeken "welke waarschuwingen zijn verstuurd" gaat per werkbon.
create index if not exists werkbon_notities_waarschuwing
  on public.werkbon_notities (werkbon_id, waarschuwing_verzonden_op)
  where waarschuwing_verzonden_op is not null;


-- ── Ondertekenpagina: de nieuwe velden meegeven ─────────────────────────────
-- De returns-lijst van deze functie IS het gegevensschild: wat er niet in staat,
-- bereikt de publieke pagina niet. Het retourtype verandert, dus dit moet een
-- drop-and-create zijn (anders SQLSTATE 42P13).
--
-- LET OP — en dit is precies de valkuil uit CLAUDE.md: na een drop-and-create
-- zijn de oude grants weg, en Supabase geeft EXECUTE op een NIEUWE functie
-- automatisch aan anon en authenticated. Hier is dat toevallig gewenst (de
-- ondertekenpagina draait zonder sessie), maar we zetten het expliciet, zodat
-- het een keuze is en geen bijwerking.
drop function if exists public.get_werkbon_notities_by_sign_token(uuid);

create function public.get_werkbon_notities_by_sign_token(p_token uuid)
returns table(
  note                        text,
  created_at                  timestamptz,
  gevolg                      text,
  waarschuwing_verzonden_op   timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select n.note, n.created_at, n.gevolg, n.waarschuwing_verzonden_op
  from public.werkbon_notities n
  join public.werkbonnen w on w.id = n.werkbon_id
  where w.sign_token = p_token
    and n.voor_klant = true
  order by n.created_at;
$$;

-- Bewust NIET het e-mailadres: de klant hoeft op zijn eigen ondertekenpagina
-- niet te lezen naar welk adres er is gemaild. Dat is bewijs voor het bedrijf.
revoke all on function public.get_werkbon_notities_by_sign_token(uuid) from public, anon, authenticated;
grant execute on function public.get_werkbon_notities_by_sign_token(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
