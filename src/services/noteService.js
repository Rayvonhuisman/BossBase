import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

export const toNote = row => ({
  id: row.id,
  customerId: row.customer_id,
  dealId: row.deal_id,
  body: row.body || row.note || "",
  author: row.author || "",
  createdAt: row.created_at,
  raw: row,
})

export async function listNotes(customerId) {
  let query = supabase.from("notes").select("*").order("created_at", { ascending: false })
  if (customerId) query = query.eq("customer_id", customerId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(toNote)
}

export async function createNote(input) {
  const payload = await withCompanyId(input)
  const { data, error } = await supabase.from("notes").insert(payload).select().single()
  if (error) throw error
  return toNote(data)
}
