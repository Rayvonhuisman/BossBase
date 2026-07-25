import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient } from "../_shared/scheduledSync.ts"

// SnelStart koppelsleutel-webhook (productiekoppeling, oAuth-flow).
//
// ⚠️  NOG NIET ACTIEF — werkt pas na certificering door SnelStart. Dan krijgen
// we een AppShortName + productiesleutel en registreren we deze URL (inclusief
// ?key=…) als WebhookURL bij SnelStart. Tot die tijd weigert de functie alles
// (503) zolang SNELSTART_WEBHOOK_SECRET niet als secret is gezet.
//
// Flow (developer portal → "oAuth Authenticatie voor productiekoppelingen"):
//   1. Wij sturen de klant naar
//      https://web.snelstart.nl/couplings/activate/{AppShortName}
//        ?referenceKey={company_id}&successUrl={onze url}
//   2. De klant logt in bij SnelStart en bevestigt de koppeling.
//   3. SnelStart POST naar deze webhook:
//        { "KoppelSleutel": string,
//          "ActionType": "Create" | "Regenerate" | "Delete",
//          "ReferenceKey": string }
//      2xx = succesvol verwerkt; bij een andere status doet SnelStart GEEN retry.
//
// Echtheidscontrole: SnelStart signeert de request niet. Daarom registreren we
// een URL met een geheim query-token (?key=SNELSTART_WEBHOOK_SECRET) en checken
// dat hier. ReferenceKey = ons company_id (uuid); alles wat niet valideert → 4xx.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Uitgeschakeld tot certificering: zonder secret geen webhook.
  const expected = Deno.env.get('SNELSTART_WEBHOOK_SECRET') ?? ''
  if (!expected) return json({ error: 'Webhook nog niet geactiveerd' }, 503)

  const provided = new URL(req.url).searchParams.get('key') ?? ''
  if (!timingSafeEqual(provided, expected)) return json({ error: 'Ongeldige key' }, 401)

  try {
    const body = await req.json().catch(() => null)
    const koppelSleutel: string = typeof body?.KoppelSleutel === 'string' ? body.KoppelSleutel : ''
    const actionType: string = typeof body?.ActionType === 'string' ? body.ActionType : ''
    const referenceKey: string = typeof body?.ReferenceKey === 'string' ? body.ReferenceKey : ''

    if (!['Create', 'Regenerate', 'Delete'].includes(actionType)) {
      return json({ error: 'Onbekend ActionType' }, 400)
    }
    if (!UUID_RE.test(referenceKey)) return json({ error: 'Ongeldige ReferenceKey' }, 400)
    if (actionType !== 'Delete' && !koppelSleutel) return json({ error: 'KoppelSleutel ontbreekt' }, 400)

    const admin = makeAdminClient()

    const { data: company } = await admin.from('companies').select('id').eq('id', referenceKey).maybeSingle()
    if (!company) return json({ error: 'Onbekend bedrijf' }, 404)

    if (actionType === 'Delete') {
      const { error } = await admin
        .from('accounting_connections')
        .update({ client_key: null, updated_at: new Date().toISOString() })
        .eq('company_id', referenceKey)
        .eq('provider', 'snelstart')
      if (error) throw error
    } else {
      // Create/Regenerate: sleutel opslaan/roteren
      const { error } = await admin
        .from('accounting_connections')
        .upsert({
          company_id: referenceKey,
          provider: 'snelstart',
          client_key: koppelSleutel,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,provider' })
      if (error) throw error
    }

    console.log(`[snelstart-webhook] ${actionType} verwerkt voor bedrijf ${referenceKey}`)
    return json({ success: true })
  } catch (err: any) {
    console.error('[snelstart-webhook]', err?.message)
    return json({ error: 'Verwerken mislukt' }, 500)
  }
})
