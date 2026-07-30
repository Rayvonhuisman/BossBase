// ── Feature- en limietmatrix ───────────────────────────────────────────────────
// EEN bron van waarheid voor: welke features horen bij welk abonnement, welke
// modules zijn bij te kopen, en welke limieten gelden. Net als tiers.js: wijzig
// ALLEEN hier — nergens anders hardcoden, geen parallelle waarden.
//
// Deze matrix is óók de bron voor de database. De tabellen plan_features,
// plan_limits en plan_modules worden geseed vanuit exact deze definitie; het
// seed-SQL wordt gegenereerd met:
//
//     node scripts/gen-plan-matrix.mjs
//
// Wijzig je hieronder iets, genereer dan een nieuwe migratie met dat script.
// De DATABASE is de waarheid bij afdwinging (RLS + edge functions); dit bestand
// stuurt de UI én levert de seed. Zo blijven ze per definitie gelijk.

import { TIER_IDS } from './tiers.js'

// ── FEATURES ──────────────────────────────────────────────────────────────────
// key = de identifier die overal wordt gebruikt (UI, RLS, edge functions).
// label/uitleg zijn voor de UI (upgrade-melding, prijspagina, super-admin).
export const FEATURES = [
  // Basis — zit in elk abonnement
  { key: 'crm_pipeline',            label: 'CRM & pipeline',              uitleg: 'Verkooppijplijn met deals en leads.' },
  { key: 'klanten',                 label: 'Klanten',                     uitleg: 'Klantenbeheer en klantkaart.' },
  { key: 'leads',                   label: 'Leads',                       uitleg: 'Binnenkomende aanvragen als lead in de pipeline.' },
  { key: 'offertes',                label: 'Offertes',                    uitleg: 'Offertes opstellen, versturen en opvolgen.' },
  { key: 'facturen',                label: 'Facturen',                    uitleg: 'Facturen aanmaken, versturen en betaalstatus volgen.' },
  { key: 'werkbonnen',              label: 'Werkbonnen',                  uitleg: 'Werkbonnen met taken, materialen en foto’s.' },
  { key: 'uren',                    label: 'Urenregistratie',             uitleg: 'Uren schrijven per project of werkbon.' },
  { key: 'agenda',                  label: 'Agenda',                      uitleg: 'Afspraken en ingeplande werkbonnen.' },
  { key: 'adres_autocomplete',      label: 'Adres-autocomplete',          uitleg: 'Adressen automatisch aanvullen via PDOK.' },
  { key: 'afspraakherinnering',     label: 'Afspraakherinnering',         uitleg: 'Automatische herinnering voor afspraken.' },
  { key: 'email_templates_bewerken',label: 'E-mailtemplates bewerken',    uitleg: 'De standaard e-mailtemplates aanpassen.' },

  // Groei
  { key: 'digitale_handtekening',   label: 'Digitale handtekening',       uitleg: 'Offertes online laten ondertekenen door de klant.' },
  { key: 'betaalherinneringen',     label: 'Automatische betaalherinneringen', uitleg: 'Herinneringen bij openstaande facturen.' },
  { key: 'boekhoudkoppeling',       label: 'Boekhoudkoppeling',           uitleg: 'Koppeling met Moneybird, SnelStart of AFAS.' },
  { key: 'btw_overzicht',           label: 'BTW-overzicht',               uitleg: 'BTW per periode uit de boekhoudkoppeling.' },
  { key: 'kosten_nacalculatie',     label: 'Kosten & nacalculatie',       uitleg: 'Kosten registreren en marge per project bewaken.' },
  { key: 'eigen_email_templates',   label: 'Eigen e-mailtemplates',       uitleg: 'Zelf nieuwe e-mailtemplates aanmaken.' },

  // Team (of als module bij Groei)
  { key: 'rollen_rechten',          label: 'Rollen & rechten',            uitleg: 'Per teamlid instellen wat hij mag zien en doen.' },
  { key: 'planning',                label: 'Planningsmodule',             uitleg: 'Weekplanning met drag & drop op medewerker en voertuig.' },
  { key: 'stripe_betaallink',       label: 'Stripe betaallink',           uitleg: 'iDEAL-betaalknop op je facturen via Stripe.' },
  { key: 'voertuigen',              label: 'Voertuigen',                  uitleg: 'Voertuigen beheren en inplannen in de planning.' },

  // Intern gedrag — geen verkoopbare functie, wel tier-afhankelijk. Staat hier
  // zodat er nergens meer een losse `tier === '…'`-vergelijking nodig is.
  // `intern: true` houdt het uit prijskaarten en upgrade-meldingen.
  { key: 'gedeelde_werkruimte',     label: 'Gedeelde werkruimte',         intern: true,
    uitleg: 'Iedereen ziet elkaars agenda, projecten en werkbonnen zonder rechtenbeheer. Past bij een bedrijf van één of twee personen.' },
]

