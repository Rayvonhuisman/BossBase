// Navigatie naar de abonnementspagina, met de aanleiding in de URL.
//
// Bewust een apart bestandje en niet in AbonnementPage.jsx: die exporteert een
// component, en een bestand dat zowel een component als losse functies
// exporteert breekt React Fast Refresh voor iedereen die het importeert.

/** Leest de aanleiding uit de URL. Geen aanleiding = gewoon de keuze. */
export function aanleidingUitUrl() {
  try {
    const q = new URLSearchParams(window.location.search);
    const soort = q.get('reden');
    if (!soort) return null;
    return { soort, key: q.get('key') || null, actie: q.get('actie') || null };
  } catch {
    return null;
  }
}

/**
 * Navigeert naar de abonnementspagina. Gebruikt door alle plekken die vroeger de
 * upgrade-modal openden: limiet bereikt, ontbrekende feature, read-only en
 * Instellingen.
 *
 * setPage is optioneel — componenten die het niet als prop krijgen (de
 * read-only-banner, de abonnementssectie) laten we via een popstate lopen, die
 * App.jsx al afvangt. Zo hoeft setPage niet door drie lagen heen gereden te
 * worden.
 */
export function gaNaarAbonnement(setPage, aanleiding = null) {
  const q = new URLSearchParams();
  if (aanleiding?.soort) q.set('reden', aanleiding.soort);
  if (aanleiding?.key) q.set('key', aanleiding.key);
  if (aanleiding?.actie) q.set('actie', aanleiding.actie);
  const zoek = q.toString();
  const pad = `/dashboard/abonnement${zoek ? `?${zoek}` : ''}`;
  // Eerst het pad mét query zetten; navigatePage vergelijkt alleen het pad en
  // laat de query daarna staan.
  try { window.history.pushState({}, '', pad); } catch { /* niet blokkerend */ }
  if (typeof setPage === 'function') { setPage('abonnement'); return; }
  try { window.dispatchEvent(new PopStateEvent('popstate')); }
  catch { window.location.href = pad; }
}
