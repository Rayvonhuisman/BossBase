import { createContext, useContext } from 'react';

export const ProfileContext = createContext({
  user: null,
  profile: null,
  company: null,
  loading: false,
  error: null,
  refresh: () => {},
  setProfile: () => {},
});

export const useProfile = () => useContext(ProfileContext);

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
