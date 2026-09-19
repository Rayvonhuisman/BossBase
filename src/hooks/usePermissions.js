import { useProfile } from '../lib/profileContext.jsx'
import { usePlan } from './usePlan.js'

// Rechten die alleen over ZIEN gaan. In een gedeelde werkruimte vervallen deze.
//
// Een Groei-bedrijf (1-2 personen) heeft geen `rollen_rechten` — die feature zit
// pas in Team. De rechten-UI staat daar dus achter een slot en user_permissions
// blijft leeg, terwijl wie je uitnodigt medewerker wordt (accept-invite). Een
// recht dat niemand kán toekennen is geen bescherming maar een blokkade.
//
// Dezelfde lijn loopt door de database (migratie 20260919220742: deals_select,
// facturen_select, offertes_select en job_costs kennen bb_gedeelde_werkruimte())
// en door het dashboard (magWidgetZien in widgetRegistry.js). Zonder deze hook
// zag zo'n medewerker de tegels wél, maar ontbraken Pipeline, Offertes,
// Facturen en Kosten in zijn menu — tegels die doodliepen op de routebewaking.
//
// Bewust NIET in deze lijst:
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
  'verkoop',            // Pipeline openen. Fase wijzigen loopt via magBewerken.
  'offertes',
  'facturen',
  'kosten',
  'bedrijfsfinancien',
  'projectbedragen',
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
    // 'planner' is geen aparte rol meer maar een medewerker met planning-recht.
    // Bestaande planner-accounts behouden zo hun planning-toegang.
    if (profile.role === 'planner' && permission === 'planning') return true
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
