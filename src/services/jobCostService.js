import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// Real DB columns: id, company_id, deal_id, description, amount, category,
// cost_date, created_at, updated_at.

export function mapJobCostFormToPayload(input = {}) {
  const payload = {}
  if (input.description !== undefined) payload.description = input.description
  if (input.amount !== undefined) {
    const amount = Number(input.amount)
    if (Number.isNaN(amount)) throw new Error("Bedrag is geen geldig getal")
    payload.amount = amount
  }
  if (input.category !== undefined) payload.category = input.category || null

  // Accept cost_date, date, or coste_date (legacy aliases).
  const date = input.cost_date ?? input.date ?? input.coste_date
  if (date !== undefined) payload.cost_date = date || null

  if (input.deal_id !== undefined || input.dealId !== undefined) {
    payload.deal_id = input.deal_id ?? input.dealId ?? null
  }
  if (input.company_id !== undefined || input.companyId !== undefined) {
    payload.company_id = input.company_id ?? input.companyId ?? null
  }
  if (input.bijlage_url !== undefined) payload.bijlage_url = input.bijlage_url
  if (input.klant_type !== undefined) payload.klant_type = input.klant_type

  return payload
}

export const toJobCost = row => ({
  id: row.id,
  dealId: row.deal_id,
  companyId: row.company_id,
  cat: row.category || "overig",
  desc: row.description || "",
  amt: Number(row.amount || 0),
  date: row.cost_date || row.created_at?.slice(0, 10) || "",
  // Best-effort linkage to a customer via the deal — populated by joins where needed.
  custId: row.deals?.customer_id ?? null,
  bijlageUrl: row.bijlage_url || null,
  klantType: row.klant_type || 'klant',
  raw: row,
})

// The deals join is best-effort: if the FK isn't declared in Postgres metadata
// Supabase returns "Could not find a relationship between …" — we then fall
// back to a plain select so the page still loads.
async function selectWithDealsFallback(query) {
  let { data, error } = await query.select("*, deals(customer_id)").order("created_at", { ascending: false })
  if (error && /could not find.*relationship|foreign key/i.test(error.message)) {
    const fallback = await query.select("*").order("created_at", { ascending: false })
    data = fallback.data
    error = fallback.error
  }
  if (error) throw error
  return data || []
}

export async function listJobCosts() {
  const rows = await selectWithDealsFallback(supabase.from("job_costs"))
  return rows.map(toJobCost)
}

export async function createJobCost(input) {
  const base = mapJobCostFormToPayload(input)
  if (!base.description) throw new Error("Omschrijving is verplicht")
  if (!(base.amount > 0)) throw new Error("Voer een geldig bedrag in")
  const payload = await withCompanyId(base)
  let { data, error } = await supabase
    .from("job_costs")
    .insert(payload)
    .select("*, deals(customer_id)")
    .single()
  if (error && /could not find.*relationship|foreign key/i.test(error.message)) {
    const fallback = await supabase.from("job_costs").insert(payload).select("*").single()
    data = fallback.data
    error = fallback.error
  }
  if (error) throw error
  return toJobCost(data)
}
