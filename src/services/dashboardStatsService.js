import { supabase } from '../lib/supabase'

// Alle cijfers van het dashboard, opgeteld door de database.
//
// Het dashboard haalde hiervoor alle facturen (218) en alle kostenregels (1257)
// op: voor vier grafieken én voor zes losse widgets (omzet, winst en kosten
// deze maand, kosten per klus, de lijst openstaande facturen, factuurstatus).
// Dat duurde vier seconden op de eerste pagina die iedereen ziet.
//
// De definities in bb_dashboard_aggregaten zijn letterlijk die van
// deriveCharts() en de widgets, inclusief de randgevallen die daar met reden
// in zitten: kosten zonder klus tellen niet mee in het gemiddelde per klus
// (ze staan apart als "overig"), en creditfacturen tellen niet mee in het
// openstaande bedrag maar worden apart vermeld. Zie migraties 20260919180000
// en 20260919190000.
//
// De presentatie blijft in de componenten: hier komen kale cijfers terug, geen
// labels, kleuren of formattering.

const getal = v => Number(v || 0)

/**
 * @param {number} maanden aantal maanden in de reeks, inclusief de huidige
 * @returns {Promise<object>} maanden, factuurstatus, kostenPerKlant, dezeMaand,
 *                            kostenPerKlus, openFacturen
 */
export async function getDashboardAggregaten(maanden = 6) {
  const { data, error } = await supabase.rpc('bb_dashboard_aggregaten', { p_maanden: maanden })
  if (error) throw error

  const dm = data?.deze_maand || {}
  const kpk = data?.kosten_per_klus || {}
  const of = data?.open_facturen || {}

  return {
    maanden: (data?.maanden || []).map(m => ({
      maand: m.maand,
      omzet: getal(m.omzet),
      winst: getal(m.winst),
    })),
    factuurstatus: data?.factuurstatus || {},
    kostenPerKlant: (data?.kosten_per_klant || []).map(k => ({
      klant: k.klant,
      bedrag: getal(k.bedrag),
    })),
    dezeMaand: {
      omzet: getal(dm.omzet),
      kosten: getal(dm.kosten),
      kostenposten: getal(dm.kostenposten),
      winst: getal(dm.winst),
    },
    kostenPerKlus: {
      klussen: getal(kpk.klussen),
      gemiddeld: getal(kpk.gemiddeld),
      overig: getal(kpk.overig),
    },
    openFacturen: {
      aantal: getal(of.aantal),
      bedrag: getal(of.bedrag),
      creditsAantal: getal(of.credits_aantal),
      creditsBedrag: getal(of.credits_bedrag),
      lijst: (of.lijst || []).map(f => ({
        id: f.id,
        nummer: f.nummer,
        klant: f.klant,
        totaalIncl: getal(f.totaal_incl),
        vervaldatum: f.vervaldatum,
      })),
    },
  }
}
