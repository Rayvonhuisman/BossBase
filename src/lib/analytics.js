// Vercel Web Analytics voor de website én de app.
//
// Waarom zonder cookiebanner: Web Analytics zet geen cookies en schrijft niets
// in de browseropslag. Een bezoeker wordt herkend aan een hash van het verzoek
// die Vercel na 24 uur weggooit; IP-adressen worden niet bewaard. Dat valt onder
// de uitzondering voor analytics met geen of geringe privacygevolgen
// (Telecommunicatiewet art. 11.7a lid 3 sub b). Zie docs/juridisch/cookiebeleid.md.
//
// Die uitzondering houdt alleen stand als er via de URL geen persoonsgegevens
// meegaan. Vercel ontvangt de volledige URL van elke pagina, en bij ons staan
// daar tokens in (/offerte/<token>, /werkbon/<token>, /betaal/<token>,
// /uitnodiging?token=…, /reset-password?…) en id's van klanten, projecten en
// facturen (/dashboard/projecten/<uuid>, ?klant=<uuid>). Die haalt anoniemeUrl()
// eruit vóór er iets verstuurd wordt. Het pad blijft zichtbaar, de sleutel niet.
import { inject, track } from '@vercel/analytics';

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

export function startAnalytics() {
  // Overblijfsel van de oude cookiebanner (verwijderd 30-09-2026). Die keuze
  // deed niets en er valt niets meer te kiezen; niet laten staan.
  try { localStorage.removeItem('cookie_consent'); } catch { /* geen opslag */ }

  try {
    inject({
      mode: import.meta.env.PROD ? 'production' : 'development',
      debug: false,
      beforeSend: event => {
        const url = anoniemeUrl(event.url);
        return url ? { ...event, url } : null;
      },
    });

    // De meetpunten uit lib/meting.js doorgeven als eigen gebeurtenis. Alleen
    // platte waarden; meting.js stuurt geen persoonsgegevens mee.
    window.bbMeter = (gebeurtenis, gegevens = {}) => {
      const plat = {};
      for (const [k, v] of Object.entries(gegevens || {})) {
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) plat[k] = v;
      }
      if (typeof plat.pagina === 'string') plat.pagina = new URL(anoniemeUrl(plat.pagina) || '/', window.location.origin).pathname;
      track(gebeurtenis, plat);
    };
  } catch {
    // Meten mag de site nooit breken.
  }
}
