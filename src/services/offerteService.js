import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { logTijdlijnSafe } from "./klantTijdlijnService"

// DB columns: id, company_id, customer_id, deal_id, nummer, omschrijving, status,
// arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct,
// totaal_excl, totaal_incl, geldig_tot, verzonden_op, geaccepteerd_op, notes,
// created_at, updated_at

const toOfferte = row => ({
  id: row.id,
  companyId: row.company_id,
  customerId: row.customer_id,
  dealId: row.deal_id,
  nummer: row.nummer || "",
  omschrijving: row.omschrijving || "",
  status: row.status || "concept",
  arbeidsuren: Number(row.arbeidsuren || 0),
  uurtarief: Number(row.uurtarief || 55),
  materiaalkosten: Number(row.materiaalkosten || 0),
  reiskosten: Number(row.reiskosten || 0),
  margePct: Number(row.marge_pct || 25),
  btwPct: Number(row.btw_pct || 21),
  totaalExcl: Number(row.totaal_excl || 0),
  totaalIncl: Number(row.totaal_incl || 0),
  geldigTot: row.geldig_tot || null,
  verzondenOp: row.verzonden_op || null,
  geaccepteerdOp: row.geaccepteerd_op || null,
  notes: row.notes || "",
  createdAt: row.created_at,
  // Joined klant (optional — alleen aanwezig bij select met customers(*))
  customerName: row.customers?.name || "",
  raw: row,
})

const toOfferteItem = row => ({
  id: row.id,
  offerteId: row.offerte_id,
  companyId: row.company_id,
  omschrijving: row.omschrijving,
  eenheid: row.eenheid || "",
  aantal: Number(row.aantal || 1),
  prijsPer: Number(row.prijs_per || 0),
  subtotaal: Number(row.subtotaal || 0),
  volgorde: Number(row.volgorde || 0),
  raw: row,
})

// ── BEREKENINGEN ────────────────────────────────────────────────────────────

/**
 * Berekent totaal_excl en totaal_incl op basis van de offerte-velden.
 * Wordt gebruikt vóór elke insert of update.
 */
export function calculateOfferteTotals({ arbeidsuren = 0, uurtarief = 55, materiaalkosten = 0, reiskosten = 0, marge_pct = 25, btw_pct = 21, totaal_excl: preExcl, totaal_incl: preIncl } = {}) {
  if (preExcl !== undefined && preIncl !== undefined) {
    return { totaal_excl: preExcl, totaal_incl: preIncl }
  }
  const arbeid = Number(arbeidsuren) * Number(uurtarief)
  const subtotaal = arbeid + Number(materiaalkosten) + Number(reiskosten)
  const totaal_excl = subtotaal * (1 + Number(marge_pct) / 100)
  const totaal_incl = totaal_excl * (1 + Number(btw_pct) / 100)
  return {
    totaal_excl: Math.round(totaal_excl * 100) / 100,
    totaal_incl: Math.round(totaal_incl * 100) / 100,
  }
}

/**
 * Genereert een volgend offertenummer op basis van het huidige aantal offertes
 * voor de company. Formaat: BB-001, BB-002, …
 * Valt terug op BB-XXX als de query mislukt.
 */
export async function generateOfferteNumber() {
  const { count, error } = await supabase
    .from("offertes")
    .select("id", { count: "exact", head: true })
  if (error) return "BB-XXX"
  const next = (count || 0) + 1
  return `BB-${String(next).padStart(3, "0")}`
}

// ── OFFERTES ────────────────────────────────────────────────────────────────

export async function getOffertes() {
  const { data, error } = await supabase
    .from("offertes")
    .select("*, customers(name)")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map(toOfferte)
}

