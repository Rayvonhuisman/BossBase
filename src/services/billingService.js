import { supabase } from '../lib/supabase.js'

// Abonnementsbeheer (Stripe Billing — betalingen AAN BossBase).
// Niet te verwarren met stripeService.js, dat de Connect-koppeling bedient
// waarmee onze klanten betalingen van HÚN klanten ontvangen.

// Huidige abonnementsstand: pakket, status, verlengdatum, modules, limieten en
// of de ingelogde gebruiker het abonnement mag beheren.
export async function getBillingStatus() {
  const { data, error } = await supabase.rpc('get_billing_status')
  if (error) throw error
  if (!data) return null
  return {
    tier: data.tier,
    status: data.status || null,
    stripeStatus: data.stripeStatus || null,
    heeftStripe: !!data.heeftStripe,
    billingInterval: data.billingInterval || 'maand',
    extraGebruikers: Number(data.extraGebruikers || 0),
    trial: !!data.trial,
    trialEindigtOp: data.trialEindigtOp || null,
    periodeStart: data.periodeStart || null,
    verlengtOp: data.verlengtOp || null,
    opzeggenPerEindePeriode: !!data.opzeggenPerEindePeriode,
    welkomstactie: data.welkomstactie || null,
    heeftVerplichting: !!data.heeftVerplichting,
    verplichtingTot: data.verplichtingTot || null,
    stoptNaLooptijd: !!data.stoptNaLooptijd,
    magDirectOpzeggen: data.magDirectOpzeggen !== false,
    opzegbaarPer: data.opzegbaarPer || null,
    stoptOp: data.stoptOp || null,
    welkomstactieGekozenOp: data.welkomstactieGekozenOp || null,
    websiteAanvraag: data.websiteAanvraag || null,
    magBeheren: !!data.magBeheren,
    modules: Array.isArray(data.modules) ? data.modules : [],
    limieten: data.limieten || {},
  }
}

// Wat verhindert een overstap naar `doelTier`? Lege lijst = het mag.
// Dezelfde controle die de edge function server-side afdwingt, zodat de UI
// vooraf kan tonen wat er weg moet in plaats van achteraf te weigeren.
export async function getDowngradeBlokkades(doelTier) {
  const { data, error } = await supabase.rpc('bb_downgrade_blokkades', { p_doel_tier: doelTier })
  if (error) throw error
  return (data || []).map(b => ({
    limiet: b.limiet, label: b.label,
    gebruikt: Number(b.gebruikt), maximum: Number(b.maximum), teveel: Number(b.teveel),
  }))
}

// Foutmelding uit een edge function halen. Die geeft bij een 4xx een JSON-body
// met `error` en soms `code`/`blokkades`; zonder dit blijft er alleen
// "non-2xx status code" over.
async function edgeFout(error) {
  let bericht = error?.message || 'Onbekende fout'
  let payload = null
  try { payload = await error?.context?.json() } catch { /* geen JSON-body */ }
  if (payload?.error) bericht = payload.error
  const err = new Error(bericht)
  if (payload?.code) err.code = payload.code
  if (payload?.blokkades) err.blokkades = payload.blokkades
  return err
}

// Start een Checkout Session en geef de URL terug waar de klant heen moet.
export async function startCheckout({ tier, interval = 'maand', extraGebruikers = 0, modules = [], welkomstactie = null }) {
  const { data, error } = await supabase.functions.invoke('billing-checkout', {
    body: { tier, interval, extra_gebruikers: extraGebruikers, modules, welkomstactie },
  })
  if (error) throw await edgeFout(error)
  if (!data?.url) throw new Error(data?.error || 'Geen checkout-URL ontvangen')
  return data.url
}

// Open het Stripe Customer Portal (opzeggen, betaalmethode, facturen, wisselen).
export async function openPortal() {
  const { data, error } = await supabase.functions.invoke('billing-portal', { body: {} })
  if (error) throw await edgeFout(error)
  if (!data?.url) throw new Error(data?.error || 'Geen portal-URL ontvangen')
  return data.url
}

// Opzeggen. Bij een jaarabonnement binnen de looptijd stopt het abonnement aan
// het einde van de 12 maanden; bij een maandabonnement aan het einde van de
// lopende maand. `herstel: true` draait de opzegging terug.
export async function zegOp({ herstel = false } = {}) {
  const { data, error } = await supabase.functions.invoke('billing-cancel', { body: { herstel } })
  if (error) throw await edgeFout(error)
  if (data?.error) throw new Error(data.error)
  return data
}
