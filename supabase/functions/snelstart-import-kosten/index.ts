import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"
import { ssFetch, ssFetchAll, forEachSnelStartCompany, pushVerkoopboeking, getActieveGrootboeken, ensureRelatie, ensureDiversenLeverancier, pushInkoopboeking } from "../_shared/snelstart.ts"

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
async function exportFacturen(supabase: any, companyId: string, clientKey: string, paidOnly: boolean): Promise<number> {
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

  const facturen = await ssFetchAll(clientKey, '/inkoopfacturen')
  const toImport = facturen.filter((f: any) => f.id && !importedFactuurIds.has(String(f.id)))

  const rows: Record<string, unknown>[] = []
  for (const f of toImport) {
    const costDate = f.factuurDatum ? String(f.factuurDatum).slice(0, 10) : null
    const baseDesc = f.factuurnummer ? `Inkoopfactuur ${f.factuurnummer}` : 'Inkoopfactuur'

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
async function exportKosten(supabase: any, companyId: string, clientKey: string): Promise<number> {
  const { data: teExporteren } = await supabase
    .from('job_costs')
    .select('*')
    .eq('company_id', companyId)
    .is('externe_referentie', null)
    .is('snelstart_id', null)
    .is('werkbon_materiaal_id', null)
    .gt('amount', 0)
    .order('cost_date', { ascending: true })
    .limit(50)

  const lijst = teExporteren || []
  if (!lijst.length) return 0

  const grootboeken = await getActieveGrootboeken(clientKey)
  const leverancierId = await ensureDiversenLeverancier(clientKey)

  let exported = 0
  for (const cost of lijst) {
    try {
      const r = await pushInkoopboeking(supabase, clientKey, cost, leverancierId, grootboeken)
      if (r.snelstart_id && !r.already_synced) exported++
    } catch (err: any) {
      console.error(`Kostenregel ${cost.id} exporteren mislukt:`, err.message)
    }
  }
  console.log('Handmatige kosten naar SnelStart geboekt:', exported)
  return exported
}

async function syncCompany(
  supabase: any, companyId: string, clientKey: string, importCosts: boolean, paidOnly: boolean,
): Promise<{ exported: { verkoopboekingen: number; inkoopboekingen: number }; imported: { inkoopfacturen: number } }> {
  const exported = await exportFacturen(supabase, companyId, clientKey, paidOnly)
  const imported = importCosts ? await importKosten(supabase, companyId, clientKey) : 0
  const kostenExported = importCosts ? await exportKosten(supabase, companyId, clientKey) : 0

  await supabase
    .from('accounting_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')

  return { exported: { verkoopboekingen: exported, inkoopboekingen: kostenExported }, imported: { inkoopfacturen: imported } }
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
