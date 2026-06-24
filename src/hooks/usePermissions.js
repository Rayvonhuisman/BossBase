import { useProfile } from '../lib/profileContext.jsx'

export function usePermissions() {
  const { profile, userPermissions } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const can = (permission) => {
    if (!profile) return false
    if (isAdmin) return true
    // 'planner' is geen aparte rol meer maar een medewerker met planning-recht.
    // Bestaande planner-accounts behouden zo hun planning-toegang.
    if (profile.role === 'planner' && permission === 'planning') return true
    return Array.isArray(userPermissions) && userPermissions.includes(permission)
  }

  return { can, isAdmin }
}