export async function getOffertesByCustomer(customerId) {
  if (!customerId) return []
  const { data, error } = await supabase
    .from("offertes")
    .select("*, customers(name)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map(toOfferte)
}

export async function getOfferteById(id) {
  const { data, error } = await supabase
    .from("offertes")
    .select("*, customers(name)")
    .eq("id", id)
    .single()
  if (error) throw error
  return toOfferte(data)
}

export async function createOfferte(input) {
  const totals = calculateOfferteTotals(input)
  const nummer = input.nummer || (await generateOfferteNumber())

  const base = {
    customer_id: input.customer_id || input.customerId || null,
    deal_id: input.deal_id || input.dealId || null,
    nummer,
    omschrijving: input.omschrijving || null,
    status: input.status || "concept",
    arbeidsuren: Number(input.arbeidsuren || 0),
    uurtarief: Number(input.uurtarief || 55),
    materiaalkosten: Number(input.materiaalkosten || 0),
    reiskosten: Number(input.reiskosten || 0),
    marge_pct: Number(input.marge_pct || input.margePct || 25),
    btw_pct: Number(input.btw_pct || input.btwPct || 21),
    ...totals,
    geldig_tot: input.geldig_tot || input.geldigTot || null,
    notes: input.notes || null,
  }
  // Verwijder null-waarden zodat DB-defaults gelden voor optionele kolommen
  Object.keys(base).forEach(k => base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("offertes")
    .insert(payload)
    .select("*, customers(name)")
    .single()
  if (error) throw error
  const offerte = toOfferte(data)
  if (offerte.customerId) {
    const bedrag = offerte.totaalIncl.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    logTijdlijnSafe(offerte.customerId, 'offerte_aangemaakt',
      `Offerte ${offerte.nummer} aangemaakt (€${bedrag})`, { nummer: offerte.nummer, totaalIncl: offerte.totaalIncl })
  }
  return offerte
}

export async function updateOfferte(id, input) {
  const updates = { ...input }

  // Herbereken totalen als financiële velden aanwezig zijn
  const financialKeys = ["arbeidsuren", "uurtarief", "materiaalkosten", "reiskosten", "marge_pct", "btw_pct"]
  const hasFinancial = financialKeys.some(k => k in updates || k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) in updates)
  if (hasFinancial) {
    // Haal huidige waarden op zodat we altijd een volledig beeld hebben
    const { data: current } = await supabase.from("offertes").select("*").eq("id", id).single()
    const merged = { ...current, ...updates }
    const totals = calculateOfferteTotals(merged)
    Object.assign(updates, totals)
  }

  // Verwijder frontend-aliases zodat alleen DB-kolommen overblijven
  delete updates.customerId
  delete updates.dealId
  delete updates.margePct
  delete updates.btwPct
  delete updates.totaalExcl
  delete updates.totaalIncl
  delete updates.geldigTot

  const { data, error } = await supabase
    .from("offertes")
    .update(updates)
    .eq("id", id)
    .select("*, customers(name)")
    .single()
  if (error) throw error
  const offerte = toOfferte(data)
  if (offerte.customerId && input.status) {
    const statusMap = {
      verzonden:    ['offerte_verzonden',    `Offerte ${offerte.nummer} verzonden naar klant`],
      geaccepteerd: ['offerte_geaccepteerd', `Offerte ${offerte.nummer} geaccepteerd`],
      afgewezen:    ['offerte_afgewezen',    `Offerte ${offerte.nummer} afgewezen`],
    }
    const entry = statusMap[input.status]
    if (entry) logTijdlijnSafe(offerte.customerId, entry[0], entry[1], { nummer: offerte.nummer })
  }
  return offerte
}

export async function deleteOfferte(id) {
  const { error } = await supabase.from("offertes").delete().eq("id", id)
  if (error) throw error
}

// ── OFFERTE ITEMS ────────────────────────────────────────────────────────────

export async function getOfferteItems(offerteId) {
  const { data, error } = await supabase
    .from("offerte_items")
    .select("*")
    .eq("offerte_id", offerteId)
    .order("volgorde", { ascending: true })
  if (error) throw error
  return (data || []).map(toOfferteItem)
}

export async function createOfferteItem(input) {
  const subtotaal = Math.round(Number(input.aantal || 1) * Number(input.prijs_per || 0) * 100) / 100
  const base = {
    offerte_id: input.offerte_id || input.offerteId,
    omschrijving: input.omschrijving,
    eenheid: input.eenheid || null,
    aantal: Number(input.aantal || 1),
    prijs_per: Number(input.prijs_per || input.prijsPer || 0),
    subtotaal,
    volgorde: Number(input.volgorde || 0),
  }
  if (!base.offerte_id) throw new Error("offerte_id is verplicht voor een offerte-item")
  if (!base.omschrijving) throw new Error("omschrijving is verplicht voor een offerte-item")

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("offerte_items")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toOfferteItem(data)
}

export async function updateOfferteItem(id, input) {
  const updates = { ...input }
  // Herbereken subtotaal indien aantal of prijs gewijzigd
  if ("aantal" in updates || "prijs_per" in updates || "prijsPer" in updates) {
    const aantal = Number(updates.aantal || 1)
    const prijsPer = Number(updates.prijs_per || updates.prijsPer || 0)
    updates.subtotaal = Math.round(aantal * prijsPer * 100) / 100
    delete updates.prijsPer
    delete updates.offerteId
  }
  const { data, error } = await supabase
    .from("offerte_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toOfferteItem(data)
}

export async function deleteOfferteItem(id) {
  const { error } = await supabase.from("offerte_items").delete().eq("id", id)
  if (error) throw error
}

export async function deleteOfferteItemsByOfferteId(offerteId) {
  const { error } = await supabase.from("offerte_items").delete().eq("offerte_id", offerteId)
  if (error) throw error
}
