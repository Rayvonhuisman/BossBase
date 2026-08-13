// ── Waarom ben je hier, en wat lost het op? ───────────────────────────────────
// Uit UpgradeFlow gehaald zodat de abonnementspagina en de (eventuele) modal
// dezelfde vertaling gebruiken. De kop kan zo nooit iets anders beweren dan de
// knop doet.
import { tierLabel, EXTRA_USER_PRICE } from './tiers.js';
import {
  moduleLabel, modulePrice, getLimitDef, featureLabel,
  tierForFeature, tierForLimit, moduleForFeature, moduleMetVereisten,
  TIER_LIMITS,
} from './features.js';
import { readonlyTekst } from './readonly.js';

export const euro = n => `€ ${Number(n || 0)}`;

export const fmtDatum = d => d
  ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  : '—';

// ── Wat is het probleem, en wat lost het op? ─────────────────────────────────
// Eén functie die van een aanleiding een voorstel maakt. Alles wat het scherm
// toont, komt hieruit — zo kan de kop nooit iets anders beweren dan de knop doet.
export function bedenkVoorstel({ aanleiding, plan, stand }) {
  const huidig = stand?.tier || plan.tier;
  const soort = aanleiding?.soort || 'abonnement';
  const key = aanleiding?.key || null;

  // Read-only: er is niets te kiezen dat het probleem oplost behalve betalen.
  // Zijn huidige pakket volstaat — hij moet er alleen een abonnement op nemen.
  if (soort === 'readonly') {
    const t = readonlyTekst(plan.readonlyReden);
    return {
      kop: t.titel,
      uitleg: t.uitleg,
      tier: huidig,
      modules: [],
      extra: stand?.extraGebruikers ?? 0,
      wat: `Je houdt ${tierLabel(huidig)} en alles staat direct weer open.`,
    };
  }

  // Limiet bereikt. De concrete stand erbij — "20 van de 20" zegt meer dan
  // "je limiet is bereikt".
  if (soort === 'limiet' && key) {
    const def = getLimitDef(key);
    const doel = tierForLimit(huidig, key) || 'groei';
    const naam = def?.label?.toLowerCase() || key;
    const nieuweMax = TIER_LIMITS[doel]?.[key];
    // De stand alleen noemen als we een échte bovengrens kennen. Bij een
    // onbekende of onbeperkte limiet gaf dit "0 van de null offertes".
    const max = plan.limit(key);
    const gebruikt = plan.used(key);
    return {
      kop: max == null
        ? `${def?.label || naam} zit aan de grens van je abonnement`
        : `Je hebt ${gebruikt} van de ${max} ${naam} gebruikt`,
      uitleg: def?.telwijze === 'periode'
        ? 'Dat is de teller van deze factuurperiode. Alles wat er al staat blijft gewoon werken; alleen nieuwe erbij maken lukt niet meer.'
        : 'Alles wat er al staat blijft gewoon werken; alleen nieuwe erbij maken lukt niet meer.',
      tier: doel,
      modules: [],
      extra: stand?.extraGebruikers ?? 0,
      wat: nieuweMax == null
        ? `Met ${tierLabel(doel)} is het aantal ${naam} onbeperkt.`
        : `${tierLabel(doel)} gaat tot ${nieuweMax} ${naam}.`,
    };
  }

  // Feature ontbreekt. Is er een module die hem levert bij het HUIDIGE pakket,
  // dan is dat het antwoord — niet de pakketsprong. Een klant die € 10 nodig
  // heeft € 20 laten betalen omdat dat ons beter uitkomt, is geen advies.
  if (soort === 'feature' && key) {
    const module = moduleForFeature(huidig, key);
    if (module) {
      const meegenomen = moduleMetVereisten(module.key);
      const prijs = meegenomen.reduce((s, k) => s + modulePrice(k), 0);
      return {
        kop: `${featureLabel(key)} zit niet in je abonnement`,
        uitleg: `Je kunt het bijkopen als module — je hoeft er niet voor over te stappen naar een groter pakket.`,
        tier: huidig,
        modules: meegenomen,
        extra: stand?.extraGebruikers ?? 0,
        wat: meegenomen.length > 1
          ? `${meegenomen.map(moduleLabel).join(' + ')} — samen ${euro(prijs)} per maand erbij. ${moduleLabel(module.key)} werkt alleen samen met ${moduleLabel(module.vereist)}.`
          : `${moduleLabel(module.key)} — ${euro(prijs)} per maand erbij.`,
      };
    }
    const doel = tierForFeature(key) || 'team';
    return {
      kop: `${featureLabel(key)} zit niet in je abonnement`,
      uitleg: `Deze functie hoort bij ${tierLabel(doel)}. Je bestaande gegevens blijven staan.`,
      tier: doel,
      modules: [],
      extra: stand?.extraGebruikers ?? 0,
      wat: `${tierLabel(doel)} heeft ${featureLabel(key)} standaard.`,
    };
  }

  // Gebruiker erbij. Past hij binnen het plafond van het huidige pakket, dan is
  // een extra gebruiker het antwoord; anders het volgende pakket.
  if (soort === 'gebruikers') {
    const plafond = TIER_LIMITS[huidig]?.gebruikers ?? null;
    const inGebruik = plan.used('gebruikers');
    const past = plafond == null || inGebruik + 1 <= plafond;
    if (past) {
      return {
        kop: 'Een teamlid erbij',
        uitleg: `Je hebt nu ${inGebruik} gebruiker${inGebruik === 1 ? '' : 's'}.`,
        tier: huidig,
        modules: stand?.modules ?? [],
        extra: Math.max((stand?.extraGebruikers ?? 0) + 1, 1),
        wat: `Elke extra gebruiker kost ${euro(EXTRA_USER_PRICE)} per maand.`,
      };
    }
    const doel = tierForLimit(huidig, 'gebruikers') || 'team';
    return {
      kop: `${tierLabel(huidig)} gaat tot ${plafond} gebruiker${plafond === 1 ? '' : 's'}`,
      uitleg: `Je hebt er ${inGebruik}. Voor meer teamleden is er ${tierLabel(doel)}.`,
      tier: doel,
      modules: stand?.modules ?? [],
      extra: stand?.extraGebruikers ?? 0,
      wat: TIER_LIMITS[doel]?.gebruikers == null
        ? `${tierLabel(doel)} heeft geen maximum aantal gebruikers — je betaalt ${euro(EXTRA_USER_PRICE)} per extra gebruiker.`
        : `${tierLabel(doel)} gaat tot ${TIER_LIMITS[doel].gebruikers} gebruikers.`,
    };
  }

  // Vanuit Instellingen: geen probleem om op te lossen, gewoon de keuze.
  return {
    kop: stand?.heeftStripe ? 'Je abonnement aanpassen' : 'Kies je abonnement',
    uitleg: stand?.heeftStripe
      ? 'Wijzigingen gaan direct in. Het verschil wordt verrekend.'
      : 'Je gegevens blijven staan; je kunt meteen verder waar je gebleven was.',
    tier: huidig,
    modules: stand?.modules ?? [],
    extra: stand?.extraGebruikers ?? 0,
    wat: null,
  };
}

