import { supabase } from "../lib/supabase"
import { withCompanyId, getCompanyId } from "../lib/currentCompany"
import { sendEmail } from "./emailService"
import { mailTemplate } from "../utils/mailTemplate"

// DB columns company_members: id, company_id, profile_id, email, full_name, phone,
// role, status, hours_per_week, avatar_url, invited_at, accepted_at, created_at, updated_at

const toTeamMember = row => ({
  id: row.id,
  companyId: row.company_id,
  profileId: row.profile_id,
  email: row.email,
  fullName: row.full_name || "",
  phone: row.phone || "",
  role: row.role || "medewerker",
  status: row.status || "uitgenodigd",
  hoursPerWeek: Number(row.hours_per_week || 0),
  avatarUrl: row.avatar_url || "",
  invitedAt: row.invited_at,
  acceptedAt: row.accepted_at || null,
  createdAt: row.created_at,
  raw: row,
})

// ── LEZEN ────────────────────────────────────────────────────────────────────

export async function getTeamMembers() {
  const { data, error } = await supabase
    .from("company_members")
    .select("*")
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data || []).map(toTeamMember)
}

// ── UITNODIGEN ───────────────────────────────────────────────────────────────

export async function inviteTeamMember(input) {
  if (!input.email) throw new Error("email is verplicht voor een teamliduitnodiging")

  const inviteToken = crypto.randomUUID()
  const inviteExpiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString()

  // Haal bedrijfsnaam en naam uitnodiger op voor de uitnodigingsmail
  const companyId = await getCompanyId()
  let companyName = 'BossBase'
  if (companyId) {
    const { data: co } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
    if (co?.name) companyName = co.name
  }

  let inviterName = 'BossBase'
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (currentUser) {
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', currentUser.id).maybeSingle()
    if (prof?.full_name) inviterName = prof.full_name
  }

  const role = input.role || "medewerker"
  const roleLabels = { admin: 'Beheerder', medewerker: 'Medewerker', manager: 'Manager' }
  const roleLabel = roleLabels[role] || role

  const base = {
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name || input.fullName || null,
    phone: input.phone || null,
    role,
    status: "uitgenodigd",
    hours_per_week: Number(input.hours_per_week || input.hoursPerWeek || 0),
    profile_id: null,
    invite_token: inviteToken,
    invite_expires_at: inviteExpiresAt,
    invite_company_name: companyName,
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("company_members")
    .insert(payload)
    .select()
    .single()
  if (error) throw error

  // Uitnodigingsmail — altijd productie URL
  const inviteUrl = `https://www.bossbase.nl/uitnodiging/${inviteToken}`
  const inviteeName = input.full_name || input.fullName || input.email
  const html = mailTemplate({
    title: 'Je bent uitgenodigd!',
    preheader: `${inviterName} heeft je uitgenodigd voor ${companyName} op BossBase`,
    body: `<p>Hallo ${inviteeName},</p>
           <p><strong>${inviterName}</strong> heeft je uitgenodigd om deel uit te maken van
           <strong>${companyName}</strong> op BossBase.</p>
           <p>Je krijgt de rol: <strong>${roleLabel}</strong></p>`,
    buttonText: 'Accepteer uitnodiging',
    buttonUrl: inviteUrl,
    footerText: 'Deze uitnodiging is 48 uur geldig. Als je deze uitnodiging niet verwacht hebt, kun je deze mail negeren.',
    companyName: 'BossBase',
  })

  const member = toTeamMember(data)

  const mailPayload = {
    to: input.email.trim().toLowerCase(),
    subject: `Je bent uitgenodigd voor ${companyName} op BossBase`,
    from_name: companyName,
    inviteUrl,
    inviterName,
    roleLabel,
  }
  console.log('[invite-mail] Payload die verstuurd wordt →', mailPayload)

  const emailErr = await sendEmail({
    to: mailPayload.to,
    subject: mailPayload.subject,
    html,
    fromName: companyName,
  }).then(response => {
    console.log('[invite-mail] send-email response ✓', response)
    return null
  }).catch(e => {
    console.error('[invite-mail] send-email MISLUKT', {
      message: e.message,
      stack: e.stack,
      error: e,
    })
    return e
  })

  if (emailErr) {
    return { ...member, emailSent: false, emailError: emailErr.message }
  }
  return { ...member, emailSent: true }
}

// ── BEWERKEN ─────────────────────────────────────────────────────────────────

export async function updateTeamMember(id, input) {
  const updates = { ...input }
  // Verwijder frontend-aliases
  delete updates.companyId
  delete updates.profileId
  delete updates.fullName
  delete updates.hoursPerWeek
  delete updates.invitedAt
  delete updates.acceptedAt

  // Normaliseer veldnamen naar DB-kolommen
  if ("fullName" in input) updates.full_name = input.fullName
  if ("hoursPerWeek" in input) updates.hours_per_week = input.hoursPerWeek

  const { data, error } = await supabase
    .from("company_members")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toTeamMember(data)
}

// ── STATUS WIJZIGEN ──────────────────────────────────────────────────────────

export async function activateTeamMember(id) {
  const { data, error } = await supabase
    .from("company_members")
    .update({ status: "actief", accepted_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toTeamMember(data)
}

export async function deactivateTeamMember(id) {
  const { data, error } = await supabase
    .from("company_members")
    .update({ status: "inactief" })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toTeamMember(data)
}

// ── VERWIJDEREN ──────────────────────────────────────────────────────────────

export async function deleteTeamMember(id) {
  const { error } = await supabase.from("company_members").delete().eq("id", id)
  if (error) throw error
}
