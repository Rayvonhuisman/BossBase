import { supabase } from '../lib/supabase'

// Korte link (10 minuten) naar een handtekening of ondertekende PDF, via de
// Edge Function document-url. Met `token` (klantlink) of `id` (ingelogd).
//
// Overgang: rijen van vóór deze wijziging bevatten nog een lange ondertekende
// URL. Lukt de korte route niet, dan gebruiken we die zolang hij geldig is.
// Nieuwe rijen bevatten alleen een verwijzing "<bucket>/<pad>"; daarvoor is er
// geen terugval.
export async function documentUrl({ soort, id, token, opgeslagen }) {
  try {
    const { data, error } = await supabase.functions.invoke('document-url', {
      body: token ? { soort, token } : { soort, id },
    })
    if (!error && data?.url) return data.url
  } catch {
    // val terug op de opgeslagen link
  }
  return /^https?:\/\//.test(opgeslagen || '') ? opgeslagen : null
}
