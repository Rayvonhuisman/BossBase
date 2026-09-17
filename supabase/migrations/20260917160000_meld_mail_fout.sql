-- Een mislukte collega-melding vanuit de browser kunnen vastleggen.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Meldingen aan collega's lopen via de edge function create-notification. Faalt
-- die, dan zag niemand dat: de client ving de fout op in een lege catch, en
-- `supabase.functions.invoke` GOOIT niet eens bij een 4xx/5xx — die fout komt
-- terug in `error`, en dat veld werd niet gelezen. Post die blijft liggen dus,
-- zonder spoor.
--
-- Schrijven in mail_fouten kan de browser niet zelf: 20260916170000 heeft
-- INSERT daar expliciet weggehaald bij `authenticated`, en dat blijft zo. In
-- plaats daarvan deze security definer-functie, met twee eigenschappen die er
-- toe doen:
--
-- 1. Het bedrijf wordt HIER afgeleid uit het profiel van de aanroeper, niet
--    meegegeven door de client. Niemand kan dus een fout op naam van een ander
--    bedrijf zetten.
-- 2. Hij loopt over PostgREST, een andere weg dan de edge functions. Juist als
--    create-notification plat ligt, is dat de route die het nog doet.
--
-- Raakt geen bestaande data; de tabel blijft leeg zolang alles goed gaat.

create or replace function public.meld_mail_fout(
  p_soort           text,
  p_fout            text,
  p_bron            text,
  p_ontvanger       text default null,
  p_gerelateerd_type text default null,
  p_gerelateerd_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_naam    text;
begin
  select company_id into v_company from public.profiles where id = auth.uid();
  if v_company is not null then
    select name into v_naam from public.companies where id = v_company;
  end if;

  insert into public.mail_fouten
    (soort, ontvanger, company_id, bedrijf_naam, fout, bron, gerelateerd_type, gerelateerd_id)
  values
    (coalesce(nullif(p_soort, ''), 'onbekend'),
     p_ontvanger,
     v_company,
     v_naam,
     -- Afkappen: een stacktrace hoort hier niet integraal in.
     left(coalesce(nullif(p_fout, ''), 'onbekende fout'), 2000),
     coalesce(nullif(p_bron, ''), 'onbekend'),
     p_gerelateerd_type,
     p_gerelateerd_id);
end;
$$;

-- `anon, authenticated` staan hier bewust letterlijk: Supabase geeft EXECUTE op
-- een nieuwe functie automatisch aan die twee rollen, en `revoke ... from public`
-- haalt dat er niet af (zie CLAUDE.md). Daarna alleen authenticated terug.
revoke all on function public.meld_mail_fout(text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.meld_mail_fout(text, text, text, text, text, uuid) to authenticated;

-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- LAAT DIT STAAN. Zie _TEMPLATE.sql en CLAUDE.md. Na het pushen:
--     npm run migratie:check -- mail_fouten
notify pgrst, 'reload schema';
