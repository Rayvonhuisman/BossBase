import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// Notities bij een deal. Zelfde opzet als project_notes en werkbon_notities:
// één rij per notitie, met schrijver. Vervangt de oude tabel `notes`, die geen
// schrijver kende en waar iedereen alles mocht aanpassen.
//
// Aanpassen en verwijderen mag alleen de schrijver, een admin of een planner —
// dat dwingt de database af (RLS op deal_notities). Het scherm verbergt de
// verwijderknop alleen om geen knop te tonen die daarna faalt.

const SELECT = "*, profiles(full_name)"

export const toDealNotitie = row => ({
  id: row.id,
  companyId: row.company_id,
  dealId: row.deal_id,
  createdBy: row.created_by,
  note: row.note || "",
  createdAt: row.created_at,
  authorName: row.profiles?.full_name || "",
  raw: row,
})

export async function getDealNotities(dealId) {
  if (!dealId) return []
  const { data, error } = await supabase
    .from("deal_notities")
    .select(SELECT)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map(toDealNotitie)
}

export async function addDealNotitie(dealId, note) {
  if (!dealId) throw new Error("dealId is verplicht")
  const text = (note || "").trim()
  if (!text) throw new Error("Notitie mag niet leeg zijn")

  // De database eist dat created_by de ingelogde gebruiker is; meegeven maakt
  // het expliciet (de default doet hetzelfde).
  const base = { deal_id: dealId, note: text }
  const { data: u } = await supabase.auth.getUser()
  if (u?.user?.id) base.created_by = u.user.id

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("deal_notities")
    .insert(payload)
    .select(SELECT)
    .single()
  if (error) throw error
  return toDealNotitie(data)
}

export async function deleteDealNotitie(id) {
  if (!id) throw new Error("id is verplicht")
  // Zonder .select() meldt Supabase geen fout als RLS de rij tegenhoudt; met
  // .select() zien we of er echt iets weg is.
  const { data, error } = await supabase.from("deal_notities").delete().eq("id", id).select("id")
  if (error) throw error
  if (!data?.length) throw new Error("Alleen de schrijver, een admin of een planner kan deze notitie verwijderen")
}
