import { supabase } from '../lib/supabase'

// Profile photo storage helpers.
//
// Storage path convention (matches migration 018_profile_avatars.sql RLS):
//   avatars/<company_id>/<owner_id>/<filename>
// Where <owner_id> is either:
//   • a profiles.id (= auth.uid) when the user uploads their own photo
//   • a company_members.id when an admin uploads a team member photo
//
// The bucket is public so we can stash the public URL on the row directly;
// RLS still gates write access to the user's own company.

const BUCKET = 'avatars'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — matches bucket file_size_limit
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function validateAvatarFile(file) {
  if (!file) throw new Error('Geen bestand geselecteerd')
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Alleen JPG, PNG of WEBP zijn toegestaan')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Maximaal 5 MB per foto')
  }
}

function buildPath({ companyId, ownerId, file }) {
  if (!companyId) throw new Error('Bedrijf ontbreekt — log opnieuw in')
  if (!ownerId) throw new Error('Eigenaar ontbreekt')
  const ext = EXT_BY_MIME[file.type] || 'jpg'
  // Timestamp suffix busts CDN/browser cache when replacing the photo.
  return `${companyId}/${ownerId}/avatar-${Date.now()}.${ext}`
}

async function uploadToStorage({ companyId, ownerId, file }) {
  validateAvatarFile(file)
  const path = buildPath({ companyId, ownerId, file })
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
  if (upErr) throw upErr
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, publicUrl: pub.publicUrl }
}

// Best-effort removal — used to clean up the previous avatar after a successful
// upload. Failures are non-fatal; the orphaned file will hang around but the
// new photo is already live.
async function removeFromStorage(publicUrlOrPath) {
  if (!publicUrlOrPath) return
  const path = toStoragePath(publicUrlOrPath)
  if (!path) return
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[bb:avatar] cleanup failed', err)
  }
}

// Turn a full public URL back into the bucket-relative storage path, e.g.
// https://<ref>.supabase.co/storage/v1/object/public/avatars/<company>/<owner>/file.jpg
//   → <company>/<owner>/file.jpg
// Pass-through if the input already looks like a storage path.
export function toStoragePath(value) {
  if (!value) return null
  const marker = `/object/public/${BUCKET}/`
  const i = value.indexOf(marker)
  if (i >= 0) return value.slice(i + marker.length)
  if (value.startsWith(`${BUCKET}/`)) return value.slice(BUCKET.length + 1)
  return value // assume already a path
}

// ── Profile (logged-in user) ────────────────────────────────────────────────

export async function uploadProfileAvatar({ profileId, companyId, file, previousUrl }) {
  const { publicUrl } = await uploadToStorage({ companyId, ownerId: profileId, file })
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', profileId)
    .select('avatar_url')
    .single()
  if (error) throw error
  removeFromStorage(previousUrl)
  return data.avatar_url
}

export async function removeProfileAvatar({ profileId, previousUrl }) {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', profileId)
  if (error) throw error
  removeFromStorage(previousUrl)
}

// ── Team member (admin acts on behalf of) ───────────────────────────────────

export async function uploadTeamMemberAvatar({ memberId, companyId, file, previousUrl }) {
  const { publicUrl } = await uploadToStorage({ companyId, ownerId: memberId, file })
  const { data, error } = await supabase
    .from('company_members')
    .update({ avatar_url: publicUrl })
    .eq('id', memberId)
    .select('avatar_url')
    .single()
  if (error) throw error
  removeFromStorage(previousUrl)
  return data.avatar_url
}

export async function removeTeamMemberAvatar({ memberId, previousUrl }) {
  const { error } = await supabase
    .from('company_members')
    .update({ avatar_url: null })
    .eq('id', memberId)
  if (error) throw error
  removeFromStorage(previousUrl)
}
