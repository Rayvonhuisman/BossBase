// ── Route ────────────────────────────────────────────────────────────────────
// Eén plek die de URL vertaalt naar "wat staat er open", en terug. De URL is de
// bron van waarheid: pagina, geopend item, actief tabblad. Terug in de browser
// betekent daarmee vanzelf terug naar de vorige weergave.
//
// Vorm:
//   /<basis>/<pagina>[/<itemId>][?klant=&tab=&deal=&lev=&agenda=]
//
// Waarom twee soorten:
//   • Een DETAIL dat de lijst vervángt (werkbon, project, offerte, factuur)
//     staat in het pad. Dat leest als een eigen pagina en is deelbaar.
//   • Een DRAWER die óver de huidige pagina zweeft (klantkaart, deal,
//     leverancier, agenda-item) staat in de query. Zo blijft in de URL staan
//     wáár hij overheen ligt, en gaat terug naar precies die pagina — een
//     klantkaart geopend vanuit de pipeline hoort terug te gaan naar de
//     pipeline, niet naar de klantenlijst.
//
// Filters en zoekvelden horen hier NIET in: die mogen geen geschiedenisstap
// maken (zie useUrlTab, dat met replaceState schrijft).

export const PAGINAS = [
  'pipeline', 'customers', 'leveranciers', 'materialen', 'activities', 'calendar',
  'planning', 'projecten', 'werkbonnen', 'uren', 'costs', 'revenue', 'facturen',
  'offertes', 'database', 'team', 'instellingen', 'abonnement',
];

// Pagina's die een detail-id in het pad mogen dragen.
export const ITEM_IN_PAD = ['werkbonnen', 'projecten', 'offertes', 'facturen', 'activities'];

// De drawers, met hun queryparameter.
export const DRAWERS = { klant: 'klant', deal: 'deal', lev: 'lev', agenda: 'agenda' };

/** Leest de huidige URL. Geeft altijd een volledig beeld terug. */
export function leesRoute(basispad, href = typeof window !== 'undefined' ? window.location.href : '/') {
  let u;
  try { u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost'); }
  catch { return { page: 'dashboard', itemId: null, klant: null, deal: null, lev: null, agenda: null, tab: null, open: null, search: '' }; }

  const pad = u.pathname;
  let page = 'dashboard';
  let itemId = null;

  if (pad.startsWith(`${basispad}/`)) {
    const delen = pad.slice(basispad.length + 1).split('/').filter(Boolean);
    if (delen[0] && PAGINAS.includes(delen[0])) {
      page = delen[0];
      if (delen[1] && ITEM_IN_PAD.includes(page)) itemId = decodeURIComponent(delen[1]);
    }
  }

  const q = u.searchParams;
  return {
    page,
    itemId,
    klant: q.get('klant'),
    deal: q.get('deal'),
    lev: q.get('lev'),
    agenda: q.get('agenda'),
    tab: q.get('tab'),
    // Oude deep-link uit collega-mails: /<basis>/<pagina>?open=<id>. Blijft
    // werken; App.jsx stuurt hem door naar de nieuwe vorm.
    open: q.get('open'),
    search: u.search,
  };
}

/**
 * Bouwt een pad. `bewaarQuery` neemt de bestaande query mee (filters, ?reden=
 * van de abonnementspagina, de Stripe-retour) en overschrijft alleen de
 * route-parameters.
 */
export function bouwRoute(basispad, opties = {}) {
  const {
    page = 'dashboard', itemId = null, klant = null, tab = null,
    deal = null, lev = null, agenda = null, bewaarQuery = '',
  } = opties;

  let pad = page === 'dashboard' ? basispad : `${basispad}/${page}`;
  if (itemId && ITEM_IN_PAD.includes(page)) pad += `/${encodeURIComponent(itemId)}`;

  const q = new URLSearchParams(bewaarQuery || '');
  // Route-parameters altijd opnieuw zetten; de rest blijft staan.
  ['klant', 'deal', 'lev', 'agenda', 'tab', 'open'].forEach(k => q.delete(k));
  if (klant) q.set('klant', klant);
  if (deal) q.set('deal', deal);
  if (lev) q.set('lev', lev);
  if (agenda) q.set('agenda', agenda);
  if (tab) q.set('tab', tab);

  const s = q.toString();
  return pad + (s ? `?${s}` : '');
}

/** Staat er een drawer open in deze route? */
export function heeftDrawer(r) {
  return Boolean(r.klant || r.deal || r.lev || r.agenda);
}
