import { supabase } from '../lib/supabase'

export async function getBtwPeriodes(periodeType = 'kwartaal') {
  const { data, error } = await supabase
    .from('btw_periodes')
    .select('*')
    .eq('periode_type', periodeType)
    .order('periode_start', { ascending: false })
    .limit(8)
  if (error) throw error
  return data || []
}

export async function syncBtwData(periodeType = 'kwartaal') {
  // Beide boekhoudkoppelingen best-effort: de niet-gekoppelde provider
  // antwoordt "niet geconfigureerd" en doet niets. SnelStart negeert
  // periode_type — de periode zit in de aangifte zelf.
  const [mb, ss] = await Promise.allSettled([
    supabase.functions.invoke('moneybird-sync-btw', { body: { periode_type: periodeType } }),
    supabase.functions.invoke('snelstart-sync-btw', { body: {} }),
  ])
  const results = [mb, ss]
    .filter(r => r.status === 'fulfilled' && !r.value.error)
    .map(r => r.value.data)
  const ok = results.find(d => d?.success)
  if (ok) return ok
  if (results.length) return results[0]
  throw new Error('BTW-synchronisatie mislukt')
}
