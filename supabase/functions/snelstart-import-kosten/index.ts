import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"
import { ssFetch, ssFetchAll, forEachSnelStartCompany, pushVerkoopboeking, pushFactuurPdf, getActieveGrootboeken, ensureRelatie, pushInkoopboeking, pushKostenBijlagen, getGrootboekVoorkeuren, importeerLeverancier, getGenegeerd,
  relatieNaarKlantVelden, alleenGevuld, regimeUitGrootboekfunctie, btwPctVoorRegime } from "../_shared/snelstart.ts"

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
  supabase: any, companyId: string, clientKey: string, paidOnly: boolean,
  foutenF: string[], meldingenF: string[],
): Promise<number> {
  const { data: teExporteren } = await supabase
    .from('facturen')
    .select('*, customers(name, email, address, city, phone, snelstart_id)')
    .eq('company_id', companyId)
    .in('status', paidOnly ? ['betaald'] : ['verzonden', 'betaald'])
    .is('snelstart_id', null)
    // Geïmporteerde facturen gaan NOOIT terug. snelstart_id alleen is te zwak:
    // een reset wist dat veld, en dan zou de sync elke opgehaalde factuur
    // terugboeken als duplicaat. De externe referentie blijft altijd staan.
    .is('externe_referentie', null)
    .order('factuurdatum', { ascending: true })
    .limit(50)

  const lijst = teExporteren || []
  // Géén vroege return bij een lege lijst: de PDF's hieronder moeten ook
  // nagestuurd worden als er niets nieuws te boeken valt.
  if (!lijst.length) {
    await stuurFactuurPdfsNa(supabase, companyId, clientKey, meldingenF)
    return 0
  }

  const grootboeken = await getActieveGrootboeken(clientKey)
  const voorkeuren = await getGrootboekVoorkeuren(supabase, companyId)
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
      const r = await pushVerkoopboeking(supabase, clientKey, companyId, factuur, regels || [], grootboeken, relaties, meldingenF, voorkeuren)
      if (r.snelstart_id && !r.already_synced) exported++
      // De PDF hangt los van de boeking: mislukt hij, dan blijft de vlag op
      // false en pakt stuurFactuurPdfsNa hem de volgende keer op.
      if (r.snelstart_id) {
        await pushFactuurPdf(supabase, clientKey, companyId, factuur, r.snelstart_id)
      }
    } catch (err: any) {
      console.error(`Factuur ${factuur.nummer} exporteren mislukt:`, err.message)
      foutenF.push(`Factuur ${factuur.nummer}: ${err.message}`)
    }
  }
  await stuurFactuurPdfsNa(supabase, companyId, clientKey, meldingenF)
  console.log('Facturen naar SnelStart geboekt:', exported)
  return exported
}

