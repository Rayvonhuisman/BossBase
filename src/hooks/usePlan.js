import { useProfile } from '../lib/profileContext.jsx'
import { DEFAULT_TIER } from '../lib/tiers.js'
import {
  hasFeature, limitFor, limitLabel, tierForFeature, tierForLimit, effectiveTier,
} from '../lib/features.js'

// De centrale feature-/limiethook. Spiegelt exact wat de server afdwingt:
// planStatus komt uit get_plan_status(), dat op dezelfde helpers draait als de
// RLS-policies. Is die stand er nog niet (eerste render, RPC mislukt), dan valt
// alles terug op de lokale matrix uit features.js.
//
// Gebruik:
//   const plan = usePlan()
//   plan.has('stripe_betaallink')      → feature aan/uit
//   plan.within('offertes')            → is er nog ruimte?
//   plan.stand('offertes')             → "offerte 7 van 20"
//   plan.needsFor('planning')          → tier dat je nodig hebt voor deze feature
export function usePlan() {
  const { company, planStatus } = useProfile()

  const tier    = effectiveTier(planStatus?.tier || company?.tier || DEFAULT_TIER)
  const modules = planStatus?.modules || []
  const trial   = !!planStatus?.trial

  // Feature-check. Server is leidend; zonder serverantwoord de lokale matrix.
  const has = key =>
    planStatus?.features ? planStatus.features.includes(key) : hasFeature(tier, key, modules)

  // null = onbeperkt.
  const limit = key => {
    const fromServer = planStatus?.limits?.[key]
    if (fromServer) return fromServer.max ?? null
    return limitFor(tier, key, { trial })
  }

  const used = key => Number(planStatus?.limits?.[key]?.gebruikt || 0)

  const within = key => {
    const max = limit(key)
    return max == null || used(key) < max
  }

  // "offerte 7 van 20" — de stand vooraf, zodat een limiet nooit verrast.
  const stand = key => limitLabel(key, used(key), limit(key))

  // Hoeveel er nog bij kan. null = onbeperkt.
  const resterend = key => {
    const max = limit(key)
    return max == null ? null : Math.max(0, max - used(key))
  }

  return {
    tier, trial, modules, planStatus,
    periodeStart: planStatus?.periodeStart || null,
    periodeEind:  planStatus?.periodeEind || null,
    trialEndsAt:  planStatus?.trialEndsAt || null,
    has, limit, used, within, stand, resterend,
    // Naar welk tier moet je voor deze feature / ruimere limiet?
    needsFor:      feature => tierForFeature(feature),
    needsForLimit: key => tierForLimit(tier, key),
  }
}
