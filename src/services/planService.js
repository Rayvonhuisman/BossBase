import { supabase } from '../lib/supabase.js'
import { withCompanyId } from '../lib/currentCompany.js'
import { DEFAULT_TIER } from '../lib/tiers.js'
import { TIER_FEATURES, TIER_LIMITS, effectiveTier } from '../lib/features.js'

// Abonnementsstand van het huidige bedrijf: tier, trial, periode, modules,
// features en per limiet de stand. Dit is dezelfde waarheid als de server
// afdwingt — get_plan_status() draait op precies de helpers (bb_has_feature,
// bb_limit, bb_usage) die ook in de RLS-policies zitten.
export async function getPlanStatus() {
  const { data, error } = await supabase.rpc('get_plan_status')
  if (error) throw error
  if (!data) return null
  return {
    tier:         effectiveTier(data.tier),
    plan:         data.plan || null,
    status:       data.status || null,
    trial:        !!data.trial,
    trialEndsAt:  data.trialEndsAt || null,
    periodeStart: data.periodeStart || null,
    periodeEind:  data.periodeEind || null,
    // Read-only en de reden erachter. Alleen een expliciete `true` telt: een
    // ontbrekend veld (oudere database, RPC die nog niet is bijgewerkt) mag het
    // account nooit op alleen-lezen zetten.
    readonly:      data.readonly === true,
    readonlyReden: data.readonlyReden || null,
    magBeheren:    data.magBeheren === true,
    modules:      Array.isArray(data.modules) ? data.modules : [],
    features:     Array.isArray(data.features) ? data.features : [],
    limits:       data.limits || {},
  }
}

// Fallback wanneer de RPC (nog) niet beschikbaar is: leid de stand af uit de
// lokale matrix. Limietstanden zijn dan onbekend (0) — de server blijft de
// waarheid, dus dit maakt de UI hooguit ruimer, nooit de afdwinging.
export function fallbackPlanStatus(tier = DEFAULT_TIER) {
  const t = effectiveTier(tier)
  const limits = {}
  for (const [key, max] of Object.entries(TIER_LIMITS[t] || {})) {
    limits[key] = { max, gebruikt: 0 }
  }
  return {
    tier: t, plan: t, status: null, trial: false, trialEndsAt: null,
    periodeStart: null, periodeEind: null,
    // Zonder serverantwoord nooit read-only — zie de veiligheidsklep in de
    // database. Een storing in het ophalen van de stand mag geen account sluiten.
    readonly: false, readonlyReden: null, magBeheren: false,
    modules: [], features: TIER_FEATURES[t] || [], limits,
  }
}

// ── UPGRADE-AANHAAKPUNT (fase 2: Stripe Billing) ─────────────────────────────
// Legt de wens vast en meer niet. Zodra Stripe Billing er is, wordt dit het
// startpunt van de checkout — de aanroepende UI hoeft dan niet te veranderen.
export async function requestUpgrade({ tier, modules = [], aanleiding = null }) {
  const payload = await withCompanyId({
    gewenst_plan: tier || null,
    gewenste_modules: modules,
    aanleiding,
  })
  const { data, error } = await supabase
    .from('upgrade_requests')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}
