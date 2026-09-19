-- Een aanvraag kan aan meerdere mensen gekoppeld worden.

-- ── Waarom ──────────────────────────────────────────────────────────────────
-- deals.assigned_to is één uuid. Werkbonnen en activiteiten kennen al langer
-- assigned_to_ids (uuid[]), omdat werk zelden van precies één persoon is. Voor
-- aanvragen gold dat niet, terwijl een aanvraag wél door meerdere mensen
-- behandeld kan worden — en in de pipeline moet je kunnen filteren op wie dat
-- zijn.
--
-- Er speelt nog iets: assigned_to heeft géén default en er is geen trigger die
-- hem vult, en createDeal() in de frontend schreef het veld niet. Elke aanvraag
-- die iemand in de app aanmaakte kreeg dus stil geen eigenaar. De gevulde
-- eigenaren in het testbedrijf komen allemaal uit de seed. Deze migratie legt
-- de kolom aan; het schrijfpad in de app gaat in dezelfde ronde mee.
--
-- Gemeten vóór het draaien, testbedrijf 7e57c0de-0000-4000-b000-000000000000:
--   110 deals, alle 110 met assigned_to gevuld
--   Lisa Bakker 72, Rayvon Test 23, Niels Grevink 15
-- De controle-selects in de droogloop tellen dit voor álle bedrijven na.
--
-- assigned_to blijft staan en blijft gevuld. Dat is bewust: er wordt nog op
-- gelezen (o.a. toDeal), en een kolom weggooien terwijl daar nog iets op leunt
-- is de riskante volgorde. assigned_to_ids is vanaf nu de bron voor "wie
-- behandelt dit"; assigned_to houdt de eerste daarvan vast.


-- ── De wijziging ────────────────────────────────────────────────────────────

alter table public.deals
  add column if not exists assigned_to_ids uuid[] not null default '{}';

-- Bestaande eigenaren overnemen, zodat niets leeg begint. Alleen rijen die nog
-- geen lijst hebben, zodat herhaald draaien niets overschrijft.
update public.deals
   set assigned_to_ids = array[assigned_to]
 where assigned_to is not null
   and cardinality(assigned_to_ids) = 0;

-- Het filter in de pipeline vraagt "zit deze persoon erbij" (array-overlap).
-- Zonder index is dat een sequentiële scan over alle deals van het bedrijf.
create index if not exists deals_assigned_to_ids_idx
  on public.deals using gin (assigned_to_ids);


-- ── PostgREST-cache verversen ───────────────────────────────────────────────
-- Zonder dit geeft de REST-API een 400 op een kolom die wél bestaat. Zie
-- CLAUDE.md; controleer na het pushen met `npm run migratie:check -- deals`.
notify pgrst, 'reload schema';
