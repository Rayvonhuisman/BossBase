-- Private opslag voor verstuurde factuur-PDF's, zodat server-side flows (de
-- Stripe-webhook, die geen browser heeft) exact dezelfde PDF als bijlage kunnen
-- meesturen bij de betaalbevestigingsmails. De browser genereert de PDF bij het
-- verzenden van de factuur en uploadt 'm hierheen (padconventie {company_id}/
-- {factuur_id}.pdf); de webhook haalt 'm met de service-role weer op.
insert into storage.buckets (id, name, public)
values ('factuur-pdfs', 'factuur-pdfs', false)
on conflict (id) do nothing;

-- Company-scoped policies op de eerste padmap (zelfde patroon als kosten-bijlagen).
drop policy if exists "factuur_pdfs_select" on storage.objects;
drop policy if exists "factuur_pdfs_insert" on storage.objects;
drop policy if exists "factuur_pdfs_update" on storage.objects;
drop policy if exists "factuur_pdfs_delete" on storage.objects;

create policy "factuur_pdfs_select" on storage.objects for select
using (
  bucket_id = 'factuur-pdfs'
  and (storage.foldername(name))[1] = current_user_company_id()::text
);

create policy "factuur_pdfs_insert" on storage.objects for insert
with check (
  bucket_id = 'factuur-pdfs'
  and (storage.foldername(name))[1] = current_user_company_id()::text
);

create policy "factuur_pdfs_update" on storage.objects for update
using (
  bucket_id = 'factuur-pdfs'
  and (storage.foldername(name))[1] = current_user_company_id()::text
);

create policy "factuur_pdfs_delete" on storage.objects for delete
using (
  bucket_id = 'factuur-pdfs'
  and (storage.foldername(name))[1] = current_user_company_id()::text
);
