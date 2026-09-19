import { supabase } from '../lib/supabase'

// De cijfers van Financiën, opgeteld door de database.
//
// De pagina haalde hiervoor vijf volledige tabellen op om zes getallen te tonen
// (218 facturen, 758 factuurregels, 1257 kostenregels, 187 offertes, 176
// klanten) en telde ze in de browser op. Dat duurde op de productiebuild zeven
// seconden, en het wordt erger naarmate een bedrijf groeit.
//
// De definities in bb_financien_kpi zijn letterlijk die van
// customerTotalsService, zodat er geen cent verschuift ten opzichte van wat de
// klantenlijst en de klantkaart tonen. Zie migratie 20260919160000.
//
// RLS blijft gelden (de functie is security invoker), dus er gaat bewust géén
// company_id mee: die zou je kunnen invullen met het id van een ander bedrijf.

const getal = v => Number(v || 0)

/**
 * @param {{van: string, tot: string}} bereik ISO-datums, inclusief
 * @returns {Promise<{gefactureerd:number, ontvangen:number, openstaand:number,
 *                    teVerwachten:number, kosten:number}>}
 */
export async function getFinancienKpi({ van, tot }) {
  const { data, error } = await supabase.rpc('bb_financien_kpi', { p_van: van, p_tot: tot })
  if (error) throw error
  return {
    gefactureerd: getal(data?.gefactureerd),
    ontvangen: getal(data?.ontvangen),
    openstaand: getal(data?.openstaand),
    teVerwachten: getal(data?.te_verwachten),
    kosten: getal(data?.kosten),
  }
}
