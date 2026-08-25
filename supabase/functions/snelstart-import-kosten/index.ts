import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"
import { ssFetch, ssFetchAll, forEachSnelStartCompany, pushVerkoopboeking, getActieveGrootboeken, ensureRelatie, ensureDiversenLeverancier, pushInkoopboeking, pushKostenBijlagen } from "../_shared/snelstart.ts"

// Kosten/facturen-synchronisatie met SnelStart, twee richtingen:
//   * EXPORT (altijd): verzonden/betaalde BossBase-facturen zonder snelstart_id
//     worden als verkoopboeking geboekt (pushVerkoopboeking) — vangnet voor
//     facturen van vóór de koppeling en gemiste triggers.
//   * IMPORT (optioneel): inkoopfacturen → kostenregels (job_costs). Draait
//     alleen als accounting_connections.import_costs aan staat (standaard uit).
//
// Lezen gaat via GET /v2/inkoopfacturen (OData, scope orders:read) — LET OP:
// /v2/inkoopboekingen is alleen POST als lijst; lezen kan wél per stuk via
// GET /v2/inkoopboekingen/{id} (scope boekhouden:read).
//
// Btw: het InkoopfactuurModel zelf heeft geen btw-uitsplitsing (alleen het
// factuurtotaal incl. btw). Daarom halen we per factuur de onderliggende
// inkoopboeking op: de boekingsregels daarin zijn EXCLUSIEF btw en dragen elk
// een btw-soort (Hoog=21/Laag=9/Geen=0). Elke boekingsregel wordt één
// job_costs-regel met het juiste percentage. Lukt dat niet (scope ontbreekt,
// geen boeking gelinkt), dan valt de import terug op één regel met het
// factuurtotaal incl. btw en het standaardtarief.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Boekingsregel-btwSoort → percentage (NL-tarieven; 'Overig' is historisch en
// valt terug op het hoge tarief).
function pctVoorBtwSoort(soort: string): number {
  if (soort === 'Hoog') return 21
  if (soort === 'Laag') return 9
  if (soort === 'Geen') return 0
  return 21
}

// Export: alle definitieve facturen die SnelStart nog niet kent als
// verkoopboeking boeken. Concepten blijven buiten de boekhouding; het
// terugschrijven van snelstart_id maakt dit idempotent. Met sync_paid_only aan
// gaan alleen betaalde facturen mee.
// Fouten worden verzameld i.p.v. alleen gelogd: anders meldt de sync "0
// facturen" zonder dat iemand kan zien waarom.
async function exportFacturen(
  supabase: any, companyId: string, clientKey: string, paidOnly: boolean, foutenF: string[],
): Promise<number> {
  const { data: teExporteren } = await supabase
    .from('facturen')
    .select('*, customers(name, email, address, city, phone, snelstart_id)')
    .eq('company_id', companyId)
    .in('status', paidOnly ? ['betaald'] : ['verzonden', 'betaald'])
    .is('snelstart_id', null)
    .order('factuurdatum', { ascending: true })
    .limit(50)

  const lijst = teExporteren || []
  if (!lijst.length) return 0

  const grootboeken = await getActieveGrootboeken(clientKey)
  const relaties = await ssFetchAll(clientKey, '/relaties')
  // Cache per klant: voorkomt dubbele relaties wanneer meerdere facturen van
  // dezelfde (nog ongekoppelde) klant in één run zitten.
  const relatieCache = new Map<string, string>()

  let exported = 0
  for (const factuur of lijst) {
    try {
      if (factuur.customer_id && factuur.customers && !factuur.customers.snelstart_id) {
        const cached = relatieCache.get(factuur.customer_id)
        if (cached) {
          factuur.customers.snelstart_id = cached
        } else {
          const rid = await ensureRelatie(supabase, clientKey, { ...factuur.customers, id: factuur.customer_id }, relaties)
          if (rid) { relatieCache.set(factuur.customer_id, rid); factuur.customers.snelstart_id = rid }
        }
      }
      const { data: regels } = await supabase
        .from('factuur_regels').select('*').eq('factuur_id', factuur.id).order('volgorde', { ascending: true })
      const r = await pushVerkoopboeking(supabase, clientKey, companyId, factuur, regels || [], grootboeken)
      if (r.snelstart_id && !r.already_synced) exported++
    } catch (err: any) {
      console.error(`Factuur ${factuur.nummer} exporteren mislukt:`, err.message)
      foutenF.push(`Factuur ${factuur.nummer}: ${err.message}`)
    }
  }
  console.log('Facturen naar SnelStart geboekt:', exported)
  return exported
}

