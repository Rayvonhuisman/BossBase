import { supabase } from '../lib/supabase'
import { getCompanyId } from '../lib/currentCompany'

// Stripe Connect service-laag. Spiegelt accountingService: de frontend leest
// UITSLUITEND statusvelden uit stripe_connections en start/ververst via edge
// functions. De platform secret key blijft server-side in de edge functions.

const toStripeConnection = row => row ? ({
  id: row.id,
  accountId: row.stripe_account_id || '',
  chargesEnabled: !!row.charges_enabled,
  payoutsEnabled: !!row.payouts_enabled,
  detailsSubmitted: !!row.details_submitted,
  onboardingStatus: row.onboarding_status || 'pending',
  updatedAt: row.updated_at || null,
}) : null

// Haalt de werkelijke foutmelding uit een edge-function respons (bv. de 403
// tier-melding) i.p.v. de generieke "non-2xx"-fout van supabase-js.
async function invokeError(error) {
  // Edge functions geven bij een fout niet altijd JSON terug. Zonder body bleef
  // alleen "Edge Function returned a non-2xx status code" over — daar kan een
  // gebruiker niets mee. We nemen de statuscode mee zodat de melding tenminste
  // aanwijst wat er misging.
  let msg = error.message
  const status = error.context?.status
  try {
    const b = await error.context?.json()
    if (b?.error) msg = b.error
  } catch {
    try {
      const tekst = await error.context?.text?.()
      if (tekst && tekst.length < 300) msg = tekst
    } catch { /* geen leesbare body */ }
  }
  if (status && !String(msg).includes(String(status))) msg = `${msg} (status ${status})`
  return new Error(msg)
}

export async function getStripeConnection() {
  const companyId = await getCompanyId()
  if (!companyId) return null
  const { data, error } = await supabase
    .from('stripe_connections')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  return toStripeConnection(data)
}

// Start (of hervat) de onboarding en geeft de Stripe onboarding-URL terug.
export async function startStripeOnboarding() {
  const { data, error } = await supabase.functions.invoke('stripe-connect-start', { body: {} })
  if (error) throw await invokeError(error)
  if (!data?.url) throw new Error(data?.error || 'Onboarding starten mislukt')
  return data.url
}

// Ververst de accountstatus bij Stripe en schrijft die naar stripe_connections.
export async function refreshStripeStatus() {
  const { data, error } = await supabase.functions.invoke('stripe-connection-status', { body: {} })
  if (error) throw await invokeError(error)
  return data
}

// Maakt een iDEAL-betaallink voor een factuur (Checkout Session op het account
// van het bedrijf). Geeft de betaal-URL terug, of null als er (bewust) geen link
// is (geen/geen actieve koppeling, verkeerde tier, bedrag 0). Gooit alleen bij een
// echte fout; de aanroeper (factuurmail) vangt dat en verstuurt zonder knop.
export async function createFactuurPaymentLink(factuurId) {
  const { data, error } = await supabase.functions.invoke('stripe-create-payment-link', { body: { factuur_id: factuurId } })
  if (error) throw await invokeError(error)
  return data?.url || null
}

// Ontkoppelen: verwijder de lokale koppeling. Het Stripe-account zelf blijft bij
// Stripe onder de ondernemer bestaan; we laten enkel onze referentie los.
export async function disconnectStripe() {
  const companyId = await getCompanyId()
  if (!companyId) return
  const { error } = await supabase
    .from('stripe_connections')
    .delete()
    .eq('company_id', companyId)
  if (error) throw error
}
