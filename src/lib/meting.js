// Meetpunten voor de website en de aanmelding.
//
// Aangesloten op de eigen cookievrije meting via window.bbMeter
// (lib/analytics.js, alleen op de website). Zonder die functie doet meet()
// niets; in de app staat hij dus niet aan. Er worden geen cookies gezet en
// niets in localStorage of sessionStorage geschreven. Alleen de naam van de
// gebeurtenis gaat mee, nooit persoonsgegevens: dan vervalt de reden dat er
// geen cookiebanner nodig is.
//
// Gebeurtenissen:
//   registratie_klik        een klik op een link naar /register (géén aanmelding!)
//   proefaccount_aangemaakt  de aanmelding is gelukt (in de app: wordt niet
//                            verstuurd; nieuwe accounts staan in de database)

export function meet(gebeurtenis, gegevens = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.bbMeter === 'function') {
      window.bbMeter(gebeurtenis, gegevens);
    }
  } catch {
    // Meten mag de site nooit breken.
  }
}
