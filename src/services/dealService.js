import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"
import { logTijdlijnSafe } from "./klantTijdlijnService"

// pipeline_stages table has no color_class column — derive from position/name
const STAGE_COLORS = ["b-new","b-orange","b-blue","b-blue","b-orange","b-orange","b-green","b-planned","b-progress","b-done","b-accepted","b-lost"]

const toStage = (row, i) => ({
  id: row.id,
  label: row.name || row.label || "Fase",
  col: row.color_class || STAGE_COLORS[(row.position ?? i ?? 0) - 1] || "b-gray",
  order: row.position ?? row.sort_order ?? 0,
})

const toDeal = row => ({
  id: row.id,
  custId: row.customer_id,
  customerName: row.customers?.name || row.customers?.company_name || row.customer_name || "",
  stage: row.stage_id || row.pipeline_stage_id || row.stage,
  title: row.title || row.name || row.description || "Deal",
  city: row.city || row.customers?.city || "",
  // Real money column is `expected_revenue` (then `final_revenue`); the older
  // value/amount/revenue are kept only as defensive fallbacks.
  value: Number(row.expected_revenue ?? row.final_revenue ?? row.value ?? row.amount ?? row.revenue ?? 0),
  priority: row.priority || "med",
  nextAct: row.next_activity || "",
  nextDate: row.next_date || "",
  notes: row.notes_count || 0,
  files: row.files_count || 0,
  acts: row.activities_count || 0,
  raw: row,
})

export async function listPipelineStages() {
  const { data, error } = await supabase.from("pipeline_stages").select("*").order("position", { ascending: true })
  if (error) {
    console.error("[bb:pipeline] listPipelineStages mislukt", { message: error.message, code: error.code })
    throw error
  }
  return (data || []).map((row, i) => toStage(row, i))
}

export async function listDeals() {
  // Join customers so the pipeline cards can show the customer name/city —
  // toDeal reads row.customers?.name. `deals` has TWO FKs to `customers`
  // (deals_customer_id_fkey + fk_deals_customer, both on customer_id), so the
  // FK must be named explicitly or PostgREST errors with "more than one
  // relationship". Keep the embed key `customers` so toDeal stays unchanged.
  const { data, error } = await supabase
    .from("deals")
    .select("*, customers!deals_customer_id_fkey(*)")
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[bb:pipeline] listDeals mislukt", { message: error.message, code: error.code, details: error.details })
    throw error
  }
  return (data || []).map(toDeal)
}

export async function updateDealStage(dealId, stageId) {
  // Mirror the customers join from listDeals so toDeal() can still resolve
  // customerName/city after the update — without the join those fields go
  // empty and pipeline cards lose klantnaam/locatie on drag-and-drop.
  const { data, error } = await supabase
    .from("deals")
    .update({ stage_id: stageId })
    .eq("id", dealId)
    .select("*, customers!deals_customer_id_fkey(*)")
    .single()
  if (error) {
    console.error("[bb:pipeline] updateDealStage mislukt", { message: error.message, code: error.code, dealId, stage_id: stageId })
    throw error
  }
  const deal = toDeal(data)
  if (deal.custId) {
    logTijdlijnSafe(deal.custId, 'deal_fase_gewijzigd', `Deal fase gewijzigd: ${deal.title}`, { dealId: deal.id, stageId })
  }
  return deal
}

const isUuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export async function createDeal(input) {
  const stageCandidate = input.stage_id || input.stage || null
  const revenue = Number(input.value || input.amount || input.expected_revenue || 0)
  // Map to the ACTUAL deals columns. The previous payload sent value/notes/
  // priority — none of which exist (real columns: expected_revenue,
  // description, no priority) — so safeInsert dropped them and the entered
  // amount/description were silently lost.
  const base = {
    title: input.title,
    customer_id: input.customer_id || input.custId || null,
    // deals.stage_id is a UUID. Reject slug fallbacks ('new_lead', etc.) so
    // Postgres can fall back to its column default instead of erroring.
    stage_id: isUuid(stageCandidate) ? stageCandidate : null,
    expected_revenue: Number.isFinite(revenue) ? revenue : 0,
    description: input.notes || input.description || null,
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])
  const payload = await withCompanyId(base)
  // safeInsert still guards against minor schema drift, but the primary
  // columns are now correct so no data is lost and no retries are needed.
  const { data, error } = await safeInsert(supabase, "deals", payload, "*")
  if (error) {
    console.error("[bb:pipeline] createDeal mislukt", {
      message: error.message, code: error.code, details: error.details,
      keys: Object.keys(payload),
      company_id: payload.company_id, customer_id: payload.customer_id, stage_id: payload.stage_id,
    })
    throw error
  }
  const deal = toDeal(data)
  if (deal.custId) {
    logTijdlijnSafe(deal.custId, 'deal_aangemaakt', `Deal aangemaakt: ${deal.title}`, { dealId: deal.id, title: deal.title })
  }
  return deal
}

export async function updateDeal(dealId, input) {
  const { data, error } = await supabase
    .from("deals")
    .update(input)
    .eq("id", dealId)
    .select("*, customers!deals_customer_id_fkey(*)")
    .single()
  if (error) throw error
  return toDeal(data)
}
