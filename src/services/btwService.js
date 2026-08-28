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
  // Alleen Moneybird. SnelStart stond hier ook in, maar de scope
  // btwaangiftes:read komt er niet: die aanroep kon alleen maar 403 opleveren.
  // Daarmee vervalt ook de reden voor de allSettled-constructie — er is nog maar
  // één bron, dus een fout mag gewoon naar boven.
  const { data, error } = await supabase.functions.invoke('moneybird-sync-btw', {
    body: { periode_type: periodeType },
  })
  if (error) throw error
  if (!data) throw new Error('BTW-synchronisatie mislukt')
  return data
}
