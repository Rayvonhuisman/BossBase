// Meetpunten voor de website en de aanmelding. Staat UIT.
//
// Er is nog geen analysedienst gekozen en er is geen toestemmingsbesluit (zie
// docs/seo/meting.md). Daarom verstuurt en bewaart dit bestand niets: zonder
// aangesloten dienst doet meet() niets. Er worden geen cookies gezet en niets
// in localStorage of sessionStorage geschreven.
//
// Een dienst aansluiten = één functie registreren:
//   window.bbMeter = (gebeurtenis, gegevens) => { ... }
// bijvoorbeeld een wrapper om Plausible, Vercel Web Analytics of GA4 (die
// laatste alleen na toestemming via de cookiebanner).
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
