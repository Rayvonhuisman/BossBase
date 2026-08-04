// Read-only: de teksten op één plek.
//
// De database bepaalt óf een account read-only is (bb_readonly_reden) en waarom;
// hier staat wat de klant daarover te lezen krijgt. Eén bron, zodat de banner,
// de blokkademelding en het abonnementsscherm nooit uit elkaar lopen.
//
// Toon: uitleggend, niet bestraffend. Wie hier terechtkomt is meestal iets
// vergeten of heeft een pas die verlopen is — geen wanbetaler. En het is zijn
// eigen administratie die hij voor zich ziet.

export const READONLY_REDENEN = {
  proefperiode_verlopen: {
    titel: 'Je gratis periode is voorbij',
    uitleg: 'Je kunt alles blijven bekijken, zoeken en exporteren. Nieuwe klanten, '
          + 'offertes en facturen aanmaken kan weer zodra je een abonnement kiest.',
    knop: 'Abonnement kiezen',
  },
  betaling_mislukt: {
    titel: 'Je laatste betaling is niet gelukt',
    uitleg: 'Daardoor staat je account tijdelijk op alleen-lezen. Werk je betaalgegevens '
          + 'bij en alles gaat direct weer open.',
    knop: 'Betaalgegevens bijwerken',
  },
  opgezegd: {
    titel: 'Je abonnement is gestopt',
    uitleg: 'Je gegevens staan er nog gewoon en blijven bewaard. Je kunt ze bekijken en '
          + 'exporteren; nieuw werk vastleggen kan weer met een abonnement.',
    knop: 'Opnieuw abonneren',
  },
}

// Vangnet: onbekende of ontbrekende reden. Kan alleen voorkomen als de database
// een nieuwe reden kent die de frontend nog niet heeft — dan liever een nette
// algemene tekst dan een lege banner.
export const READONLY_ALGEMEEN = {
  titel: 'Je account staat op alleen-lezen',
  uitleg: 'Je kunt alles bekijken, zoeken en exporteren. Nieuw werk vastleggen kan weer '
        + 'zodra er een lopend abonnement is.',
  knop: 'Abonnement regelen',
}

export function readonlyTekst(reden) {
  return READONLY_REDENEN[reden] || READONLY_ALGEMEEN
}

// Wat blijft er werken? Dit noemen we expliciet, want de eerste gedachte bij
// "alleen-lezen" is "ben ik mijn gegevens kwijt?". Het antwoord is nee.
export const READONLY_BLIJFT_WERKEN = [
  'Alles bekijken, zoeken en filteren',
  'Exporteren naar CSV of Excel',
  'Facturen op betaald zetten',
  'Binnenkomende aanvragen van je website',
]

// De regel die het vaakst gerustgesteld moet worden.
export const READONLY_BEWAARD =
  'Je gegevens blijven bewaard en zijn meteen weer volledig beschikbaar zodra je abonnement loopt.'

// Herkent de foutmelding die de database teruggeeft als een schrijfactie op een
// read-only account strandt. Zowel de trigger (RAISE ... HINT 'readonly') als een
// geweigerde restrictive policy komen hier langs; die laatste geeft geen eigen
// tekst, dus daar herkennen we de standaard RLS-fout.
//
// Let op: een geweigerde policy geeft 42501 zonder te zeggen wélke gate hem
// tegenhield — een bereikte limiet ziet er identiek uit. Roep dit dus alleen aan
// als je al weet dat het bedrijf read-only is (plan.readonly).
export function isReadonlyFout(error) {
  const tekst = `${error?.message || ''} ${error?.hint || ''} ${error?.details || ''}`.toLowerCase()
  if (tekst.includes('readonly')) return true
  return error?.code === '42501' || tekst.includes('row-level security')
}

// Vertaalt de rauwe databasemelding van een geweigerde plan-gate naar iets wat
// een dakdekker begrijpt. De knoppen die we kennen zijn vooraf afgevangen
// (usePlanGuard); dit is het vangnet voor alles wat we níét als knop hebben
// afgeschermd — een notitie, een uploadje, een uur dat wordt geboekt.
//
// "new row violates row-level security policy for table offertes" is voor ons
// een prima foutmelding en voor een klant een muur. Eén regel Nederlands eronder
// scheelt een supportgesprek.
const PLAN_FOUT =
  'Dit past niet binnen je huidige abonnement. Kijk bij Instellingen → Abonnement.'
const READONLY_FOUT =
  'Je account staat op alleen-lezen. Bekijken en exporteren kan gewoon; '
  + 'nieuw werk vastleggen kan weer zodra je abonnement loopt. '
  + 'Regel het bij Instellingen → Abonnement.'

export function nettePlanFout(bericht) {
  const tekst = String(bericht ?? '')
  const laag = tekst.toLowerCase()
  if (laag.includes('readonly')) return READONLY_FOUT
  if (laag.includes('row-level security') || laag.includes('row level security')) return PLAN_FOUT
  return tekst
}
