-- Aanvraag/deal-prioriteit. De pipeline-modal liet al een prioriteit kiezen
-- (Laag/Normaal/Hoog → low/med/high), maar de deals-tabel had geen kolom, dus
-- de waarde werd bij het aanmaken stil weggelaten (safeInsert). Hierdoor werkte
-- ook het filter niet en was er geen badge in de lijst.
--
-- Standaard 'med' (= Normaal), ook voor bestaande rijen. toDeal() valt daarnaast
-- al terug op 'med' zodat oude data zonder waarde als Normaal wordt behandeld.
alter table public.deals add column if not exists priority text not null default 'med';

comment on column public.deals.priority is 'Aanvraag/deal-prioriteit: low | med | high (med = Normaal, standaard).';
