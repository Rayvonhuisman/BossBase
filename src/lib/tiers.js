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

// Alle bedragen zijn EXCLUSIEF BTW (zo staan ze ook op de prijspagina). In Stripe
// betekent dat tax_behavior 'exclusive' op elke price.
export const PRIJZEN_EXCL_BTW = true

export const TIERS = [
  { id: 'starter', label: 'Starter', price: 29 },
  { id: 'groei',   label: 'Groei',   price: 39 },
  { id: 'team',    label: 'Team',    price: 59 },
]

// Tier waarop we terugvallen als er (nog) geen subscription bekend is.
export const DEFAULT_TIER = 'starter'

// Prijs per extra gebruiker — geldt overal (maand- én jaarweergave, alle pagina's).
export const EXTRA_USER_PRICE = 10

// Jaarabonnement: GEEN aparte jaarprijs en geen kortingspercentage. De klant
// betaalt gewoon maandelijks, 12 maanden lang, tegen dezelfde maandprijs.
// Het voordeel zit in de WELKOMSTACTIE die hij daarbij kiest (zie hieronder).
//
// Let op: dit verving het oude model (20% korting → Groei € 31/mnd). Voorheen:
// YEARLY_DISCOUNT / tierPriceYearly — die bestaan niet meer, zodat er geen prijs
// kan blijven rondslingeren die Stripe niet incasseert.
export const YEARLY_FREE_MONTHS = 2
export const yearlySavingPct = () => Math.round((YEARLY_FREE_MONTHS / 12) * 100)

// ── WELKOMSTACTIES ────────────────────────────────────────────────────────────
// Wie een JAARabonnement afsluit kiest één welkomstactie. Precies één — nooit
// allebei, en achteraf niet meer te wisselen (anders pakt iemand eerst de gratis
// maanden en daarna alsnog de website). Bij een maandabonnement is er geen actie.
//
// De gratis maanden zijn een KORTING, geen proefperiode. In Stripe is dat een
// coupon van 100% over de eerste twee termijnen; het abonnement staat vanaf dag
// één op actief en de incassomachtiging ligt meteen vast.
//
// Dat onderscheid is niet cosmetisch: "proefperiode" is voorbehouden aan de
// 14 dagen gratis uitproberen vóór het abonnement. Wie een jaarabonnement
// afsluit, is klant — die krijgt korting, geen proeftijd.
//
// `kortingMaanden` = aantal maanden dat de coupon 100% korting geeft.
export const WELKOMSTACTIES = [
  {
    key: 'gratis_maanden',
    label: `Eerste ${YEARLY_FREE_MONTHS} maanden gratis`,
    kort: `Je betaalt ${12 - YEARLY_FREE_MONTHS} van de 12 maanden.`,
    kortingMaanden: YEARLY_FREE_MONTHS,
    tiers: ['starter', 'groei', 'team'],
  },
  {
    key: 'gratis_website',
    label: 'Gratis website',
    kort: 'Wij bouwen eenmalig een professionele website voor je bedrijf.',
    // Geen korting: betalen vanaf de eerste maand.
    kortingMaanden: 0,
    // Niet bij Starter — dat pakket is te klein voor deze actie.
    tiers: ['groei', 'team'],
    // De website blijft beschikbaar zolang het abonnement loopt; hosting is een
    // aparte maandelijkse module (zie features.js → MODULES).
    hostingModule: 'hosting',
  },
]

export const WELKOMSTACTIE_KEYS = WELKOMSTACTIES.map(a => a.key)
export const getWelkomstactie = key => WELKOMSTACTIES.find(a => a.key === key) || null
export const welkomstactieLabel = key => getWelkomstactie(key)?.label || key

// Welke acties mag dit pakket kiezen? Alleen relevant bij een jaarabonnement.
export const welkomstactiesVoor = tier => WELKOMSTACTIES.filter(a => a.tiers.includes(tier))

// Hoeveel maanden 100% korting hoort er bij deze keuze? Geen keuze = 0.
export const kortingMaandenVoorActie = key => getWelkomstactie(key)?.kortingMaanden ?? 0

// Vaste id van de Stripe-coupon voor de welkomstactie. Wordt aangemaakt door
// scripts/stripe-setup-prices.mjs en hier bij naam aangeroepen, zodat er geen
// extra secret voor nodig is.
export const WELKOM_COUPON_ID = 'bb_welkom_2_maanden_gratis'

export const TIER_IDS = TIERS.map(t => t.id)

export const getTier    = id => TIERS.find(t => t.id === id) || null
export const tierLabel  = id => getTier(id)?.label || id
export const tierPrice  = id => getTier(id)?.price ?? 0
export const isValidTier = id => TIER_IDS.includes(id)

// Wat de klant het eerste jaar betaalt bij jaarbetaling: 10 van de 12 maanden.
export const tierPriceFirstYear = id => tierPrice(id) * (12 - YEARLY_FREE_MONTHS)

// Vaste tekst voor de "+ € X per extra gebruiker"-regel op de prijskaarten.
export const extraUserLabel = () => `+ € ${EXTRA_USER_PRICE} per extra gebruiker`
