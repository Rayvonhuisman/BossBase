// Eigen cookievrije meting voor de website (sinds 8 oktober 2026; daarvoor
// Vercel Web Analytics, dat op ons abonnement geen gegevens doorgaf).
//
// Waarom zonder cookiebanner: er wordt niets in de browser opgeslagen (geen
// cookies, geen localStorage). Een bezoeker wordt aan de serverkant herkend
// aan een hash van IP-adres en browser met een zout dat elke dag wisselt en
// daarna gewist wordt; het IP-adres zelf wordt niet bewaard. Dat valt onder de
// uitzondering voor analytics met geen of geringe privacygevolgen
// (Telecommunicatiewet art. 11.7a lid 3 sub b). Zie docs/juridisch/cookiebeleid.md
// en supabase/functions/_shared/meting.ts.
//
// Alleen de website wordt gemeten, niet de app: wat klanten in de app doen
// staat al in onze eigen database. Ook hier gaan er geen persoonsgegevens via
// de URL mee: anoniemeUrl() haalt tokens en id's eruit, en van de verwijzer
// gaat alleen de domeinnaam mee. Wie "Do Not Track" of Global Privacy Control
// aan heeft staan, meten we niet.
// Alleen deze parameters zeggen iets over herkomst en bevatten geen gegevens
// over een persoon. Alle andere (token, klant, deal, open, email, …) vallen weg.
const TOEGESTANE_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref']);

// Publieke klantlinks: alles na het eerste padsegment is een token.
const TOKEN_PREFIXEN = ['/offerte', '/werkbon', '/betaal', '/uitnodiging'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Lange willekeurige reeksen (tokens, hashes) en losse getallen (id's).
const TOKENACHTIG = /^(?=.*\d)[A-Za-z0-9_-]{16,}$|^\d+$/;

export function anoniemeUrl(url) {
  let u;
  try {
    u = new URL(url, window.location.origin);
  } catch {
    return null;
  }

  let pad = u.pathname;
  const prefix = TOKEN_PREFIXEN.find(p => pad === p || pad.startsWith(p + '/'));
  if (prefix && pad !== prefix) {
    pad = `${prefix}/[token]`;
  } else {
    pad = pad
      .split('/')
      .map(deel => (UUID.test(deel) ? '[id]' : TOKENACHTIG.test(deel) ? '[token]' : deel))
      .join('/');
  }

  const params = new URLSearchParams();
  u.searchParams.forEach((waarde, sleutel) => {
    if (TOEGESTANE_PARAMS.has(sleutel)) params.set(sleutel, waarde);
  });
  const query = params.toString();
  // Het fragment (#…) gaat nooit mee.
  return `${u.origin}${pad}${query ? `?${query}` : ''}`;
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meting`;

// Alleen op de echte website, niet op localhost of een preview.
const meetbaar = () => {
  try {
    if (!/(^|\.)bossbase\.nl$/.test(window.location.hostname)) return false;
    if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1') return false;
    return true;
  } catch {
    return false;
  }
};

function verwijzerDomein() {
  try {
    return document.referrer ? `https://${new URL(document.referrer).hostname}` : '';
  } catch {
    return '';
  }
}

function stuur(bericht) {
  if (!meetbaar()) return;
  try {
    const url = anoniemeUrl(window.location.href);
    if (!url) return;
    const tekst = JSON.stringify({ ...bericht, url, verwijzer: verwijzerDomein() });
    const blob = new Blob([tekst], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob))) {
      fetch(ENDPOINT, { method: 'POST', body: tekst, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
    }
  } catch {
    // Meten mag de site nooit breken.
  }
}

// Een paginaweergave. Bij het laden van de website en na elke navigatie
// binnen de website (MarketingApp).
export function meetPagina() {
  stuur({ soort: 'pagina' });
}

export function startAnalytics() {
  // Overblijfsel van de oude cookiebanner (verwijderd 30-09-2026). Die keuze
  // deed niets en er valt niets meer te kiezen; niet laten staan.
  try { localStorage.removeItem('cookie_consent'); } catch { /* geen opslag */ }

  // De meetpunten uit lib/meting.js. Alleen de naam gaat mee; de server neemt
  // alleen bekende gebeurtenissen aan.
  window.bbMeter = gebeurtenis => stuur({ soort: 'gebeurtenis', naam: gebeurtenis });
  meetPagina();
}
