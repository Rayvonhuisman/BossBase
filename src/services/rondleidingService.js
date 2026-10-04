import { supabase } from '../lib/supabase'

// Welke rondleidingen deze gebruiker al heeft gezien (of overgeslagen).
//
// Per gebruiker in de database, niet in localStorage: wie op een andere
// computer inlogt, moet een rondleiding die hij al kent niet opnieuw krijgen.
// Zie migratie 20261001140557_rondleiding_gezien.

async function mijnId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id || null
}

/** Set met de pagina's waarvan de rondleiding al is gezien. */
export async function getGezien() {
  const { data, error } = await supabase
    .from('rondleiding_gezien')
    .select('pagina')
  if (error) throw error
  return new Set((data || []).map(r => r.pagina))
}

/** Markeert een of meer pagina's als gezien. Dubbel markeren is geen fout. */
export async function markeerGezien(paginas) {
  const lijst = Array.isArray(paginas) ? paginas : [paginas]
  const userId = await mijnId()
  if (!userId || lijst.length === 0) return
  const { error } = await supabase
    .from('rondleiding_gezien')
    .upsert(lijst.map(pagina => ({ user_id: userId, pagina })), { onConflict: 'user_id,pagina', ignoreDuplicates: true })
  if (error) throw error
}

/** "Rondleidingen opnieuw starten": alles weer als niet gezien. */
export async function resetGezien() {
  const userId = await mijnId()
  if (!userId) return
  const { error } = await supabase
    .from('rondleiding_gezien')
    .delete()
    .eq('user_id', userId)
  if (error) throw error
}
