// ── Abonnementstiers ──────────────────────────────────────────────────────────
// Eén bron voor de tiernamen én prijzen. Wordt gebruikt door de app, het
// super-admin portaal en de marketingpagina's.
// Wijzig namen/prijzen ALLEEN hier — nergens anders hardcoden, geen parallelle
// waarden.
//
// WELKE FEATURES EN LIMIETEN bij een tier horen staat NIET hier maar in
// features.js — dat is de matrix die zowel de UI (usePlan) als de database
// (plan_features / plan_limits, via scripts/gen-plan-matrix.mjs) voedt.
//
// De tier zelf wordt per bedrijf opgeslagen in `subscriptions.plan`
// (één rij per company). Voor de frontend leest `get_company_tier()` alleen de
// tier uit — zie profileService.getCompany en de bijbehorende migratie.

export const TIERS = [
  { id: 'starter', label: 'Starter', price: 29 },
  { id: 'groei',   label: 'Groei',   price: 39 },
  { id: 'team',    label: 'Team',    price: 59 },
]

// Tier waarop we terugvallen als er (nog) geen subscription bekend is.
export const DEFAULT_TIER = 'starter'

// Prijs per extra gebruiker — geldt overal (maand- én jaarweergave, alle pagina's).
export const EXTRA_USER_PRICE = 10

// Jaarabonnement: 20% korting op de maandprijs, naar beneden afgerond op hele
// euro's, getoond als maandprijs bij jaarbetaling.
//   Starter € 23 · Groei € 31 · Team € 47
export const YEARLY_DISCOUNT = 0.2
export const YEARLY_DISCOUNT_LABEL = 'Bespaar jaarlijks meer dan 20%'

export const TIER_IDS = TIERS.map(t => t.id)

export const getTier    = id => TIERS.find(t => t.id === id) || null
export const tierLabel  = id => getTier(id)?.label || id
export const tierPrice  = id => getTier(id)?.price ?? 0
// Maandprijs bij jaarbetaling (20% korting, naar beneden afgerond).
export const tierPriceYearly = id => Math.floor(tierPrice(id) * (1 - YEARLY_DISCOUNT))
export const isValidTier = id => TIER_IDS.includes(id)

// Vaste tekst voor de "+ € X per extra gebruiker"-regel op de prijskaarten.
export const extraUserLabel = () => `+ € ${EXTRA_USER_PRICE} per extra gebruiker`
