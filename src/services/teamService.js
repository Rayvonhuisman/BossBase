import { supabase } from "../lib/supabase"
import { withCompanyId, getCompanyId } from "../lib/currentCompany"
import { sendEmail } from "./emailService"

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

  // Haal bedrijfsnaam op voor de uitnodigingsmail
  const companyId = await getCompanyId()
  let companyName = 'BossBase'
  if (companyId) {
    const { data: co } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
    if (co?.name) companyName = co.name
  }

  const base = {
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name || input.fullName || null,
    phone: input.phone || null,
    role: input.role || "medewerker",
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

  // Stuur uitnodigingsmail
  const inviteUrl = `${window.location.origin}/uitnodiging/${inviteToken}`
  const inviteeName = input.full_name || input.fullName || input.email
  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="margin-bottom:24px">
    <span style="font-size:22px;font-weight:900;color:#1DDB62;letter-spacing:-0.5px">Boss<span style="color:#0a0a0a">Base</span></span>
  </div>
  <h2 style="font-size:20px;font-weight:800;color:#0a0a0a;margin:0 0 8px">Je bent uitgenodigd!</h2>
  <p style="color:#4b5563;margin:0 0 20px">
    Je bent uitgenodigd om deel te nemen aan <strong>${companyName}</strong> op BossBase.
  </p>
  <p style="color:#4b5563;margin:0 0 28px">
    Klik op de knop hieronder om je account aan te maken en direct aan de slag te gaan.
    Deze uitnodiging is 48 uur geldig.
  </p>
  <a href="${inviteUrl}"
     style="display:inline-block;background:#1DDB62;color:#0a0a0a;font-weight:800;
            font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none">
    Accepteer uitnodiging →
  </a>
  <p style="color:#9ca3af;font-size:12px;margin-top:28px">
    Als je deze uitnodiging niet verwachtte, kun je deze e-mail negeren.
  </p>
</div>`

  try {
    await sendEmail({
      to: input.email.trim().toLowerCase(),
      subject: `Je bent uitgenodigd voor ${companyName} op BossBase`,
      html,
      fromName: companyName,
    })
  } catch (e) {
    console.warn('[team] uitnodigingsmail mislukt:', e.message)
  }

  return toTeamMember(data)
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
