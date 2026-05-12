import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// DB columns werkbonnen: id, company_id, customer_id, deal_id, offerte_id,
// assigned_to, titel, omschrijving, status, gepland_op, starttijd, eindtijd,
// locatie, notes, created_at, updated_at

const toWerkbon = row => ({
  id: row.id,
  companyId: row.company_id,
  customerId: row.customer_id,
  dealId: row.deal_id,
  offerteId: row.offerte_id,
  assignedTo: row.assigned_to,
  titel: row.titel || "",
  omschrijving: row.omschrijving || "",
  status: row.status || "gepland",
  geplandOp: row.gepland_op || null,
  starttijd: row.starttijd || null,
  eindtijd: row.eindtijd || null,
  locatie: row.locatie || "",
  notes: row.notes || "",
  createdAt: row.created_at,
  // Joined relaties (optioneel)
  customerName: row.customers?.name || "",
  assignedName: row.profiles?.full_name || "",
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

const toWerkbonMateriaal = row => ({
  id: row.id,
  werkbonId: row.werkbon_id,
  companyId: row.company_id,
  naam: row.naam,
  eenheid: row.eenheid || "",
  aantal: Number(row.aantal || 1),
  prijsPer: Number(row.prijs_per || 0),
  subtotaal: Number(row.subtotaal || 0),
  raw: row,
})

// ── WERKBONNEN ───────────────────────────────────────────────────────────────

export async function getWerkbonnen() {
  const { data, error } = await supabase
    .from("werkbonnen")
    .select("*, customers(name), profiles(full_name)")
    .order("gepland_op", { ascending: true })
  if (error) throw error
  return (data || []).map(toWerkbon)
}

export async function getWerkbonById(id) {
  const { data, error } = await supabase
    .from("werkbonnen")
    .select("*, customers(name), profiles(full_name)")
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
    assigned_to: input.assigned_to || input.assignedTo || null,
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
    .select("*, customers(name), profiles(full_name)")
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
  delete updates.assignedTo
  delete updates.geplandOp
  delete updates.customerName
  delete updates.assignedName

  const { data, error } = await supabase
    .from("werkbonnen")
    .update(updates)
    .eq("id", id)
    .select("*, customers(name), profiles(full_name)")
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
  return updateWerkbon(id, { status: "afgerond" })
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
  const { data, error } = await supabase
    .from("werkbon_materialen")
    .select("*")
    .eq("werkbon_id", werkbonId)
    .order("created_at", { ascending: true })
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
