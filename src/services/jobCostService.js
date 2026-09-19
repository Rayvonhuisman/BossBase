import { supabase } from "../lib/supabase"
import { negeerBijImport } from "./accountingService.js"
import { withCompanyId } from "../lib/currentCompany"
import { alleRijen } from "../lib/alleRijen.js"

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


// Bonnen uploaden naar de privé-bucket en de opslagpaden teruggeven. Gedeeld
// door de kostenmodal en het snelle kostenformulier in de projectdrawer, zodat
// beide dezelfde padopbouw gebruiken — de SnelStart-koppeling leest deze paden
// weer uit om het document aan de inkoopboeking te hangen.
//
// Geeft een array met paden terug; de aanroeper zet die als JSON in bijlage_url.
export async function uploadKostenBonnen(files, companyId) {
  if (!files?.length) return []
  const cid = companyId || (await supabase.auth.getUser()
    .then(({ data }) => supabase.from('profiles').select('company_id').eq('id', data?.user?.id).maybeSingle())
    .then(({ data }) => data?.company_id))
  if (!cid) throw new Error('Geen bedrijf gevonden voor de bijlage')

  return await Promise.all(files.map(async (file) => {
    const ext = (file.name || 'bestand').split('.').pop()
    const path = `${cid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('kosten-bijlagen').upload(path, file)
    if (error) throw error
    return path
  }))
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
  if (input.leverancier_id !== undefined || input.leverancierId !== undefined) {
    payload.leverancier_id = input.leverancier_id ?? input.leverancierId ?? null
  }

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

// Kostencategorieën worden met hoofdletter opgeslagen ('Materiaal', 'Inkoopfactuur',
// 'Gereedschap', …). De KPI-tegels vergeleken op kleine letters en matchten dus
// nooit — vandaar €0 terwijl het totaal wél klopte.
//
// Deze indeling is de enige bron voor het groeperen van kosten. Alles wat niet in
// een genoemde groep valt komt in 'overig', zodat de groepen altijd optellen tot
// het totaal — ook als er later een nieuwe categorie bijkomt.
export const KOSTEN_GROEPEN = [
  { id: 'materiaal',  label: 'Materiaalkosten', categorieen: ['materiaal'] },
  { id: 'arbeid',     label: 'Arbeidskosten',   categorieen: ['arbeid', 'arbeidskosten', 'uren'] },
  { id: 'reiskosten', label: 'Reiskosten',      categorieen: ['reiskosten', 'reis', 'brandstof', 'km'] },
  { id: 'overig',     label: 'Overige kosten',  categorieen: [] }, // vangnet
]

const GROEP_PER_CATEGORIE = KOSTEN_GROEPEN.reduce((acc, g) => {
  g.categorieen.forEach(c => { acc[c] = g.id })
  return acc
}, {})

/** Naar welke KPI-groep hoort deze kostencategorie? Onbekend → 'overig'. */
export const kostenGroepVan = cat => GROEP_PER_CATEGORIE[(cat || '').trim().toLowerCase()] || 'overig'

/** Telt een lijst kosten op per groep. Geeft { materiaal, arbeid, reiskosten, overig }. */
export function kostenPerGroep(kosten = []) {
  const totalen = Object.fromEntries(KOSTEN_GROEPEN.map(g => [g.id, 0]))
  for (const k of kosten) totalen[kostenGroepVan(k.cat ?? k.category)] += Number(k.amt ?? k.amount) || 0
  return totalen
}

// Werkbonmateriaal is wél kostprijs, maar géén boekhoudkost: die rijen worden
// bewust niet naar de boekhouding geëxporteerd (exportKosten filtert op
// werkbon_materiaal_id is null). De echte boekhoudkost is de inkoopfactuur van
// de leverancier — één post voor een rol kabel die over meerdere klussen gaat.
// Zonder dit onderscheid lijkt het kostenoverzicht niet te kloppen met de
// boekhouding.
export const isWerkbonMateriaal = k => Boolean(k?.werkbonMateriaalId ?? k?.werkbon_materiaal_id)

/**
 * Alleen wat geboekt is — de boekhouding. Werkbonmateriaal eruit: dat is de
 * kostprijs van een klus, en de inkoopfactuur van dat materiaal staat er al
 * als boeking in. Samen tellen zou dezelfde inkoop twee keer tellen.
 *
 * Nodig op elke plek die kosten van het bedrijf optelt (dashboard,
 * Financiën). De spiegelregels zijn bovendien alleen zichtbaar met het recht
 * inkoopprijzen; zonder dit filter zou hetzelfde dashboard per gebruiker een
 * ander bedrag tonen.
 */
export const alleenGeboekt = (kosten = []) => kosten.filter(k => !isWerkbonMateriaal(k))

/**
 * Splitst kosten in kostprijs (alles) en boekhoudkosten (wat naar de
 * boekhouding gaat). Geeft { kostprijs, boekhouding, werkbonMateriaal }.
 */
export function kostenSplitsing(kosten = []) {
  let kostprijs = 0
  let werkbonMateriaal = 0
  for (const k of kosten) {
    const bedrag = Number(k.amt ?? k.amount) || 0
    kostprijs += bedrag
    if (isWerkbonMateriaal(k)) werkbonMateriaal += bedrag
  }
  return {
    kostprijs: Math.round(kostprijs * 100) / 100,
    boekhouding: Math.round((kostprijs - werkbonMateriaal) * 100) / 100,
    werkbonMateriaal: Math.round(werkbonMateriaal * 100) / 100,
  }
}

/**
 * Inkoopwaarde van de kosten — de basis voor een brutowinst.
 *
 * De database zet het bedrag van een spiegelregel zelf op aantal x inkoopprijs
 * (migratie 20260915130500); hier wordt dat nog eens uit de materiaalregel
 * afgeleid, zodat ook een regel van vóór die migratie goed telt.
 *
 * Is de inkoopprijs NIET bekend, dan valt de regel terug op de verkoopprijs en
 * wordt hij geteld in `zonderInkoopprijs`. Bewust die kant op: terugvallen op
 * verkoop maakt de winst te LAAG, en een te lage winst met een melding erbij is
 * veiliger dan een te hoge. De regel weglaten zou de winst juist opblazen.
 *
 * @returns {{inkoopwaarde:number, overigeKosten:number, materiaalInkoop:number,
 *            zonderInkoopprijs:number, geschatBedrag:number}}
 */
export function inkoopwaardeVanKosten(kosten = []) {
  let materiaalInkoop = 0
  let overigeKosten = 0
  let zonderInkoopprijs = 0
  let geschatBedrag = 0

  for (const k of kosten) {
    const verkoop = Number(k.amt ?? k.amount) || 0
    if (!isWerkbonMateriaal(k)) { overigeKosten += verkoop; continue }

    const inkoopPer = k.inkoopprijsPer ?? k.inkoopprijs_per ?? null
    const aantal = Number(k.materiaalAantal ?? k.aantal ?? 0)
    if (inkoopPer != null && aantal > 0) {
      materiaalInkoop += Number(inkoopPer) * aantal
    } else {
      materiaalInkoop += verkoop
      zonderInkoopprijs += 1
      geschatBedrag += verkoop
    }
  }

  const r = n => Math.round(n * 100) / 100
  return {
    inkoopwaarde: r(materiaalInkoop + overigeKosten),
    materiaalInkoop: r(materiaalInkoop),
    overigeKosten: r(overigeKosten),
    zonderInkoopprijs,
    geschatBedrag: r(geschatBedrag),
  }
}

export const toJobCost = row => ({
  id: row.id,
  dealId: row.deal_id,
  projectId: row.project_id || null,
  werkbonId: row.werkbon_id || null,
  werkbonMateriaalId: row.werkbon_materiaal_id || null,
  companyId: row.company_id,
  cat: row.category || "overig",
  desc: row.description || "",
  leverancierId: row.leverancier_id || null,
  // Vervallen vrij tekstveld; alleen nog voor rijen van vóór de leveranciers-tabel.
  leverancier: row.leverancier || "",
  amt: Number(row.amount || 0),
  // amount is exclusief BTW; btw-bedrag en incl. worden hieruit afgeleid.
  btwPercentage: row.btw_percentage != null ? Number(row.btw_percentage) : 21,
  date: row.cost_date || row.created_at?.slice(0, 10) || "",
  // Klantkoppeling: de eigen customer_id-kolom is leidend; de deal-join is de
  // terugval voor oudere rijen die alleen via een deal aan een klant hangen.
  // Stond hier eerder alleen de deal-join, waardoor kosten die rechtstreeks aan
  // een klant hangen (zonder deal) nergens meetelden — vandaar €0 in de
  // Financiën-tabel per klant en in het klantfilter op de Kosten-pagina.
  custId: row.customer_id ?? row.deals?.customer_id ?? null,
  customerId: row.customer_id || null,
  bijlageUrl: row.bijlage_url || null,
  klantType: row.klant_type || 'klant',
  externeRef: row.externe_referentie || null,
  btwInclusief: row.btw_inclusief ?? null,
  moneybirdDocumentId: row.moneybird_document_id || null,
  raw: row,
})

// De deals-join is best-effort: staat de FK niet in de Postgres-metadata, dan
// geeft Supabase "Could not find a relationship between …" — dan vallen we terug
// op een kale select zodat de pagina toch laadt.
//
// Doorvragen tot alles binnen is (alleRijen). job_costs is de eerste lijst die
// in de praktijk boven de 1000 rijen uitkomt, en een afgekapte lijst gaf stil te
// lage bedragen op de Kosten-pagina, Financiën en het dashboard: gemeten 235 van
// 450 boekingen, €171.720,05 in plaats van €333.046,70. Het werkbonmateriaal
// vulde daarbij driekwart van het ophaalvenster.
//
// `id` als tweede sorteersleutel: created_at is niet uniek (een import zet veel
// rijen op dezelfde seconde), en zonder unieke laatste sleutel kan een rij bij
// het bladeren dubbel komen of wegvallen.
async function selectWithDealsFallback(maakBasis, pasFilters = q => q) {
  // Filters gaan ná .select(): daarvoor is het nog een tabelverwijzing zonder
  // filtermethodes. Daarom komen ze als functie binnen en niet als kant-en-
  // klare query.
  const gesorteerd = (q, select) => pasFilters(q.select(select, { count: "exact" }))
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
  try {
    return await alleRijen(() => gesorteerd(maakBasis(), "*, deals(customer_id)"))
  } catch (error) {
    if (!/could not find.*relationship|foreign key/i.test(error?.message || "")) throw error
    return await alleRijen(() => gesorteerd(maakBasis(), "*"))
  }
}

/**
 * Kosten ophalen, eventueel alleen die van één periode.
 *
 * Zonder datums komt alles binnen — dat is wat het dashboard en Financiën
 * nodig hebben. De Kosten-pagina geeft wél een bereik mee: die toont één
 * periode tegelijk, en dan is het zonde om de hele geschiedenis op te halen.
 * Filtert op cost_date; geen enkele rij heeft die leeg (gecontroleerd op
 * productie), dus er valt niets stil buiten beeld.
 *
 * @param {{vanDatum?: string, totDatum?: string}} bereik ISO-datums, inclusief
 */
export async function listJobCosts({ vanDatum, totDatum } = {}) {
  const filters = q => {
    if (vanDatum) q = q.gte("cost_date", vanDatum)
    if (totDatum) q = q.lte("cost_date", totDatum)
    return q
  }
  const rows = await selectWithDealsFallback(() => supabase.from("job_costs"), filters)
  return rows.map(toJobCost)
}

export async function deleteJobCost(id) {
  // Heeft de kost een gekoppeld werkbon-materiaal? Verwijder dat materiaal —
  // de FK (ON DELETE CASCADE) ruimt de kost dan mee op. Zo blijven materiaal en
  // kost in sync, ongeacht vanaf welke kant je verwijdert.
  const { data: cost } = await supabase
    .from('job_costs').select('werkbon_materiaal_id, externe_referentie').eq('id', id).maybeSingle()
  if (cost?.werkbon_materiaal_id) {
    const { error } = await supabase.from('werkbon_materialen').delete().eq('id', cost.werkbon_materiaal_id)
    if (error) throw error
    // Spiegelregels van een werkbon komen niet uit de boekhouding: geen prullenbak,
    // dus ook niets te waarschuwen.
    return null
  }
  const { error } = await supabase.from('job_costs').delete().eq('id', id)
  if (error) throw error

  // Onthouden dat deze kostenpost hier bewust weg is, zodat de import hem niet
  // terughaalt.
  //
  // LET OP: één inkoopfactuur uit SnelStart kan als meerdere kostenregels zijn
  // binnengekomen (referentie snelstart_<factuur>_<n>). De prullenbak werkt op
  // het FACTUURnummer, dus één regel weggooien onderdrukt de hele factuur. Dat
  // is de bedoeling: anders zou de verwijderde regel bij de volgende sync toch
  // terugkomen, samen met een dubbele van de regels die je liet staan.
  //
  // Retourwaarde in plaats van een throw: de kostenpost is echt weg, dus het
  // scherm mag sluiten — maar een mislukte prullenbak moet de gebruiker zien.
  if (cost?.externe_referentie) {
    return await negeerBijImport('kost', cost.externe_referentie, 'verwijderd in BossBase')
  }
  return null
}

// ── PROJECT-KOSTEN (direct + via werkbon, één keer geteld) ───────────────────
// Kosten van één project: rechtstreeks (project_id) óf via een werkbon van dit
// project. Een kost die via BEIDE routes matcht is nog steeds één rij → telt
// dus precies één keer (geen dubbeltelling).
export async function getProjectCosts(projectId) {
  if (!projectId) return []
  // Alleen de werkbonnen van dít project. Hier stond een lijst van álle
  // werkbonnen van het bedrijf, en die kapte PostgREST stil af op 1000 rijen:
  // bij een groot bedrijf viel het materiaal van nieuwere werkbonnen dan weg.
  const { data: wbs } = await supabase.from("werkbonnen").select("id").eq("project_id", projectId)
  const werkbonIds = (wbs || []).map(w => w.id)

  const orParts = [`project_id.eq.${projectId}`]
  if (werkbonIds.length) orParts.push(`werkbon_id.in.(${werkbonIds.join(",")})`)

  // De inkoopprijs komt mee via de materiaalregel. Die staat in een aparte
  // tabel met eigen RLS: zonder het recht 'inkoopprijzen' geeft de database hem
  // niet terug, en dan valt de brutowinst vanzelf terug op de verkoopprijs.
  const MET_INKOOP = "*, werkbon_materialen!werkbon_materiaal_id(aantal, werkbon_materiaal_inkoop(inkoopprijs_per))"
  let { data, error } = await supabase
    .from("job_costs")
    .select(MET_INKOOP)
    .or(orParts.join(","))
    .order("cost_date", { ascending: false })

  // Kent de API die relatie nog niet, dan weigert hij de héle select. Terugvallen
  // op de kale kolommen: liever kosten zonder inkoopprijs dan een lege tab.
  if (error) {
    ({ data, error } = await supabase
      .from("job_costs")
      .select("*")
      .or(orParts.join(","))
      .order("cost_date", { ascending: false }))
  }
  if (error) throw error

  return (data || []).map(row => {
    const m = Array.isArray(row.werkbon_materialen) ? row.werkbon_materialen[0] : row.werkbon_materialen
    const inkoop = Array.isArray(m?.werkbon_materiaal_inkoop)
      ? m.werkbon_materiaal_inkoop[0] : m?.werkbon_materiaal_inkoop
    return {
      ...toJobCost(row),
      materiaalAantal: m?.aantal != null ? Number(m.aantal) : null,
      inkoopprijsPer: inkoop?.inkoopprijs_per != null ? Number(inkoop.inkoopprijs_per) : null,
    }
  })
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

  // Werkbon-koppeling → project en klant afleiden van de werkbon (tenzij
  // expliciet meegegeven), zodat de boeking bij de juiste klant hangt. In de
  // projectmarge telt hij niet mee: dat doen alleen het werkbonmateriaal en
  // de projectkosten (project_kosten).
  if (base.werkbon_id && (!base.project_id || !base.customer_id)) {
    const { data: wb } = await supabase
      .from("werkbonnen")
      .select("project_id, customer_id")
      .eq("id", base.werkbon_id)
      .maybeSingle()
    if (wb) {
      if (!base.project_id) base.project_id = wb.project_id || null
      if (!base.customer_id) base.customer_id = wb.customer_id || null
    }
  }

  // Een materiaalboeking op een werkbon werd hier vroeger óók als
  // werkbonmateriaal aangemaakt. De boeking kreeg daarmee een
  // werkbon_materiaal_id, en zo'n regel slaat de SnelStart-export over: de
  // inkoop kwam dan nooit in de boekhouding. Een boeking blijft nu een boeking.

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
