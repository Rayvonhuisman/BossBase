import { createContext, useContext } from 'react';
import { DEFAULT_TIER } from './tiers.js';

export const ProfileContext = createContext({
  user: null,
  profile: null,
  company: null,
  userPermissions: [],
  // Abonnementsstand uit get_plan_status(): tier, trial, modules, features en
  // per limiet de stand. Zie usePlan().
  planStatus: null,
  loading: false,
  error: null,
  refresh: () => {},
  setProfile: () => {},
});

export const useProfile = () => useContext(ProfileContext);

// Abonnementstier van het huidige bedrijf ('starter' | 'groei' | 'team').
//
// Let op: gebruik dit NIET om functionaliteit aan of uit te zetten. Daarvoor is
// usePlan() er — die leest de centrale feature-/limietmatrix (src/lib/features.js)
// en spiegelt exact wat de server afdwingt. Losse tier-vergelijkingen zoals
// `tier === 'team'` horen nergens meer in de code te staan.
export const useTier = () => {
  const { company, planStatus } = useProfile();
  return planStatus?.tier || company?.tier || DEFAULT_TIER;
};

// Derives the display name in priority order: profile.full_name → user.email
// local-part → null. Returns null (not '??') when nothing is available so the
// UI can render a skeleton instead of a placeholder.
export const displayName = (profile, user) => {
  if (profile?.fullName) return profile.fullName;
  const email = profile?.email || user?.email;
  if (email) return email.split('@')[0];
  return '';
};

export const profileInitials = (profile, user) => {
  const name = profile?.fullName || '';
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const email = profile?.email || user?.email;
  if (email) return email.charAt(0).toUpperCase();
  return '';
};
