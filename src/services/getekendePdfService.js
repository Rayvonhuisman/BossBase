import { supabase } from '../lib/supabase.js'

// Vangnet voor een ontbrekende ondertekende PDF.
//
// Het ondertekende exemplaar maakt de server tijdens het tekenen. Mislukte dat,
// dan is de handtekening wél vastgelegd maar het document niet. Zodra iemand van
// het bedrijf de offerte of werkbon opent, vraagt de app de server het alsnog te
// maken; die bewaart het, zet de link en stuurt de bijlage na. De app stuurt zelf
// geen PDF meer mee: een exemplaar uit de browser is niet te vertrouwen.
//
// Openen twee mensen tegelijk, dan wint er precies één: de server claimt via de
// update die de link zet. De verliezer krijgt `nagezonden: false` terug.

/** true zodra een getekend document zijn PDF mist. */
export const mistGetekendePdf = (getekendOp, pdfUrl) => !!getekendOp && !pdfUrl

/**
 * Laat de server het ontbrekende ondertekende exemplaar alsnog maken en nasturen.
 * @returns {Promise<{nagezonden: boolean, reden?: string, warnings?: string[]}>}
 */
export async function stuurGetekendePdfNa({ soort, id }) {
  if (!soort || !id) throw new Error('soort en id zijn verplicht')
  const { data, error } = await supabase.functions.invoke('getekende-pdf-nazenden', {
    body: { soort, id },
  })
  if (error) {
    let melding = null
    try { const b = await error.context?.json(); if (b?.error) melding = b.error } catch { /* geen json */ }
    throw new Error(melding || 'De ontbrekende PDF kon niet worden nagestuurd.')
  }
  if (data?.error) throw new Error(data.error)
  return data || { nagezonden: false }
}
