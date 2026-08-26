import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { logTijdlijnSafe } from "./klantTijdlijnService"
import { regimeVanPct, regimeVoorOpslag } from "../lib/btwRegime"

// Canonieke offerte-statussen. Enige bron voor filter- en keuzelijsten, zodat
// die niet uit elkaar lopen met wat er daadwerkelijk wordt weggeschreven.
// Weergavekleur/-label komt uit utils/statusColors.js (domein 'offerte').
export const OFFERTE_STATUS = {
  concept:      'Concept',
  verzonden:    'Verzonden',
  geaccepteerd: 'Geaccepteerd',
  afgewezen:    'Afgewezen',
}
export const OFFERTE_STATUS_OPTIONS = Object.entries(OFFERTE_STATUS).map(([id, label]) => ({ id, label }))


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
  // VERVALLEN, zie createOfferte. `?? 25` en niet `|| 25`: een opgeslagen 0 las
  // anders terug als 25, waardoor elke offerte 25% marge leek te hebben.
  margePct: Number(row.marge_pct ?? 25),
  btwPct: Number(row.btw_pct || 21),
  totaalExcl: Number(row.totaal_excl || 0),
  totaalIncl: Number(row.totaal_incl || 0),
  geldigTot: row.geldig_tot || null,
  verzondenOp: row.verzonden_op || null,
  geaccepteerdOp: row.geaccepteerd_op || null,
  notes: row.notes || "",
  sign_token: row.sign_token || null,
  createdAt: row.created_at,
  signedAt: row.signed_at || null,
  signedByName: row.signed_by_name || '',
  signedByEmail: row.signed_by_email || '',
  signedPdfUrl: row.signed_pdf_url || null,
  signatureUrl: row.signature_url || null,
  sentToEmail: row.sent_to_email || null,
  // Versiebeheer: gezet zodra deze offerte door een nieuwere versie is vervangen.
  vervangenOp: row.vervangen_op || null,
  vervangenDoorNummer: row.vervangen_door_nummer || null,
  // Bevroren bedrijfs-branding op moment van versturen (zie documentSnapshot.js)
  snapshotLogoUrl: row.snapshot_logo_url || null,
  snapshotBrandingColor: row.snapshot_branding_color || null,
  snapshotBedrijfsnaam: row.snapshot_bedrijfsnaam || null,
  snapshotAdres: row.snapshot_adres || null,
  snapshotPostcode: row.snapshot_postcode || null,
  snapshotPlaats: row.snapshot_plaats || null,
  snapshotEmail: row.snapshot_email || null,
  snapshotKvk: row.snapshot_kvk || null,
  snapshotBtw: row.snapshot_btw || null,
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
  // type + btwPct zijn null voor regels van vóór de migratie (oude data).
  type: row.type || null,
  btwPct: row.btw_pct != null ? Number(row.btw_pct) : null,
  // Regels van vóór de btw_regime-migratie: afleiden uit het percentage.
  btwRegime: row.btw_regime || regimeVanPct(row.btw_pct),
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
 * Gooit een fout als de query mislukt (geen ongeldig nummer toekennen).
 */
export async function generateOfferteNumber() {
  const { count, error } = await supabase
    .from("offertes")
    .select("id", { count: "exact", head: true })
  if (error) {
    if (import.meta.env.DEV) console.error("[bb:offerte] offertenummer ophalen mislukt:", error.message)
    throw new Error("Offertenummer kon niet worden gegenereerd. Probeer het opnieuw.")
  }
  const next = (count || 0) + 1
  return `BB-${String(next).padStart(3, "0")}`
}

/**
 * Volgend versienummer voor een offerte. Het basisnummer is het nummer zonder
 * eventuele "-vN"-suffix; de nieuwe versie is de hoogste bestaande versie + 1.
 * Voorbeeld: BB-005 → BB-005-v2 → BB-005-v3 (het origineel telt als v1).
 */
export async function nextOfferteVersionNumber(nummer) {
  const base = String(nummer || "").replace(/-v\d+$/i, "") || "BB"
  const { data, error } = await supabase
    .from("offertes")
    .select("nummer")
    .ilike("nummer", `${base}%`)
  if (error) throw error
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`^${esc}(?:-v(\\d+))?$`, "i")
  let max = 1
  for (const r of data || []) {
    const m = re.exec(r.nummer || "")
    if (!m) continue
    const v = m[1] ? parseInt(m[1], 10) : 1
    if (v > max) max = v
  }
  return `${base}-v${max + 1}`
}

/**
 * Kopieert een offerte (incl. regelitems) naar een nieuwe, bewerkbare
 * concept-offerte.
 *  - asVersion=true  → nieuw versienummer van dezelfde offerte (BB-005-v2).
 *  - asVersion=false → nieuw regulier offertenummer (andere klant).
 * Verstuur-/onderteken-/snapshotgegevens worden NIET meegekopieerd.
 */
