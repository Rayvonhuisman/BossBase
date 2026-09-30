// Meetpunten voor de website en de aanmelding.
//
// Aangesloten op Vercel Web Analytics via window.bbMeter (lib/analytics.js,
// gekozen 30-09-2026). Zonder die functie doet meet() niets. Er worden geen
// cookies gezet en niets in localStorage of sessionStorage geschreven. Stuur
// hier nooit persoonsgegevens mee: dan vervalt de reden dat er geen
// cookiebanner nodig is.
//
// Gebeurtenissen:
//   registratie_klik        een klik op een link naar /register (géén aanmelding!)
//   proefaccount_aangemaakt  de aanmelding is gelukt en het account bestaat

export function meet(gebeurtenis, gegevens = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.bbMeter === 'function') {
      window.bbMeter(gebeurtenis, gegevens);
    }
  } catch {
    // Meten mag de site nooit breken.
  }
}
