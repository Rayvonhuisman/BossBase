import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// DB-kolommen notes: id, company_id, customer_id, deal_id, content, created_at.
// De tekstkolom heet `content` — niet `body`/`note`, en er is geen auteurskolom.
// Naar buiten toe houden we `body` aan, zodat aanroepers niet hoeven te weten
// hoe de kolom heet.

export const toNote = row => ({
  id: row.id,
  customerId: row.customer_id,
  dealId: row.deal_id,
  body: row.content || "",
  author: "",
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

export async function createNote(input = {}) {
  const { body, content, ...rest } = input
  const text = (body ?? content ?? "").trim()
  if (!text) throw new Error("Notitie mag niet leeg zijn")
  const payload = await withCompanyId({ ...rest, content: text })
  const { data, error } = await supabase.from("notes").insert(payload).select().single()
  if (error) throw error
  return toNote(data)
}
