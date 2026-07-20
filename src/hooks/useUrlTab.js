import { useState, useCallback } from 'react';

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
export function useUrlTab(defaultId, { param = 'tab', validIds = null } = {}) {
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
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch { /* URL niet beschikbaar — sla het URL-schrijven over */ }
  }, [param, defaultId]);

  return [tab, setTab];
}
