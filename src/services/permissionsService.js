import { supabase } from '../lib/supabase.js'

// Haal alle verleende permissies op voor een gebruiker (array van permission strings)
export async function getUserPermissions(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', userId)
    .eq('granted', true)
  if (error) throw error
  return (data || []).map(r => r.permission)
}

// Sla permissies op voor een gebruiker (vervangt alle bestaande permissies)
// permissions: array van permission strings die granted = true zijn
export async function setUserPermissions(userId, companyId, grantedPermissions) {
  if (!userId || !companyId) throw new Error('userId en companyId zijn verplicht')

  // Verwijder eerst alle bestaande rechten voor deze gebruiker
  const { error: delError } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId)
  if (delError) throw delError

  if (grantedPermissions.length === 0) return

  const rows = grantedPermissions.map(permission => ({
    user_id: userId,
    company_id: companyId,
    permission,
    granted: true,
  }))

  const { error } = await supabase
    .from('user_permissions')
    .insert(rows)
  if (error) throw error
}
