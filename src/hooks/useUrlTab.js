import { useState, useCallback, useEffect } from 'react';
import { schrijfEntry } from '../lib/geschiedenis.js';

// ── useUrlTab ─────────────────────────────────────────────────────────────────
// Houdt de actieve tab in de URL (?<param>=<id>) zodat een refresh of een externe
// terugkeer (bv. de Stripe-return) de gebruiker op dezelfde tab houdt. De URL is
// de bron van waarheid — bewust GEEN localStorage/sessionStorage, dat werkt niet
// betrouwbaar in dit soort return-flows.
//
// Sluit aan op de bestaande, zelfgebouwde router in App.jsx (die op
// popstate/pathname stuurt):
//   • we schrijven met history.replaceState → dat triggert GÉÉN popstate en
//     verstoort de paginanavigatie dus niet (zelfde patroon als de bestaande
//     ?stripe-strip in InstellingenPage).
//   • navigatePage() pusht bij een paginawissel een pad zónder query, dus een
//     verse pagina erft nooit de tab van een andere pagina (gewenst gedrag).
//
// Vervangt 1-op-1 een `useState` voor de actieve tab; de setter blijft op
// dezelfde manier aanroepbaar (setTab(id)). Optioneel `validIds` weert
// onbekende ?tab=-waarden (val dan terug op de default).
//
// `stap: true` maakt er een geschiedenisstap van (pushState), zodat terug in de
// browser naar het vorige tabblad gaat. Dat hoort bij een WEERGAVE: de
// dag/week-stand van planning en agenda, en de tabbladen van Instellingen.
// Een FILTER hoort dat juist niet te doen — anders moet je vijf keer terug om
// een lijst te verlaten waar je alleen wat in hebt zitten filteren. Standaard
// blijft daarom replaceState.
//
// Bij een stap luistert de hook ook naar popstate: terug/vooruit zet dan de
// juiste tab terug. Zonder stap is dat niet nodig, want de URL verandert dan
// binnen dezelfde geschiedenis-entry.
export function useUrlTab(defaultId, { param = 'tab', validIds = null, stap = false } = {}) {
  const [tab, setTabState] = useState(() => {
    try {
      const v = new URLSearchParams(window.location.search).get(param);
      if (v && (!validIds || validIds.includes(v))) return v;
    } catch { /* geen searchParams beschikbaar */ }
    return defaultId;
  });

  const setTab = useCallback((id) => {
    setTabState(id);
    try {
      const url = new URL(window.location.href);
      // Default-tab → laat de URL schoon (geen ?tab=). Anders zet de tab erin.
      if (id == null || id === defaultId) url.searchParams.delete(param);
      else url.searchParams.set(param, id);
      const pad = url.pathname + url.search + url.hash;
      // Een tabblad is geen venster: de sluitdoelen van het venster eromheen
      // gaan ongewijzigd mee (schrijfEntry zonder `vensters`), zodat het kruisje
      // ook na drie tabwissels nog in één keer dat venster sluit.
      if (stap) schrijfEntry(pad);
      else window.history.replaceState(window.history.state, '', pad);
    } catch { /* URL niet beschikbaar — sla het URL-schrijven over */ }
  }, [param, defaultId, stap]);

  // Terug/vooruit in de browser moet het tabblad meenemen. Alleen nodig als de
  // wissel een eigen geschiedenis-entry heeft.
  useEffect(() => {
    if (!stap) return undefined;
    const onPop = () => {
      try {
        const v = new URLSearchParams(window.location.search).get(param);
        if (v && (!validIds || validIds.includes(v))) setTabState(v);
        else setTabState(defaultId);
      } catch { /* niets te lezen */ }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [stap, param, defaultId, validIds]);

  return [tab, setTab];
}
