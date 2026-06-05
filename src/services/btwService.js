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
  const { data, error } = await supabase.functions.invoke('moneybird-sync-btw', {
    body: { periode_type: periodeType },
  })
  if (error) throw error
  return data
}
