import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// ── DATA MAPPERS ─────────────────────────────────────────────────────────────

const toBedrijfsinstellingen = row => ({
  id: row.id,
  companyId: row.company_id,
  uurtarief: Number(row.uurtarief || 55),
  reiskostenPerKm: Number(row.reiskosten_per_km || 0.23),
  standaardMarge: Number(row.standaard_marge || 25),
  btwPct: Number(row.btw_pct || 21),
  offerteGeldigDagen: Number(row.offerte_geldig_dagen || 14),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  raw: row,
})

const toEmailTemplate = row => ({
  id: row.id,
  companyId: row.company_id,
  type: row.type,
  name: row.name || "",
  onderwerp: row.onderwerp || "",
  body: row.body || "",
  body_html: row.body_html || row.body || "",
  is_default: Boolean(row.is_default),
  actief: Boolean(row.actief),
  auto_versturen: Boolean(row.auto_versturen),
  auto_dagen: Number(row.auto_dagen ?? 7),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  raw: row,
})

const toPipelineStage = row => ({
  id: row.id,
  companyId: row.company_id,
  name: row.name || "",
  position: Number(row.position ?? 0),
  colorClass: row.color_class || "b-gray",
  createdAt: row.created_at,
  raw: row,
})

// ── BEDRIJFSINSTELLINGEN ─────────────────────────────────────────────────────

/**
 * Haalt de bedrijfsinstellingen op voor de ingelogde company.
 * Retourneert null als er nog geen rij bestaat.
 */
export async function getBedrijfsinstellingen() {
  const { data, error } = await supabase
    .from("bedrijfsinstellingen")
    .select("*")
    .maybeSingle()
  if (error) throw error
  return data ? toBedrijfsinstellingen(data) : null
}

/**
 * Maakt een nieuwe rij aan als die ontbreekt, of werkt de bestaande bij.
 * Gebruik: upsertBedrijfsinstellingen({ uurtarief: 60, standaard_marge: 30 })
 */
export async function upsertBedrijfsinstellingen(input) {
  const updates = {
    uurtarief: input.uurtarief != null ? Number(input.uurtarief) : undefined,
    reiskosten_per_km: input.reiskosten_per_km ?? input.reiskostenPerKm != null
      ? Number(input.reiskosten_per_km ?? input.reiskostenPerKm)
      : undefined,
    standaard_marge: input.standaard_marge ?? input.standaardMarge != null
      ? Number(input.standaard_marge ?? input.standaardMarge)
      : undefined,
    btw_pct: input.btw_pct ?? input.btwPct != null
      ? Number(input.btw_pct ?? input.btwPct)
      : undefined,
    offerte_geldig_dagen: input.offerte_geldig_dagen ?? input.offerteGeldigDagen != null
      ? Number(input.offerte_geldig_dagen ?? input.offerteGeldigDagen)
      : undefined,
    updated_at: new Date().toISOString(),
  }
  // Verwijder undefined waarden zodat bestaande DB-waarden niet worden overschreven
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k])

  const payload = await withCompanyId(updates)

  // Probeer eerst te updaten; als er niets bestaat, insert
  const { data: existing } = await supabase
    .from("bedrijfsinstellingen")
    .select("id")
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await supabase
      .from("bedrijfsinstellingen")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single()
    if (error) throw error
    return toBedrijfsinstellingen(data)
  }

  // Geen bestaande rij — aanmaken
  const { data, error } = await supabase
    .from("bedrijfsinstellingen")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toBedrijfsinstellingen(data)
}

// ── E-MAILTEMPLATES ──────────────────────────────────────────────────────────

export async function getEmailTemplates() {
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .order("type", { ascending: true })
  if (error) throw error
  return (data || []).map(toEmailTemplate)
}

export async function updateEmailTemplate(id, input) {
  const updates = {
    onderwerp: input.onderwerp,
    body: input.body,
    body_html: input.body_html,
    actief: input.actief != null ? Boolean(input.actief) : undefined,
    auto_versturen: input.auto_versturen != null ? Boolean(input.auto_versturen) : undefined,
    auto_dagen: input.auto_dagen != null ? Number(input.auto_dagen) : undefined,
    updated_at: new Date().toISOString(),
  }
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k])

  const { data, error } = await supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toEmailTemplate(data)
}

export async function createEmailTemplate(input) {
  const base = {
    type: input.type,
    name: input.name || input.type,
    onderwerp: input.onderwerp || '',
    body: input.body || '',
    body_html: input.body || '',
    is_default: false,
    actief: true,
    auto_versturen: false,
    auto_dagen: 7,
  }
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("email_templates")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toEmailTemplate(data)
}

export async function deleteEmailTemplate(id) {
  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", id)
  if (error) throw error
}

// ── PIPELINE STAGES ──────────────────────────────────────────────────────────
// Gebruikt de bestaande pipeline_stages tabel uit dealService.

export async function getPipelineStages() {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position", { ascending: true })
  if (error) throw error
  return (data || []).map(toPipelineStage)
}

export async function createPipelineStage(input) {
  if (!input.name) throw new Error("name is verplicht voor een pipeline-fase")

  // Bepaal de volgende positie
  const { data: last } = await supabase
    .from("pipeline_stages")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (last?.position ?? -1) + 1

  const base = {
    name: input.name,
    position: input.position != null ? Number(input.position) : nextPosition,
    color_class: input.color_class || "b-gray",
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("pipeline_stages")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toPipelineStage(data)
}

export async function updatePipelineStage(id, input) {
  const updates = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.position !== undefined) updates.position = Number(input.position)
  if (input.color_class !== undefined) updates.color_class = input.color_class

  const { data, error } = await supabase
    .from("pipeline_stages")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toPipelineStage(data)
}

export async function deletePipelineStage(id) {
  const { error } = await supabase.from("pipeline_stages").delete().eq("id", id)
  if (error) throw error
}

/**
 * Herordent alle pipeline-stages in één keer.
 * @param {Array<{id: string, position: number}>} stages
 */
export async function reorderPipelineStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return []

  // Supabase JS v2 ondersteunt geen bulk-update in één query;
  // we sturen parallelle updates en wachten op alle resultaten.
  const updates = stages.map(({ id, position }) =>
    supabase
      .from("pipeline_stages")
      .update({ position: Number(position) })
      .eq("id", id)
      .select()
      .single()
  )

  const results = await Promise.all(updates)
  const firstError = results.find(r => r.error)
  if (firstError?.error) throw firstError.error

  return results.map(r => toPipelineStage(r.data))
}
