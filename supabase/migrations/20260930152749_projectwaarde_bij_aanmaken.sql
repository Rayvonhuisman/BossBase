-- ── Waarom ──────────────────────────────────────────────────────────────────
-- Vervolg op 20260930152713. De projectwaarde werd opnieuw uitgerekend bij een
-- wijziging van een offerte of van het project, maar niet bij het AANMAKEN van
-- een project. Een project dat met de hand wordt gemaakt met een al
-- geaccepteerde offerte eraan (Nieuw project → offerte kiezen) bleef daardoor op
-- de ingevulde waarde of 0 staan. Met een ingevulde waarde is de bron
-- 'handmatig' (createProject) en blijft die staan; anders rekent deze trigger.

begin;

drop trigger if exists bb_project_waarde_bij_aanmaken on public.projects;
create trigger bb_project_waarde_bij_aanmaken
  after insert on public.projects
  for each row
  when (new.waarde_bron <> 'handmatig')
  execute function public.bb_project_waarde_herbereken();

select count(*) as trigger_er from pg_trigger where tgname = 'bb_project_waarde_bij_aanmaken';

commit;

notify pgrst, 'reload schema';