// Features die aan de gebruiker getoond mogen worden (prijskaarten, upgrade).
export const ZICHTBARE_FEATURES = FEATURES.filter(f => !f.intern)

export const FEATURE_KEYS = FEATURES.map(f => f.key)

export const getFeature   = key => FEATURES.find(f => f.key === key) || null
export const featureLabel = key => getFeature(key)?.label || key

// ── PER TIER: WELKE FEATURES ──────────────────────────────────────────────────
// Cumulatief opgebouwd: Groei = Starter + extra, Team = Groei + extra. Zo kan er
// nooit per ongeluk iets uit een lager pakket wegvallen.
const STARTER_FEATURES = [
  'crm_pipeline', 'klanten', 'leads', 'offertes', 'facturen', 'werkbonnen',
  'uren', 'agenda', 'adres_autocomplete', 'afspraakherinnering',
  'email_templates_bewerken',
]

const GROEI_EXTRA = [
  'digitale_handtekening', 'betaalherinneringen', 'boekhoudkoppeling',
  'btw_overzicht', 'kosten_nacalculatie', 'eigen_email_templates',
]

const TEAM_EXTRA = [
  'rollen_rechten', 'planning', 'stripe_betaallink', 'voertuigen',
]

export const TIER_FEATURES = {
  starter: STARTER_FEATURES,
  // Groei (1-2 personen) is een gedeelde werkruimte: beide teamleden zien
  // elkaars agenda, projecten en werkbonnen. Starter is solo, Team werkt met
  // rollen & rechten — daar geldt het dus niet.
  groei:   [...STARTER_FEATURES, ...GROEI_EXTRA, 'gedeelde_werkruimte'],
  team:    [...STARTER_FEATURES, ...GROEI_EXTRA, ...TEAM_EXTRA],
}

// ── MODULES ───────────────────────────────────────────────────────────────────
// Los bij te kopen — ALLEEN bij Groei. Bij Team zitten ze inbegrepen (staan daar
// al in TIER_FEATURES); bij Starter zijn ze niet te koop.
// `vereist` = module die eerst aan moet staan (voertuigen kan alleen mét planning).
export const MODULES = [
  { key: 'stripe_betaallink', label: 'Stripe betaallink', price: 10, feature: 'stripe_betaallink', vereist: null },
  { key: 'planning',          label: 'Planningsmodule',   price: 10, feature: 'planning',          vereist: null },
  { key: 'voertuigen',        label: 'Voertuigen',        price: 5,  feature: 'voertuigen',        vereist: 'planning' },
]

export const MODULE_KEYS = MODULES.map(m => m.key)

// Tiers waarbij modules los bijgekocht kunnen worden.
export const MODULE_TIERS = ['groei']

export const getModule   = key => MODULES.find(m => m.key === key) || null
export const modulePrice = key => getModule(key)?.price ?? 0
export const moduleLabel = key => getModule(key)?.label || key

// Kan dit tier deze module bijkopen?
export const canBuyModule = (tier, key) => MODULE_TIERS.includes(tier) && MODULE_KEYS.includes(key)

