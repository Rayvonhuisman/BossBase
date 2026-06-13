import { supabase } from "../lib/supabase"

// Default pipeline stages seeded on first registration. Names match the spec.
export const DEFAULT_PIPELINE_STAGES = [
  "Nieuwe aanvraag",
  "Contact opgenomen",
  "Afspraak gepland",
  "Offerte verstuurd",
  "Akkoord",
  "In uitvoering",
  "Afgerond",
]

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}

export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// Tries one set of columns first; if the DB rejects an unknown column, retries
// with that column removed. Lets us tolerate small schema drift without crashing.
async function insertWithFallback(table, payload, optionalKeys = []) {
  const tryOnce = async row => {
    const { data, error } = await supabase.from(table).insert(row).select().single()
    return { data, error }
  }
  let attempt = { ...payload }
  let result = await tryOnce(attempt)
  while (result.error && optionalKeys.length) {
    const msg = (result.error.message || "").toLowerCase()
    const droppedKey = optionalKeys.find(k => msg.includes(`'${k}'`) || msg.includes(`"${k}"`) || msg.includes(` ${k} `))
    if (!droppedKey || !(droppedKey in attempt)) break
    delete attempt[droppedKey]
    optionalKeys = optionalKeys.filter(k => k !== droppedKey)
    result = await tryOnce(attempt)
  }
  return result
}

async function ensureDefaultPipelineStages(companyId) {
  if (!companyId) return
  const { data: existing, error } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
  if (error) return // RLS or missing table — silently skip; not fatal for signup
  if (existing && existing.length > 0) return

  const rows = DEFAULT_PIPELINE_STAGES.map((name, i) => ({
    company_id: companyId,
    name,
    position: i,
  }))
  await supabase.from("pipeline_stages").insert(rows)
}

export async function registerWithEmail({ email, password, fullName, companyName, phone, kvk }) {
  // 1. Create the auth user. Stash full_name and company_name in metadata so a
  //    later "repair profile" flow can recover the values if step 2 or 3 fails.
  const signup = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, company_name: companyName } },
  })
  if (signup.error) throw signup.error

  const user = signup.data.user
  if (!user) {
    // Email-confirmation flow — UI will need to wait for the user to confirm.
    return { ...signup.data, requiresConfirmation: true }
  }

  // 2. Create the company. New schema: name is required; the rest are optional
  //    string columns. We drop unknown columns (e.g. legacy `trade`) on retry.
  const companyPayload = {
    name: companyName,
    email: email || null,
    phone: phone || null,
    kvk: kvk || null,
  }
  const companyResult = await insertWithFallback("companies", companyPayload, ["email", "phone", "kvk"])
  if (companyResult.error) {
    throw new Error(`Bedrijf aanmaken mislukt: ${companyResult.error.message}`)
  }
  const company = companyResult.data

  // 3. Create the profile row keyed on auth.user.id. Schema: id, company_id,
  //    full_name, role. We use insert (not upsert) so duplicate-key errors are
  //    visible — if a trigger already created the row we update instead.
  const profilePayload = {
    id: user.id,
    company_id: company.id,
    full_name: fullName,
    role: "admin",
  }
  let { error: profileError } = await supabase.from("profiles").insert(profilePayload)
  if (profileError && /duplicate|already exists|conflict/i.test(profileError.message)) {
    const upd = await supabase
      .from("profiles")
      .update({ company_id: company.id, full_name: fullName, role: "admin" })
      .eq("id", user.id)
    profileError = upd.error
  }
  if (profileError) {
    throw new Error(`Profiel aanmaken mislukt: ${profileError.message}`)
  }

  // 4. Best-effort seed of default pipeline stages.
  try { await ensureDefaultPipelineStages(company.id) } catch { /* non-fatal */ }

  return { ...signup.data, company }
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function resetPasswordForEmail(email) {
  const redirectTo = `${window.location.origin}/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function resendVerificationEmail(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
}

// Repair flow: recreate company + profile from auth metadata if signup didn't
// complete cleanly. Used by the "Geen profiel gevonden" error state.
export async function createMissingProfile() {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData?.session?.user
  if (!user) throw new Error("Niet ingelogd")

  const meta = user.user_metadata || {}
  const fullName = meta.full_name || ""
  const companyName = meta.company_name || (user.email ? user.email.split("@")[0] : "Mijn bedrijf")

  // If a profile already exists with a company, surface that instead of overwriting.
  const existing = await supabase.from("profiles").select("*, company_id").eq("id", user.id).maybeSingle()
  if (existing.data?.company_id) return existing.data

  let companyId = existing.data?.company_id || null
  if (!companyId) {
    const companyResult = await insertWithFallback(
      "companies",
      { name: companyName, email: user.email || null },
      ["email"]
    )
    if (companyResult.error) throw new Error(`Bedrijf aanmaken mislukt: ${companyResult.error.message}`)
    companyId = companyResult.data.id
  }

  const profilePayload = {
    id: user.id,
    company_id: companyId,
    full_name: fullName,
    role: "admin",
  }
  const { error: insertErr } = await supabase.from("profiles").insert(profilePayload)
  if (insertErr && !/duplicate|already exists|conflict/i.test(insertErr.message)) {
    throw new Error(`Profiel aanmaken mislukt: ${insertErr.message}`)
  }
  if (insertErr) {
    const upd = await supabase
      .from("profiles")
      .update({ company_id: companyId, full_name: fullName, role: "admin" })
      .eq("id", user.id)
    if (upd.error) throw new Error(`Profiel bijwerken mislukt: ${upd.error.message}`)
  }

  try { await ensureDefaultPipelineStages(companyId) } catch { /* non-fatal */ }

  return { id: user.id, company_id: companyId, full_name: fullName, role: "admin" }
}
