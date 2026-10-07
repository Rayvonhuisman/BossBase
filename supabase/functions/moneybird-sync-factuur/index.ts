import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { heeftRecht, geenRecht } from '../_shared/eisRecht.ts'
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"
import { clientFout } from '../_shared/clientFout.ts'
import { markeerGesynct } from "../_shared/boekhouding.ts"
import { laadKoppeling, Tijdsbudget, pakSlot, geefSlot } from "../_shared/moneybird.ts"
import { laadContext, pushFactuur, pushFactuurPdf, pushBetaling, verrekenCredit } from "../_shared/moneybirdBoekingen.ts"

// Boekt ÉÉN factuur in Moneybird als externe verkoopfactuur, met PDF, en
// registreert de betaling als hij betaald is (zie _shared/moneybirdBoekingen.ts).
// Aangeroepen bij "betaald" in de app (factuurService), door de Stripe-webhook
// (service-modus via cron_secret) en handmatig. Idempotent: een factuur met
// moneybird_id wordt niet opnieuw aangemaakt, een betaling maar één keer gezet.
//
// Alles behalve concepten, zoals de nachtelijke sync en zoals SnelStart.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const KLANT_JOIN = 'customers(id, name, type, email, phone, address, postcode, city, contactpersoon, kvk_number, btw_number, iban, betaaltermijn_dagen, moneybird_id, moneybird_versie, moneybird_hash)'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = makeAdminClient()
  const body = await req.json().catch(() => ({}))
  const factuurId = body?.factuur_id
  if (!factuurId) return json({ error: 'factuur_id is verplicht' }, 400)

  try {
    let companyId: string | null = null
    if (isScheduledCall(body)) {
      const { data: f } = await admin.from('facturen').select('company_id').eq('id', factuurId).maybeSingle()
      companyId = f?.company_id ?? null
    } else {
      const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
      const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
      if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)
      if (!(await heeftRecht(user.id, 'facturen'))) return geenRecht(corsHeaders)
      const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
      companyId = profile?.company_id ?? null
    }
    if (!companyId) return json({ error: 'Geen bedrijf gevonden' }, 400)

    const k = await laadKoppeling(admin, companyId)
    if (!k) return json({ error: 'Moneybird niet geconfigureerd' }, 400)
    k.budget = new Tijdsbudget(90_000)

    const { data: factuur } = await admin.from('facturen').select(`*, ${KLANT_JOIN}`)
      .eq('id', factuurId).eq('company_id', companyId).single()
    if (!factuur) return json({ error: 'Factuur niet gevonden' }, 404)
    if (factuur.status === 'concept') return json({ success: true, skipped: 'concepten worden niet geboekt' })
    // Uit een boekhouding opgehaald: gaat nooit terug.
    if (factuur.externe_referentie) return json({ success: true, skipped: 'opgehaalde facturen gaan niet terug' })

    // Loopt er een sync, dan even wachten (die kan net een contact aanmaken voor
    // deze klant). Duurt het te lang, dan neemt de volgende sync deze factuur mee.
    if (!(await pakSlot(admin, companyId, { wachtMs: 60_000 }))) {
      return json({ success: true, skipped: 'er loopt een synchronisatie; deze factuur gaat met de volgende mee' })
    }
    try {
      // Opnieuw lezen: een sync die net klaar is, kan hem al geboekt hebben.
      const { data: vers } = await admin.from('facturen').select(`*, ${KLANT_JOIN}`).eq('id', factuurId).single()
      const meldingen: string[] = []
      const ctx = await laadContext(k, meldingen)
      const boeking = await pushFactuur(ctx, vers)
      const bijlage = vers.moneybird_bijlage_gesynct && !boeking.nieuw
        ? { gelukt: true } : await pushFactuurPdf(ctx, vers, { nieuw: boeking.nieuw })
      const betaling = await pushBetaling(ctx, vers)
      const verrekend = await verrekenCredit(ctx, vers)
      await markeerGesynct(admin, companyId, 'moneybird')
      return json({ success: true, moneybird_id: boeking.moneybirdId, nieuw: boeking.nieuw, bijlage, betaling, verrekend, meldingen })
    } finally {
      await geefSlot(admin, companyId)
    }
  } catch (err: any) {
    console.error('moneybird-sync-factuur:', err?.message)
    return json({ success: false, error: clientFout(err) }, 500)
  }
})
