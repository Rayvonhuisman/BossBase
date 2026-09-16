import { supabase } from '../lib/supabase.js'

// Vangnet voor een ontbrekende ondertekende PDF.
//
// De PDF wordt normaal in de browser van de KLANT gemaakt, tijdens het tekenen.
// Mislukt dat, dan is de handtekening wél vastgelegd maar het document niet: de
// bevestigingsmails gingen zonder bijlage weg en er was niets opgeslagen.
//
// Zodra iemand van het bedrijf de offerte of werkbon opent, maakt de app het
// document alsnog met dezelfde opmaakcode en stuurt het hierheen. De server
// bewaart het, zet de link en stuurt de bijlage na aan klant en bedrijf.
//
// Openen twee mensen tegelijk, dan wint er precies één: de server claimt via de
// update die de link zet. De verliezer krijgt `nagezonden: false` terug.

/** true zodra een getekend document zijn PDF mist. */
export const mistGetekendePdf = (getekendOp, pdfUrl) => !!getekendOp && !pdfUrl

/**
 * Stuurt een alsnog gemaakte PDF naar de server.
 * @returns {Promise<{nagezonden: boolean, reden?: string, warnings?: string[]}>}
 */
export async function stuurGetekendePdfNa({ soort, id, pdfBase64 }) {
  if (!soort || !id || !pdfBase64) throw new Error('soort, id en pdfBase64 zijn verplicht')
  const { data, error } = await supabase.functions.invoke('getekende-pdf-nazenden', {
    body: { soort, id, pdf_base64: pdfBase64 },
  })
  if (error) {
    let melding = null
    try { const b = await error.context?.json(); if (b?.error) melding = b.error } catch { /* geen json */ }
    throw new Error(melding || 'De ontbrekende PDF kon niet worden nagestuurd.')
  }
  if (data?.error) throw new Error(data.error)
  return data || { nagezonden: false }
}
