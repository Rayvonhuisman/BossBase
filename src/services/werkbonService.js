import { supabase } from "../lib/supabase"
import { getCompanyId, withCompanyId } from "../lib/currentCompany"


// DB columns werkbonnen: id, company_id, customer_id, deal_id, offerte_id,
// assigned_to, titel, omschrijving, status, gepland_op, starttijd, eindtijd,
// locatie, notes, created_at, updated_at

const toWerkbon = row => ({
  id: row.id,
  companyId: row.company_id,
  customerId: row.customer_id,
  dealId: row.deal_id,
  offerteId: row.offerte_id,
  projectId: row.project_id || null,
  assignedTo: row.assigned_to,
  voertuigId: row.voertuig_id || null,
  titel: row.titel || "",
  omschrijving: row.omschrijving || "",
  status: row.status || "gepland",
  geplandOp: row.gepland_op || null,
  starttijd: row.starttijd || null,
  eindtijd: row.eindtijd || null,
  locatie: row.locatie || "",
  notes: row.notes || "",
  werkbonNotities: row.werkbon_notities || "",
  afgerondOp: row.afgerond_op || null,
  createdAt: row.created_at,
  // Joined relaties (optioneel)
  customerName: row.customers?.name || "",
  assignedName: row.profiles?.full_name || "",
  projectName: row.projects?.name || "",
  voertuigNaam: row.voertuigen?.naam || "",
  voertuigKleur: row.voertuigen?.kleur || "",
  raw: row,
})

const toWerkbonTaak = row => ({
  id: row.id,
  werkbonId: row.werkbon_id,
  companyId: row.company_id,
  omschrijving: row.omschrijving,
  afgerond: Boolean(row.afgerond),
  volgorde: Number(row.volgorde || 0),
  raw: row,
})

const toWerkbonMateriaal = row => {
  // BTW leeft op de gekoppelde job_cost (geen apart systeem). Join geeft die mee.
  const jc = Array.isArray(row.job_costs) ? row.job_costs[0] : row.job_costs
  return {
    id: row.id,
    werkbonId: row.werkbon_id,
    companyId: row.company_id,
    naam: row.naam,
    eenheid: row.eenheid || "",
    aantal: Number(row.aantal || 1),
    prijsPer: Number(row.prijs_per || 0),
    subtotaal: Number(row.subtotaal || 0),
    btwPercentage: jc?.btw_percentage != null ? Number(jc.btw_percentage) : 21,
    raw: row,
  }
}

// ── WERKBONNEN ───────────────────────────────────────────────────────────────

const WERKBON_SELECT = "*, customers(name), profiles(full_name), projects(name), voertuigen(naam, kleur)"

export async function getWerkbonnen() {
  const { data, error } = await supabase
    .from("werkbonnen")
    .select(WERKBON_SELECT)
    .order("gepland_op", { ascending: true })
  if (error) throw error
  return (data || []).map(toWerkbon)
}

export async function getWerkbonnenForWeek(startDate, endDate) {
  const { data, error } = await supabase
    .from("werkbonnen")
    .select(WERKBON_SELECT)
    .or(`gepland_op.gte.${startDate},gepland_op.is.null`)
    .lte("gepland_op", endDate)
    .order("starttijd", { ascending: true, nullsFirst: true })
  if (error) throw error
  return (data || []).map(toWerkbon)
}

export async function getWerkbonById(id) {
  const { data, error } = await supabase
    .from("werkbonnen")
    .select(WERKBON_SELECT)
    .eq("id", id)
    .single()
  if (error) throw error
  return toWerkbon(data)
}

export async function createWerkbon(input) {
  const base = {
    customer_id: input.customer_id || input.customerId || null,
    deal_id: input.deal_id || input.dealId || null,
    offerte_id: input.offerte_id || input.offerteId || null,
    project_id: input.project_id || input.projectId || null,
    assigned_to: input.assigned_to || input.assignedTo || null,
    voertuig_id: input.voertuig_id || input.voertuigId || null,
    titel: input.titel,
    omschrijving: input.omschrijving || null,
    status: input.status || "gepland",
    gepland_op: input.gepland_op || input.geplandOp || null,
    starttijd: input.starttijd || null,
    eindtijd: input.eindtijd || null,
    locatie: input.locatie || null,
    notes: input.notes || null,
  }
  if (!base.titel) throw new Error("titel is verplicht voor een werkbon")
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("werkbonnen")
    .insert(payload)
    .select(WERKBON_SELECT)
    .single()
  if (error) throw error
  return toWerkbon(data)
}

