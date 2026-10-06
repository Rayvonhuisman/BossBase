import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { heeftRecht, geenRecht } from '../_shared/eisRecht.ts'
import { clientFout } from '../_shared/clientFout.ts'
import { makeAdminClient, isScheduledCall, startSyncRun, eindSyncRun } from "../_shared/scheduledSync.ts"
import { markeerGesynct } from "../_shared/boekhouding.ts"
import { laadKoppeling, Tijdsbudget, isLimiet, type MbKoppeling } from "../_shared/moneybird.ts"
import { syncContacten } from "../_shared/moneybirdContacten.ts"
import { syncBoekingen } from "../_shared/moneybirdBoekingen.ts"
import { zorgVoorWebhook } from "../_shared/moneybirdWebhook.ts"

// Synchronisatie met Moneybird, op het model van de SnelStart-koppeling.
//
//   body.onderdeel = 'contacten'        klanten en leveranciers, beide kanten op
//                  = 'kosten-facturen'  facturen en kosten naar Moneybird,
//                                       inkoopfacturen/bonnetjes en externe
//                                       verkoopfacturen terug, betaalstatus
//                  = 'alles'            beide (de nachtelijke run)
//
// Handmatig: één bedrijf, alleen admins (een sync schrijft in de boekhouding
// van de klant), voor kosten ook het recht 'kosten' — zoals bij SnelStart.
// Nachtelijk (cron_secret): alle gekoppelde bedrijven, oudste eerst.
//
// Moneybird staat 150 verzoeken per 5 minuten toe, voor al onze klanten samen.
// Elke run werkt daarom binnen een tijdsbudget en stopt netjes als de tijd of
// de limiet op is; wat klaar is staat vast, de volgende run gaat verder. Een
// bedrijf dat helemaal bij is krijgt volledig_gesynct_op, en wordt dan door de
// volgende nachtelijke rondes overgeslagen tot de volgende nacht.
//
// Elke run komt in accounting_sync_runs, met fouten en meldingen voor het
// tabblad Meldingen.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Ruim binnen de wandkloklimiet van een edge function: wat dan halverwege was,
// zou niet zijn vastgelegd.
const BUDGET_HANDMATIG_MS = 110_000
const BUDGET_CRON_MS = 120_000

type Onderdeel = 'contacten' | 'kosten-facturen'

async function draaiOnderdeel(k: MbKoppeling, onderdeel: Onderdeel, bron: 'cron' | 'handmatig') {
  const runId = await startSyncRun(k.admin, k.companyId, 'moneybird', onderdeel, bron)
  try {
    const u: any = onderdeel === 'contacten' ? await syncContacten(k) : await syncBoekingen(k)
    if (u.rest) {
      u.meldingen.push('Nog niet alles is gesynchroniseerd (tijd of de limiet van Moneybird). '
        + 'De volgende synchronisatie gaat verder waar deze stopte.')
    }
    const { fouten, meldingen, adresWaarschuwingen = [], ...samenvatting } = u
    await eindSyncRun(k.admin, runId, {
      gelukt: fouten.length === 0,
      fouten,
      meldingen: [...meldingen, ...adresWaarschuwingen.map((w: any) => `${w.klant} — mist ${w.mist.join(', ')}`)],
      samenvatting,
    })
    return u
  } catch (err: any) {
    await eindSyncRun(k.admin, runId, { gelukt: false, fout: clientFout(err) })
    throw err
  }
}

async function syncBedrijf(k: MbKoppeling, onderdelen: Onderdeel[], bron: 'cron' | 'handmatig') {
  const uit: Record<string, unknown> = {}
  let rest = false
  // Webhook alvast (opnieuw) aanmelden als dat nog niet gelukt was.
  await zorgVoorWebhook(k).catch(() => {})
  for (const o of onderdelen) {
    if (k.budget?.op(20_000)) { rest = true; break }
    const u = await draaiOnderdeel(k, o, bron)
    uit[o] = u
    if (u.rest) rest = true
  }
  await markeerGesynct(k.admin, k.companyId, 'moneybird')
  if (!rest && onderdelen.length === 2) {
    await k.admin.from('accounting_connections')
      .update({ volledig_gesynct_op: new Date().toISOString() })
      .eq('company_id', k.companyId).eq('provider', 'moneybird')
  }
  return { ...uit, rest }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = makeAdminClient()
  const body = await req.json().catch(() => ({}))
  const gevraagd = String(body?.onderdeel || 'alles')
  const onderdelen: Onderdeel[] = gevraagd === 'contacten' ? ['contacten']
    : gevraagd === 'kosten-facturen' ? ['kosten-facturen']
    // Kosten eerst: daarmee komen leveranciers binnen via hun facturen, zodat de
    // contactensync ze daarna als leverancier herkent en niet als klant.
    : ['kosten-facturen', 'contacten']

  try {
    // ── Nachtelijk: alle bedrijven ─────────────────────────────────────────
    if (isScheduledCall(body)) {
      const budget = new Tijdsbudget(BUDGET_CRON_MS)
      const { data: doelen, error } = await admin.rpc('get_moneybird_sync_doelen')
      if (error) throw error
      const resultaten: unknown[] = []
      const overgeslagen: string[] = []
      const { data: bij } = await admin.from('accounting_connections')
        .select('company_id, volledig_gesynct_op').eq('provider', 'moneybird')
      const vannachtBij = new Set((bij || [])
        .filter((r: any) => r.volledig_gesynct_op && Date.now() - new Date(r.volledig_gesynct_op).getTime() < 12 * 3600_000)
        .map((r: any) => r.company_id))

      for (const d of (doelen || [])) {
        if (vannachtBij.has(d.company_id)) continue
        if (budget.op(30_000)) { overgeslagen.push(d.company_id); continue }
        const k: MbKoppeling = {
          admin, companyId: d.company_id, administratieId: String(d.administration_id),
          accessToken: d.api_token, refreshToken: d.refresh_token, budget,
        }
        try {
          resultaten.push({ company_id: d.company_id, ...(await syncBedrijf(k, onderdelen, 'cron')) })
        } catch (e: any) {
          console.error(`[moneybird-cron] ${d.company_id}:`, e?.message)
          resultaten.push({ company_id: d.company_id, fout: e?.message })
          // De limiet geldt voor alle klanten samen: de rest wacht op de volgende ronde.
          if (isLimiet(e)) break
        }
      }
      return json({ scheduled: true, bedrijven: (doelen || []).length, resultaten, overgeslagen })
    }

    // ── Handmatig: één bedrijf ──────────────────────────────────────────────
    const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)
    if (onderdelen.includes('kosten-facturen') && !(await heeftRecht(user.id, 'kosten'))) return geenRecht(corsHeaders)
    const { data: profile } = await admin.from('profiles').select('company_id, role').eq('id', user.id).maybeSingle()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)
    if (profile.role !== 'admin') return json({ error: 'Alleen admins kunnen synchroniseren' }, 403)

    const k = await laadKoppeling(admin, profile.company_id)
    if (!k) return json({ success: false, error: 'Moneybird is niet gekoppeld' }, 400)
    k.budget = new Tijdsbudget(BUDGET_HANDMATIG_MS)

    const r = await syncBedrijf(k, onderdelen, 'handmatig')
    return json({ success: true, ...r })
  } catch (err: any) {
    console.error('moneybird-sync:', err?.message, err?.stack)
    return json({ success: false, error: clientFout(err) }, 500)
  }
})
