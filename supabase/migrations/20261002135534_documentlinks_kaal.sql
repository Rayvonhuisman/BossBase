-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Audit 2026-10-01, M15 (sec-publiek-opslag O4). Vroeger werd per handtekening
-- en ondertekende PDF een ondertekende URL van 10 jaar opgeslagen. Gemeten vóór
-- het draaien: 19 waarden met een ondertekende URL (offertes.signature_url 7,
-- signed_pdf_url 2, werkbonnen.handtekening_url 5, ondertekende_pdf_url 5),
-- waarvan 12 rijen nog langer dan een jaar geldig, 8 bij niet-testbedrijven.
-- Wie de waarde uit de database kreeg (ex-medewerker, export), kon het bestand
-- jaren openen.
--
-- De app en document-url werken al met een kale verwijzing "<bucket>/<pad>"
-- (_shared/documentLink.ts padUit; src: documentUrl({ opgeslagen })) en maken
-- zelf een link van 10 minuten na een rechtencontrole. Deze migratie zet alle
-- opgeslagen ondertekende URL's om naar die verwijzing, zodat de database geen
-- langlevende links meer uitdeelt.
--
-- Wat dit NIET doet: een al uitgedeelde oude URL blijft geldig tot zijn
-- vervaldatum (het is een ondertekend token, geen databaserij). Intrekken kan
-- alleen door het bestand te verplaatsen via de Storage-API met de service-rol;
-- dat staat als bewust open in de fixes-log.

begin;

create temp table _voor on commit drop as
select 'offertes.signature_url' k, count(*) n from offertes where signature_url like '%/object/sign/%'
union all select 'offertes.signed_pdf_url', count(*) from offertes where signed_pdf_url like '%/object/sign/%'
union all select 'werkbonnen.handtekening_url', count(*) from werkbonnen where handtekening_url like '%/object/sign/%'
union all select 'werkbonnen.ondertekende_pdf_url', count(*) from werkbonnen where ondertekende_pdf_url like '%/object/sign/%';

-- '<…>/storage/v1/object/sign/<bucket>/<pad>?token=…' → '<bucket>/<pad>'
update offertes
   set signature_url = split_part(split_part(signature_url, '/object/sign/', 2), '?', 1)
 where signature_url like '%/object/sign/signatures/%';
update offertes
   set signed_pdf_url = split_part(split_part(signed_pdf_url, '/object/sign/', 2), '?', 1)
 where signed_pdf_url like '%/object/sign/signed-offertes/%';
update werkbonnen
   set handtekening_url = split_part(split_part(handtekening_url, '/object/sign/', 2), '?', 1)
 where handtekening_url like '%/object/sign/signatures/%';
update werkbonnen
   set ondertekende_pdf_url = split_part(split_part(ondertekende_pdf_url, '/object/sign/', 2), '?', 1)
 where ondertekende_pdf_url like '%/object/sign/signed-werkbonnen/%';

notify pgrst, 'reload schema';

select (select json_agg(_voor) from _voor) as voor,
  (select count(*) from offertes where signature_url like '%token=%' or signed_pdf_url like '%token=%')
  + (select count(*) from werkbonnen where handtekening_url like '%token=%' or ondertekende_pdf_url like '%token=%') as nog_met_token_moet_0,
  (select count(*) from offertes o where o.signature_url like 'signatures/%' and not exists
     (select 1 from storage.objects s where s.bucket_id = 'signatures' and s.name = substr(o.signature_url, length('signatures/') + 1))) as kale_handtekening_zonder_bestand_moet_0;

commit;