export async function updateWerkbon(id, input) {
  const updates = { ...input }
  // Verwijder frontend-aliases
  delete updates.customerId
  delete updates.dealId
  delete updates.offerteId
  delete updates.projectId
  delete updates.assignedTo
  delete updates.voertuigId
  delete updates.geplandOp
  delete updates.customerName
  delete updates.assignedName
  delete updates.projectName
  delete updates.voertuigNaam
  delete updates.voertuigKleur
  delete updates.raw

  const { data, error } = await supabase
    .from("werkbonnen")
    .update(updates)
    .eq("id", id)
    .select(WERKBON_SELECT)
    .single()
  if (error) throw error
  return toWerkbon(data)
}

export async function deleteWerkbon(id) {
  const { error } = await supabase.from("werkbonnen").delete().eq("id", id)
  if (error) throw error
}

/** Zet een werkbon op 'afgerond' en registreert de afrondtijd. */
export async function completeWerkbon(id) {
  return updateWerkbon(id, { status: "afgerond", afgerond_op: new Date().toISOString() })
}

// ── WERKBON TAKEN ────────────────────────────────────────────────────────────

export async function getWerkbonTaken(werkbonId) {
  const { data, error } = await supabase
    .from("werkbon_taken")
    .select("*")
    .eq("werkbon_id", werkbonId)
    .order("volgorde", { ascending: true })
  if (error) throw error
  return (data || []).map(toWerkbonTaak)
}

export async function createWerkbonTaak(input) {
  const base = {
    werkbon_id: input.werkbon_id || input.werkbonId,
    omschrijving: input.omschrijving,
    afgerond: Boolean(input.afgerond),
    volgorde: Number(input.volgorde || 0),
  }
  if (!base.werkbon_id) throw new Error("werkbon_id is verplicht voor een taak")
  if (!base.omschrijving) throw new Error("omschrijving is verplicht voor een taak")

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("werkbon_taken")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toWerkbonTaak(data)
}

export async function updateWerkbonTaak(id, input) {
  const updates = { ...input }
  delete updates.werkbonId
  const { data, error } = await supabase
    .from("werkbon_taken")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toWerkbonTaak(data)
}

/** Schakel het afgerond-vlagje van een taak om. */
export async function toggleWerkbonTaak(id, afgerond) {
  return updateWerkbonTaak(id, { afgerond: Boolean(afgerond) })
}

export async function deleteWerkbonTaak(id) {
  const { error } = await supabase.from("werkbon_taken").delete().eq("id", id)
  if (error) throw error
}

// ── WERKBON MATERIALEN ───────────────────────────────────────────────────────

export async function getWerkbonMaterialen(werkbonId) {
  // BTW-percentage komt van de gekoppelde job_cost (werkbon_materiaal_id).
  let { data, error } = await supabase
    .from("werkbon_materialen")
    .select("*, job_costs!werkbon_materiaal_id(btw_percentage)")
    .eq("werkbon_id", werkbonId)
    .order("created_at", { ascending: true })
  if (error && /could not find.*relationship|foreign key/i.test(error.message)) {
    const fb = await supabase
      .from("werkbon_materialen").select("*").eq("werkbon_id", werkbonId).order("created_at", { ascending: true })
    data = fb.data; error = fb.error
  }
  if (error) throw error
  return (data || []).map(toWerkbonMateriaal)
}

export async function createWerkbonMateriaal(input) {
  const aantal = Number(input.aantal || 1)
  const prijsPer = Number(input.prijs_per || input.prijsPer || 0)
  const subtotaal = Math.round(aantal * prijsPer * 100) / 100

  const base = {
    werkbon_id: input.werkbon_id || input.werkbonId,
    naam: input.naam,
    eenheid: input.eenheid || null,
    aantal,
    prijs_per: prijsPer,
    subtotaal,
  }
  if (!base.werkbon_id) throw new Error("werkbon_id is verplicht voor een materiaalregel")
  if (!base.naam) throw new Error("naam is verplicht voor een materiaalregel")
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("werkbon_materialen")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toWerkbonMateriaal(data)
}

export async function updateWerkbonMateriaal(id, input) {
  const updates = { ...input }
  // Herbereken subtotaal indien aantal of prijs gewijzigd
  if ("aantal" in updates || "prijs_per" in updates || "prijsPer" in updates) {
    const aantal = Number(updates.aantal || 1)
    const prijsPer = Number(updates.prijs_per || updates.prijsPer || 0)
    updates.subtotaal = Math.round(aantal * prijsPer * 100) / 100
    delete updates.prijsPer
  }
  delete updates.werkbonId
  const { data, error } = await supabase
    .from("werkbon_materialen")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toWerkbonMateriaal(data)
}

