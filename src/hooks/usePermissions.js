import { useProfile } from '../lib/profileContext.jsx'
import { usePlan } from './usePlan.js'

// OPERATIONELE rechten die alleen over ZIEN gaan. In een gedeelde werkruimte
// (pakket Groei, 1-2 personen) vervallen deze: iedereen ziet elkaars agenda,
// projecten en werkbonnen zonder rechtenbeheer.
//
// Een abonnementsfeature is geen gebruikersrecht. Financiele inzage — pipeline,
// offertes, facturen, kosten, bedrijfsfinancien, projectbedragen — vraagt
// daarom óók in een gedeelde werkruimte een expliciet recht (besluit 4-10-2026,
// migratie 20261004200000). Groei heeft daarvoor sinds 20261004190000 het
// rechtenbeheer. Deze lijst en de SELECT-policies horen hetzelfde te zeggen:
// staat een recht hier, dan moet de bijbehorende policy bb_gedeelde_werkruimte()
// kennen, anders opent het menu een pagina waar de database niets op teruggeeft.
//
// Bewust NIET in deze lijst:
// - verkoop, offertes, facturen, kosten, bedrijfsfinancien, projectbedragen:
//   financieel, zie hierboven.
// - klanten_bewerken, klanten_verwijderen, projecten_bewerken,
//   werkbonnen_bewerken: aanmaken en wijzigen blijft een recht vragen, precies
//   zoals de database het doet. deals_insert en deals_update eisen nog altijd
//   bb_has_permission('verkoop'), dus een knop die hier wél zou verschijnen
//   liep vast op de policy.
// - planning: gaat over inplannen, slepen en andermans agenda bewerken. De
//   Planning-pagina zit bovendien achter een Team-feature die Groei niet heeft.
// - inkoopprijzen: marges op materialen blijven dicht, net als
//   bb_mag_inkoopprijs_zien() in de database.
// - instellingen: beheer, geen inzage.
export const INZAGE_RECHTEN = new Set([
  'alles_inzien',
  'agenda_inzien',
  'projecten',
  'database',
  'team',
])

export function usePermissions() {
  const { profile, userPermissions } = useProfile()
  const plan = usePlan()
  const isAdmin = profile?.role === 'admin'

  // Zonder planStatus valt usePlan terug op DEFAULT_TIER ('starter'), en dan is
  // dit false. Dat is hier de goede kant om op te falen: bij twijfel niet
  // verruimen. Het menu is de eerste ~200 ms dus smal en wordt daarna breder.
  const gedeeldeWerkruimte = plan.has('gedeelde_werkruimte')

  // De strenge toets: puur het rechtensysteem, zonder gedeelde werkruimte.
  // Gebruik deze voor alles wat schrijft — aanmaken, wijzigen, verwijderen.
  const magBewerken = (permission) => {
    if (!profile) return false
    if (isAdmin) return true
    return Array.isArray(userPermissions) && userPermissions.includes(permission)
  }

  // De gewone toets, voor zien: menu, routes, tabbladen, bedragen. Gelijk aan
  // magBewerken, behalve dat inzagerechten vervallen in een gedeelde werkruimte.
  const can = (permission) => {
    if (gedeeldeWerkruimte && INZAGE_RECHTEN.has(permission)) return Boolean(profile)
    return magBewerken(permission)
  }

  return { can, magBewerken, isAdmin }
}
