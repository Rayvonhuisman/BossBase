import { supabase } from "../lib/supabase"

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

export async function registerWithEmail({ email, password, fullName, companyName, phone, kvk }) {
  // 1. Auth-user aanmaken. Metadata opslaan zodat de DB-trigger (handle_new_user)
  //    en de repair-flow de naam kunnen gebruiken ook als stap 2 faalt.
  const signup = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, company_name: companyName } },
  })
  if (signup.error) throw signup.error

  if (!signup.data.session) {
    // Email-bevestiging vereist: geen actieve sessie. De DB-trigger
    // (handle_new_user) maakt alvast een minimaal profiel aan.
    // Company + koppeling worden aangemaakt bij eerste login via provision_account.
    return { ...signup.data, requiresConfirmation: true }
  }

  // 2. Sessie beschikbaar → maak company + profiel atomair aan via de
  //    SECURITY DEFINER RPC. Dit bypast RLS en lost het kip-en-ei
  //    SELECT-probleem op (SELECT-policy blokkeert company-lezen zonder profiel).
  const { data: rpcData, error: rpcError } = await supabase.rpc("provision_account", {
    p_company_name: companyName,
    p_full_name:    fullName,
    p_email:        email    || null,
    p_phone:        phone    || null,
    p_kvk:          kvk     || null,
  })
  if (rpcError) throw new Error(`Account aanmaken mislukt: ${rpcError.message}`)

  return { ...signup.data, company: { id: rpcData?.company_id } }
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Eigen reset flow via edge function + Resend — Supabase auth reset mail wordt NIET gebruikt
export async function requestPasswordReset(email) {
  const { data, error } = await supabase.functions.invoke('request-password-reset', {
    body: { email },
  })
  if (error) {
    let message = error.message
    try { const b = await error.context?.json(); if (b?.error) message = b.error } catch {}
    throw new Error(message)
  }
  if (!data?.success) throw new Error(data?.error || 'Versturen mislukt')
}

// Valideert het reset token zonder wachtwoord in te stellen.
// Geeft { valid: true } of { valid: false, code: 'EXPIRED'|'USED'|'INVALID', error: string }
export async function validateResetToken(token) {
  const { data, error } = await supabase.functions.invoke('apply-password-reset', {
    body: { token, checkOnly: true },
  })
  if (error) {
    let parsed = null
    try { parsed = await error.context?.json() } catch {}
    return { valid: false, code: parsed?.code || 'INVALID', error: parsed?.error || error.message }
  }
  if (!data?.success) return { valid: false, code: data?.code || 'INVALID', error: data?.error || 'Ongeldige link' }
  return { valid: true, code: 'VALID' }
}

export async function applyPasswordReset(token, newPassword) {
  const { data, error } = await supabase.functions.invoke('apply-password-reset', {
    body: { token, newPassword },
  })
  if (error) {
    let parsed = null
    try { parsed = await error.context?.json() } catch {}
    const err = new Error(parsed?.error || error.message || 'Wachtwoord instellen mislukt')
    err.code = parsed?.code || 'ERROR'
    throw err
  }
  if (!data?.success) {
    const err = new Error(data?.error || 'Wachtwoord instellen mislukt')
    err.code = data?.code || 'ERROR'
    throw err
  }
}

export async function resendVerificationEmail(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
}

// Repair flow: wordt aangeroepen als een ingelogde user geen (volledig) profiel heeft.
// Gebruikt de SECURITY DEFINER RPC zodat RLS geen probleem is.
export async function createMissingProfile() {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData?.session?.user
  if (!user) throw new Error("Niet ingelogd")

  const meta        = user.user_metadata || {}
  const fullName    = meta.full_name    || ""
  const companyName = meta.company_name || (user.email ? user.email.split("@")[0] : "Mijn bedrijf")

  // Profiel al volledig? Dan niks doen.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, company_id")
    .eq("id", user.id)
    .maybeSingle()
  if (existing?.company_id) return existing

  // Controleer of er een uitnodiging bestaat voor dit emailadres.
  // company_members is niet leesbaar via RLS als company_id NULL is,
  // dus gebruiken we een SECURITY DEFINER RPC die auth.users kan lezen.
  const { data: inviteCompanyId } = await supabase.rpc("get_invite_company_for_current_user")
  if (inviteCompanyId) {
    // Koppel aan het bedrijf van de uitnodiging — geen nieuw bedrijf aanmaken
    await supabase
      .from("profiles")
      .update({ company_id: inviteCompanyId, role: "medewerker" })
      .eq("id", user.id)
    return { id: user.id, company_id: inviteCompanyId }
  }

  // Geen uitnodiging → nieuw bedrijf aanmaken via SECURITY DEFINER RPC.
  const { data: rpcData, error: rpcError } = await supabase.rpc("provision_account", {
    p_company_name: companyName,
    p_full_name:    fullName,
    p_email:        user.email || null,
    p_phone:        null,
    p_kvk:          null,
  })
  if (rpcError) throw new Error(`Profiel herstellen mislukt: ${rpcError.message}`)

  return { id: user.id, company_id: rpcData?.company_id }
}
