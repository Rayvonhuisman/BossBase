// Helpers om een deal's pipeline-fase (stage_id = uuid) te koppelen aan een
// semantische categorie. Deals dragen alleen het stage_id; de namen/volgorde
// komen uit de pipeline_stages-lijst (sharedData.stages). Zo werken de
// dashboard-widgets op echte data i.p.v. hardcoded string-fases.

// Naam van een fase → semantische groep. 'open' = nog in de pipeline.
//
// LET OP: dit is sinds de statusomzetting nog maar voor twee dingen goed — de
// WEERGAVE (welke fases hoort de gebruiker te zien) en de vraag of gewonnen werk
// al is afgerekend ('paid'). Of een deal open, gewonnen of verloren is komt uit
// deals.status; zie dealStatus() hieronder.
//
// 'gefactureerd' hoort bij 'paid': de factuur is eruit, dus het werk staat niet
// meer "te factureren". Die naam stond er eerder niet in, waardoor een fase
// "Gefactureerd" stilletjes als 'open' werd geteld en dus meeliep in de open
// pipeline.
export function stageCategory(name = '') {
  const n = (name || '').toLowerCase();
  if (/verloren|verloor|afgewezen|geannuleerd|geen interesse/.test(n)) return 'lost';
  if (/betaald|gesloten|voldaan|gefactureerd/.test(n)) return 'paid';
  if (/afgerond|gewonnen|voltooid|opgeleverd/.test(n)) return 'won';
  return 'open';
}

// De status van een deal: 'open' | 'won' | 'lost'. Uit de database, niet uit de
// fasenaam geraden.
//
// Waarom dit er is: stageCategory() leidde de status af uit de naam van de fase,
// en in productie liepen die twee uiteen. Gemeten in het testbedrijf: 27 deals
// met status 'won' stonden in Akkoord/Gepland/In uitvoering en telden daardoor
// mee als open pipeline (€934.500), en 2 verloren deals stonden in de fase
// Afgerond en telden mee als te factureren (€85.900).
//
// `stageIndex` is optioneel en dient alleen als terugval voor rijen zonder
// status (demo-data, en deals van vóór de statuskolom).
export function dealStatus(deal, stageIndex = null) {
  const s = String(deal?.status || '').toLowerCase();
  if (s === 'open' || s === 'won' || s === 'lost') return s;
  const cat = stageIndex ? stageIndex.get(deal?.stage)?.category : null;
  if (cat === 'lost') return 'lost';
  if (cat === 'won' || cat === 'paid') return 'won';
  return 'open';
}

// Is deze aanvraag afgerond? Eén plek, zodat bord, klantkaart en funnel het
// over hetzelfde hebben. Niet uit de fasenaam geraden: zie migratie
// 20260920100000.
export function isAfgerond(deal) {
  return Boolean(deal?.afgerondOp || deal?.afgerond_op);
}

// Map: stage_id → { id, label, order, category, isFirst }.
export function buildStageIndex(stages = []) {
  const sorted = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = new Map();
  sorted.forEach((s, i) => idx.set(s.id, {
    id: s.id, label: s.label, order: s.order ?? i,
    category: stageCategory(s.label), isFirst: i === 0,
  }));
  return idx;
}

// Categorie van een deal ('open' als de fase onbekend is).
export function dealCategory(deal, stageIndex) {
  return stageIndex.get(deal?.stage)?.category || 'open';
}

// De order (volgnummer) van een deal binnen de pipeline; -1 als onbekend.
export function dealOrder(deal, stageIndex) {
  return stageIndex.get(deal?.stage)?.order ?? -1;
}

// Het stage_id van de eerste pipeline-fase (de "nieuwe aanvragen").
export function firstStageId(stages = []) {
  return stages.length ? [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.id : null;
}
