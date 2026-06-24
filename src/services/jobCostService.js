import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// ── CATEGORIE → LABEL + KLEUR ────────────────────────────────────────────────
// Eén bron voor categorie-weergave. Case-insensitief zodat 'materiaal' en
// 'Materiaal' samenvallen. Onbekende categorieën → nette label + grijs.
export const COST_CATEGORIES = {
  materiaal:         { label: "Materiaal",       bg: "#eff6ff", color: "#2563eb" }, // blauw
  arbeid:            { label: "Arbeid",          bg: "#f0fdf4", color: "#15a34a" }, // groen
  reiskosten:        { label: "Reiskosten",      bg: "#fff7ed", color: "#ea580c" }, // oranje
  inkoopfactuur:     { label: "Inkoopfactuur",   bg: "#faf5ff", color: "#9333ea" }, // paars
  "algemene kosten": { label: "Algemene kosten", bg: "#f3f4f6", color: "#6b7280" }, // grijs
  overig:            { label: "Overig",          bg: "#f3f4f6", color: "#6b7280" }, // grijs
}

export function costCategoryMeta(cat) {
  const key = (cat || "").trim().toLowerCase()
  if (COST_CATEGORIES[key]) return COST_CATEGORIES[key]
  const label = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Overig"
  return { label, bg: "#f3f4f6", color: "#6b7280" }
}

// Lijst voor dropdowns (vaste categorieën, consistente casing).
export const COST_CATEGORY_OPTIONS = Object.values(COST_CATEGORIES).map(c => c.label)

// kosten-bijlagen is een PRIVÉ bucket. De `bijlage_url`-kolom bevat een JSON-
// array met opslagpaden ({company_id}/bestand). Deze helper geeft een tijdelijke
// signed URL terug voor de eerste bijlage (legacy: een opgeslagen http-URL wordt
// ongewijzigd teruggegeven).
export async function getKostenBijlageUrl(stored) {
  if (!stored) return null
  let items
  try { items = JSON.parse(stored) } catch { items = [stored] }
  const first = Array.isArray(items) ? items[0] : items
  if (!first) return null
  if (String(first).startsWith("http")) return first // legacy publieke URL
  const { data, error } = await supabase.storage
    .from("kosten-bijlagen")
    .createSignedUrl(first, 3600)
  if (error) return null
  return data?.signedUrl || null
}


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
  if (input.project_id !== undefined || input.projectId !== undefined) {
    payload.project_id = input.project_id ?? input.projectId ?? null
  }
  if (input.werkbon_id !== undefined || input.werkbonId !== undefined) {
    payload.werkbon_id = input.werkbon_id ?? input.werkbonId ?? null
  }
  if (input.company_id !== undefined || input.companyId !== undefined) {
    payload.company_id = input.company_id ?? input.companyId ?? null
  }
  if (input.bijlage_url !== undefined) payload.bijlage_url = input.bijlage_url
  if (input.klant_type !== undefined) payload.klant_type = input.klant_type
  if (input.btw_percentage !== undefined || input.btwPercentage !== undefined) {
    payload.btw_percentage = input.btw_percentage ?? input.btwPercentage ?? 21
  }
  if (input.btw_inclusief !== undefined || input.btwInclusief !== undefined) {
    payload.btw_inclusief = input.btw_inclusief ?? input.btwInclusief ?? null
  }
  if (input.customer_id !== undefined || input.customerId !== undefined) {
    payload.customer_id = input.customer_id ?? input.customerId ?? null
  }
  if (input.werkbon_materiaal_id !== undefined || input.werkbonMateriaalId !== undefined) {
    payload.werkbon_materiaal_id = input.werkbon_materiaal_id ?? input.werkbonMateriaalId ?? null
  }

  return payload
}

const isMateriaal = cat => (cat || '').trim().toLowerCase() === 'materiaal'