export async function deleteWerkbonMateriaal(id) {
  const { error } = await supabase.from("werkbon_materialen").delete().eq("id", id)
  if (error) throw error
}

// ── WERKBON NOTITIES ─────────────────────────────────────────────────────────

export async function updateWerkbonNotities(id, notities) {
  return updateWerkbon(id, { werkbon_notities: notities || null })
}

// ── WERKBON FOTOS ────────────────────────────────────────────────────────────

const toWerkbonFoto = row => ({
  id: row.id,
  werkbonId: row.werkbon_id,
  companyId: row.company_id,
  url: row.url,
  categorie: row.categorie,
  createdAt: row.created_at,
})

export async function getWerkbonFotos(werkbonId) {
  const { data, error } = await supabase
    .from("werkbon_fotos")
    .select("*")
    .eq("werkbon_id", werkbonId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data || []).map(toWerkbonFoto)
}

export async function uploadWerkbonFoto(werkbonId, file, categorie) {
  const companyId = await getCompanyId()
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
  const path = `${companyId}/${werkbonId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("werkbon-fotos")
    .upload(path, file, { contentType: file.type || "image/jpeg" })
  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage.from("werkbon-fotos").getPublicUrl(path)

  const payload = await withCompanyId({ werkbon_id: werkbonId, url: urlData.publicUrl, categorie })
  const { data, error } = await supabase.from("werkbon_fotos").insert(payload).select().single()
  if (error) throw error
  return toWerkbonFoto(data)
}

export async function deleteWerkbonFoto(id, url) {
  const idx = (url || "").indexOf("/werkbon-fotos/")
  if (idx !== -1) {
    const storagePath = url.slice(idx + "/werkbon-fotos/".length)
    await supabase.storage.from("werkbon-fotos").remove([storagePath]).catch(() => {})
  }
  const { error } = await supabase.from("werkbon_fotos").delete().eq("id", id)
  if (error) throw error
}

// ── WERKBON MEERWERK ─────────────────────────────────────────────────────────

const toWerkbonMeerwerk = row => ({
  id: row.id,
  werkbonId: row.werkbon_id,
  companyId: row.company_id,
  omschrijving: row.omschrijving || "",
  prijs: Number(row.prijs || 0),
  createdAt: row.created_at,
})

export async function getWerkbonMeerwerk(werkbonId) {
  const { data, error } = await supabase
    .from("werkbon_meerwerk")
    .select("*")
    .eq("werkbon_id", werkbonId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data || []).map(toWerkbonMeerwerk)
}

export async function createWerkbonMeerwerk(input) {
  const base = {
    werkbon_id: input.werkbon_id || input.werkbonId,
    omschrijving: input.omschrijving,
    prijs: Number(input.prijs || 0),
  }
  if (!base.werkbon_id) throw new Error("werkbon_id is verplicht")
  if (!base.omschrijving) throw new Error("omschrijving is verplicht")
  const payload = await withCompanyId(base)
  const { data, error } = await supabase.from("werkbon_meerwerk").insert(payload).select().single()
  if (error) throw error
  return toWerkbonMeerwerk(data)
}

export async function deleteWerkbonMeerwerk(id) {
  const { error } = await supabase.from("werkbon_meerwerk").delete().eq("id", id)
  if (error) throw error
}

// ── WERKBONNEN PER PROJECT ───────────────────────────────────────────────────

export async function getWerkbonnenByProject(projectId) {
  const { data, error } = await supabase
    .from("werkbonnen")
    .select("*, customers(name), profiles(full_name), projects(name), voertuigen(naam, kleur), werkbon_taken(afgerond)")
    .eq("project_id", projectId)
    .order("gepland_op", { ascending: true })
  if (error) throw error
  return (data || []).map(row => ({
    ...toWerkbon(row),
    taakTotal: (row.werkbon_taken || []).length,
    taakDone: (row.werkbon_taken || []).filter(t => t.afgerond).length,
  }))
}

// ── TAKEN COUNTS (batch, for list view) ─────────────────────────────────────

export async function getAllWerkbonTakenCounts() {
  const { data, error } = await supabase
    .from("werkbon_taken")
    .select("werkbon_id, afgerond")
  if (error) throw error
  const counts = {}
  for (const row of data || []) {
    if (!counts[row.werkbon_id]) counts[row.werkbon_id] = { total: 0, done: 0 }
    counts[row.werkbon_id].total++
    if (row.afgerond) counts[row.werkbon_id].done++
  }
  return counts
}