// ── LIMIETEN ──────────────────────────────────────────────────────────────────
// value: null = onbeperkt.
// telwijze:
//   'voorraad' — telt de rijen die er NU zijn. Verwijderen geeft een plek vrij.
//   'periode'  — telt wat er in de lopende factuurperiode is AANGEMAAKT, via het
//                ledger plan_usage_events. Verwijderen geeft de teller NIET vrij.
export const LIMIT_DEFS = [
  { key: 'gebruikers', label: 'Gebruikers', enkelvoud: 'gebruiker', telwijze: 'voorraad' },
  { key: 'klanten',    label: 'Klanten',    enkelvoud: 'klant',     telwijze: 'voorraad' },
  { key: 'offertes',   label: 'Offertes',   enkelvoud: 'offerte',   telwijze: 'periode' },
  { key: 'facturen',   label: 'Facturen',   enkelvoud: 'factuur',   telwijze: 'periode' },
]

export const LIMIT_KEYS = LIMIT_DEFS.map(l => l.key)

export const getLimitDef = key => LIMIT_DEFS.find(l => l.key === key) || null

// null = onbeperkt. Gebruikers bij Team: onbeperkt (€10 per extra gebruiker).
export const TIER_LIMITS = {
  starter: { gebruikers: 1,    klanten: 100,  offertes: 20,   facturen: 20   },
  groei:   { gebruikers: 2,    klanten: null, offertes: null, facturen: null },
  team:    { gebruikers: null, klanten: null, offertes: null, facturen: null },
}

// ── EFFECTIEF TIER ────────────────────────────────────────────────────────────
// Tijdens de trial gelden er GEEN limieten en is de trial altijd Groei of Team.
// Staat er nog 'trial' in subscriptions.plan, dan behandelen we dat als Groei.
export const TRIAL_TIER = 'groei'

export function effectiveTier(plan) {
  const id = String(plan || '').toLowerCase()
  if (TIER_IDS.includes(id)) return id
  return TRIAL_TIER
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Heeft dit abonnement deze feature?
 * @param {string}   tier     'starter' | 'groei' | 'team'
 * @param {string}   feature  key uit FEATURES
 * @param {string[]} modules  bijgekochte modulesleutels (alleen relevant bij Groei)
 */
export function hasFeature(tier, feature, modules = []) {
  const t = effectiveTier(tier)
  if ((TIER_FEATURES[t] || []).includes(feature)) return true
  if (!MODULE_TIERS.includes(t)) return false
  return MODULES.some(m => m.feature === feature && modules.includes(m.key))
}

/** Limiet voor dit tier. null = onbeperkt. Tijdens de trial: altijd onbeperkt. */
export function limitFor(tier, key, { trial = false } = {}) {
  if (trial) return null
  const t = effectiveTier(tier)
  return TIER_LIMITS[t]?.[key] ?? null
}

/** Is er nog ruimte? `used` is de huidige stand. */
export function withinLimit(tier, key, used, { trial = false } = {}) {
  const max = limitFor(tier, key, { trial })
  if (max == null) return true
  return Number(used || 0) < max
}

/** Het laagste tier dat deze feature heeft — voor de upgrade-melding. */
export function tierForFeature(feature) {
  return TIER_IDS.find(t => (TIER_FEATURES[t] || []).includes(feature)) || null
}

/** Het laagste tier waar deze limiet ruimer is dan bij `tier`. */
export function tierForLimit(tier, key) {
  const huidig = TIER_LIMITS[effectiveTier(tier)]?.[key]
  if (huidig == null) return null
  return TIER_IDS.find(t => {
    const v = TIER_LIMITS[t]?.[key]
    return v == null || v > huidig
  }) || null
}

/** "offerte 7 van 20" — de stand vooraf, zodat een limiet nooit verrast. */
export function limitLabel(key, used, max) {
  const def = getLimitDef(key)
  const naam = def?.enkelvoud || key
  if (max == null) return `${used} ${def?.label?.toLowerCase() || key}`
  return `${naam} ${Math.min(Number(used || 0) + 1, max)} van ${max}`
}
