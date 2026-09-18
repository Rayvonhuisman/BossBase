import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, timingSafeEqual } from "../_shared/scheduledSync.ts"

// SnelStart koppelsleutel-webhook (productiekoppeling, oAuth-flow).
//
// De bij SnelStart geregistreerde WebhookURL is
//   https://www.bossbase.nl/api/snelstart/webhook
// Dat is een Vercel-functie (api/snelstart/webhook.js) die hierheen doorstuurt
// en ?key=<SNELSTART_WEBHOOK_SECRET> er serverkant aan toevoegt. Deze URL met
// ?key= werkt rechtstreeks ook nog, maar hoort nergens meer te staan.
// Eén URL voor alle klanten; bij wie een bericht hoort volgt uit ReferenceKey.
//
// Flow (developer portal → "oAuth Authenticatie voor productiekoppelingen"):
//   1. Wij sturen de klant naar
//      https://web.snelstart.nl/couplings/activate/{AppShortName}
//        ?referenceKey={referentiesleutel}&successUrl={onze url}
//      De referentiesleutel komt uit de RPC snelstart_referentie() (tabel
//      snelstart_referenties): willekeurig, per bedrijf, alleen zichtbaar voor
//      admins van dat bedrijf. Bewust NIET het company_id — zie migratie
//      20260918140000 voor waarom dat een lek zou zijn.
//   2. De klant logt in bij SnelStart en bevestigt de koppeling.
//   3. SnelStart POST naar deze webhook:
//        { "KoppelSleutel": string,
//          "ActionType": "Create" | "Regenerate" | "Delete",
//          "ReferenceKey": string }
//      2xx = succesvol verwerkt; bij een andere status doet SnelStart GEEN retry.
//
// Echtheidscontrole: SnelStart signeert de request niet. Daarom staat er een
// geheim query-token in de URL (?key=SNELSTART_WEBHOOK_SECRET) dat we hier
// checken. Zonder die secret weigert de functie alles (503).
//
// Elke aanroep komt in snelstart_webhook_log — geslaagd of niet — omdat
// SnelStart niet opnieuw probeert. De koppelsleutel zelf komt daar nooit in.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ACTIES = ['Create', 'Regenerate', 'Delete']

type Log = {
  actie?: string | null
  companyId?: string | null
  bedrijfNaam?: string | null
  uitkomst: 'verwerkt' | 'geweigerd' | 'fout'
  status: number
  melding: string
}

