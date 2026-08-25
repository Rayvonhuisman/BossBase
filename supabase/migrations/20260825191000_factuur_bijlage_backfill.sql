-- Bestaande verkoopboekingen buiten de nastuurlus houden.
--
-- snelstart_bijlage_gesynct staat standaard op false, dus alle facturen die al
-- vóór deze wijziging geboekt waren komen in de nastuurlus terecht. Voor die
-- facturen bestaat de PDF niet in de bucket: het opslaan is pas ingebouwd toen
-- de koppeling hem nodig had, en de opmaak zit in jsPDF — er valt server-side
-- niets te genereren.
--
-- Zonder deze backfill zou elke sync tientallen downloads doen die niet kunnen
-- slagen, en bij elke ronde melden dat oude facturen geen document hebben. Die
-- melding is terecht voor nieuwe facturen en ruis voor oude.
--
-- Historische boekingen zijn hiermee bewust buiten beeld: wie het document daar
-- alsnog bij wil hebben, hangt het in SnelStart zelf aan de boeking.

update public.facturen
   set snelstart_bijlage_gesynct = true
 where snelstart_id is not null
   and snelstart_bijlage_gesynct = false;
