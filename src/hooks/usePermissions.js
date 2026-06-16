import { useProfile } from '../lib/profileContext.jsx'

export function usePermissions() {
  const { profile, userPermissions } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const can = (permission) => {
    if (!profile) return false
    if (isAdmin) return true
    return Array.isArray(userPermissions) && userPermissions.includes(permission)
  }

  return { can, isAdmin }
}