export const toJobCost = row => ({
  id: row.id,
  dealId: row.deal_id,
  projectId: row.project_id || null,
  werkbonId: row.werkbon_id || null,
  werkbonMateriaalId: row.werkbon_materiaal_id || null,
  companyId: row.company_id,
  cat: row.category || "overig",
  desc: row.description || "",
  amt: Number(row.amount || 0),
  // amount is exclusief BTW; btw-bedrag en incl. worden hieruit afgeleid.
  btwPercentage: row.btw_percentage != null ? Number(row.btw_percentage) : 21,
  date: row.cost_date || row.created_at?.slice(0, 10) || "",
  // Best-effort linkage to a customer via the deal — populated by joins where needed.
  custId: row.deals?.customer_id ?? null,
  customerId: row.customer_id || null,
  bijlageUrl: row.bijlage_url || null,
  klantType: row.klant_type || 'klant',
  externeRef: row.externe_referentie || null,
  btwInclusief: row.btw_inclusief ?? null,
  moneybirdDocumentId: row.moneybird_document_id || null,
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

export async function deleteJobCost(id) {
  // Heeft de kost een gekoppeld werkbon-materiaal? Verwijder dat materiaal —
  // de FK (ON DELETE CASCADE) ruimt de kost dan mee op. Zo blijven materiaal en
  // kost in sync, ongeacht vanaf welke kant je verwijdert.
  const { data: cost } = await supabase
    .from('job_costs').select('werkbon_materiaal_id').eq('id', id).maybeSingle()
  if (cost?.werkbon_materiaal_id) {
    const { error } = await supabase.from('werkbon_materialen').delete().eq('id', cost.werkbon_materiaal_id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('job_costs').delete().eq('id', id)
  if (error) throw error
}

// ── PROJECT-KOSTEN (direct + via werkbon, één keer geteld) ───────────────────
// Werkbon → project map voor de indirecte koppeling.
async function getWerkbonProjectMap() {
  const { data, error } = await supabase.from("werkbonnen").select("id, project_id")
  if (error) return {}
  const map = {}
  for (const w of (data || [])) if (w.project_id) map[w.id] = w.project_id
  return map
}

// Kosten van één project: rechtstreeks (project_id) óf via een werkbon van dit
// project. Een kost die via BEIDE routes matcht is nog steeds één rij → telt
// dus precies één keer (geen dubbeltelling).
export async function getProjectCosts(projectId) {
  if (!projectId) return []
  const wbMap = await getWerkbonProjectMap()
  const werkbonIds = Object.keys(wbMap).filter(id => wbMap[id] === projectId)

  const orParts = [`project_id.eq.${projectId}`]
  if (werkbonIds.length) orParts.push(`werkbon_id.in.(${werkbonIds.join(",")})`)

  const { data, error } = await supabase
    .from("job_costs")
    .select("*")
    .or(orParts.join(","))
    .order("cost_date", { ascending: false })
  if (error) throw error
  return (data || []).map(toJobCost)
}

// Totale kosten per project (direct + via werkbon), één keer per kost-rij.
// Geeft { projectId: totaalBedrag }.
export async function getProjectCostsMap() {
  const [costRes, wbMap] = await Promise.all([
    supabase.from("job_costs").select("amount, project_id, werkbon_id"),
    getWerkbonProjectMap(),
  ])
  const byProject = {}
  for (const c of (costRes.data || [])) {
    const pid = c.project_id || wbMap[c.werkbon_id] || null
    if (!pid) continue
    byProject[pid] = (byProject[pid] || 0) + Number(c.amount || 0)
  }
  return byProject
}

export async function updateJobCost(id, input) {
  const payload = mapJobCostFormToPayload(input)
  const { data, error } = await supabase.from('job_costs').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return toJobCost(data)
}

export async function createJobCost(input) {
  const base = mapJobCostFormToPayload(input)
  if (!base.description) throw new Error("Omschrijving is verplicht")
  if (!(base.amount > 0)) throw new Error("Voer een geldig bedrag in")

  // Werkbon-koppeling → project en klant automatisch afleiden van de werkbon
  // (tenzij expliciet meegegeven). Zo telt een werkbon-kost mee bij het project
  // en hangt hij aan de juiste klant.
  let wbCompanyId = null
  if (base.werkbon_id && (!base.project_id || !base.customer_id || (isMateriaal(base.category) && !base.werkbon_materiaal_id))) {
    const { data: wb } = await supabase
      .from("werkbonnen")
      .select("project_id, customer_id, company_id")
      .eq("id", base.werkbon_id)
      .maybeSingle()
    if (wb) {
      if (!base.project_id) base.project_id = wb.project_id || null
      if (!base.customer_id) base.customer_id = wb.customer_id || null
      wbCompanyId = wb.company_id || null
    }
  }

  // Materiaalkost gekoppeld aan een werkbon (en nog niet aan een materiaal):
  // maak een spiegel-regel in werkbon_materialen zodat hij ook in de materiaal-
  // lijst van de werkbon verschijnt. De lijst leest werkbon_materialen, de
  // kosten lezen job_costs → elk item telt precies één keer.
  if (base.werkbon_id && isMateriaal(base.category) && !base.werkbon_materiaal_id && wbCompanyId) {
    const { data: mat } = await supabase
      .from("werkbon_materialen")
      .insert({
        werkbon_id: base.werkbon_id,
        company_id: wbCompanyId,
        naam: (base.description || "Materiaal").replace(/^Materiaal:\s*/i, ""),
        aantal: 1,
        prijs_per: base.amount,
        subtotaal: base.amount,
      })
      .select("id")
      .single()
    if (mat?.id) base.werkbon_materiaal_id = mat.id
  }

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