async function importKosten(
  supabase: any, companyId: string, clientKey: string,
): Promise<number> {
  // Bestaande referenties voor deduplicatie. Regels van één factuur krijgen
  // refs `snelstart_{id}_{n}` (fallback: `snelstart_{id}`); een factuur geldt
  // als geïmporteerd zodra er één ref van bestaat.
  const { data: existingCosts } = await supabase
    .from('job_costs')
    .select('externe_referentie')
    .eq('company_id', companyId)
    .not('externe_referentie', 'is', null)
  const importedFactuurIds = new Set(
    (existingCosts || [])
      .map((r: any) => /^snelstart_(.+?)(?:_\d+)?$/.exec(r.externe_referentie)?.[1])
      .filter(Boolean),
  )

  // Onze eigen export terug-importeren zou elke kost verdubbelen: wij boeken
  // kosten als inkoopboeking, en die verschijnen daarna als inkoopfactuur in
  // dezelfde lijst. Twee filters, want ze vangen verschillende gevallen:
  //
  //  1. inkoopBoeking.id — de id die wij bij de export hebben teruggeschreven
  //     naar job_costs.snelstart_id. Dit is de betrouwbare check: hij hangt aan
  //     een echte sleutel en niet aan een naamconventie.
  //  2. het factuurnummer BB-KST-… — vangnet voor boekingen waarvan de
  //     verwijzing is gewist (bijvoorbeeld na "koppeling opnieuw opbouwen") of
  //     die door een eerdere versie zijn aangemaakt.
  const { data: eigenBoekingen } = await supabase
    .from('job_costs')
    .select('snelstart_id')
    .eq('company_id', companyId)
    .not('snelstart_id', 'is', null)
  const eigenIds = new Set((eigenBoekingen || []).map((r: any) => String(r.snelstart_id)))

  const isVanOnszelf = (f: any) =>
    (f?.inkoopBoeking?.id && eigenIds.has(String(f.inkoopBoeking.id)))
    || String(f?.factuurnummer || '').startsWith('BB-KST-')

  const facturen = await ssFetchAll(clientKey, '/inkoopfacturen')
  const toImport = facturen.filter((f: any) =>
    f.id && !importedFactuurIds.has(String(f.id)) && !isVanOnszelf(f))

  // InkoopfactuurModel geeft alleen relatie.id, geen naam. Eén keer de
  // relatielijst ophalen om die te vertalen: zonder dit ging de leverancier
  // verloren en belandden geïmporteerde kosten naamloos in BossBase.
  const relatieNaam = new Map<string, string>()
  if (toImport.length) {
    try {
      for (const r of await ssFetchAll(clientKey, '/relaties')) {
        if (r?.id && r?.naam) relatieNaam.set(String(r.id), String(r.naam).trim())
      }
    } catch (err: any) {
      console.error('Relatielijst niet leesbaar (leverancier blijft leeg):', err.message)
    }
  }

  const rows: Record<string, unknown>[] = []
  for (const f of toImport) {
    const costDate = f.factuurDatum ? String(f.factuurDatum).slice(0, 10) : null
    const baseDesc = f.factuurnummer ? `Inkoopfactuur ${f.factuurnummer}` : 'Inkoopfactuur'
    const leverancier = f.relatie?.id ? (relatieNaam.get(String(f.relatie.id)) || null) : null

    // Btw-uitsplitsing via de onderliggende inkoopboeking (best-effort).
    let regels: any[] = []
    if (f.inkoopBoeking?.id) {
      try {
        const boeking = await ssFetch(clientKey, `/inkoopboekingen/${f.inkoopBoeking.id}`)
        regels = Array.isArray(boeking?.boekingsregels) ? boeking.boekingsregels : []
      } catch (err: any) {
        console.error(`Inkoopboeking ${f.inkoopBoeking.id} niet leesbaar (fallback op factuurtotaal):`, err.message)
      }
    }

    if (regels.length > 0) {
      regels.forEach((r: any, i: number) => {
        rows.push({
          company_id: companyId,
          description: r.omschrijving ? `${baseDesc} — ${r.omschrijving}` : baseDesc,
          amount: Math.abs(Number(r.bedrag || 0)),
          category: 'Inkoopfactuur',
          leverancier,
          cost_date: costDate,
          externe_referentie: `snelstart_${f.id}_${i}`,
          klant_type: 'algemeen',
          btw_inclusief: false, // boekingsregels zijn exclusief btw
          btw_percentage: pctVoorBtwSoort(String(r.btwSoort || '')),
        })
      })
    } else {
      rows.push({
        company_id: companyId,
        description: baseDesc,
        amount: Math.abs(Number(f.factuurBedrag || 0)),
        category: 'Inkoopfactuur',
        leverancier,
        cost_date: costDate,
        externe_referentie: 'snelstart_' + f.id,
        klant_type: 'algemeen',
        btw_inclusief: true, // factuurBedrag is het factuurtotaal (incl. btw)
      })
    }
  }

  let imported = 0
  if (rows.length > 0) {
    const { error: insertErr } = await supabase.from('job_costs').insert(rows)
    if (insertErr) throw insertErr
    imported = toImport.length
  }
  console.log(`SnelStart inkoopfacturen geïmporteerd: ${imported} (${rows.length} kostenregels)`)
  return imported
}

