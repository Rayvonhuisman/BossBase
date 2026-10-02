import { listCustomers } from "./customerService"
import { getFacturen } from "./factuurService"

// Enige bron voor de bedragen per klant: "Gefactureerd" (total), "Betaald"
// (paid) en "Openstaand". Dit is de werkelijke waarde van een klant, dus puur
// op basis van facturen — offertes tellen niet mee, ook geaccepteerde niet.
// De customers-tabel kent deze kolommen niet; customerService levert ze bewust
// niet, wie ze nodig heeft haalt ze hier op.
//
// Elke pagina rekende dit eerder zelf uit, met vier verschillende definities:
// de klantenlijst toonde overal €0, de klantkaart telde concept-offertes mee,
// en de database-export vergat gecrediteerde facturen af te trekken.

// Een creditfactuur (isCredit) en de factuur die daarmee is teruggedraaid
// (gecrediteerd) tellen niet mee als ontvangen geld.
export const isRealFactuur = f => !f.isCredit && !f.gecrediteerd

// Gefactureerd = wat de klant in rekening is gebracht. Een concept is nog niet
// de deur uit en telt niet mee. Creditfacturen staan met een negatief bedrag in
// de boeken en trekken zichzelf er dus vanzelf weer af — daardoor klopt ook een
// gedeeltelijke creditering (factuur €127,35, creditnota €119,79 → €7,56 blijft
// openstaan) in plaats van dat het hele bedrag verdwijnt.
export const isGefactureerdeFactuur = f => f.status !== "concept"

export const isBetaaldeFactuur = f => isRealFactuur(f) && f.status === "betaald"

const sumIncl = (rows, pred) =>
  rows.filter(pred).reduce((s, r) => s + (r.totaalIncl || 0), 0)

export const sumGefactureerd = (facturen = []) => sumIncl(facturen, isGefactureerdeFactuur)
export const sumBetaald      = (facturen = []) => sumIncl(facturen, isBetaaldeFactuur)

// Zelfde selectie facturen, maar exclusief BTW. Het dashboard rekent hiermee,
// omdat winst = omzet − kosten alleen klopt als de BTW er aan beide kanten uit
// is. Bewust een aparte functie: "omzet" (excl. BTW) en "gefactureerd"
// (incl. BTW) zijn verschillende bedragen en horen niet dezelfde naam te delen.
export const sumOmzetExclBtw = (facturen = []) =>
  facturen.filter(isGefactureerdeFactuur).reduce((s, f) => s + (Number(f.totaalExcl) || 0), 0)

// Openstaand — één definitie, gelijk aan de database (bb_openstaand_per_factuur,
// migratie 20261002135544): een verstuurde, nog niet betaalde factuur (status
// verzonden of geboekt), geen creditnota zelf, met als bedrag zijn totaal plus
// de creditnota's die naar hem verwijzen, nooit onder 0. Een creditnota op een
// al betaalde factuur is geld dat terug moet, geen openstaande vordering.
// Vroeger was dit "gefactureerd − betaald", waardoor een betaalde en daarna
// gecrediteerde factuur als openstaand telde (audit 2026-10-01, M18).
export function openstaandPerFactuur(facturen = []) {
  const credits = new Map()
  facturen.forEach(f => {
    if (f.isCredit && f.creditVanFactuurId && f.status !== "concept") {
      credits.set(f.creditVanFactuurId, (credits.get(f.creditVanFactuurId) || 0) + (f.totaalIncl || 0))
    }
  })
  return facturen
    .filter(f => !f.isCredit && ["verzonden", "geboekt"].includes(f.status))
    .map(f => ({ factuur: f, bedrag: Math.max(0, Math.round(((f.totaalIncl || 0) + (credits.get(f.id) || 0)) * 100) / 100) }))
}

export const sumOpenstaand = (facturen = []) =>
  Math.round(openstaandPerFactuur(facturen).reduce((s, o) => s + o.bedrag, 0) * 100) / 100

// Map<customerId, { total, paid, openstaand }> voor lijstweergaven die alle
// facturen in één keer inlezen.
export function buildCustomerTotals({ facturen = [] } = {}) {
  const totals = new Map()
  const entry = id => {
    if (!totals.has(id)) totals.set(id, { total: 0, paid: 0, openstaand: 0 })
    return totals.get(id)
  }
  facturen.forEach(f => {
    if (!f.customerId || !isGefactureerdeFactuur(f)) return
    const t = entry(f.customerId)
    t.total += f.totaalIncl || 0
    if (isBetaaldeFactuur(f)) t.paid += f.totaalIncl || 0
  })
  openstaandPerFactuur(facturen).forEach(({ factuur, bedrag }) => {
    if (factuur.customerId) entry(factuur.customerId).openstaand += bedrag
  })
  return totals
}

const NUL_TOTALEN = { total: 0, paid: 0, openstaand: 0 }

// Verrijkt klantobjecten met total/paid/openstaand. Gebruik dit als de pagina de
// facturen toch al heeft ingeladen.
export function withCustomerTotals(customers = [], { facturen = [] } = {}) {
  const totals = buildCustomerTotals({ facturen })
  return customers.map(c => ({ ...c, ...(totals.get(c.id) || NUL_TOTALEN) }))
}

// Bedragen voor één klant, uit de facturen die de klantkaart al ophaalt.
export function customerTotals({ facturen = [] } = {}) {
  const total = sumGefactureerd(facturen)
  const paid = sumBetaald(facturen)
  return { total, paid, openstaand: sumOpenstaand(facturen) }
}

// Klantenlijst inclusief bedragen, voor pagina's die verder niets met facturen doen.
export async function listCustomersWithTotals() {
  const [customers, facturen] = await Promise.all([listCustomers(), getFacturen()])
  return withCustomerTotals(customers, { facturen })
}
