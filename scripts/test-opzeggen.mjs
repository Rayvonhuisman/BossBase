#!/usr/bin/env node
// Test van supabase/functions/_shared/opzeggen.ts tegen Stripe in TESTMODUS.
//
//     STRIPE_SECRET_KEY=sk_test_... node scripts/test-opzeggen.mjs
//
// Maakt een testklant met drie abonnementen en zegt ze op met dezelfde code die
// billing-cancel en de webhook gebruiken:
//   A. maandabonnement zonder schema           → stopt aan einde periode
//   B. jaarabonnement met schema (12 termijnen) → schema stopt na de looptijd
//   C. maandabonnement met schema, buiten looptijd → schema vrijgegeven, einde periode
// Daarna voor elk de opzegging weer intrekken, en alles opruimen.
//
// Weigert een live-sleutel: dit script maakt en verwijdert abonnementen.

const KEY = process.env.STRIPE_SECRET_KEY || ''
if (!KEY.startsWith('sk_test_') && !KEY.startsWith('rk_test_')) {
  console.error('Alleen met een Stripe-testsleutel (sk_test_…).')
  process.exit(1)
}
// De gedeelde code is voor Deno geschreven; dit is alles wat hij daarvan nodig heeft.
globalThis.Deno = { env: { get: k => process.env[k] } }
const { opzeggenBijStripe } = await import('../supabase/functions/_shared/opzeggen.ts')
const { stripeFetch } = await import('../supabase/functions/_shared/stripe.ts')

const datum = sec => sec ? new Date(sec * 1000).toISOString().slice(0, 10) : null
let fouten = 0
const check = (naam, ok, info = '') => { console.log(`${ok ? '✓' : '✗'} ${naam}${info ? `  (${info})` : ''}`); if (!ok) fouten++ }

const klant = await stripeFetch('/customers', 'POST', {
  email: 'opzegtest@example.com', name: 'BossBase opzegtest', payment_method: 'pm_card_visa',
  'invoice_settings[default_payment_method]': 'pm_card_visa',
})
const product = await stripeFetch('/products', 'POST', { name: 'BossBase opzegtest' })
const prijs = await stripeFetch('/prices', 'POST', {
  product: product.id, currency: 'eur', unit_amount: '3900', 'recurring[interval]': 'month',
})
const nieuwAbo = () => stripeFetch('/subscriptions', 'POST', {
  customer: klant.id, 'items[0][price]': prijs.id,
})
const metSchema = async (sub, iteraties) => {
  const s = await stripeFetch('/subscription_schedules', 'POST', { from_subscription: sub.id })
  return stripeFetch(`/subscription_schedules/${s.id}`, 'POST', {
    end_behavior: 'release',
    'phases[0][items][0][price]': prijs.id,
    'phases[0][items][0][quantity]': '1',
    'phases[0][start_date]': String(s.phases[0].start_date),
    'phases[0][iterations]': String(iteraties),
  })
}

try {
  // ── A: zonder schema ──────────────────────────────────────────────────────
  const a = await nieuwAbo()
  let r = await opzeggenBijStripe({ subscriptionId: a.id })
  let s = await stripeFetch(`/subscriptions/${a.id}`)
  check('A route einde_periode', r.route === 'einde_periode', r.route)
  check('A cancel_at_period_end', s.cancel_at_period_end === true)
  check('A stoptOp = einde periode', r.stoptOp?.slice(0, 10) === datum(s.items.data[0].current_period_end), `${r.stoptOp} / ${datum(s.items.data[0].current_period_end)}`)
  r = await opzeggenBijStripe({ subscriptionId: a.id, herstel: true })
  s = await stripeFetch(`/subscriptions/${a.id}`)
  check('A herstel', s.cancel_at_period_end === false && !s.cancel_at)

  // ── B: jaarabonnement met schema ─────────────────────────────────────────
  const b = await nieuwAbo()
  const schemaB = await metSchema(b, 12)
  const eindeB = schemaB.phases.at(-1).end_date
  r = await opzeggenBijStripe({ subscriptionId: b.id, scheduleId: schemaB.id, verplichtingTot: new Date(eindeB * 1000).toISOString() })
  let sch = await stripeFetch(`/subscription_schedules/${schemaB.id}`)
  s = await stripeFetch(`/subscriptions/${b.id}`)
  check('B route schema_stopt_na_looptijd', r.route === 'schema_stopt_na_looptijd', r.route)
  check('B schema end_behavior cancel', sch.end_behavior === 'cancel')
  check('B schema nog actief', sch.status === 'active', sch.status)
  check('B abonnement loopt door (niet nu opgezegd)', s.status === 'active' && !s.cancel_at_period_end, `status ${s.status}`)
  check('B stoptOp = einde looptijd', r.stoptOp?.slice(0, 10) === datum(eindeB), `${r.stoptOp} / ${datum(eindeB)}`)
  r = await opzeggenBijStripe({ subscriptionId: b.id, scheduleId: schemaB.id, verplichtingTot: new Date(eindeB * 1000).toISOString(), herstel: true })
  sch = await stripeFetch(`/subscription_schedules/${schemaB.id}`)
  check('B herstel: end_behavior release', sch.end_behavior === 'release')

  // ── C: maandabonnement met schema, buiten de looptijd ────────────────────
  const c = await nieuwAbo()
  const schemaC = await metSchema(c, 2)
  r = await opzeggenBijStripe({ subscriptionId: c.id, scheduleId: schemaC.id, verplichtingTot: null })
  sch = await stripeFetch(`/subscription_schedules/${schemaC.id}`)
  s = await stripeFetch(`/subscriptions/${c.id}`)
  check('C route schema_vrijgegeven_einde_periode', r.route === 'schema_vrijgegeven_einde_periode', r.route)
  check('C schema vrijgegeven', sch.status === 'released', sch.status)
  check('C cancel_at_period_end', s.cancel_at_period_end === true)
  check('C stoptOp = einde periode', r.stoptOp?.slice(0, 10) === datum(s.items.data[0].current_period_end), `${r.stoptOp}`)
  // Intrekken: het schema is weg, dus de gewone weg.
  r = await opzeggenBijStripe({ subscriptionId: c.id, scheduleId: schemaC.id, verplichtingTot: null, herstel: true })
  s = await stripeFetch(`/subscriptions/${c.id}`)
  check('C herstel', s.cancel_at_period_end === false)

  // ── Oude route: rechtstreeks cancel_at op een abonnement met schema ──────
  // Bewijst dat de fout uit de melding echt deze oorzaak had.
  const d = await nieuwAbo()
  await metSchema(d, 12)
  let geweigerd = ''
  try {
    await stripeFetch(`/subscriptions/${d.id}`, 'POST', { cancel_at: String(eindeB) })
  } catch (e) { geweigerd = e.message }
  check('Oude route weigert zoals gemeld', /managed by the subscription schedule/i.test(geweigerd), geweigerd.slice(0, 80))
} finally {
  // Opruimen: klant verwijderen annuleert zijn abonnementen.
  await stripeFetch(`/customers/${klant.id}`, 'DELETE').catch(() => {})
  await stripeFetch(`/products/${product.id}`, 'POST', { active: 'false' }).catch(() => {})
}

console.log(fouten ? `\n${fouten} controle(s) mislukt` : '\nAlles klopt')
process.exit(fouten ? 1 : 0)