// Export van handmatige kosten: elke BossBase-kostenregel zonder externe bron
// (dus niet geïmporteerd) wordt een inkoopboeking op vraagposten + markering,
// onder de verzamelleverancier — de boekhouder controleert en herverdeelt ze in
// SnelStart. Werkbon-materiaalregels blijven buiten de boekhouding (risico op
// dubbeltelling met de echte inkoopfactuur van dat materiaal).
const KOSTEN_BATCH = 50

// Boekt een batch kostenregels. Apart gehouden zodat exportKosten ook zonder
// nieuwe regels doorloopt naar het nasturen van bonnen.
async function boekKosten(
  supabase: any, clientKey: string, lijst: any[], fouten: string[], meldingen: string[],
): Promise<number> {
  const grootboeken = await getActieveGrootboeken(clientKey)
  // Eén keer ophalen en doorgeven: ensureLeverancier matcht client-side op naam
  // en zet nieuwe relaties in deze lijst bij, zodat twee kostenregels van
  // dezelfde leverancier niet twee relaties aanmaken.
  const relaties = await ssFetchAll(clientKey, '/relaties')

  // De verzamelrelatie "BossBase kosten (controleren)" is nog uitsluitend een
  // terugval voor kosten van vóór de leveranciersplicht. Hem hier
  // onvoorwaardelijk aanmaken zette die fictieve relatie in élke administratie,
  // ook als geen enkele kost hem nodig had — daarom pas op het moment dat er
  // werkelijk een kost zonder leverancier langskomt.
  let verzamelId: string | null = null
  const verzamelrelatie = async () => {
    if (!verzamelId) verzamelId = await ensureDiversenLeverancier(clientKey, relaties)
    return verzamelId
  }

  let exported = 0
  for (const cost of lijst) {
    try {
      const leverancierId = cost.leveranciers?.naam ? '' : await verzamelrelatie()
      const r = await pushInkoopboeking(supabase, clientKey, cost, leverancierId, grootboeken, relaties, meldingen)
      if (r.snelstart_id && !r.already_synced) exported++
    } catch (err: any) {
      console.error(`Kostenregel ${cost.id} exporteren mislukt:`, err.message)
      fouten.push(`Kosten "${cost.description ?? cost.id}": ${err.message}`)
    }
  }
  return exported
}