// Gooit nooit: een mislukte logregel mag het antwoord aan SnelStart niet
// veranderen. Dan blijft alleen de console over.
async function log(admin: ReturnType<typeof makeAdminClient>, l: Log) {
  try {
    const { error } = await admin.from('snelstart_webhook_log').insert({
      actie: l.actie ? String(l.actie).slice(0, 40) : null,
      company_id: l.companyId ?? null,
      bedrijf_naam: l.bedrijfNaam ?? null,
      uitkomst: l.uitkomst,
      http_status: l.status,
      melding: l.melding.slice(0, 2000),
    })
    if (error) console.error('[snelstart-webhook] log mislukt:', error.message)
  } catch (e) {
    console.error('[snelstart-webhook] log mislukt:', (e as Error).message)
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = makeAdminClient()
  const antwoord = async (l: Log) => {
    console.log(`[snelstart-webhook] ${l.status} ${l.actie ?? '-'} ${l.companyId ?? '-'}: ${l.melding}`)
    await log(admin, l)
    return l.uitkomst === 'verwerkt'
      ? json({ success: true }, l.status)
      : json({ error: l.melding }, l.status)
  }

  const expected = Deno.env.get('SNELSTART_WEBHOOK_SECRET') ?? ''
  if (!expected) {
    return antwoord({ uitkomst: 'fout', status: 503, melding: 'SNELSTART_WEBHOOK_SECRET ontbreekt' })
  }
  const provided = new URL(req.url).searchParams.get('key') ?? ''
  if (!timingSafeEqual(provided, expected)) {
    return antwoord({ uitkomst: 'geweigerd', status: 401, melding: 'Ongeldige key in URL' })
  }

  const body = await req.json().catch(() => null)
  const koppelSleutel = typeof body?.KoppelSleutel === 'string' ? body.KoppelSleutel.trim() : ''
  const actie = typeof body?.ActionType === 'string' ? body.ActionType : ''
  const referenceKey = typeof body?.ReferenceKey === 'string' ? body.ReferenceKey.trim() : ''

  if (!ACTIES.includes(actie)) {
    return antwoord({ actie: actie || null, uitkomst: 'geweigerd', status: 400, melding: 'Onbekend ActionType' })
  }
  if (!referenceKey) {
    return antwoord({ actie, uitkomst: 'geweigerd', status: 400, melding: 'ReferenceKey ontbreekt' })
  }
  if (actie !== 'Delete' && !koppelSleutel) {
    return antwoord({ actie, uitkomst: 'geweigerd', status: 400, melding: 'KoppelSleutel ontbreekt' })
  }

  try {
    const { data: ref, error: refErr } = await admin
      .from('snelstart_referenties')
      .select('company_id, companies(name)')
      .eq('reference_key', referenceKey)
      .maybeSingle()
    if (refErr) throw refErr
    if (!ref) {
      // Alleen een begin van de sleutel: genoeg om hem terug te vinden, niet
      // genoeg om hem te hergebruiken.
      return antwoord({
        actie, uitkomst: 'geweigerd', status: 404,
        melding: `Onbekende ReferenceKey (${referenceKey.slice(0, 8)}…)`,
      })
    }
    const companyId: string = ref.company_id
    const bedrijfNaam: string | null = (ref as any).companies?.name ?? null
    const nu = new Date().toISOString()

    if (actie === 'Delete') {
      // Alleen wissen als het om DEZE sleutel gaat. Is er intussen een nieuwe
      // koppeling gemaakt (of handmatig een sleutel ingevoerd), dan hoort een
      // late Delete van de oude die niet te slopen.
      let q = admin
        .from('accounting_connections')
        .update({ client_key: null, is_connected: false, updated_at: nu })
        .eq('company_id', companyId)
        .eq('provider', 'snelstart')
      if (koppelSleutel) q = q.eq('client_key', koppelSleutel)
      const { data, error } = await q.select('id')
      if (error) throw error
      const gewist = (data ?? []).length > 0
      return antwoord({
        actie, companyId, bedrijfNaam, uitkomst: 'verwerkt', status: 200,
        melding: gewist ? 'Koppeling verwijderd' : 'Geen koppeling met deze sleutel; niets gewijzigd',
      })
    }

    // Create en Regenerate: sleutel opslaan of vervangen.
    const { data: bestaand, error: leesErr } = await admin
      .from('accounting_connections')
      .select('client_key')
      .eq('company_id', companyId)
      .eq('provider', 'snelstart')
      .maybeSingle()
    if (leesErr) throw leesErr

    const { error } = await admin
      .from('accounting_connections')
      .upsert({
        company_id: companyId,
        provider: 'snelstart',
        client_key: koppelSleutel,
        updated_at: nu,
      }, { onConflict: 'company_id,provider' })
    if (error) throw error

    const had = !!bestaand?.client_key
    const melding = actie === 'Create'
      ? (had ? 'Sleutel opgeslagen (verving een bestaande sleutel)' : 'Sleutel opgeslagen')
      : (had ? 'Sleutel vervangen' : 'Sleutel opgeslagen (er was nog geen sleutel om te vervangen)')
    return antwoord({ actie, companyId, bedrijfNaam, uitkomst: 'verwerkt', status: 200, melding })
  } catch (err) {
    return antwoord({
      actie, uitkomst: 'fout', status: 500,
      melding: `Verwerken mislukt: ${(err as any)?.message ?? String(err)}`,
    })
  }
})
