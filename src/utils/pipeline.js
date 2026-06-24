// Helpers om een deal's pipeline-fase (stage_id = uuid) te koppelen aan een
// semantische categorie. Deals dragen alleen het stage_id; de namen/volgorde
// komen uit de pipeline_stages-lijst (sharedData.stages). Zo werken de
// dashboard-widgets op echte data i.p.v. hardcoded string-fases.

// Naam van een fase → semantische groep. 'open' = nog in de pipeline.
export function stageCategory(name = '') {
  const n = (name || '').toLowerCase();
  if (/verloren|verloor|afgewezen|geannuleerd|geen interesse/.test(n)) return 'lost';
  if (/betaald|gesloten|voldaan/.test(n)) return 'paid';
  if (/afgerond|gewonnen|voltooid|opgeleverd/.test(n)) return 'won';
  return 'open';
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