async function exportKosten(
  supabase: any, companyId: string, clientKey: string,
): Promise<{ exported: number; resterend: number; fouten: string[]; meldingen: string[] }> {
  const fouten: string[] = []
  const meldingen: string[] = []
  // Basisfilter voor "nog te boeken kosten". Wordt twee keer gebruikt: één keer
  // om te tellen hoeveel er openstaan, één keer om een batch op te halen.
  // De filters moeten NA .select() — een PostgrestQueryBuilder heeft nog geen
  // .eq(); die zit pas op de filter-builder die select() teruggeeft. Vandaar dat
  // de selectie hier per query wordt meegegeven in plaats van in een gedeelde
  // helper vooraf.
  const filters = (q: any) => q
    .eq('company_id', companyId)
    .is('externe_referentie', null)
    .is('snelstart_id', null)
    .is('werkbon_materiaal_id', null)
    .gt('amount', 0)

  // Hoeveel staan er in totaal open? Zonder dit meldde de sync alleen wat er in
  // deze batch zat en las dat als "klaar", terwijl er nog een rest was.
  const { count: openstaand } = await filters(
    supabase.from('job_costs').select('id', { count: 'exact', head: true }),
  )
  const totaalOpen = openstaand ?? 0

  const { data: teExporteren, error: exportErr } = await filters(
    supabase.from('job_costs')
      .select('*, leveranciers(id, naam, email, telefoon, mobiel, website, address, postcode, city, kvk_number, btw_number, iban, betaaltermijn_dagen, notities, actief, snelstart_id)'),
  )
    .order('cost_date', { ascending: true })
    .limit(KOSTEN_BATCH)
  if (exportErr) throw exportErr

  const lijst = teExporteren || []
  // Géén vroege return bij een lege lijst: het nasturen van bonnen hieronder
  // moet ook draaien als er niets nieuws te boeken valt.
  const exported = lijst.length ? await boekKosten(supabase, clientKey, lijst, fouten, meldingen) : 0
  // Bonnen nasturen bij boekingen die al bestaan. Bijlagen worden ná het
  // opslaan van de kost op de achtergrond geüpload, dus een sync die daar net
  // tussendoor liep boekte zonder bon. Zonder deze stap kwam die bon er nooit
  // meer bij, want de kost wordt daarna overgeslagen.
  const { data: naTeSturen } = await supabase
    .from('job_costs')
    .select('id, bijlage_url, snelstart_id')
    .eq('company_id', companyId)
    .not('snelstart_id', 'is', null)
    .not('bijlage_url', 'is', null)
    .eq('snelstart_bijlage_gesynct', false)
    .limit(KOSTEN_BATCH)

  let bijlagenNagestuurd = 0
  for (const cost of (naTeSturen || [])) {
    try {
      const r = await pushKostenBijlagen(supabase, clientKey, cost, cost.snelstart_id)
      if (r.gelukt > 0 || r.overgeslagen.length === 0) {
        await supabase.from('job_costs').update({ snelstart_bijlage_gesynct: true }).eq('id', cost.id)
        bijlagenNagestuurd += r.gelukt
      } else {
        console.warn(`Kostenregel ${cost.id}: bijlagen overgeslagen — ${r.overgeslagen.join(', ')}`)
      }
    } catch (err: any) {
      console.error(`Bijlage nasturen voor ${cost.id} mislukt:`, err?.message)
    }
  }
  if (bijlagenNagestuurd) console.log('Bonnen alsnog naar SnelStart gestuurd:', bijlagenNagestuurd)

  // Wat er ná deze batch nog openstaat: het totaal minus wat we nu geboekt
  // hebben. Mislukte regels tellen mee als rest — die moeten opnieuw.
  const resterend = Math.max(0, totaalOpen - exported)
  console.log(`Handmatige kosten naar SnelStart geboekt: ${exported} (nog open: ${resterend})`)
  return { exported, resterend, fouten, meldingen }
}

async function syncCompany(
  supabase: any, companyId: string, clientKey: string, importCosts: boolean, paidOnly: boolean,
): Promise<{
  exported: { verkoopboekingen: number; inkoopboekingen: number };
  imported: { inkoopfacturen: number };
  kostenResterend: number;
  fouten: string[];
  meldingen: string[];
}> {
  const factuurFouten: string[] = []
  const exported = await exportFacturen(supabase, companyId, clientKey, paidOnly, factuurFouten)
  const imported = importCosts ? await importKosten(supabase, companyId, clientKey) : 0
  const kosten = importCosts
    ? await exportKosten(supabase, companyId, clientKey)
    : { exported: 0, resterend: 0 }

  await supabase
    .from('accounting_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')

  return {
    exported: { verkoopboekingen: exported, inkoopboekingen: kosten.exported },
    imported: { inkoopfacturen: imported },
    kostenResterend: kosten.resterend,
    // Wat er per regel misging — zodat de gebruiker niet naar "0" zit te kijken.
    fouten: [...factuurFouten, ...kosten.fouten],
    // Velden die SnelStart afwees maar die we hebben overgeslagen zodat de
    // relatie tóch kon ontstaan.
    meldingen: kosten.meldingen,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log('Function started: snelstart-import-kosten')
  const supabase = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const body = await req.json().catch(() => ({}))

  try {
    // ── Scheduled-modus: alle bedrijven (facturen altijd; kosten per vinkje) ──
    if (isScheduledCall(body)) {
      const summary = await forEachSnelStartCompany(supabase, (companyId, clientKey, importCosts, syncPaidOnly) =>
        syncCompany(supabase, companyId, clientKey, importCosts, syncPaidOnly))
      return json(summary)
    }

    // ── User-modus: één bedrijf van de ingelogde gebruiker ───────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)

    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('client_key, import_costs, sync_paid_only')
      .eq('company_id', profile.company_id)
      .eq('provider', 'snelstart')
      .maybeSingle()
    if (!conn?.client_key) return json({ error: 'SnelStart niet geconfigureerd' }, 400)

    const r = await syncCompany(supabase, profile.company_id, conn.client_key, Boolean(conn.import_costs), Boolean(conn.sync_paid_only))
    return json({ success: true, ...r })
  } catch (err: any) {
    console.error('Error:', err.message, err.stack)
    return json({ success: false, error: err.message }, 500)
  }
})
