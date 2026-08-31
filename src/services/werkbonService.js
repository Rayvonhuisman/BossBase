import { supabase } from "../lib/supabase"
import { getCompanyId, withCompanyId } from "../lib/currentCompany"
import { comprimeerAfbeelding, FOTO_MAX_ZIJDE } from "../utils/afbeeldingComprimeren.js"


// DB columns werkbonnen: id, company_id, customer_id, deal_id, offerte_id,
// assigned_to, titel, omschrijving, status, gepland_op, starttijd, eindtijd,
// locatie, notes, gestart_op, afgerond_op, created_at, updated_at

// Combineert een geplande datum (YYYY-MM-DD) + tijd (HH:MM) tot een ISO-moment.
// Vereist BEIDE — een geplande datum zonder tijd telt niet als geplande start
// (spiegelt de "niet ingepland"-definitie in de Planning: !gepland_op || !starttijd).
// Spiegelt calendarService.buildEventTimes qua lokale-tijd-interpretatie.
export function plannedStartIso(geplandOp, starttijd) {
  if (!geplandOp || !starttijd) return null
  const t = starttijd.length === 5 ? `${starttijd}:00` : starttijd // HH:MM → HH:MM:SS
  const d = new Date(`${geplandOp}T${t}`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

const toWerkbon = row => ({
  id: row.id,
  companyId: row.company_id,
  customerId: row.customer_id,
  dealId: row.deal_id,
  offerteId: row.offerte_id,
  projectId: row.project_id || null,
  assignedTo: row.assigned_to,
  // Meerdere toegewezen medewerkers; valt terug op de enkele assigned_to.
  assignedToIds: Array.isArray(row.assigned_to_ids) && row.assigned_to_ids.length
    ? row.assigned_to_ids
    : (row.assigned_to ? [row.assigned_to] : []),
  // Verantwoordelijken (subset van de gekoppelde medewerkers) die de werkbon
  // mogen bewerken. Leeg = alleen admin/planner beheert de bon.
  verantwoordelijkeIds: Array.isArray(row.verantwoordelijke_ids) ? row.verantwoordelijke_ids : [],
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
  nummer: row.nummer || "",
  // Ondertekening. sign_token is de publieke link (/werkbon/<token>) en staat
  // bewust in de mapper: de app moet hem kunnen mailen zonder extra query.
  signToken: row.sign_token || null,
  ondertekendOp: row.ondertekend_op || null,
  handtekeningUrl: row.handtekening_url || null,
  ondertekendDoorNaam: row.ondertekend_door_naam || "",
  ondertekendDoorEmail: row.ondertekend_door_email || "",
  ondertekendePdfUrl: row.ondertekende_pdf_url || null,
  verstuurdNaarEmail: row.verstuurd_naar_email || "",
  verstuurdOp: row.verstuurd_op || null,
  // Ondertekend = op slot: uren, taken en materiaal liggen vast. De DB-trigger
  // bb_werkbon_op_slot weigert het ook, dit vlagje is er zodat de UI niet eerst
  // een knop toont die daarna faalt.
  opSlot: !!row.ondertekend_op,
  gestartOp: row.gestart_op || null,
  // Effectief startmoment: het werkelijk vastgelegde start (gestart_op, gezet bij
  // "Start klus") valt terug op de geplande start (gepland_op + starttijd) zolang
  // de knop niet is gebruikt. Afgeleid (niet fysiek opgeslagen) — zie taakeisen.
  effectiveStartOp: row.gestart_op || plannedStartIso(row.gepland_op, row.starttijd),
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
    materiaalId: row.materiaal_id || null,
    leverancierId: row.leverancier_id || null,
    // null = niet ingevuld óf geen recht om het te zien; de UI leest dat af aan
    // het recht, niet aan de waarde.
    inkoopprijsPer: (() => {
      const k = Array.isArray(row.werkbon_materiaal_inkoop)
        ? row.werkbon_materiaal_inkoop[0] : row.werkbon_materiaal_inkoop
      return k?.inkoopprijs_per != null ? Number(k.inkoopprijs_per) : null
    })(),
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

// Bepaal de lijst toegewezen medewerkers + de primaire (eerste) uit de input,
// zodat assigned_to_ids en assigned_to altijd consistent zijn.
function normalizeAssignees(input) {
  let ids = input.assigned_to_ids ?? input.assignedToIds
  if (!Array.isArray(ids)) {
    const single = input.assigned_to ?? input.assignedTo
    ids = single ? [single] : []
  }
  ids = ids.filter(Boolean)
  return { ids, primary: ids[0] || null }
}

// Bepaal de verantwoordelijken bij een gegeven set gekoppelde medewerkers.
// - Expliciet meegegeven lijst wordt ontdaan van niet-gekoppelde ids (subset-
//   invariant; sluit aan op de DB CHECK werkbonnen_verantwoordelijke_subset).
// - Niet meegegeven → val terug op de primaire medewerker, zodat er altijd
//   minimaal één verantwoordelijke is zolang er iemand gekoppeld is. Zo blijven
//   flows die alleen de toewijzing zetten (bv. de Planning-pagina) geldig.
function normalizeVerantwoordelijken(input, assigneeIds) {
  let v = input.verantwoordelijke_ids ?? input.verantwoordelijkeIds
  if (Array.isArray(v)) {
    v = v.filter(Boolean).filter(id => assigneeIds.includes(id))
  } else {
    v = []
  }
  if (!v.length && assigneeIds.length) v = [assigneeIds[0]]
  return v
}

export async function createWerkbon(input) {
  const { ids: assigneeIds, primary } = normalizeAssignees(input)
  const verantwoordelijkeIds = normalizeVerantwoordelijken(input, assigneeIds)
  const base = {
    customer_id: input.customer_id || input.customerId || null,
    deal_id: input.deal_id || input.dealId || null,
    offerte_id: input.offerte_id || input.offerteId || null,
    project_id: input.project_id || input.projectId || null,
    assigned_to: primary,
    assigned_to_ids: assigneeIds,
    verantwoordelijke_ids: verantwoordelijkeIds,
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
  // Toewijzing: houd assigned_to_ids (lijst), assigned_to (primair) en
  // verantwoordelijke_ids (subset) in sync zodra de toewijzing wordt meegegeven.
  if ('assigned_to_ids' in input || 'assignedToIds' in input || 'assigned_to' in input || 'assignedTo' in input) {
    const { ids, primary } = normalizeAssignees(input)
    updates.assigned_to_ids = ids
    updates.assigned_to = primary
    // Verantwoordelijken opnieuw bepalen o.b.v. de nieuwe koppeling (blijft
    // subset; valt terug op de primaire zodat er minimaal één is).
    updates.verantwoordelijke_ids = normalizeVerantwoordelijken(input, ids)
  } else if ('verantwoordelijke_ids' in input || 'verantwoordelijkeIds' in input) {
    // Alleen de verantwoordelijken wijzigen (koppeling blijft gelijk). De DB
    // CHECK bewaakt dat het een subset van de gekoppelde medewerkers blijft.
    updates.verantwoordelijke_ids = (input.verantwoordelijke_ids ?? input.verantwoordelijkeIds ?? []).filter(Boolean)
  }
  delete updates.assignedToIds
  delete updates.verantwoordelijkeIds
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
  delete updates.gestartOp
  delete updates.afgerondOp
  delete updates.signToken
  delete updates.ondertekendOp
  delete updates.handtekeningUrl
  delete updates.ondertekendDoorNaam
  delete updates.ondertekendDoorEmail
  delete updates.ondertekendePdfUrl
  delete updates.verstuurdNaarEmail
  delete updates.verstuurdOp
  delete updates.opSlot
  delete updates.raw

  // Legt het startmoment vast zodra de status naar 'in_uitvoering' gaat, tenzij
  // de aanroeper zelf al een gestart_op meegeeft. De daadwerkelijke schrijf
  // gebeurt hieronder pas ná de hoofdupdate, en alleen als gestart_op nog leeg is.
  const wantsStartStamp = updates.status === "in_uitvoering" && updates.gestart_op === undefined

  const { data, error } = await supabase
    .from("werkbonnen")
    .update(updates)
    .eq("id", id)
    .select(WERKBON_SELECT)
    .single()
  if (error) throw error

  // Startmoment één keer registreren — spiegelt hoe afgerond_op werkt. De
  // .is('gestart_op', null)-guard zorgt dat een bestaand startmoment nooit wordt
  // overschreven (race-veilig). Bij direct afronden (in_uitvoering overgeslagen)
  // draait dit niet, dus blijft gestart_op leeg.
  if (wantsStartStamp && data && !data.gestart_op) {
    const { data: stamped } = await supabase
      .from("werkbonnen")
      .update({ gestart_op: new Date().toISOString() })
      .eq("id", id)
      .is("gestart_op", null)
      .select(WERKBON_SELECT)
      .maybeSingle()
    if (stamped) return toWerkbon(stamped)
  }
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
  // De kostprijs staat in werkbon_materiaal_inkoop met eigen RLS: zonder het
  // recht inkoopprijzen komt die inbedding gewoon leeg terug.
  let { data, error } = await supabase
    .from("werkbon_materialen")
    .select("*, job_costs!werkbon_materiaal_id(btw_percentage), werkbon_materiaal_inkoop(inkoopprijs_per)")
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
    // Uit de bibliotheek gekopieerd (of null bij vrij materiaal). De kostprijs
    // gaat niet mee in deze insert — die staat in werkbon_materiaal_inkoop.
    materiaal_id: input.materiaal_id ?? input.materiaalId ?? null,
    leverancier_id: input.leverancier_id ?? input.leverancierId ?? null,
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

  // De prijsrij is door de trigger al aangemaakt; alleen nog de waarde erin.
  // Zonder het recht weigert RLS deze update stil — precies de bedoeling.
  const inkoop = input.inkoopprijs_per ?? input.inkoopprijsPer ?? null
  if (inkoop != null) {
    await supabase.from("werkbon_materiaal_inkoop")
      .update({ inkoopprijs_per: Number(inkoop), updated_at: new Date().toISOString() })
      .eq("werkbon_materiaal_id", data.id)
  }
  return toWerkbonMateriaal({ ...data, werkbon_materiaal_inkoop: { inkoopprijs_per: inkoop } })
}

export async function updateWerkbonMateriaal(id, input) {
  const updates = { ...input }

  // De kostprijs staat in een aparte tabel met eigen RLS: apart wegschrijven.
  const heeftInkoop = "inkoopprijs_per" in updates || "inkoopprijsPer" in updates
  const inkoop = updates.inkoopprijs_per ?? updates.inkoopprijsPer
  delete updates.inkoopprijs_per
  delete updates.inkoopprijsPer

  // Subtotaal herberekenen als aantal of prijs wijzigt. Bij een DEELpatch
  // (alleen aantal, of alleen prijs) moet de ontbrekende helft uit de database
  // komen — anders werd er met 0 gerekend en viel het subtotaal weg.
  if ("aantal" in updates || "prijs_per" in updates || "prijsPer" in updates) {
    const { data: huidig } = await supabase
      .from("werkbon_materialen").select("aantal, prijs_per").eq("id", id).maybeSingle()
    const aantal = "aantal" in updates ? Number(updates.aantal) || 0 : Number(huidig?.aantal ?? 1)
    const prijsPer = ("prijs_per" in updates || "prijsPer" in updates)
      ? Number(updates.prijs_per ?? updates.prijsPer) || 0
      : Number(huidig?.prijs_per ?? 0)
    updates.subtotaal = Math.round(aantal * prijsPer * 100) / 100
    delete updates.prijsPer
  }
  delete updates.werkbonId

  let rij = null
  if (Object.keys(updates).length) {
    const { data, error } = await supabase
      .from("werkbon_materialen").update(updates).eq("id", id).select().single()
    if (error) throw error
    rij = data
  } else {
    const { data } = await supabase.from("werkbon_materialen").select("*").eq("id", id).maybeSingle()
    rij = data
  }

  if (heeftInkoop) {
    // Zonder het recht weigert RLS dit stil — precies de bedoeling.
    await supabase.from("werkbon_materiaal_inkoop")
      .update({
        inkoopprijs_per: inkoop === '' || inkoop == null ? null : Number(inkoop),
        updated_at: new Date().toISOString(),
      })
      .eq("werkbon_materiaal_id", id)
  }

  return toWerkbonMateriaal({ ...rij, werkbon_materiaal_inkoop: heeftInkoop ? { inkoopprijs_per: inkoop } : undefined })
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

// Pad uit de opgeslagen waarde halen — accepteert zowel een oude, volledige
// public-URL als een kaal opslagpad (nieuwe uploads slaan het pad op).
const storagePathFromStored = (val) => {
  // Strip een eventuele query string (signed-URL token) vóór de padextractie.
  const s = String(val || "").split("?")[0]
  const marker = "/werkbon-fotos/"
  const i = s.indexOf(marker)
  return i !== -1 ? s.slice(i + marker.length) : s
}

export async function getWerkbonFotos(werkbonId) {
  const { data, error } = await supabase
    .from("werkbon_fotos")
    .select("*")
    .eq("werkbon_id", werkbonId)
    .order("created_at", { ascending: true })
  if (error) throw error
  const rows = data || []
  // Bucket is privé → toon foto's via tijdelijke signed URLs (1 uur).
  const paths = rows.map(r => storagePathFromStored(r.url))
  let signed = []
  if (paths.length) {
    const res = await supabase.storage.from("werkbon-fotos").createSignedUrls(paths, 3600)
    signed = res.data || []
  }
  return rows.map((r, i) => toWerkbonFoto({ ...r, url: signed[i]?.signedUrl || r.url }))
}

export async function uploadWerkbonFoto(werkbonId, file, categorie) {
  const companyId = await getCompanyId()
  // Een telefoonfoto is al gauw 4000 pixels breed en een paar megabyte. Die
  // wordt hier nooit groter getoond dan volledig scherm en op de PDF niet groter
  // dan 83 mm, dus verkleinen vóór het uploaden — dat scheelt opslag én de
  // wachttijd bij het openen van een werkbon met tien foto's. Mislukt het, dan
  // gaat het origineel gewoon omhoog.
  const { file: teUploaden } = await comprimeerAfbeelding(file, {
    maxZijde: FOTO_MAX_ZIJDE,
    kwaliteit: 0.82,
  })
  const ext = (teUploaden.name.split(".").pop() || "jpg").toLowerCase()
  const path = `${companyId}/${werkbonId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("werkbon-fotos")
    .upload(path, teUploaden, { contentType: teUploaden.type || "image/jpeg" })
  if (uploadError) throw uploadError

  // Sla het opslagpad op (bucket is privé; weergave loopt via signed URLs).
  const payload = await withCompanyId({ werkbon_id: werkbonId, url: path, categorie })
  const { data, error } = await supabase.from("werkbon_fotos").insert(payload).select().single()
  if (error) throw error

  // Meteen een signed URL teruggeven, net als getWerkbonFotos doet. Zonder dit
  // kreeg de UI het rauwe opslagpad terug en bleef de thumbnail stuk tot de
  // pagina werd herladen.
  const { data: signed } = await supabase.storage
    .from("werkbon-fotos")
    .createSignedUrl(path, 3600)
  return toWerkbonFoto({ ...data, url: signed?.signedUrl || data.url })
}

export async function deleteWerkbonFoto(id, url) {
  const storagePath = storagePathFromStored(url)
  if (storagePath) {
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

// =============================================================================
// WERKBON NOTITIES (log) — losse rijen, zelfde patroon als project_notes.
// De oude tekstkolom werkbonnen.werkbon_notities blijft voorlopig staan; de
// inhoud daarvan is bij de migratie als eerste logregel overgenomen.
// =============================================================================

const toWerkbonNotitie = row => ({
  id: row.id,
  companyId: row.company_id,
  werkbonId: row.werkbon_id,
  createdBy: row.created_by,
  note: row.note || '',
  createdAt: row.created_at,
  // false = interne notitie (de standaard), true = staat op de werkbon-PDF en
  // op de ondertekenpagina die de klant ziet.
  voorKlant: row.voor_klant === true,
  authorName: row.profiles?.full_name || '',
  raw: row,
})

export async function getWerkbonNotities(werkbonId) {
  if (!werkbonId) return []
  const { data, error } = await supabase
    .from('werkbon_notities')
    .select('*, profiles(full_name)')
    .eq('werkbon_id', werkbonId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toWerkbonNotitie)
}

export async function addWerkbonNotitie(werkbonId, note, voorKlant = false) {
  if (!werkbonId) throw new Error('werkbonId is verplicht')
  const text = (typeof note === 'string' ? note : note?.note || '').trim()
  if (!text) throw new Error('Notitie mag niet leeg zijn')

  // Standaard intern. Klantnotities zijn de uitzondering en moeten expliciet
  // worden aangevinkt — een notitie die per ongeluk bij de klant belandt is
  // erger dan een notitie die hij mist.
  const base = { werkbon_id: werkbonId, note: text, voor_klant: voorKlant === true }
  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user?.id) base.created_by = u.user.id
  } catch { /* ignore */ }

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('werkbon_notities')
    .insert(payload)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toWerkbonNotitie(data)
}

/** Zet een bestaande logregel om van intern naar klantnotitie of terug. */
export async function updateWerkbonNotitieZichtbaarheid(notitieId, voorKlant) {
  if (!notitieId) throw new Error('notitieId is verplicht')
  const { data, error } = await supabase
    .from('werkbon_notities')
    .update({ voor_klant: voorKlant === true, updated_at: new Date().toISOString() })
    .eq('id', notitieId)
    .select('*, profiles(full_name)')
    .single()
  if (error) throw error
  return toWerkbonNotitie(data)
}

export async function deleteWerkbonNotitie(notitieId) {
  if (!notitieId) throw new Error('notitieId is verplicht')
  const { error } = await supabase.from('werkbon_notities').delete().eq('id', notitieId)
  if (error) throw error
}
