// Periodekeuze: week, maand, kwartaal of jaar, met vooruit en terug bladeren.
//
// Bewust met lokale datumonderdelen gerekend en niet met toISOString(): die
// zet om naar UTC, en dan valt 1 januari 00:00 in Nederland op 31 december.
// Een kost op de eerste of laatste dag van een periode viel daardoor buiten
// het filter.

export const PERIODE_TYPES = [
  { id: 'week', label: 'Week' },
  { id: 'maand', label: 'Maand' },
  { id: 'kwartaal', label: 'Kwartaal' },
  { id: 'jaar', label: 'Jaar' },
]

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** Datum als 'YYYY-MM-DD' in de lokale tijdzone. */
export const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const hoofdletter = s => s.charAt(0).toUpperCase() + s.slice(1)

// ISO-weeknummer: de week met de donderdag erin bepaalt het nummer, en week 1
// is de week met 4 januari. Zo telt Nederland de weken.
function isoWeekNummer(d) {
  const doel = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // Naar de donderdag van deze week (maandag = 1 … zondag = 7).
  const dag = (doel.getDay() + 6) % 7
  doel.setDate(doel.getDate() - dag + 3)
  const eersteDonderdag = new Date(doel.getFullYear(), 0, 4)
  const dagVanEerste = (eersteDonderdag.getDay() + 6) % 7
  eersteDonderdag.setDate(eersteDonderdag.getDate() - dagVanEerste + 3)
  const weken = Math.round((doel - eersteDonderdag) / (7 * 24 * 3600 * 1000))
  return { week: weken + 1, jaar: doel.getFullYear() }
}

/**
 * Begin, eind en label van een periode.
 *
 * @param {string} type    'week' | 'maand' | 'kwartaal' | 'jaar'
 * @param {number} offset  0 = de huidige periode, -1 = de vorige, 1 = de volgende
 * @param {Date}   vandaag alleen voor tests
 * @returns {{ start: string, eind: string, label: string }} datums inclusief
 */
export function periodeRange(type, offset = 0, vandaag = new Date()) {
  const j = vandaag.getFullYear()
  const m = vandaag.getMonth()

  if (type === 'week') {
    // Maandag als eerste dag, net als de planning.
    const dag = (vandaag.getDay() + 6) % 7
    const start = new Date(j, m, vandaag.getDate() - dag + offset * 7)
    const eind = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    const { week, jaar } = isoWeekNummer(start)
    const zelfdeMaand = start.getMonth() === eind.getMonth()
    const bereik = zelfdeMaand
      ? `${start.getDate()}–${eind.getDate()} ${MAANDEN_KORT[eind.getMonth()]}`
      : `${start.getDate()} ${MAANDEN_KORT[start.getMonth()]} – ${eind.getDate()} ${MAANDEN_KORT[eind.getMonth()]}`
    return { start: iso(start), eind: iso(eind), label: `Week ${week} · ${bereik} ${jaar}` }
  }

  if (type === 'kwartaal') {
    // Date normaliseert een maand buiten 0–11 vanzelf naar het juiste jaar.
    const kwartaalStart = Math.floor(m / 3) * 3 + offset * 3
    const start = new Date(j, kwartaalStart, 1)
    const eind = new Date(j, kwartaalStart + 3, 0)
    return {
      start: iso(start), eind: iso(eind),
      label: `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`,
    }
  }

  if (type === 'jaar') {
    const start = new Date(j + offset, 0, 1)
    const eind = new Date(j + offset, 11, 31)
    return { start: iso(start), eind: iso(eind), label: String(start.getFullYear()) }
  }

  // maand (ook de terugval bij een onbekend type)
  const start = new Date(j, m + offset, 1)
  const eind = new Date(j, m + offset + 1, 0)
  return {
    start: iso(start), eind: iso(eind),
    label: `${hoofdletter(MAANDEN[start.getMonth()])} ${start.getFullYear()}`,
  }
}

/** Valt een datum ('YYYY-MM-DD') binnen de periode? Lege datum telt niet mee. */
export const inPeriode = (datum, { start, eind }) => {
  if (!datum) return false
  const d = String(datum).slice(0, 10)
  return d >= start && d <= eind
}
