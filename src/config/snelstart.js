// SnelStart-activatieflow (oAuth voor productiekoppelingen).
//
// ⚠️  DE FLOW WERKT PAS NA CERTIFICERING. Zolang de AppShortName leeg is, toont
// het scherm de knop niet en blijft de handmatige invoer van de koppelsleutel
// het enige pad. Dat is bewust: een knop die naar een 404 bij SnelStart leidt is
// erger dan geen knop.
//
// ── NA GOEDKEURING: HIER INVULLEN, VERDER NIETS ─────────────────────────────
// SnelStart geeft bij certificering een AppShortName uit. Zet die hieronder (of
// als VITE_SNELSTART_APP_SHORTNAME in de omgeving, die wint) en de knop
// verschijnt vanzelf. Er hoeft verder geen regel code aangepast te worden.
//
// Hoe de flow loopt (developer portal → "oAuth Authenticatie voor
// productiekoppelingen", en zie ook de kop van supabase/functions/snelstart-webhook):
//   1. Wij sturen de klant naar de activatie-URL met referenceKey = company_id.
//   2. De klant logt in bij SnelStart en bevestigt de koppeling.
//   3. SnelStart POST de koppelsleutel naar onze webhook — niet naar de browser.
//   4. De browser komt terug op successUrl. De sleutel kan op dat moment nog
//      onderweg zijn; daarom wacht de retourpagina hem af (zie RETOUR_PARAM).
//
// Belangrijk voor stap 4: de koppeling is NIET rond op het moment dat de
// browser terugkeert. De webhook is de bron van waarheid, de retourpagina toont
// alleen wat er inmiddels binnen is.

const ENV_SHORTNAME = (import.meta.env?.VITE_SNELSTART_APP_SHORTNAME || '').trim();

/** Door SnelStart uitgegeven bij certificering. Leeg = flow nog niet actief. */
const INGEVULDE_SHORTNAME = ''; // ← hier de AppShortName van SnelStart invullen

export const SNELSTART_APP_SHORTNAME = ENV_SHORTNAME || INGEVULDE_SHORTNAME;

const ACTIVATIE_BASIS = 'https://web.snelstart.nl/couplings/activate';

/** Queryparameter waarmee SnelStart ons terugstuurt naar de integratiepagina. */
export const RETOUR_PARAM = 'snelstart';
export const RETOUR_WAARDE = 'gekoppeld';

/** Is de activatieflow bruikbaar? Zo niet: handmatige invoer tonen. */
export function activatieBeschikbaar() {
  return !!SNELSTART_APP_SHORTNAME;
}

/** Waar SnelStart de klant naartoe terugstuurt als hij klaar is. */
export function bouwRetourUrl(origin = window.location.origin) {
  return `${origin}/dashboard/instellingen?tab=integraties&${RETOUR_PARAM}=${RETOUR_WAARDE}`;
}

/**
 * De activatie-URL voor één bedrijf, of null als de flow nog niet aan staat.
 * referenceKey is ons company_id: daarmee weet de webhook straks bij wie de
 * binnenkomende koppelsleutel hoort.
 */
export function bouwActivatieUrl(companyId, { origin } = {}) {
  if (!activatieBeschikbaar() || !companyId) return null;
  const url = new URL(`${ACTIVATIE_BASIS}/${encodeURIComponent(SNELSTART_APP_SHORTNAME)}`);
  url.searchParams.set('referenceKey', companyId);
  url.searchParams.set('successUrl', bouwRetourUrl(origin));
  return url.toString();
}
