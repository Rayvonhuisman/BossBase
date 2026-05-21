import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

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

/**
 * Voegt een teamlid toe met status 'uitgenodigd'.
 * Echte Supabase Auth-invite is nog niet geïmplementeerd —
 * dit slaat de uitnodiging op in company_members zodat de UI al klopt.
 *
 * Verplichte velden: email
 * Optionele velden: full_name, phone, role, hours_per_week
 */
export async function inviteTeamMember(input) {
  if (!input.email) throw new Error("email is verplicht voor een teamliduitnodiging")

  const base = {
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name || input.fullName || null,
    phone: input.phone || null,
    role: input.role || "medewerker",
    status: "uitgenodigd",
    hours_per_week: Number(input.hours_per_week || input.hoursPerWeek || 0),
    // profile_id wordt pas ingevuld als de uitgenodigde gebruiker inlogt
    profile_id: null,
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("company_members")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
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
