// Draaien:  node --experimental-strip-types supabase/tests/itemmutaties_test.ts
// Test van bouwItemMutaties: van "wat heeft de klant" naar "wat stuurt Stripe".
// Hier kost een fout geld — een gemiste `deleted` laat een opgezegde module
// doorlopen, een dubbele regel laat de klant dubbel betalen.
const ENV: Record<string, string> = {
  STRIPE_PRICE_STARTER: 'price_starter',
  STRIPE_PRICE_GROEI:   'price_groei',
  STRIPE_PRICE_TEAM:    'price_team',
  STRIPE_PRICE_EXTRA_GEBRUIKER: 'price_extra',
  STRIPE_PRICE_MODULE_STRIPE_BETAALLINK: 'price_mod_stripe',
  STRIPE_PRICE_MODULE_PLANNING:          'price_mod_planning',
  STRIPE_PRICE_MODULE_VOERTUIGEN:        'price_mod_voertuigen',
  STRIPE_PRICE_MODULE_HOSTING:           'price_mod_hosting',
}
;(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } }

const { bouwItemMutaties } = await import('../functions/_shared/billing.ts')

const item = (id: string, price: string, quantity = 1) => ({ id, quantity, price: { id: price } })
const prijzen = {
  prijsVoorTier: (t: string) => ENV[`STRIPE_PRICE_${t.toUpperCase()}`],
  prijsVoorModule: (k: string) => ENV[`STRIPE_PRICE_MODULE_${k.toUpperCase()}`],
  prijsExtraGebruiker: () => ENV.STRIPE_PRICE_EXTRA_GEBRUIKER,
}

let fouten = 0
const check = (naam: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${naam}${ok ? '' : `  → ${JSON.stringify(detail)}`}`)
  if (!ok) fouten++
}

// 1. Groei → Team, verder niets.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei')],
    doelTier: 'team', doelExtra: 0, doelModules: [], ...prijzen,
  })
  check('Groei → Team wisselt de pakketregel om',
    r.params['items[0][id]'] === 'si_tier' && r.params['items[0][price]'] === 'price_team'
    && Object.keys(r.params).filter(k => k.startsWith('items[1]')).length === 0, r.params)
}

// 2. Extra gebruiker erbij op een abonnement dat er nog geen had.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei')],
    doelTier: 'groei', doelExtra: 1, doelModules: [], ...prijzen,
  })
  check('extra gebruiker erbij → nieuwe regel met aantal 1',
    r.params['items[0][price]'] === 'price_extra' && r.params['items[0][quantity]'] === '1'
    && !('items[0][id]' in r.params), r.params)
}

// 3. Aantal gebruikers verhogen op een bestaande regel.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei'), item('si_extra', 'price_extra', 2)],
    doelTier: 'groei', doelExtra: 5, doelModules: [], ...prijzen,
  })
  check('gebruikers 2 → 5 werkt de bestaande regel bij',
    r.params['items[0][id]'] === 'si_extra' && r.params['items[0][quantity]'] === '5'
    && !('items[0][price]' in r.params), r.params)
}

// 4. Extra gebruikers naar nul: de REGEL moet weg, niet quantity 0.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei'), item('si_extra', 'price_extra', 3)],
    doelTier: 'groei', doelExtra: 0, doelModules: [], ...prijzen,
  })
  check('gebruikers naar 0 verwijdert de regel (geen quantity 0)',
    r.params['items[0][id]'] === 'si_extra' && r.params['items[0][deleted]'] === 'true'
    && r.params['items[0][quantity]'] === undefined, r.params)
}

// 5. Module bijkopen.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei')],
    doelTier: 'groei', doelExtra: 0, doelModules: ['planning'], ...prijzen,
  })
  check('planningsmodule erbij',
    r.params['items[0][price]'] === 'price_mod_planning' && r.params['items[0][quantity]'] === '1', r.params)
}

// 6. Module opzeggen.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei'), item('si_mod', 'price_mod_planning')],
    doelTier: 'groei', doelExtra: 0, doelModules: [], ...prijzen,
  })
  check('planningsmodule eraf verwijdert precies die regel',
    r.params['items[0][id]'] === 'si_mod' && r.params['items[0][deleted]'] === 'true', r.params)
}

// 7. Module ruilen: planning eraf, hosting erbij.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei'), item('si_plan', 'price_mod_planning')],
    doelTier: 'groei', doelExtra: 0, doelModules: ['hosting'], ...prijzen,
  })
  const heeftToevoeging = r.params['items[0][price]'] === 'price_mod_hosting'
  const heeftVerwijdering = r.params['items[1][id]'] === 'si_plan' && r.params['items[1][deleted]'] === 'true'
  check('module ruilen doet toevoegen én verwijderen', heeftToevoeging && heeftVerwijdering, r.params)
}

// 8. Niets veranderd → geen enkele mutatie. Dit voorkomt een lege Stripe-call
//    die toch een proratiefactuur zou kunnen veroorzaken.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei'), item('si_extra', 'price_extra', 2), item('si_mod', 'price_mod_planning')],
    doelTier: 'groei', doelExtra: 2, doelModules: ['planning'], ...prijzen,
  })
  check('identieke wens levert nul mutaties op', r.wijzigingen.length === 0 && Object.keys(r.params).length === 0, r)
}

// 9. Het volle scenario: Groei+planning+1 → Team+hosting+3.
{
  const r = bouwItemMutaties({
    huidigeItems: [
      item('si_tier', 'price_groei'),
      item('si_extra', 'price_extra', 1),
      item('si_plan', 'price_mod_planning'),
    ],
    doelTier: 'team', doelExtra: 3, doelModules: ['hosting'], ...prijzen,
  })
  const p = r.params
  check('volledige overstap: pakket om, aantal bij, module om',
    p['items[0][id]'] === 'si_tier' && p['items[0][price]'] === 'price_team'
    && p['items[1][id]'] === 'si_extra' && p['items[1][quantity]'] === '3'
    && p['items[2][price]'] === 'price_mod_hosting'
    && p['items[3][id]'] === 'si_plan' && p['items[3][deleted]'] === 'true', p)
}

// 10. Onbekende regel op het abonnement (handmatig toegevoegd in Stripe) mag
//     niet stilletjes verdwijnen — we raken alleen aan wat we herkennen.
{
  const r = bouwItemMutaties({
    huidigeItems: [item('si_tier', 'price_groei'), item('si_raar', 'price_handmatig')],
    doelTier: 'team', doelExtra: 0, doelModules: [], ...prijzen,
  })
  const raaktRare = Object.entries(r.params).some(([, v]) => v === 'si_raar')
  check('onbekende handmatige regel blijft ongemoeid', !raaktRare, r.params)
}

console.log(fouten === 0 ? '\nALLE MUTATIETESTS GESLAAGD' : `\n${fouten} MISLUKT`)
process.exit(fouten === 0 ? 0 : 1)
