import { supabase } from '../lib/supabase'

// De grafiekcijfers van het dashboard, opgeteld door de database.
//
// Het dashboard haalde hiervoor alle facturen (218) en alle kostenregels (1257)
// op om zes maanden omzet en winst te tekenen, plus de verdeling van
// factuurstatussen en de zes duurste klanten. Dat duurde vier seconden op de
// eerste pagina die iedereen ziet.
//
// De definities in bb_dashboard_aggregaten zijn letterlijk die van
// deriveCharts(), inclusief de terugval van kosten naar de klant van hun deal.
// Zie migratie 20260919180000.
//
// De presentatie blijft in de component: hier komen kale cijfers terug, geen
// labels of kleuren.

const getal = v => Number(v || 0)

/**
 * @param {number} maanden aantal maanden in de reeks, inclusief de huidige
 * @returns {Promise<{maanden: Array<{maand:string, omzet:number, winst:number}>,
 *                    factuurstatus: Record<string, number>,
 *                    kostenPerKlant: Array<{klant:string, bedrag:number}>}>}
 */
export async function getDashboardAggregaten(maanden = 6) {
  const { data, error } = await supabase.rpc('bb_dashboard_aggregaten', { p_maanden: maanden })
  if (error) throw error
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
  }
}
