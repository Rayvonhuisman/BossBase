// Draait de echte Edge Function-code (supabase/functions/<naam>/index.ts) op
// http://localhost:54330/functions/v1/<naam>. Stripe is een nep: elke aanroep
// naar api.stripe.com wordt vastgelegd in stripe_aanroepen.jsonl en krijgt een
// plausibel antwoord. Er gaat niets naar Stripe.
const FUNCTIES = Deno.env.get('FUNCTIES')!.split(',')
const MAP = Deno.env.get('FUNCTIEMAP')!
const LOG = Deno.env.get('STRIPE_LOG')!
const echteFetch = globalThis.fetch
globalThis.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.startsWith('https://api.stripe.com')) {
    await Deno.writeTextFile(LOG, JSON.stringify({ methode: init?.method || 'GET', url: url.replace('https://api.stripe.com', ''), functie: (globalThis as any).__huidige }) + '\n', { append: true })
    const nu = Math.floor(Date.now() / 1000)
    return new Response(JSON.stringify({ id: 'sub_test', object: 'subscription', status: 'active', cancel_at: null,
      cancel_at_period_end: true, current_period_end: nu + 20 * 86400, url: 'https://billing.stripe.test/sessie', data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return echteFetch(input, init)
}
const handlers: Record<string, (r: Request) => Promise<Response>> = {}
for (const naam of FUNCTIES) {
  ;(globalThis as any).__registreer = (h: any) => { handlers[naam] = h }
  await import(`${MAP}/${naam}/index.ts`)
}
Deno.serve({ port: 54330 }, async (req) => {
  const naam = new URL(req.url).pathname.split('/')[3]
  const h = handlers[naam]
  if (!h) return new Response('onbekende functie', { status: 404 })
  ;(globalThis as any).__huidige = naam
  return await h(req)
})
console.log('functies:', Object.keys(handlers).join(', '))
