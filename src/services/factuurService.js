import { supabase } from '../lib/supabase'
import { negeerBijImport } from './accountingService.js'
import { withCompanyId } from '../lib/currentCompany'
import { syncFactuurNaarBoekhouding } from './accountingService'
import { logTijdlijnSafe } from './klantTijdlijnService'
import { regimeVanPct, regimeVoorOpslag } from '../lib/btwRegime'

// Canonieke factuurstatussen. 'aangemaakt' bestond alleen als oude alias en komt
// in de database niet voor — de beginstatus is 'concept'.
export const FACTUUR_STATUS = {
  concept:   'Concept',
  verzonden: 'Verzonden',
  betaald:   'Betaald',
}
export const FACTUUR_STATUS_OPTIONS = Object.entries(FACTUUR_STATUS).map(([id, label]) => ({ id, label }))


// Slaat de bij verzending gegenereerde factuur-PDF op in de private bucket
// 'factuur-pdfs' (pad {company_id}/{factuur_id}.pdf, upsert). Server-side flows
// zonder browser halen deze kopie later op: de Stripe-webhook als bijlage bij de
// betaalbevestiging, de boekhoudkoppeling als brondocument bij de
// verkoopboeking. Best-effort: faalt stil, mag de mailverzending nooit
// blokkeren.
export async function uploadFactuurPdf(factuurId, companyId, pdfBase64) {
  if (!factuurId || !companyId || !pdfBase64) return false
  try {
    const bin = atob(pdfBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const path = `${companyId}/${factuurId}.pdf`
    const { error } = await supabase.storage
      .from('factuur-pdfs')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
    if (error) return false

    // De bijlagevlag terug op "nog te sturen". Zonder dit bleef een factuur die
    // al geboekt was maar pas later een PDF kreeg voorgoed zonder document in de
    // boekhouding staan: de nastuurlus slaat alles over wat op gesynct staat.
    await supabase
      .from('facturen')
      .update({ snelstart_bijlage_gesynct: false })
      .eq('id', factuurId)
      .eq('snelstart_bijlage_gesynct', true)
    return true
  } catch {
    return false
  }
}

/**
 * Tijdelijke link naar het bewaarde brondocument van een factuur.
 *
 * Voor een eigen factuur is dat de PDF die bij het versturen is weggeschreven;
 * voor een geïmporteerde factuur het document dat uit de boekhouding is
 * meegekomen. Zelfde bucket, zelfde pad — één plek waar het brondocument staat.
 */
export async function getFactuurDocumentUrl(factuurId, companyId) {
  if (!factuurId || !companyId) return null
  const { data, error } = await supabase.storage
    .from('factuur-pdfs')
    .createSignedUrl(`${companyId}/${factuurId}.pdf`, 3600)
  if (error) return null
  return data?.signedUrl || null
}

const toFactuur = row => ({
  id: row.id,
  companyId: row.company_id,
  customerId: row.customer_id,
  projectId: row.project_id || null,
  nummer: row.nummer || '',
  factuurdatum: row.factuurdatum || null,
  vervaldatum: row.vervaldatum || null,
  betaaltermijnDagen: Number(row.betaaltermijn_dagen ?? 14),
  betalingskenmerk: row.betalingskenmerk || '',
  status: row.status || 'concept',
  notities: row.notities || '',
  totaalExcl: Number(row.totaal_excl || 0),
  totaalIncl: Number(row.totaal_incl || 0),
  betaaldOp: row.betaald_op || null,
  herinnering1VerstuurdAt: row.herinnering_1_verstuurd_at || null,
  herinnering2VerstuurdAt: row.herinnering_2_verstuurd_at || null,
  createdAt: row.created_at,
  customerName: row.customers?.name || '',
  isCredit: row.is_credit || false,
  // Gevuld bij import uit de boekhouding. De UI gebruikt dit om zulke facturen
  // op slot te zetten: ze bestaan al in SnelStart en horen daar thuis.
  externeReferentie: row.externe_referentie || null,
  creditVanFactuurId: row.credit_van_factuur_id || null,
  gecrediteerd: row.gecrediteerd || false,
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
})

const toRegel = row => ({
  id: row.id,
  factuurId: row.factuur_id,
  type: row.type || 'stuks',
  omschrijving: row.omschrijving || '',
  aantal: Number(row.aantal || 1),
  eenheidsprijs: Number(row.eenheidsprijs || 0),
  btwPct: Number(row.btw_pct || 21),
  // Regels van vóór de btw_regime-migratie hebben nog geen regime: afleiden uit
  // het percentage, zodat de rest van de app altijd een regime ziet.
  btwRegime: row.btw_regime || regimeVanPct(row.btw_pct),
  regelprijs: Number(row.regelprijs || 0),
  volgorde: Number(row.volgorde || 0),
})

export async function generateFactuurNummer() {
  const { count, error } = await supabase
    .from('facturen')
    .select('id', { count: 'exact', head: true })
  if (error) return 'BB-F000'
  return `BB-F${String((count || 0) + 1).padStart(3, '0')}`
}

export async function generateCreditFactuurNummer() {
  const { count, error } = await supabase
    .from('facturen')
    .select('id', { count: 'exact', head: true })
    .eq('is_credit', true)
  if (error) return 'BB-CF001'
  return `BB-CF${String((count || 0) + 1).padStart(3, '0')}`
}

export async function getFacturen() {
  const { data, error } = await supabase
    .from('facturen')
    .select('*, customers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toFactuur)
}

export async function getFacturenByCustomer(customerId) {
  if (!customerId) return []
  const { data, error } = await supabase
    .from('facturen')
    .select('*, customers(name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toFactuur)
}

export async function createFactuur(input) {
  const nummer = input.nummer || (await generateFactuurNummer())
  const base = {
    customer_id: input.customer_id || null,
    project_id: input.project_id || input.projectId || null,
    nummer,
    factuurdatum: input.factuurdatum || new Date().toISOString().slice(0, 10),
    vervaldatum: input.vervaldatum || null,
    betalingskenmerk: input.betalingskenmerk || nummer,
    status: 'concept',
    notities: input.notities || null,
    totaal_excl: Number(input.totaal_excl || 0),
    totaal_incl: Number(input.totaal_incl || 0),
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('facturen')
    .insert(payload)
    .select('*, customers(name)')
    .single()
  if (error) throw error
  const factuur = toFactuur(data)
  if (factuur.customerId) {
    const bedrag = factuur.totaalIncl.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    logTijdlijnSafe(factuur.customerId, 'factuur_aangemaakt',
      `Factuur ${factuur.nummer} aangemaakt (€${bedrag})`, { nummer: factuur.nummer, totaalIncl: factuur.totaalIncl })
  }
  return factuur
}

// Inhoudelijke velden die op een verstuurde factuur niet meer mogen wijzigen.
const FACTUUR_CONTENT_FIELDS = ['vervaldatum', 'betalingskenmerk', 'notities', 'totaal_excl', 'totaal_incl']

export async function updateFactuur(id, input) {
  // Betaald-transitie loopt via de gedeelde, idempotente guard (mark_factuur_betaald)
  // — exact dezelfde route als de Stripe-webhook. Atomair: zet alleen op betaald als
  // dat nog niet zo is; alleen dan volgt de Moneybird-sync + tijdlijn-log (één keer).
  if (input.status === 'betaald') {
    const { data: res, error: rpcErr } = await supabase.rpc('mark_factuur_betaald', {
      p_factuur_id: id,
      p_betaald_op: input.betaald_op || null,
    })
    if (rpcErr) throw rpcErr
    const { data: cur, error } = await supabase.from('facturen').select('*, customers(name)').eq('id', id).single()
    if (error) throw error
    const result = toFactuur(cur)
    if (res?.changed) {
      // Best-effort push naar de gekoppelde boekhouding. syncFactuurNaarBoekhouding
      // checkt eerst welke providers gekoppeld zijn en slaat de rest over — dat
      // scheelt een 400 per niet-gekoppelde provider.
      syncFactuurNaarBoekhouding(id).catch(() => {})
      const bedrag = result.totaalIncl.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      logTijdlijnSafe(result.customerId, 'factuur_betaald', `Factuur ${result.nummer} betaald (€${bedrag})`, { nummer: result.nummer })
    }
    return result
  }

  // Een verstuurde/betaalde factuur is alleen-lezen: inhoud kan niet meer
  // wijzigen. Status (betaald markeren), herinneringen en de branding-snapshot
  // mogen nog wel. We controleren server-side voor de zekerheid.
  if (FACTUUR_CONTENT_FIELDS.some(k => k in input)) {
    const { data: cur } = await supabase.from('facturen').select('status').eq('id', id).maybeSingle()
    if (cur && !['concept', 'aangemaakt'].includes(cur.status)) {
      throw new Error('Een verstuurde factuur kan niet meer gewijzigd worden')
    }
  }

  const updates = {}
  if ('status' in input)                       updates.status = input.status
  if ('vervaldatum' in input)                  updates.vervaldatum = input.vervaldatum
  if ('betalingskenmerk' in input)             updates.betalingskenmerk = input.betalingskenmerk
  if ('notities' in input)                     updates.notities = input.notities
  if ('totaal_excl' in input)                  updates.totaal_excl = input.totaal_excl
  if ('totaal_incl' in input)                  updates.totaal_incl = input.totaal_incl
  if ('herinnering_1_verstuurd_at' in input)   updates.herinnering_1_verstuurd_at = input.herinnering_1_verstuurd_at
  if ('herinnering_2_verstuurd_at' in input)   updates.herinnering_2_verstuurd_at = input.herinnering_2_verstuurd_at
  // Branding-snapshot (bevriezen bij versturen)
  for (const k of ['snapshot_logo_url', 'snapshot_branding_color', 'snapshot_bedrijfsnaam', 'snapshot_adres', 'snapshot_postcode', 'snapshot_plaats', 'snapshot_email', 'snapshot_kvk', 'snapshot_btw']) {
    if (k in input) updates[k] = input[k]
  }
  // (betaald wordt hierboven al via mark_factuur_betaald afgehandeld)
  updates.updated_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('facturen')
    .update(updates)
    .eq('id', id)
    .select('*, customers(name)')
    .single()
  if (error) throw error
  const result = toFactuur(data)
  if (result.customerId && input.status === 'verzonden') {
    logTijdlijnSafe(result.customerId, 'factuur_verzonden', `Factuur ${result.nummer} verzonden naar klant`, { nummer: result.nummer })
  }
  return result
}

export async function deleteFactuur(id) {
  // Eerst opzoeken: na de delete is niet meer te zien of hij uit SnelStart kwam.
  const { data: bestaand } = await supabase
    .from('facturen').select('externe_referentie').eq('id', id).maybeSingle()

  const { error } = await supabase.from('facturen').delete().eq('id', id)
  if (error) {
    // Een gecrediteerde factuur kan niet weg zolang de creditnota ernaar
    // verwijst (foreign key facturen_credit_van_factuur_id_fkey). Dat is
    // bedoeld: een creditnota die naar een verdwenen factuur wijst, breekt de
    // audittrail. De rauwe databasefout zegt dat niet, dus vertalen we hem.
    if (error.code === '23503') {
      throw new Error(
        'Deze factuur is gecrediteerd en kan niet verwijderd worden. ' +
        'Verwijder eerst de bijbehorende creditfactuur.'
      )
    }
    throw error
  }

  // Onthouden dat deze factuur hier bewust weg is, zodat de import hem niet
  // terughaalt. Alleen zinvol bij een geïmporteerde factuur; een eigen factuur
  // wordt sowieso nooit opgehaald.
  if (bestaand?.externe_referentie) {
    await negeerBijImport('factuur', bestaand.externe_referentie, 'verwijderd in BossBase').catch(() => {})
  }
}

export async function getFactuurRegels(factuurId) {
  const { data, error } = await supabase
    .from('factuur_regels')
    .select('*')
    .eq('factuur_id', factuurId)
    .order('volgorde', { ascending: true })
  if (error) throw error
  return (data || []).map(toRegel)
}

export async function getAllFactuurRegels() {
  const { data, error } = await supabase
    .from('factuur_regels')
    .select('*')
  if (error) throw error
  return (data || []).map(toRegel)
}

export async function createCreditFactuur(origineleFactuurId, regels, origineleFactuur) {
  const nummer = await generateCreditFactuurNummer()
  const totaalExcl = -Math.abs(Math.round(regels.reduce((s, r) => s + Math.abs(Number(r.regelprijs || 0)), 0) * 100) / 100)
  // BTW per tarief groeperen en per groep afronden — zelfde regel als
  // useRegelTotals en de boekhoudexport, anders scheelt het centen.
  //
  // Het regime is leidend, niet het percentage. `btwPct || 21` maakte van een
  // regel met percentage 0 een regel van 21%: bij vrijgestelde of verlegde omzet
  // zou de creditnota btw terugvorderen die nooit is afgedragen. Het percentage
  // is er alleen nog voor het bedrag; of er überhaupt btw is, bepaalt het regime.
  const btwPerTarief = {}
  for (const r of regels) {
    const regime = r.btwRegime || regimeVanPct(r.btwPct)
    if (regime === 'vrijgesteld' || regime === 'verlegd') continue
    const pct = Number(r.btwPct ?? 21)
    if (!pct) continue
    const bedrag = Math.abs(Number(r.regelprijs || 0)) * pct / 100
    btwPerTarief[pct] = Math.round(((btwPerTarief[pct] || 0) + bedrag) * 100) / 100
  }
  const totaalBtw = Object.values(btwPerTarief).reduce((s, v) => s + v, 0)
  const totaalIncl = -Math.round((Math.abs(totaalExcl) + totaalBtw) * 100) / 100
  const base = {
    customer_id: origineleFactuur.customerId,
    nummer,
    factuurdatum: new Date().toISOString().slice(0, 10),
    status: 'verzonden',
    notities: `Creditering van factuur ${origineleFactuur.nummer}`,
    is_credit: true,
    credit_van_factuur_id: origineleFactuurId,
    totaal_excl: Math.round(totaalExcl * 100) / 100,
    totaal_incl: Math.round(totaalIncl * 100) / 100,
    // Een creditfactuur is meteen "verzonden"; bevries dezelfde branding als de
    // originele (al bevroren) factuur, zodat ook hij niet meer wijzigt.
    snapshot_logo_url: origineleFactuur.snapshotLogoUrl || null,
    snapshot_branding_color: origineleFactuur.snapshotBrandingColor || null,
    snapshot_bedrijfsnaam: origineleFactuur.snapshotBedrijfsnaam || null,
    snapshot_adres: origineleFactuur.snapshotAdres || null,
    snapshot_postcode: origineleFactuur.snapshotPostcode || null,
    snapshot_plaats: origineleFactuur.snapshotPlaats || null,
    snapshot_email: origineleFactuur.snapshotEmail || null,
    snapshot_kvk: origineleFactuur.snapshotKvk || null,
    snapshot_btw: origineleFactuur.snapshotBtw || null,
  }
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('facturen')
    .insert(payload)
    .select('*, customers(name)')
    .single()
  if (error) throw error
  const creditFactuur = toFactuur(data)
  if (creditFactuur.customerId) {
    logTijdlijnSafe(creditFactuur.customerId, 'creditfactuur_aangemaakt',
      `Creditfactuur ${creditFactuur.nummer} aangemaakt`, { nummer: creditFactuur.nummer })
  }
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i]
    await createFactuurRegel({
      factuur_id: creditFactuur.id,
      type: r.type,
      omschrijving: r.omschrijving,
      // Aantal ongewijzigd overnemen; alleen de prijs wordt negatief. Ook hier
      // gold de 'vast'-uitzondering, waardoor een creditregel van 2 × €120 maar
      // €120 crediteerde.
      aantal: Number(r.aantal || 1),
      eenheidsprijs: -Math.abs(Number(r.eenheidsprijs || 0)),
      btw_pct: Number(r.btwPct || 21),
      btw_regime: r.btwRegime || regimeVanPct(r.btwPct),
      volgorde: i,
    })
  }
  await supabase
    .from('facturen')
    .update({ gecrediteerd: true, updated_at: new Date().toISOString() })
    .eq('id', origineleFactuurId)
  return creditFactuur
}

export async function createFactuurRegel(input) {
  // Elke regel is aantal × eenheidsprijs — óók type 'vast'. Die typewaarde heette
  // vroeger "Vast bedrag" (één bedrag, aantal betekenisloos) en werd hier daarom
  // afgedwongen op aantal 1. Sinds regelTypes.js heet hetzelfde type "Overig" met
  // de semantiek prijs × aantal, en toont de editor gewoon een aantalveld. Deze
  // uitzondering gooide dat ingevoerde aantal weg: 2 × €120 werd 1 × €120, terwijl
  // de kop wél 240 kreeg. Zie useRegelTotals in FacturenPage, dat altijd al
  // vermenigvuldigde — dit brengt de opslag daarmee in lijn.
  //
  // Oude 'vast'-regels hebben aantal 1, dus 1 × prijs = prijs: die blijven gelijk.
  const aantal = Number(input.aantal || 1)
  const eenheidsprijs = Number(input.eenheidsprijs || 0)
  const regelprijs = Math.round(aantal * eenheidsprijs * 100) / 100
  const base = {
    factuur_id: input.factuur_id,
    type: input.type || 'stuks',
    omschrijving: input.omschrijving,
    aantal,
    eenheidsprijs,
    btw_pct: Number(input.btw_pct || 21),
    btw_regime: regimeVoorOpslag(input.btw_regime || input.btwRegime || regimeVanPct(input.btw_pct)),
    regelprijs,
    volgorde: Number(input.volgorde || 0),
  }
  if (!base.factuur_id) throw new Error('factuur_id is verplicht')
  if (!base.omschrijving) throw new Error('omschrijving is verplicht')
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('factuur_regels')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toRegel(data)
}
