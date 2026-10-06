import { mbFetch, type MbKoppeling } from "./moneybird.ts"

// Webhooks van Moneybird aanmelden en afmelden.
//
// Met een webhook hoort BossBase meteen wanneer een factuur in Moneybird
// betaald is of een contact wijzigt, in plaats van pas bij de volgende
// synchronisatie. De nachtelijke run blijft het vangnet: valt een webhook weg,
// dan haalt die alles alsnog bij.
//
// Per administratie één webhook, aangemeld bij het koppelen (en opnieuw
// geprobeerd bij elke sync als dat toen niet lukte). Moneybird geeft het
// ondertekeningsgeheim alleen bij het aanmaken terug; dat staat daarom in
// accounting_connections.webhook_secret (niet leesbaar voor de app).

export const WEBHOOK_URL = 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/moneybird-webhook'

// Namen gecontroleerd op developer.moneybird.com/webhooks/events.
export const WEBHOOK_EVENTS = [
  'external_sales_invoice_state_changed_to_paid',
  'sales_invoice_state_changed_to_paid',
  'payment_registered',
  'contact_changed',
]

export async function zorgVoorWebhook(k: MbKoppeling): Promise<{ actief: boolean; fout?: string }> {
  const { data: conn } = await k.admin.from('accounting_connections')
    .select('webhook_id, webhook_secret')
    .eq('company_id', k.companyId).eq('provider', 'moneybird').maybeSingle()
  if (conn?.webhook_id && conn?.webhook_secret) return { actief: true }
  try {
    const wh = await mbFetch(k, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url: WEBHOOK_URL, enabled_events: WEBHOOK_EVENTS }),
    })
    if (!wh?.id || !wh?.secret) return { actief: false, fout: 'Moneybird gaf geen webhook terug' }
    await k.admin.from('accounting_connections')
      .update({ webhook_id: String(wh.id), webhook_secret: String(wh.secret) })
      .eq('company_id', k.companyId).eq('provider', 'moneybird')
    return { actief: true }
  } catch (e: any) {
    console.warn('Webhook aanmelden bij Moneybird mislukt:', e?.message)
    return { actief: false, fout: e?.message }
  }
}

/** Meldt een webhook af (best-effort: een verdwenen webhook is geen fout). */
export async function verwijderWebhook(k: MbKoppeling, webhookId: string): Promise<void> {
  try {
    await mbFetch(k, `/webhooks/${webhookId}`, { method: 'DELETE' })
  } catch (e: any) {
    console.warn('Webhook afmelden mislukt:', e?.message)
  }
}

/**
 * Controleert de handtekening van een webhookbericht
 * (developer.moneybird.com/webhooks/verifying-signatures): header
 * "t=<epoch>,v1=<hex>[,v1=…]", HMAC-SHA256 over "<t>.<ruwe body>", hooguit
 * 5 minuten oud. Tijdens een sleutelwissel staan er meer v1's in; één passende
 * is genoeg.
 */
export async function handtekeningKlopt(header: string, ruweBody: string, geheim: string): Promise<boolean> {
  const delen = header.split(',').map(d => d.trim().split('='))
  const t = delen.find(([k]) => k === 't')?.[1]
  const v1 = delen.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !v1.length) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', sleutel, new TextEncoder().encode(`${t}.${ruweBody}`)))
  const verwacht = Array.from(sig, b => b.toString(16).padStart(2, '0')).join('')
  return v1.some(v => gelijk(v, verwacht))
}

function gelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let verschil = 0
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return verschil === 0
}
