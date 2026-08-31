import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// Werkdaguren: de werkdag van een medewerker, voor loon en verlof. Uren op een
// klus staan in werkbon_uren — die hebben andere schrijfrechten en voeden de
// nacalculatie. Hier zit dus bewust GEEN werkbon, project, klant of deal meer.
//
// DB columns: id, company_id, profile_id, datum, start_tijd, eind_tijd,
// pauze_minuten, uren, reis_km, notitie, created_at, updated_at
//
// `type` bestaat nog maar is vervallen.

const SELECT_UREN = "*, profiles(full_name)"

const toUrenregel = row => ({
  id: row.id,
  companyId: row.company_id,
  profileId: row.profile_id,
  datum: row.datum,
  startTijd: row.start_tijd || null,
  eindTijd: row.eind_tijd || null,
  pauzeMinuten: Number(row.pauze_minuten || 0),
  uren: Number(row.uren || 0),
  // Leeg blijft leeg: 0 km en "niet ingevuld" zijn niet hetzelfde.
  reisKm: row.reis_km == null ? null : Number(row.reis_km),
  notitie: row.notitie || "",
  createdAt: row.created_at,
  // Joined relaties (optioneel)
  medewerkerNaam: row.profiles?.full_name || "",
  raw: row,
})

/**
 * Het totaal van een urenregel: eind − begin − pauze.
 *
 * De pauze zat hier niet in, en dat is geen detail: 08:00–16:00 telde acht uur
 * terwijl het er zeven en een half zijn. Elke werkbon telde te veel, en dat is
 * wat iemand afleest bij het factureren.
 *
 * Retourneert null als een tijd ontbreekt, ongeldig is, of als er na aftrek van
 * de pauze niets overblijft — dan is de invoer niet kloppend te maken en hoort
 * het scherm dat te zeggen in plaats van 0 op te slaan.
 */
export function berekenUren(startTijd, eindTijd, pauzeMinuten = 0) {
  if (!startTijd || !eindTijd) return null
  const [sh, sm] = String(startTijd).split(":").map(Number)
  const [eh, em] = String(eindTijd).split(":").map(Number)
  if ([sh, sm, eh, em].some(v => isNaN(v))) return null
  const pauze = Math.max(0, Number(pauzeMinuten) || 0)
  const verschil = (eh * 60 + em) - (sh * 60 + sm) - pauze
  if (verschil <= 0) return null
  return Math.round((verschil / 60) * 100) / 100
}

/**
 * @deprecated Gebruik berekenUren(start, eind, pauze). Blijft bestaan omdat de
 * urenherinnering en de werkbonpagina hem nog aanroepen; zonder pauze is het
 * gedrag identiek aan vroeger.
 */
export function calculateHours(startTijd, eindTijd, pauzeMinuten = 0) {
  return berekenUren(startTijd, eindTijd, pauzeMinuten)
}

// ── FILTERS ──────────────────────────────────────────────────────────────────

/**
 * Haalt urenregistraties op.
 * @param {object} filters - Optionele filters:
 *   { profileId, vanDatum, totDatum }
 */
export async function getUrenregistratie(filters = {}) {
  const bouw = (select) => {
    let query = supabase
      .from("urenregistratie")
      .select(select)
      .order("datum", { ascending: false })
      .order("created_at", { ascending: false })

    if (filters.profileId) query = query.eq("profile_id", filters.profileId)
    if (filters.vanDatum) query = query.gte("datum", filters.vanDatum)
    if (filters.totDatum) query = query.lte("datum", filters.totDatum)
    return query
  }

  const { data, error } = await bouw(SELECT_UREN)
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

// Kilometers: alleen opslaan als er echt iets is ingevuld. Een leeg veld is
// "niet gemeten", niet "nul gereden".
function reisKmWaarde(input) {
  const ruw = input.reis_km ?? input.reisKm
  if (ruw === '' || ruw == null) return null
  const n = Number(ruw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createUrenregel(input) {
  // Bereken uren automatisch als start/eind opgegeven zijn maar uren ontbreekt
  const pauzeMinuten = Math.max(0, Number(input.pauze_minuten ?? input.pauzeMinuten ?? 0) || 0)
  let uren = input.uren != null ? Number(input.uren) : null
  if ((uren == null || uren === 0) && input.start_tijd && input.eind_tijd) {
    uren = berekenUren(input.start_tijd || input.startTijd, input.eind_tijd || input.eindTijd, pauzeMinuten)
  }
  if (!uren || uren <= 0) throw new Error("uren moet groter zijn dan 0")
  if (!input.datum) throw new Error("datum is verplicht")

  const base = {
    profile_id: input.profile_id || input.profileId,
    datum: input.datum,
    start_tijd: input.start_tijd || input.startTijd || null,
    eind_tijd: input.eind_tijd || input.eindTijd || null,
    pauze_minuten: pauzeMinuten,
    uren,
    // Leeg laten als er niets is ingevuld; 0 km is een uitspraak, leeg niet.
    reis_km: reisKmWaarde(input),
    notitie: input.notitie || null,
  }
  if (!base.profile_id) throw new Error("profile_id is verplicht")
  // pauze_minuten bewust behouden als hij 0 is: de kolom is not null en 0 is een
  // geldige waarde, geen "niet ingevuld".
  Object.keys(base).forEach(k => k !== 'pauze_minuten' && base[k] === null && delete base[k])

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("urenregistratie").insert(payload).select(SELECT_UREN).single()
  if (error) throw error
  return toUrenregel(data)
}

export async function updateUrenregel(id, input) {
  const updates = { ...input }

  // Herbereken uren als start/eind gewijzigd zijn
  if ("start_tijd" in updates || "eind_tijd" in updates || "startTijd" in updates
      || "eindTijd" in updates || "pauze_minuten" in updates || "pauzeMinuten" in updates) {
    const start = updates.start_tijd || updates.startTijd
    const eind = updates.eind_tijd || updates.eindTijd
    if ("pauzeMinuten" in updates && updates.pauze_minuten === undefined) {
      updates.pauze_minuten = Math.max(0, Number(updates.pauzeMinuten) || 0)
    }
    const berekend = berekenUren(start, eind, updates.pauze_minuten ?? 0)
    if (berekend !== null) updates.uren = berekend
    delete updates.startTijd
    delete updates.eindTijd
    delete updates.pauzeMinuten
  }
  if ("reisKm" in updates && updates.reis_km === undefined) {
    updates.reis_km = reisKmWaarde(updates)
    delete updates.reisKm
  }

  // Verwijder frontend-aliases (camelCase → echte kolommen blijven staan)
  delete updates.profileId
  delete updates.medewerkerNaam

  const { data, error } = await supabase
    .from("urenregistratie").update(updates).eq("id", id).select(SELECT_UREN).single()
  if (error) throw error
  return toUrenregel(data)
}

export async function deleteUrenregel(id) {
  const { error } = await supabase.from("urenregistratie").delete().eq("id", id)
  if (error) throw error
}
