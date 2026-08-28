import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall, startSyncRun, eindSyncRun } from "../_shared/scheduledSync.ts"
import {
  ssFetchAll, ensureRelatie, forEachSnelStartCompany, ontbrekendeAdresvelden,
  relatieNaarKlantVelden, relatieNaarVelden, alleenGevuld, isSysteemrelatie, getGenegeerd,
} from "../_shared/snelstart.ts"

// Contacten twee-richtingen sync met SnelStart (spiegel van moneybird-sync-
// contacten). Scopes: relaties:read + relaties:write.
//
// Datamodel volgens de spec (docs/snelstart-b2b-api-v2-openapi.json):
//   * adres = vestigingsAdres { straat (incl. huisnummer), postcode, plaats }
//   * relatiesoort = array met o.a. "Klant" / "Leverancier"
//   * telefoon / mobieleTelefoon, email, naam

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

type AdresWaarschuwing = { klant: string; mist: string[] }

async function syncCompanyInner(
  supabase: any, companyId: string, clientKey: string,
): Promise<Record<string, unknown>> {
  let imported = 0
  let exported = 0
  const adresWaarschuwingen: AdresWaarschuwing[] = []
  let systeemrelaties = 0
  let bijgewerkt = 0
  let levGeimporteerd = 0
  let levBijgewerkt = 0
  // Klanten en leveranciers tellen apart. Ze deelden één teller, en die werd
  // weggeschreven in de klantenregel VOORDAT de leverancierslus liep — een
  // leverancier die de prullenbak tegenhield kwam daardoor in geen enkel log
  // terecht.
  let overgeslagen = 0
  let levSysteemrelaties = 0
  let levOvergeslagen = 0

  // ── A: SNELSTART → BOSSBASE ──────────────────────────────────────────────
  // Systeemrelaties van SnelStart zelf overslaan. Elke administratie heeft er
  // twee — "Klant onbekend" en "Leverancier onbekend" — die niet verwijderd
  // kunnen worden en herkenbaar zijn aan een NEGATIEF relatienummer (-2 en -1).
  // Ze importeren vervuilt het klantenbestand met relaties waar nooit iets aan
  // hangt, en verwijderen helpt niet: bij de volgende sync staan ze er weer.
  //
  // Het nummer is leidend, niet de naam: de naam is taalafhankelijk en een echte
  // klant zou hem theoretisch kunnen voeren.
  // Alleen klanten (geen pure leveranciers); filter-casing conform het
  // documentatievoorbeeld: Relatiesoort/any(r:r eq '...').
  const relaties = await ssFetchAll(clientKey, `/relaties?$filter=${encodeURIComponent("Relatiesoort/any(r:r eq 'Klant')")}`)
  console.log('SnelStart relaties opgehaald:', relaties.length)

  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('id, name, email, snelstart_id')
    .eq('company_id', companyId)

  const bySnelstartId = new Map<string, any>()
  const byEmail = new Map<string, any>()
  const byName = new Map<string, any>()
  for (const c of (existingCustomers || [])) {
    if (c.snelstart_id) bySnelstartId.set(c.snelstart_id, c)
    if (c.email) byEmail.set(c.email.toLowerCase(), c)
    if (c.name) byName.set(c.name.toLowerCase(), c)
  }

  const genegeerd = await getGenegeerd(supabase, companyId, 'klant')

  for (const relatie of relaties) {
    const name = (relatie.naam || '').trim()
    if (!name) continue
    if (relatie.nonactief === true) continue
    if (isSysteemrelatie(relatie)) { systeemrelaties++; continue }
    // Bewust hier verwijderd: niet terughalen. Alleen "Alles opnieuw ophalen"
    // maakt de prullenbak leeg.
    if (genegeerd.has(String(relatie.id))) { overgeslagen++; continue }

    const velden = relatieNaarKlantVelden(relatie)
    const bestaandeRij = bySnelstartId.get(String(relatie.id))

    if (bestaandeRij) {
      // Al gekoppeld: bijwerken met wat SnelStart heeft. Lege velden daar mogen
      // niet overschrijven wat hier is aangevuld.
      await supabase.from('customers').update(alleenGevuld(velden)).eq('id', bestaandeRij.id)
      bijgewerkt++
      continue
    }

    const emailKey = (relatie.email || '').toLowerCase()
    const existing = (emailKey ? byEmail.get(emailKey) : null) ?? byName.get(name.toLowerCase()) ?? null

    if (existing) {
      await supabase.from('customers')
        .update({ snelstart_id: String(relatie.id), ...alleenGevuld(velden) })
        .eq('id', existing.id)
      existing.snelstart_id = String(relatie.id)
      bySnelstartId.set(String(relatie.id), existing)
      bijgewerkt++
    } else {
      const { data: newCustomer } = await supabase.from('customers').insert({
        company_id: companyId,
        snelstart_id: String(relatie.id),
        ...velden,
      }).select().single()

      if (newCustomer) {
        imported++
        bySnelstartId.set(String(relatie.id), newCustomer)
        if (emailKey) byEmail.set(emailKey, newCustomer)
        byName.set(name.toLowerCase(), newCustomer)
      }
    }
  }
  console.log('Klanten geïmporteerd:', imported, 'bijgewerkt:', bijgewerkt, `(${systeemrelaties} systeemrelaties, ${overgeslagen} uit de prullenbak overgeslagen)`)

  // ── A2: LEVERANCIERS UIT SNELSTART ───────────────────────────────────────
  // Nieuw importpad. Leveranciers gingen tot nu toe alleen heen: wat de
  // boekhouder in SnelStart aanmaakte was in BossBase onzichtbaar, en een
  // geïmporteerde inkoopfactuur had daardoor niemand om aan te hangen.
  //
  // Een relatie kan beide soorten dragen; die komt dan zowel als klant als als
  // leverancier binnen. Dat is juist: in beide rollen is het een echte relatie.
  const levRelaties = await ssFetchAll(
    clientKey, `/relaties?$filter=${encodeURIComponent("Relatiesoort/any(r:r eq 'Leverancier')")}`)
  const levGenegeerd = await getGenegeerd(supabase, companyId, 'leverancier')

  const { data: bestaandeLev } = await supabase
    .from('leveranciers').select('id, naam, snelstart_id').eq('company_id', companyId)
  const levOpId = new Map<string, any>()
  const levOpNaam = new Map<string, any>()
  for (const l of (bestaandeLev || [])) {
    if (l.snelstart_id) levOpId.set(String(l.snelstart_id), l)
    if (l.naam) levOpNaam.set(l.naam.toLowerCase(), l)
  }

  for (const relatie of levRelaties) {
    const naam = (relatie.naam || '').trim()
    if (!naam) continue
    if (isSysteemrelatie(relatie)) { levSysteemrelaties++; continue }
    if (levGenegeerd.has(String(relatie.id))) { levOvergeslagen++; continue }

    const velden = relatieNaarVelden(relatie)
    const bestaand = levOpId.get(String(relatie.id)) ?? levOpNaam.get(naam.toLowerCase()) ?? null

    if (bestaand) {
      await supabase.from('leveranciers')
        .update({ snelstart_id: String(relatie.id), ...alleenGevuld(velden) })
        .eq('id', bestaand.id)
      levBijgewerkt++
    } else {
      const { data: nieuw } = await supabase.from('leveranciers').insert({
        company_id: companyId,
        snelstart_id: String(relatie.id),
        // nonactief in SnelStart = uit de keuzelijsten hier, maar niet weg.
        actief: relatie.nonactief !== true,
        ...velden,
      }).select('id, naam').single()
      if (nieuw) {
        levGeimporteerd++
        levOpId.set(String(relatie.id), nieuw)
        levOpNaam.set(naam.toLowerCase(), nieuw)
      }
    }
  }
  console.log('Leveranciers geïmporteerd:', levGeimporteerd, 'bijgewerkt:', levBijgewerkt,
    `(${levSysteemrelaties} systeemrelaties, ${levOvergeslagen} uit de prullenbak overgeslagen)`)

  // ── B: BOSSBASE → SNELSTART ──────────────────────────────────────────────
  const { data: unsynced } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .is('snelstart_id', null)

  console.log('BossBase klanten zonder snelstart_id:', unsynced?.length ?? 0)

  for (const customer of (unsynced || [])) {
    try {
      // Onvolledig adres blokkeert niet — SnelStart accepteert de relatie — maar
      // we melden wél welke klanten het betreft, zodat de gebruiker het kan
      // aanvullen in plaats van het pas in de boekhouding te ontdekken.
      const mist = ontbrekendeAdresvelden(customer)
      if (mist.length) adresWaarschuwingen.push({ klant: customer.name || 'Naamloze klant', mist })

      const relatieId = await ensureRelatie(supabase, clientKey, customer, relaties)
      if (relatieId) exported++
    } catch (err: any) {
      console.error(`Export klant ${customer.id} mislukt:`, err.message)
    }
  }
  console.log('Geëxporteerd naar SnelStart:', exported)
  if (adresWaarschuwingen.length) {
    console.warn('Klanten zonder compleet adres:', adresWaarschuwingen.map(w => `${w.klant} (mist ${w.mist.join(', ')})`).join('; '))
  }

  await supabase
    .from('accounting_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')

  return {
    imported, exported, adresWaarschuwingen, systeemrelaties, bijgewerkt,
    leveranciers: {
      geimporteerd: levGeimporteerd,
      bijgewerkt: levBijgewerkt,
      systeemrelaties: levSysteemrelaties,
      overgeslagenUitPrullenbak: levOvergeslagen,
    },
    klantenOvergeslagenUitPrullenbak: overgeslagen,
    // Het totaal blijft het veld dat de UI toont; de splitsing staat erboven.
    overgeslagenUitPrullenbak: overgeslagen + levOvergeslagen,
  }
}

