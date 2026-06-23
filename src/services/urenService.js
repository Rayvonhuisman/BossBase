import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// DB columns: id, company_id, profile_id, customer_id, werkbon_id, deal_id,
// project_id, datum, start_tijd, eind_tijd, uren, type, notitie, created_at, updated_at

const toUrenregel = row => ({
  id: row.id,
  companyId: row.company_id,
  profileId: row.profile_id,
  customerId: row.customer_id,
  werkbonId: row.werkbon_id,
  dealId: row.deal_id,
  projectId: row.project_id,
  datum: row.datum,
  startTijd: row.start_tijd || null,
  eindTijd: row.eind_tijd || null,
  uren: Number(row.uren || 0),
  type: row.type || "arbeid",
  notitie: row.notitie || "",
  createdAt: row.created_at,
  // Joined relaties (optioneel)
  medewerkerNaam: row.profiles?.full_name || "",
  customerName: row.customers?.name || "",
  raw: row,
})

/**
 * Berekent het aantal uren tussen twee tijdstrings (HH:MM formaat).
 * Retourneert null als een van de waarden ontbreekt of ongeldig is.
 */
export function calculateHours(startTijd, eindTijd) {
  if (!startTijd || !eindTijd) return null
  const [sh, sm] = startTijd.split(":").map(Number)
  const [eh, em] = eindTijd.split(":").map(Number)
  if ([sh, sm, eh, em].some(v => isNaN(v))) return null
  const startMinuten = sh * 60 + sm
  const eindMinuten = eh * 60 + em
  const verschil = eindMinuten - startMinuten
  if (verschil <= 0) return null
  return Math.round((verschil / 60) * 100) / 100
}

// ── FILTERS ──────────────────────────────────────────────────────────────────

/**
 * Haalt urenregistraties op.
 * @param {object} filters - Optionele filters:
 *   { profileId, werkbonId, customerId, dealId, vanDatum, totDatum }
 */
export async function getUrenregistratie(filters = {}) {
  let query = supabase
    .from("urenregistratie")
    .select("*, profiles(full_name), customers(name)")
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false })

  if (filters.profileId) query = query.eq("profile_id", filters.profileId)
  if (filters.werkbonId) query = query.eq("werkbon_id", filters.werkbonId)
  if (filters.customerId) query = query.eq("customer_id", filters.customerId)
  if (filters.dealId) query = query.eq("deal_id", filters.dealId)
  if (filters.vanDatum) query = query.gte("datum", filters.vanDatum)
  if (filters.totDatum) query = query.lte("datum", filters.totDatum)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(toUrenregel)
}

// ── SAMENVATTING ─────────────────────────────────────────────────────────────

/**
 * Berekent een samenvatting van uren (totaal + per medewerker).
 * @param {object} filters - Zelfde opties als getUrenregistratie
 * @returns {{ totaal: number, perMedewerker: Array<{profileId, naam, uren}> }}
 */
export async function getUrenSummary(filters = {}) {
  const regels = await getUrenregistratie(filters)
  const totaal = regels.reduce((sum, r) => sum + r.uren, 0)

  const medewerkerMap = {}
  for (const r of regels) {
    if (!medewerkerMap[r.profileId]) {
      medewerkerMap[r.profileId] = { profileId: r.profileId, naam: r.medewerkerNaam, uren: 0 }
    }
    medewerkerMap[r.profileId].uren += r.uren
  }

  return {
    totaal: Math.round(totaal * 100) / 100,
    perMedewerker: Object.values(medewerkerMap).map(m => ({
      ...m,
      uren: Math.round(m.uren * 100) / 100,
    })),
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createUrenregel(input) {
  // Bereken uren automatisch als start/eind opgegeven zijn maar uren ontbreekt
  let uren = input.uren != null ? Number(input.uren) : null
  if ((uren == null || uren === 0) && input.start_tijd && input.eind_tijd) {
    uren = calculateHours(input.start_tijd || input.startTijd, input.eind_tijd || input.eindTijd)
  }
  if (!uren || uren <= 0) throw new Error("uren moet groter zijn dan 0")
  if (!input.datum) throw new Error("datum is verplicht")

  // Werkbon-koppeling → project en klant automatisch afleiden van de werkbon
  // (tenzij expliciet meegegeven). Zo tellen werkbon-uren mee in de
  // project-nacalculatie en hangen ze aan de juiste klant.
  const werkbon_id = input.werkbon_id || input.werkbonId || null
  let project_id = input.project_id || input.projectId || null
  let customer_id = input.customer_id || input.customerId || null
  if (werkbon_id && (!project_id || !customer_id)) {
    const { data: wb } = await supabase
      .from("werkbonnen")
      .select("project_id, customer_id")
      .eq("id", werkbon_id)
      .maybeSingle()
    if (wb) {
      if (!project_id) project_id = wb.project_id || null
      if (!customer_id) customer_id = wb.customer_id || null
    }
  }

  const base = {
    profile_id: input.profile_id || input.profileId,
    customer_id: customer_id || null,
    werkbon_id,
    deal_id: input.deal_id || input.dealId || null,
    project_id: project_id || null,
    datum: input.datum,
    start_tijd: input.start_tijd || input.startTijd || null,
    eind_tijd: input.eind_tijd || input.eindTijd || null,
    uren,
    type: input.type || "arbeid",
    notitie: input.notitie || null,
  }
  if (!base.profile_id) throw new Error("profile_id is verplicht")
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("urenregistratie")
    .insert(payload)
    .select("*, profiles(full_name), customers(name)")
    .single()
  if (error) throw error
  return toUrenregel(data)
}

export async function updateUrenregel(id, input) {
  const updates = { ...input }

  // Herbereken uren als start/eind gewijzigd zijn
  if ("start_tijd" in updates || "eind_tijd" in updates || "startTijd" in updates || "eindTijd" in updates) {
    const start = updates.start_tijd || updates.startTijd
    const eind = updates.eind_tijd || updates.eindTijd
    const berekend = calculateHours(start, eind)
    if (berekend !== null) updates.uren = berekend
    delete updates.startTijd
    delete updates.eindTijd
  }

  // Verwijder frontend-aliases (camelCase → echte kolommen blijven staan)
  if ("projectId" in updates && updates.project_id === undefined) updates.project_id = updates.projectId
  delete updates.profileId
  delete updates.customerId
  delete updates.werkbonId
  delete updates.dealId
  delete updates.projectId
  delete updates.medewerkerNaam
  delete updates.customerName

  const { data, error } = await supabase
    .from("urenregistratie")
    .update(updates)
    .eq("id", id)
    .select("*, profiles(full_name), customers(name)")
    .single()
  if (error) throw error
  return toUrenregel(data)
}

export async function deleteUrenregel(id) {
  const { error } = await supabase.from("urenregistratie").delete().eq("id", id)
  if (error) throw error
}
