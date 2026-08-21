import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"
import { ssFetchAll, ensureRelatie, forEachSnelStartCompany, ontbrekendeAdresvelden } from "../_shared/snelstart.ts"

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

async function syncCompany(
  supabase: any, companyId: string, clientKey: string,
): Promise<{ imported: number; exported: number; adresWaarschuwingen: AdresWaarschuwing[] }> {
  let imported = 0
  let exported = 0
  const adresWaarschuwingen: AdresWaarschuwing[] = []

  // ── A: SNELSTART → BOSSBASE ──────────────────────────────────────────────
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

  for (const relatie of relaties) {
    const name = (relatie.naam || '').trim()
    if (!name) continue
    if (relatie.nonactief === true) continue
    if (bySnelstartId.has(String(relatie.id))) continue

    const emailKey = (relatie.email || '').toLowerCase()
    const existing = (emailKey ? byEmail.get(emailKey) : null) ?? byName.get(name.toLowerCase()) ?? null

    if (existing) {
      if (!existing.snelstart_id) {
        await supabase.from('customers').update({ snelstart_id: String(relatie.id) }).eq('id', existing.id)
        existing.snelstart_id = String(relatie.id)
        bySnelstartId.set(String(relatie.id), existing)
      }
    } else {
      const adres = relatie.vestigingsAdres || relatie.correspondentieAdres || null
      const { data: newCustomer } = await supabase.from('customers').insert({
        company_id: companyId,
        name,
        email: relatie.email || null,
        phone: relatie.telefoon || relatie.mobieleTelefoon || null,
        address: adres?.straat || null,
        city: adres?.plaats || null,
        snelstart_id: String(relatie.id),
      }).select().single()

      if (newCustomer) {
        imported++
        bySnelstartId.set(String(relatie.id), newCustomer)
        if (emailKey) byEmail.set(emailKey, newCustomer)
        byName.set(name.toLowerCase(), newCustomer)
      }
    }
  }
  console.log('Geïmporteerd van SnelStart:', imported)

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

  return { imported, exported, adresWaarschuwingen }
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
        syncCompany(supabase, companyId, clientKey))
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