// Dunne schil om syncCompanyInner die de run vastlegt. Bewust een schil en geen
// code midden in de sync: zo wordt óók een harde fout vastgelegd, en die is
// anders alleen in de functielogs terug te vinden.
async function syncCompany(
  supabase: any, companyId: string, clientKey: string, bron: 'cron' | 'handmatig' = 'handmatig',
): Promise<Record<string, unknown>> {
  const runId = await startSyncRun(supabase, companyId, 'snelstart', 'contacten', bron)
  try {
    const r = await syncCompanyInner(supabase, companyId, clientKey)
    const waarschuwingen = (r.adresWaarschuwingen ?? []) as { klant: string; mist: string[] }[]
    const lev = (r.leveranciers ?? {}) as Record<string, number>
    await eindSyncRun(supabase, runId, {
      // Adreswaarschuwingen zijn geen fouten: de relatie is wél doorgezet.
      gelukt: true,
      meldingen: waarschuwingen.map(w => `${w.klant} — mist ${w.mist.join(', ')}`),
      samenvatting: {
        klanten: { geimporteerd: r.imported, bijgewerkt: r.bijgewerkt, geexporteerd: r.exported },
        leveranciers: { geimporteerd: lev.geimporteerd, bijgewerkt: lev.bijgewerkt },
        overgeslagenUitPrullenbak: r.overgeslagenUitPrullenbak,
      },
    })
    return r
  } catch (err: any) {
    await eindSyncRun(supabase, runId, { gelukt: false, fout: err?.message ?? String(err) })
    throw err
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log('Function started: snelstart-sync-contacten')
  const supabase = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const body = await req.json().catch(() => ({}))

  try {
    // ── Scheduled-modus (cron_secret in de body): alle bedrijven ─────────────
    if (isScheduledCall(body)) {
      const summary = await forEachSnelStartCompany(supabase, (companyId, clientKey) =>
        syncCompany(supabase, companyId, clientKey, 'cron'))
      return json(summary)
    }

    // ── User-modus: één bedrijf van de ingelogde gebruiker ───────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)

    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('client_key')
      .eq('company_id', profile.company_id)
      .eq('provider', 'snelstart')
      .maybeSingle()
    if (!conn?.client_key) return json({ error: 'SnelStart niet geconfigureerd' }, 400)

    const r = await syncCompany(supabase, profile.company_id, conn.client_key)
    return json({ success: true, ...r })
  } catch (err: any) {
    console.error('Error:', err.message, err.stack)
    return json({ success: false, error: err.message }, 500)
  }
})
