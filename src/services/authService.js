import { supabase } from "../lib/supabase"

// Vertaalt Supabase/Engelse auth-foutmeldingen naar het Nederlands.
// Onbekende (al-Nederlandse) meldingen worden ongewijzigd doorgegeven.
export function vertaalAuthFout(message) {
  const msg = (message || '').trim()
  const vertalingen = {
    'Invalid login credentials': 'Onjuist e-mailadres of wachtwoord',
    'Email not confirmed': 'Je e-mailadres is nog niet bevestigd',
    'User not found': 'Geen account gevonden met dit e-mailadres',
    'Email rate limit exceeded': 'Te veel pogingen. Probeer het later opnieuw',
    'Password should be at least 6 characters': 'Wachtwoord moet minimaal 6 tekens zijn',
    'User already registered': 'Er bestaat al een account met dit e-mailadres',
    'Unable to validate email address: invalid format': 'Vul een geldig e-mailadres in',
    'Signup requires a valid password': 'Vul een geldig wachtwoord in',
    'New password should be different from the old password': 'Het nieuwe wachtwoord moet verschillen van het oude',
  }
  if (vertalingen[msg]) return vertalingen[msg]
  // Variaties die Supabase soms net anders formuleert
  if (/invalid login credentials/i.test(msg)) return 'Onjuist e-mailadres of wachtwoord'
  if (/email not confirmed|not confirmed/i.test(msg)) return 'Je e-mailadres is nog niet bevestigd'
  if (/user not found/i.test(msg)) return 'Geen account gevonden met dit e-mailadres'
  if (/rate limit/i.test(msg)) return 'Te veel pogingen. Probeer het later opnieuw'
  if (/at least 6 characters/i.test(msg)) return 'Wachtwoord moet minimaal 6 tekens zijn'
  if (/already registered/i.test(msg)) return 'Er bestaat al een account met dit e-mailadres'
  // Engelse rest-meldingen → generieke fallback; al-Nederlandse meldingen ongewijzigd.
  if (/[a-z]/i.test(msg) && /\b(the|invalid|error|failed|should|requires|please|try|credentials)\b/i.test(msg)) {
    return 'Er ging iets mis. Probeer het opnieuw'
  }
  return msg || 'Er ging iets mis. Probeer het opnieuw'
}

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
  // Gedeactiveerd account weigeren: meteen weer uitloggen en blokkeren.
  // (Een verwijderd account kan sowieso niet inloggen — auth.users bestaat niet meer.)
  const uid = data?.user?.id
  if (uid) {
    const { data: prof } = await supabase.from('profiles').select('actief').eq('id', uid).maybeSingle()
    if (prof && prof.actief === false) {
      await supabase.auth.signOut()
      throw new Error('Je account is gedeactiveerd. Neem contact op met je beheerder.')
    }
  }
  return data
}

export async function registerWithEmail({ email, password, fullName, companyName, phone, kvk }) {
  // Auth-user aanmaken. Alle registratie-gegevens in metadata opslaan zodat
  // verify-code het bedrijf later (na e-mailverificatie) kan provisionen.
  const signup = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, company_name: companyName, phone: phone || null, kvk: kvk || null } },
  })
  if (signup.error) throw signup.error

  if (!signup.data.session) {
    // Supabase "Confirm email" staat AAN → geen sessie. Val terug op de
    // Supabase-bevestigingsmail (defensief; in onze config staat dit UIT).
    return { ...signup.data, requiresConfirmation: true }
  }

  // Confirm email UIT → er is een sessie. We provisionen het bedrijf NIET meer
  // hier; dat gebeurt pas ná e-mailverificatie in verify-code. Stuur de
  // 6-cijferige code (best-effort; het verificatiescherm heeft een resend).
  await requestVerificationCode().catch(() => {})
  return { ...signup.data, requiresVerification: true }
}

// Vraag een (nieuwe) 6-cijferige verificatiecode aan voor de ingelogde user.
export async function requestVerificationCode() {
  const { data, error } = await supabase.functions.invoke('request-verification-code')
  if (error) throw error
  return data
}

// Controleer de ingevoerde code. Geeft het JSON-resultaat van de edge function
// terug (ook bij 4xx), zodat de UI de specifieke foutmelding kan tonen.
export async function verifyCode(code) {
  const { data, error } = await supabase.functions.invoke('verify-code', { body: { code } })
  if (error) {
    let parsed = null
    try { parsed = await error.context?.json() } catch { /* geen JSON-body */ }
    return parsed || { success: false, error: error.message || 'Verifiëren mislukt' }
  }
  return data
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

// Wachtwoord wijzigen voor een ingelogde gebruiker. Verifieert eerst het
// huidige wachtwoord (door opnieuw in te loggen) en zet daarna het nieuwe.
export async function changePassword(currentPassword, newPassword) {
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email
  if (!email) throw new Error('Geen actieve sessie gevonden — log opnieuw in')

  // Verifieer het huidige wachtwoord.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (signInError) {
    const err = new Error('Huidig wachtwoord is onjuist')
    err.code = 'WRONG_CURRENT'
    throw err
  }

  // Zet het nieuwe wachtwoord.
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) throw new Error(vertaalAuthFout(updateError.message) || 'Wachtwoord wijzigen mislukt')
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