// PDF's nasturen bij verkoopboekingen die er al zijn. Nodig omdat de PDF door de
// browser wordt weggeschreven bij het versturen van de factuur: een sync die daar
// net tussendoor liep boekte zonder document. Zonder deze stap kwam de factuur
// er nooit meer bij, want de boeking wordt daarna overgeslagen.
//
// Ontbreekt de PDF nog steeds, dan is de factuur nooit vanuit BossBase verstuurd
// (bijvoorbeeld handmatig op 'verzonden' gezet). Dat melden we terug in plaats
// van het stil te laten — een boeking zonder brondocument is precies wat we
// wilden voorkomen.
async function stuurFactuurPdfsNa(
  supabase: any, companyId: string, clientKey: string, meldingenF: string[],
): Promise<void> {
  const { data: naTeSturen } = await supabase
    .from('facturen')
    .select('id, nummer, is_credit, snelstart_id')
    .eq('company_id', companyId)
    .not('snelstart_id', 'is', null)
    .eq('snelstart_bijlage_gesynct', false)
    .limit(50)

  const zonderPdf: string[] = []
  for (const f of (naTeSturen || [])) {
    const r = await pushFactuurPdf(supabase, clientKey, companyId, f, f.snelstart_id)
    if (!r.gelukt && r.reden === 'ontbreekt') zonderPdf.push(f.nummer || f.id)
  }
  if (zonderPdf.length) {
    meldingenF.push(
      `${zonderPdf.length} ${zonderPdf.length === 1 ? 'factuur staat' : 'facturen staan'} zonder PDF in de boekhouding `
      + `(${zonderPdf.slice(0, 5).join(', ')}${zonderPdf.length > 5 ? ', …' : ''}). `
      + 'Verstuur de factuur vanuit BossBase, dan wordt de PDF alsnog meegestuurd.',
    )
  }
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
  // dezelfde lijst.
  //
  // De check is de inkoopBoeking.id die wij bij de export hebben teruggeschreven
  // naar job_costs.snelstart_id. Die hangt aan een echte sleutel, en — dit is de
  // kern — hij geldt alleen zolang de kostenpost hier ook echt bestaat. Is hij
  // verwijderd, dan mag hij terugkomen; dat is precies wat een inzichtportaal
  // hoort te doen.
  //
  // Hier stond ook een filter op het factuurnummer BB-KST-…, als vangnet voor
  // boekingen waarvan de verwijzing was gewist. Dat vangnet blokkeerde élk
  // herstel: een verwijderde kostenpost kwam nooit meer terug, want het
  // factuurnummer in SnelStart blijft BB-KST-…. Weggehaald.
  //
  // Restrisico: slaagt een export wél maar mislukt het terugschrijven van het
  // id, dan komt die kost bij de volgende sync alsnog binnen — als GEÏMPORTEERDE
  // regel, herkenbaar aan zijn externe referentie, en te verwijderen waarna de
  // prullenbak hem tegenhoudt. Dat is een zichtbaar en oplosbaar gevolg; een
  // kostenpost die nooit meer terug te halen is, is dat niet.
  const { data: eigenBoekingen } = await supabase
    .from('job_costs')
    .select('snelstart_id')
    .eq('company_id', companyId)
    .not('snelstart_id', 'is', null)
  const eigenIds = new Set((eigenBoekingen || []).map((r: any) => String(r.snelstart_id)))

  const isVanOnszelf = (f: any) =>
    Boolean(f?.inkoopBoeking?.id && eigenIds.has(String(f.inkoopBoeking.id)))

  const genegeerd = await getGenegeerd(supabase, companyId, 'kost')
  const facturen = await ssFetchAll(clientKey, '/inkoopfacturen')
  const toImport = facturen.filter((f: any) =>
    f.id && !importedFactuurIds.has(String(f.id)) && !isVanOnszelf(f) && !genegeerd.has(String(f.id)))

  // InkoopfactuurModel geeft alleen relatie.id. Die vertalen we niet meer naar
  // een stuk tekst maar naar een ECHTE leverancier: opzoeken op snelstart_id,
  // en bestaat hij nog niet, dan ophalen en aanmaken. Zonder dit kwamen
  // geïmporteerde kosten binnen als losse regels zonder leverancier — je zag in
  // BossBase niet bij wie er was ingekocht, en de kostenpost kon niet mee in de
  // leveranciersoverzichten.
  const levCache = new Map<string, string>()

  const rows: Record<string, unknown>[] = []
  for (const f of toImport) {
    const costDate = f.factuurDatum ? String(f.factuurDatum).slice(0, 10) : null
    const baseDesc = f.factuurnummer ? `Inkoopfactuur ${f.factuurnummer}` : 'Inkoopfactuur'
    const leverancierId = f.relatie?.id
      ? await importeerLeverancier(supabase, clientKey, companyId, String(f.relatie.id), levCache)
      : null

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
          leverancier_id: leverancierId,
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
        leverancier_id: leverancierId,
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


// ── Import: verkoopfacturen uit SnelStart ───────────────────────────────────
// Zodat het omzetbeeld compleet is, ook voor facturen die de boekhouder zelf
// heeft geboekt.
//
// Twee endpoints, want geen van beide geeft het hele plaatje:
//   GET /verkoopfacturen        nummer, datum, vervaldatum, klant, bedrag,
//                               openstaandSaldo — maar GEEN regels en GEEN btw
//   GET /verkoopboekingen/{id}  boekingsregels + btw per soort
//
// Het btw-REGIME per regel bestaat niet als veld in SnelStart, maar is af te
// leiden uit de GROOTBOEKFUNCTIE van de regel: dat is precies de indeling die
// wij bij het exporteren aanbrengen, teruggelezen. Vrijgesteld en verlegd delen
// die functie en zijn uit elkaar te houden aan de VerkopenVerlegd-btwregel op
// de boeking.
//
// Wat NIET reconstrueerbaar is: aantal en eenheidsprijs (een boekingsregel heeft
// alleen een bedrag), de PDF, en de koppeling van een creditnota aan zijn
// originele factuur — SnelStart kent geen creditnota-type.
//
// Zulke facturen zijn ALLEEN-LEZEN. Ze krijgen status 'geboekt' (waarmee
// isFactuurLocked ze automatisch vergrendelt) en externe_referentie
// 'snelstart_<id>', waarop de export ze overslaat.
async function importFacturen(
  supabase: any, companyId: string, clientKey: string, meldingen: string[],
): Promise<number> {
  const genegeerd = await getGenegeerd(supabase, companyId, 'factuur')

  // Wat we al kennen: op externe referentie (geïmporteerd) én op snelstart_id
  // (door onszelf geëxporteerd). Dat tweede is de terugkoppellus: onze eigen
  // facturen mogen niet als "nieuwe" factuur terugkomen.
  const { data: bekend } = await supabase
    .from('facturen')
    .select('externe_referentie, snelstart_id, nummer')
    .eq('company_id', companyId)
  const bekendeRefs = new Set<string>()
  const eigenBoekingen = new Set<string>()
  const bekendeNummers = new Set<string>()
  for (const f of (bekend || [])) {
    if (f.externe_referentie) bekendeRefs.add(String(f.externe_referentie))
    if (f.snelstart_id) eigenBoekingen.add(String(f.snelstart_id))
    if (f.nummer) bekendeNummers.add(String(f.nummer).toLowerCase())
  }

  const facturen = await ssFetchAll(clientKey, '/verkoopfacturen')
  const grootboeken = await getActieveGrootboeken(clientKey)
  const functieVan = new Map<string, string>(
    grootboeken.map((g: any) => [String(g.id), String(g.grootboekfunctie || '')]))

  let imported = 0
  let overgeslagen = 0
  const klantCache = new Map<string, string | null>()

  for (const f of facturen) {
    const ref = `snelstart_${f.id}`
    if (bekendeRefs.has(ref)) continue
    if (genegeerd.has(String(f.id))) { overgeslagen++; continue }
    // Door onszelf geëxporteerd: die staat hier al als eigen factuur.
    if (f.verkoopBoeking?.id && eigenBoekingen.has(String(f.verkoopBoeking.id))) continue
    if (f.factuurnummer && bekendeNummers.has(String(f.factuurnummer).toLowerCase())) continue

    try {
      // Klant erbij zoeken of aanmaken, anders staat de omzet nergens aan vast.
      let customerId: string | null = null
      if (f.relatie?.id) {
        const sleutel = String(f.relatie.id)
        if (klantCache.has(sleutel)) {
          customerId = klantCache.get(sleutel) ?? null
        } else {
          const { data: bestaand } = await supabase
            .from('customers').select('id').eq('company_id', companyId).eq('snelstart_id', sleutel).maybeSingle()
          if (bestaand?.id) customerId = bestaand.id
          else {
            const relatie = await ssFetch(clientKey, `/relaties/${sleutel}`)
            const velden = relatieNaarKlantVelden(relatie)
            if (velden.name) {
              const { data: nieuw } = await supabase.from('customers')
                .insert({ company_id: companyId, snelstart_id: sleutel, ...velden })
                .select('id').single()
              customerId = nieuw?.id ?? null
            }
          }
          klantCache.set(sleutel, customerId)
        }
      }

      // Regels + btw uit de onderliggende boeking.
      let regels: any[] = []
      let btwRegels: any[] = []
      if (f.verkoopBoeking?.id) {
        const boeking = await ssFetch(clientKey, `/verkoopboekingen/${f.verkoopBoeking.id}`)
        regels = Array.isArray(boeking?.boekingsregels) ? boeking.boekingsregels : []
        btwRegels = Array.isArray(boeking?.btw) ? boeking.btw : []
      }
      const heeftVerlegd = btwRegels.some((b: any) => String(b?.btwSoort || '') === 'VerkopenVerlegd')

      // openstaandSaldo 0 = betaald. Voor een geïmporteerde factuur is SnelStart
      // de waarheid over de betaalstatus; wij hebben er geen eigen beeld van.
      const saldo = Number(f.openstaandSaldo ?? 0)
      const betaald = Math.abs(saldo) < 0.005
      const datum = f.factuurDatum ? String(f.factuurDatum).slice(0, 10) : null

      const { data: factuur, error: fErr } = await supabase.from('facturen').insert({
        company_id: companyId,
        customer_id: customerId,
        nummer: f.factuurnummer || `SS-${String(f.id).slice(0, 8)}`,
        factuurdatum: datum,
        vervaldatum: f.vervalDatum ? String(f.vervalDatum).slice(0, 10) : null,
        // 'geboekt' bestaat niet in de eigen statusflow en valt daarmee buiten
        // ['concept','aangemaakt'] — isFactuurLocked vergrendelt hem dus vanzelf.
        status: betaald ? 'betaald' : 'geboekt',
        betaald_op: betaald ? datum : null,
        externe_referentie: ref,
        snelstart_id: f.verkoopBoeking?.id ? String(f.verkoopBoeking.id) : null,
        // Niets na te sturen: er is geen PDF van een boeking die hier niet is
        // gemaakt.
        snelstart_bijlage_gesynct: true,
        totaal_excl: 0,
        totaal_incl: 0,
      }).select('id').single()
      if (fErr) throw fErr

      // Regels wegschrijven; de triggers leiden de totalen eruit af.
      if (regels.length) {
        const rijen = regels.map((r: any, i: number) => {
          const functie = functieVan.get(String(r?.grootboek?.id)) || ''
          const regime = regimeUitGrootboekfunctie(functie, heeftVerlegd)
          const bedrag = Math.round(Number(r?.bedrag || 0) * 100) / 100
          return {
            factuur_id: factuur.id,
            company_id: companyId,
            type: 'vast',
            omschrijving: r?.omschrijving || f.factuurnummer || 'Boekingsregel',
            // Aantal en eenheidsprijs bestaan niet in een boeking; 1 × bedrag is
            // de enige eerlijke weergave.
            aantal: 1,
            eenheidsprijs: bedrag,
            regelprijs: bedrag,
            btw_pct: btwPctVoorRegime(regime),
            btw_regime: regime,
            volgorde: i,
          }
        })
        const { error: rErr } = await supabase.from('factuur_regels').insert(rijen)
        if (rErr) throw rErr
      } else {
        // Geen boeking leesbaar: dan alleen het totaal, als één regel.
        await supabase.from('factuur_regels').insert({
          factuur_id: factuur.id,
          company_id: companyId,
          type: 'vast',
          omschrijving: f.factuurnummer ? `Factuur ${f.factuurnummer}` : 'Verkoopfactuur',
          aantal: 1,
          eenheidsprijs: Number(f.factuurBedrag || 0),
          regelprijs: Number(f.factuurBedrag || 0),
          btw_pct: 0,
          btw_regime: 'vrijgesteld',
          volgorde: 0,
        })
        meldingen.push(
          `Factuur ${f.factuurnummer || f.id} is opgehaald zonder btw-uitsplitsing — de onderliggende boeking was niet leesbaar. `
          + 'Het bedrag klopt, de btw-verdeling niet.',
        )
      }
      imported++
    } catch (err: any) {
      console.error(`Verkoopfactuur ${f.factuurnummer || f.id} importeren mislukt:`, err?.message)
      meldingen.push(`Factuur ${f.factuurnummer || f.id} kon niet worden opgehaald: ${err?.message}`)
    }
  }

  console.log('Verkoopfacturen geïmporteerd:', imported, `(${overgeslagen} uit de prullenbak overgeslagen)`)
  return imported
}

// Export van handmatige kosten: elke BossBase-kostenregel zonder externe bron
// (dus niet geïmporteerd) wordt een inkoopboeking onder de eigen leverancier van
// die kostenpost. Werkbon-materiaalregels blijven buiten de boekhouding (risico
// op dubbeltelling met de echte inkoopfactuur van dat materiaal).
//
// Kosten zónder leverancier gaan NIET meer mee. Ze belandden voorheen onder een
// verzamelrelatie "BossBase kosten (controleren)"; dat zette een fictieve relatie
// in de boekhouding en verplaatste het uitzoekwerk naar de boekhouder. Sinds de
// leveranciersplicht kan er niets nieuws meer zonder ontstaan, dus wat overblijft
// is oude data — die melden we terug zodat iemand hem hier aanvult.
const KOSTEN_BATCH = 50

// Boekt een batch kostenregels. Apart gehouden zodat exportKosten ook zonder
// nieuwe regels doorloopt naar het nasturen van bonnen.
async function boekKosten(
  supabase: any, companyId: string, clientKey: string, lijst: any[], fouten: string[], meldingen: string[],
): Promise<number> {
  const grootboeken = await getActieveGrootboeken(clientKey)
  const voorkeuren = await getGrootboekVoorkeuren(supabase, companyId)
  // Eén keer ophalen en doorgeven: ensureLeverancier matcht client-side op naam
  // en zet nieuwe relaties in deze lijst bij, zodat twee kostenregels van
  // dezelfde leverancier niet twee relaties aanmaken.
  const relaties = await ssFetchAll(clientKey, '/relaties')

  let exported = 0
  for (const cost of lijst) {
    try {
      const r = await pushInkoopboeking(supabase, clientKey, cost, grootboeken, relaties, meldingen, voorkeuren)
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
  ).not('leverancier_id', 'is', null)
  const totaalOpen = openstaand ?? 0

  // Kosten zonder leverancier blijven staan. Ze stilzwijgend overslaan zou
  // hetzelfde probleem geven als de verzamelrelatie: niemand die het merkt.
  const { count: zonderLeverancier } = await filters(
    supabase.from('job_costs').select('id', { count: 'exact', head: true }),
  ).is('leverancier_id', null)
  if (zonderLeverancier) {
    meldingen.push(
      `${zonderLeverancier} ${zonderLeverancier === 1 ? 'kostenpost heeft' : 'kostenposten hebben'} geen leverancier `
      + 'en zijn niet naar de boekhouding gestuurd. Vul de leverancier aan bij Kosten, dan gaan ze mee met de volgende synchronisatie.',
    )
  }

  const { data: teExporteren, error: exportErr } = await filters(
    supabase.from('job_costs')
      .select('*, leveranciers(id, naam, email, telefoon, mobiel, website, address, postcode, city, kvk_number, btw_number, iban, betaaltermijn_dagen, notities, actief, snelstart_id)'),
  )
    .not('leverancier_id', 'is', null)
    .order('cost_date', { ascending: true })
    .limit(KOSTEN_BATCH)
  if (exportErr) throw exportErr

  const lijst = teExporteren || []
  // Géén vroege return bij een lege lijst: het nasturen van bonnen hieronder
  // moet ook draaien als er niets nieuws te boeken valt.
  const exported = lijst.length ? await boekKosten(supabase, companyId, clientKey, lijst, fouten, meldingen) : 0
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
  imported: { inkoopfacturen: number; verkoopfacturen: number };
  kostenResterend: number;
  fouten: string[];
  meldingen: string[];
}> {
  const factuurFouten: string[] = []
  const factuurMeldingen: string[] = []
  const exported = await exportFacturen(supabase, companyId, clientKey, paidOnly, factuurFouten, factuurMeldingen)
  const imported = importCosts ? await importKosten(supabase, companyId, clientKey) : 0
  // Verkoopfacturen ophalen hangt aan dezelfde instelling: wie zijn boekhouding
  // als bron wil zien, wil dat voor kosten én omzet.
  const importedFacturen = importCosts
    ? await importFacturen(supabase, companyId, clientKey, factuurMeldingen)
    : 0
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
    imported: { inkoopfacturen: imported, verkoopfacturen: importedFacturen },
    kostenResterend: kosten.resterend,
    // Wat er per regel misging — zodat de gebruiker niet naar "0" zit te kijken.
    fouten: [...factuurFouten, ...kosten.fouten],
    // Wat er wel doorging maar aandacht vraagt: afgewezen relatievelden,
    // kosten zonder leverancier, boekingen zonder brondocument.
    meldingen: [...factuurMeldingen, ...kosten.meldingen],
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
