-- ── Waarom ──────────────────────────────────────────────────────────────────
-- De boekhoudimports (SnelStart, Moneybird) bepaalden "al geïmporteerd?" met
-- één query zonder paginering. PostgREST geeft daar hooguit 1000 rijen van
-- terug, ook aan de service-rol; boven 1000 geïmporteerde posten zag de import
-- de rest als nieuw en importeerde hij die bij elke sync opnieuw (audit
-- 2026-10-01, H16). De functies pagineren nu (_shared/alleRijen.ts); deze
-- indexen zijn de tweede laag: een dubbele import is in de database onmogelijk.
--
-- Volledige (niet-partiële) unieke indexen, zodat PostgREST ze kan gebruiken
-- voor upsert … on_conflict=company_id,externe_referentie. NULL's blijven
-- onderling verschillend, dus handmatige posten zonder referentie botsen niet.
--
-- Gemeten vóór het draaien (2026-10-02): 0 dubbele combinaties in
-- job_costs(company_id, externe_referentie), job_costs(company_id, snelstart_id),
-- facturen(company_id, externe_referentie), facturen(company_id, snelstart_id),
-- facturen(company_id, moneybird_id).

begin;

create unique index if not exists job_costs_company_externe_ref_uniek
  on public.job_costs (company_id, externe_referentie);
create unique index if not exists job_costs_company_snelstart_uniek
  on public.job_costs (company_id, snelstart_id);
create unique index if not exists facturen_company_externe_ref_uniek
  on public.facturen (company_id, externe_referentie);
create unique index if not exists facturen_company_snelstart_uniek
  on public.facturen (company_id, snelstart_id);
create unique index if not exists facturen_company_moneybird_uniek
  on public.facturen (company_id, moneybird_id);

-- De oude niet-unieke index op hetzelfde paar is nu overbodig.
drop index if exists public.idx_facturen_externe_ref;
drop index if exists public.facturen_externe_referentie_idx;

notify pgrst, 'reload schema';

select indexrelid::regclass::text as index, indisunique as uniek
  from pg_index
 where indrelid in ('public.job_costs'::regclass, 'public.facturen'::regclass)
   and indexrelid::regclass::text like '%uniek'
 order by 1;

commit;
