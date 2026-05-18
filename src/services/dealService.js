import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"

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
  value: Number(row.value || row.amount || row.revenue || 0),
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
  if (error) throw error
  return (data || []).map((row, i) => toStage(row, i))
}

export async function listDeals() {
  // Join customers so the pipeline cards can show the customer name/city —
  // toDeal reads row.customers?.name. Without the embed it was always blank.
  const { data, error } = await supabase
    .from("deals")
    .select("*, customers(*)")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map(toDeal)
}

export async function updateDealStage(dealId, stageId) {
  const { data, error } = await supabase.from("deals").update({ stage_id: stageId }).eq("id", dealId).select("*").single()
  if (error) throw error
  return toDeal(data)
}

const isUuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export async function createDeal(input) {
  const stageCandidate = input.stage_id || input.stage || null
  const base = {
    title: input.title,
    customer_id: input.customer_id || input.custId || null,
    // deals.stage_id is a UUID. Reject slug fallbacks ('new_lead', etc.) so
    // Postgres can fall back to its column default instead of erroring.
    stage_id: isUuid(stageCandidate) ? stageCandidate : null,
    value: Number(input.value || input.amount || 0),
    notes: input.notes || input.description || null,
    priority: input.priority || "med",
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])
  const payload = await withCompanyId(base)
  // safeInsert retries while dropping columns the schema doesn't have
  // (e.g. `priority` if you haven't added it yet).
  const { data, error } = await safeInsert(supabase, "deals", payload, "*")
  if (error) throw error
  return toDeal(data)
}

export async function updateDeal(dealId, input) {
  const { data, error } = await supabase
    .from("deals")
    .update(input)
    .eq("id", dealId)
    .select("*")
    .single()
  if (error) throw error
  return toDeal(data)
}
