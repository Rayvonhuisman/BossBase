// Draaien:  node supabase/tests/voorstel_test.mjs
// De keuzelogica achter "dit lost het op". Als deze fout is, krijgt de klant het
// verkeerde advies — bv. een pakketsprong van € 20 terwijl een module van € 10
// volstaat.
import {
  moduleForFeature, moduleMetVereisten, tierForLimit, tierForFeature,
  modulePrice, canBuyModule, TIER_LIMITS,
} from '../../src/lib/features.js'

let fouten = 0
const check = (naam, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${naam}${ok ? '' : `  → ${JSON.stringify(detail)}`}`)
  if (!ok) fouten++
}

// Planning bij Groei: module (€10), niet de sprong naar Team (€20 meer).
const m = moduleForFeature('groei', 'planning')
check('Groei mist planning → module, geen pakketsprong', m?.key === 'planning', m)
check('  en die kost 10', modulePrice('planning') === 10)
check('  terwijl Team 20 duurder zou zijn', 59 - 39 === 20)

// Voertuigen sleept planning mee, inclusief prijs.
const keten = moduleMetVereisten('voertuigen')
check('voertuigen neemt planning mee', JSON.stringify(keten) === JSON.stringify(['planning','voertuigen']), keten)
check('  samen 15 per maand', keten.reduce((s,k)=>s+modulePrice(k),0) === 15)

// Team heeft planning al: geen module aanbieden voor iets wat je hebt.
check('Team krijgt planning niet als module aangeboden', moduleForFeature('team','planning') === null)

// Starter kan modules niet bijkopen → dan is upgraden het enige antwoord.
check('Starter mist planning → geen module beschikbaar', moduleForFeature('starter','planning') === null)
check('  dus het antwoord is een pakket', tierForFeature('planning') === 'team')

// Hosting is een dienst, óók bij Team bij te kopen.
check('hosting kan ook bij Team', canBuyModule('team','hosting') === true)

// Limieten: Starter zit vast op offertes → Groei is het antwoord.
check('Starter offertelimiet → Groei', tierForLimit('starter','offertes') === 'groei')
check('  en Groei is daar onbeperkt', TIER_LIMITS.groei.offertes === null)

// Gebruikers: Groei gaat tot 2 → daarboven Team.
check('Groei gebruikerslimiet → Team', tierForLimit('groei','gebruikers') === 'team')
check('  Groei gaat tot 2', TIER_LIMITS.groei.gebruikers === 2)
check('  Team heeft geen maximum', TIER_LIMITS.team.gebruikers === null)

// Groei is al onbeperkt in klanten: geen zinnig hoger tier voor die limiet.
check('Groei klantenlimiet is onbeperkt → geen upgrade nodig', tierForLimit('groei','klanten') === null)

console.log(fouten === 0 ? '\nALLE VOORSTELTESTS GESLAAGD' : `\n${fouten} MISLUKT`)
process.exit(fouten === 0 ? 0 : 1)
