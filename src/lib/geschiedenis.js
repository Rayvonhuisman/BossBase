// ── Geschiedenis ─────────────────────────────────────────────────────────────
// Sluiten is teruggaan, maar precies zóver dat alleen dát ene venster dichtgaat.
//
// Eén history.back() bleek niet genoeg. Sinds een tabwissel in de klantkaart een
// eigen stap is, ligt er tussen "klantkaart geopend" en "nu" van alles. Het
// kruisje bracht je dan naar het vorige tabblad met de kaart nog open — precies
// de regressie die dit bestand oplost.
//
// Elke entry die wij pushen draagt daarom twee dingen mee:
//
//   • bbIndex — een teller die per stap met 1 oploopt. Het verschil tussen twee
//     entries is daarmee gelijk aan hun afstand in de geschiedenis, en dat is
//     precies wat history.go() nodig heeft.
//   • bbOpen  — per venstersoort de index waar je heen moet om dat venster te
//     sluiten: de entry vlak vóór het openen. Een tabwissel binnen hetzelfde
//     venster erft die waarde, dus sluiten blijft in één keer op de goede plek,
//     hoeveel stappen je binnen het venster ook hebt gezet.
//
// Alleen vensters die in de URL staan horen hier thuis. Een bevestiging, het
// mailvenster of een kleine modal staat er niet in en sluit lokaal, zonder
// geschiedenisstap — anders zou terug in de browser ze weer openen.

// De venstersoorten uit route.js: de vier drawers plus het detail in het pad.
export const VENSTERS = ['klant', 'deal', 'lev', 'agenda', 'item'];

function stand() {
  const s = (typeof window !== 'undefined' && window.history.state) || {};
  return {
    state: s,
    index: typeof s.bbIndex === 'number' ? s.bbIndex : 0,
    open: s.bbOpen || {},
    ids: s.bbIds || {},
  };
}

/** De teller van de huidige entry. Entries van buiten de app tellen als 0. */
export function huidigeIndex() {
  return stand().index;
}

/**
 * Schrijft een geschiedenis-entry.
 *
 * `vensters` is {klant, deal, lev, agenda, item} met de id's die ná deze stap
 * openstaan. Laat het weg om de bestaande sluitdoelen ongewijzigd te erven: een
 * dag/week-wissel of een tabblad is geen venster en mag het sluiten van het
 * venster eromheen niet verzetten.
 */
export function schrijfEntry(pad, { replace = false, vensters = null, extra = null } = {}) {
  try {
    const vorig = stand();
    const index = replace ? vorig.index : vorig.index + 1;

    let open = vorig.open;
    let ids = vorig.ids;
    if (vensters) {
      open = {};
      ids = {};
      for (const soort of VENSTERS) {
        const id = vensters[soort] || null;
        if (!id) continue;
        ids[soort] = id;
        // Hetzelfde venster als op de vorige entry → hetzelfde sluitdoel houden.
        // Nieuw venster (of een ander item in dezelfde soort) → sluiten brengt
        // je terug naar de entry die we nu verlaten.
        open[soort] = vorig.ids[soort] === id && typeof vorig.open[soort] === 'number'
          ? vorig.open[soort]
          : vorig.index;
      }
    }

    window.history[replace ? 'replaceState' : 'pushState']({
      ...(replace ? vorig.state : {}),
      ...(extra || {}),
      // bbDiep markeert een entry die wíj hebben gepusht; een replace verandert
      // daar niets aan, anders raakt een entry zijn herkomst kwijt.
      bbDiep: replace ? Boolean(vorig.state.bbDiep) : true,
      bbIndex: index,
      bbOpen: open,
      bbIds: ids,
    }, '', pad);
  } catch { /* niet blokkerend */ }
}

/**
 * Hoeveel stappen terug om precies dit venster te sluiten, en niets anders?
 *
 * Null als er niets te sluiten valt in de geschiedenis — een verse tab of een
 * gedeelde link waarin het venster al openstond. De aanroeper valt dan terug op
 * de weergave eronder, zodat het kruisje daar óók werkt.
 */
export function sluitDelta(soort) {
  const { index, open } = stand();
  const doel = open[soort];
  if (typeof doel !== 'number' || doel >= index) return null;
  return doel - index;
}
