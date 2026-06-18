import { supabase } from "../lib/supabase"

// Real DB columns:
// profiles: id, company_id, full_name, role, avatar_url, created_at
// companies: id, name, email, kvk, btw_number, phone, address, city, postal_code,
//            website, logo_url, created_at, updated_at
// `email` for the user lives on auth.user, not in profiles.

const toProfile = (row, user) => ({
  id: row.id,
  companyId: row.company_id || null,
  fullName: row.full_name || "",
  email: user?.email || "",
  role: row.role || "user",
  avatarUrl: row.avatar_url || "",
  createdAt: row.created_at || null,
  isSuperAdmin: row.is_super_admin || false,
  raw: row,
})

const toCompany = row => ({
  id: row.id,
  name: row.name || "",
  email: row.email || "",
  phone: row.phone || "",
  kvk: row.kvk || "",
  btwNumber: row.btw_number || "",
  address: row.address || "",
  city: row.city || "",
  postalCode: row.postal_code || "",
  website: row.website || "",
  logoUrl: row.logo_url || "",
  brandingColor: row.branding_color || '#f97316',
  status: row.status || 'actief',
  raw: row,
})

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data?.user || null
}

export async function getCurrentProfile() {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return toProfile(data, user)
}

export async function getCompany(companyId) {
  if (!companyId) return null
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle()
  if (error) throw error
  return data ? toCompany(data) : null
}

export async function getCurrentCompany() {
  const profile = await getCurrentProfile()
  if (!profile?.companyId) return null
  return getCompany(profile.companyId)
}

const DEV = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV
const debug = (...args) => { if (DEV) console.log("[bb:profile]", ...args) }

// Single source of truth for the dashboard header/sidebar/profile menu.
// Always returns { user, profile, company, profileError, companyError }.
// `profile === null` with `profileError === null` means the SELECT succeeded
// but returned zero rows — caller can treat this as a real "missing" state.
// If `profileError` is set, the SELECT itself failed (RLS, network, etc.)
// and the caller should surface the error rather than declaring "no profile".
export async function getCurrentUserContext() {
  const user = await getCurrentUser()
  debug("user", { id: user?.id, email: user?.email })
  if (!user) return { user: null, profile: null, company: null, profileError: null, companyError: null }

  let profile = null
  let profileError = null
  try {
    // profiles.id is the auth user id (no separate user_id column).
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
    debug("profile query", { data, error })
    if (error) profileError = error
    else if (data) profile = toProfile(data, user)
  } catch (err) {
    debug("profile exception", err)
    profileError = err
  }

  let company = null
  let companyError = null
  if (profile?.companyId) {
    try {
      company = await getCompany(profile.companyId)
      debug("company query", { id: profile.companyId, data: company })
    } catch (err) {
      debug("company exception", err)
      companyError = err
    }
  } else if (profile && !profile.companyId) {
    debug("profile has no company_id")
  }

  return { user, profile, company, profileError, companyError }
}

export async function updateProfile(id, input) {
  if (!id) throw new Error("Profiel-id ontbreekt")
  const allowed = {}
  if (input.full_name !== undefined) allowed.full_name = input.full_name
  if (input.role !== undefined) allowed.role = input.role
  if (input.company_id !== undefined) allowed.company_id = input.company_id
  const { data, error } = await supabase
    .from("profiles")
    .update(allowed)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  const user = await getCurrentUser()
  return toProfile(data, user)
}

export async function updateCompany(id, input) {
  if (!id) throw new Error("Bedrijfs-id ontbreekt")
  const allowed = {}
  for (const k of [
    "name", "email", "kvk", "btw_number", "phone",
    "address", "city", "postal_code", "website", "logo_url", "branding_color",
  ]) {
    if (input[k] !== undefined) allowed[k] = input[k]
  }
  const { data, error } = await supabase
    .from("companies")
    .update(allowed)
    .eq("id", id)
    .select()
    .maybeSingle()
  if (error) {
    console.error("[bb:updateCompany] query mislukt", { id, error })
    throw error
  }
  return data ? toCompany(data) : null
}
