import { supabase } from '../lib/supabase'

// Korte link (10 minuten) naar een handtekening of ondertekende PDF, via de
// Edge Function document-url. Met `token` (klantlink) of `id` (ingelogd).
//
// Terugval: lukt de korte route niet, dan de opgeslagen link zolang die geldig
// is (oude rijen: 10 jaar; nieuwe rijen: 24 uur, zie _shared/documentLink.ts).
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
