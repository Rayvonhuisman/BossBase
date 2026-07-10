import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// Company-scoped, instelbare lijst met verloren-redenen. Zelfde opzet als
// pipeline_stages (zie instellingenService): RLS scoped op company, admins
// muteren. De pipeline-modal en het database-filter lezen deze lijst.

const toLostReason = row => ({
  id: row.id,
  companyId: row.company_id,
  label: row.label || "",
  position: Number(row.position ?? 0),
  createdAt: row.created_at,
  raw: row,
})

export async function getLostReasons() {
  const { data, error } = await supabase
    .from("lost_reasons")
    .select("*")
    .order("position", { ascending: true })
  if (error) {
    console.error("[bb:pipeline] getLostReasons mislukt", { message: error.message, code: error.code })
    throw error
  }
  return (data || []).map(toLostReason)
}

export async function createLostReason(input) {
  const label = (input.label || "").trim()
  if (!label) throw new Error("Reden is verplicht")

  // Volgende positie = achteraan de lijst.
  const { data: last } = await supabase
    .from("lost_reasons")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (last?.position ?? -1) + 1

  const base = {
    label,
    position: input.position != null ? Number(input.position) : nextPosition,
  }
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("lost_reasons")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toLostReason(data)
}

export async function updateLostReason(id, input) {
  const updates = {}
  if (input.label !== undefined) updates.label = (input.label || "").trim()
  if (input.position !== undefined) updates.position = Number(input.position)
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k])

  const { data, error } = await supabase
    .from("lost_reasons")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toLostReason(data)
}

export async function deleteLostReason(id) {
  const { error } = await supabase.from("lost_reasons").delete().eq("id", id)
  if (error) throw error
}