export async function copyOfferte(sourceId, { customerId, asVersion } = {}) {
  const src = await getOfferteById(sourceId)
  const items = await getOfferteItems(sourceId)
  const nummer = asVersion ? await nextOfferteVersionNumber(src.nummer) : await generateOfferteNumber()
  const created = await createOfferte({
    customer_id: customerId || src.customerId,
    deal_id: asVersion ? src.dealId || null : null,
    nummer,
    omschrijving: src.omschrijving,
    status: "concept",
    arbeidsuren: src.arbeidsuren,
    uurtarief: src.uurtarief,
    materiaalkosten: src.materiaalkosten,
    reiskosten: src.reiskosten,
    marge_pct: src.margePct,
    btw_pct: src.btwPct,
    totaal_excl: src.totaalExcl,
    totaal_incl: src.totaalIncl,
    geldig_tot: src.geldigTot,
    notes: src.notes,
  })
  for (const it of items) {
    await createOfferteItem({
      offerte_id: created.id,
      omschrijving: it.omschrijving,
      eenheid: it.eenheid || null,
      type: it.type,
      btw_pct: it.btwPct,
      btw_regime: it.btwRegime,
      aantal: it.aantal,
      prijs_per: it.prijsPer,
      subtotaal: it.subtotaal,
      volgorde: it.volgorde,
    })
  }
  return created
}

/**
 * Markeert een offerte als vervangen door een nieuwere versie. Het sign_token
 * blijft bestaan zodat de oude ondertekenlink een nette "niet meer geldig"-
 * melding kan tonen (i.p.v. "niet gevonden"). vervangen_op is geen inhoudelijk
 * veld, dus dit mag ook op een verstuurde offerte.
 */
export async function markOfferteVervangen(id, vervangenDoorNummer) {
  const { data, error } = await supabase
    .from("offertes")
    .update({ vervangen_op: new Date().toISOString(), vervangen_door_nummer: vervangenDoorNummer || null })
    .eq("id", id)
    .select("*, customers(name)")
    .single()
  if (error) throw error
  const offerte = toOfferte(data)
  if (offerte.customerId) {
    logTijdlijnSafe(offerte.customerId, "offerte_verzonden",
      `Offerte ${offerte.nummer} vervangen door nieuwe versie ${vervangenDoorNummer || ""}`.trim(),
      { nummer: offerte.nummer, vervangenDoor: vervangenDoorNummer })
  }
  return offerte
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
    // VERVALLEN. Er is geen invoerveld meer voor marge; de offertemodal werkt
    // met regels die hun eigen prijs dragen en geeft de totalen expliciet mee,
    // waardoor calculateOfferteTotals nooit voorbij zijn vroege terugkeer komt.
    // De kolom blijft staan omdat de RPC's van de ondertekenpagina hem in hun
    // signatuur hebben; hij wordt nergens meer op toegepast.
    //
    // `??` en niet `||`: de modal geeft bewust 0 mee, maar 0 is falsy, dus dat
    // werd stilzwijgend 25. Daardoor stond er marge 25 op élke offerte, ook op
    // die van vorige maand.
    marge_pct: Number(input.marge_pct ?? input.margePct ?? 25),
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

// Inhoudelijke velden die op een verstuurde/ondertekende offerte vastliggen.
const OFFERTE_CONTENT_FIELDS = ['customer_id', 'omschrijving', 'geldig_tot', 'notes', 'arbeidsuren', 'uurtarief', 'materiaalkosten', 'reiskosten', 'marge_pct', 'btw_pct', 'totaal_excl', 'totaal_incl']

export async function updateOfferte(id, input) {
  // Een verstuurde of ondertekende offerte is een vastgelegd document: de inhoud
  // kan niet meer wijzigen. Status-wijzigingen, verzend-/ondertekengegevens en de
  // branding-snapshot mogen nog wel.
  if (OFFERTE_CONTENT_FIELDS.some(k => k in input)) {
    const { data: cur } = await supabase.from('offertes').select('status, signed_at').eq('id', id).maybeSingle()
    if (cur && (cur.status !== 'concept' || cur.signed_at)) {
      throw new Error('Een verstuurde of ondertekende offerte kan niet meer gewijzigd worden')
    }
  }

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
  const btwPct = input.btw_pct ?? input.btwPct
  const base = {
    offerte_id: input.offerte_id || input.offerteId,
    omschrijving: input.omschrijving,
    eenheid: input.eenheid || null,
    type: input.type || null,
    btw_pct: btwPct != null ? Number(btwPct) : null,
    btw_regime: regimeVoorOpslag(input.btw_regime || input.btwRegime || regimeVanPct(btwPct)),
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
  // Herbereken subtotaal indien aantal of prijs gewijzigd. Beide waarden komen
  // uit de HUIDIGE rij als ze niet worden meegestuurd — anders zou een update van
  // alleen de prijs het aantal stilzwijgend als 1 rekenen (en andersom).
  if ("aantal" in updates || "prijs_per" in updates || "prijsPer" in updates) {
    const { data: huidig } = await supabase
      .from("offerte_items").select("aantal, prijs_per").eq("id", id).maybeSingle()
    const aantal = "aantal" in updates
      ? Number(updates.aantal || 0)
      : Number(huidig?.aantal ?? 1)
    const prijsPer = ("prijs_per" in updates || "prijsPer" in updates)
      ? Number(updates.prijs_per ?? updates.prijsPer ?? 0)
      : Number(huidig?.prijs_per ?? 0)
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
