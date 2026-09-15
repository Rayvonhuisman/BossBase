import { supabase } from '../lib/supabase.js'

// Het meldpunt in de bovenbalk: bugs en ideeën van gebruikers naar ons.
// Versturen loopt via de edge function `meldpunt`; die bepaalt zelf bedrijf,
// gebruiker en abonnement. Wat de server niet kan weten (pagina, browser,
// scherm) sturen we hier mee.

// ── ACTIE ────────────────────────────────────────────────────────────────────
// Staat de actie met prijzen aan? Geeft de prijzenlijst terug, of null.
// Bij twijfel (tabel nog niet gemigreerd, netwerkfout) null: dan beloven we
// liever niets dan iets wat niet meer loopt. De meldknop werkt hoe dan ook.
export async function getMeldactie() {
  const { data, error } = await supabase
    .from('platform_instellingen')
    .select('waarde')
    .eq('sleutel', 'meldactie')
    .maybeSingle()
  if (error || !data?.waarde?.actief) return null
  const prijzen = Array.isArray(data.waarde.prijzen) ? data.waarde.prijzen.filter(Boolean) : []
  return prijzen.length ? prijzen : null
}

// Volledige instelling, voor het super-admin portaal.
export async function getMeldactieInstelling() {
  const { data, error } = await supabase
    .from('platform_instellingen')
    .select('waarde, bijgewerkt_op')
    .eq('sleutel', 'meldactie')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function zetMeldactie(waarde) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('platform_instellingen')
    .update({ waarde, bijgewerkt_op: new Date().toISOString(), bijgewerkt_door: user?.id ?? null })
    .eq('sleutel', 'meldactie')
  if (error) throw error
}

// ── CONTEXT ──────────────────────────────────────────────────────────────────
// "Chrome 140 op macOS". Grof, maar genoeg om te zien of een bug aan één browser
// hangt; de volledige user-agent gaat er los bij.
export function browserLabel(ua = navigator.userAgent) {
  const v = re => (ua.match(re) || [])[1]
  let browser = 'Onbekende browser'
  if (/Edg\//.test(ua)) browser = `Edge ${v(/Edg\/(\d+)/)}`
  else if (/OPR\//.test(ua)) browser = `Opera ${v(/OPR\/(\d+)/)}`
  else if (/Firefox\//.test(ua)) browser = `Firefox ${v(/Firefox\/(\d+)/)}`
  else if (/FxiOS\//.test(ua)) browser = `Firefox ${v(/FxiOS\/(\d+)/)}`
  else if (/CriOS\//.test(ua)) browser = `Chrome ${v(/CriOS\/(\d+)/)}`
  else if (/Chrome\//.test(ua)) browser = `Chrome ${v(/Chrome\/(\d+)/)}`
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${v(/Version\/([\d.]+)/)}`

  let os = ''
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Linux/.test(ua)) os = 'Linux'
  return os ? `${browser} op ${os}` : browser
}

function context(pagina) {
  return {
    pagina: pagina || document.title,
    pagina_url: window.location.href,
    browser: browserLabel(),
    user_agent: navigator.userAgent,
    scherm: `${window.innerWidth}×${window.innerHeight} venster, ${window.screen?.width}×${window.screen?.height} scherm`,
  }
}

// ── SCHERMAFBEELDING ─────────────────────────────────────────────────────────
export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const DOEL_BYTES = 3 * 1024 * 1024

// Een retina-schermafbeelding van een groot scherm is al snel groter dan we
// willen versturen. Is hij te groot, dan verkleinen we hem hier in plaats van
// de melder een foutmelding te geven waar hij niets mee kan.
export async function verkleinAfbeelding(file) {
  if (file.size <= DOEL_BYTES) return file
  const bitmap = await createImageBitmap(file)
  const schaal = Math.min(1, 2400 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * schaal)
  canvas.height = Math.round(bitmap.height * schaal)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) return file
  return new File([blob], (file.name || 'schermafbeelding').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

const naarBase64 = file => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
  r.onerror = () => reject(new Error('Schermafbeelding kon niet worden gelezen'))
  r.readAsDataURL(file)
})

// ── VERSTUREN ────────────────────────────────────────────────────────────────
// Geeft { nummer, bevestigd, actie } terug.
export async function verstuurMelding({ soort, omschrijving, screenshot, pagina }) {
  const body = { soort, omschrijving, ...context(pagina) }
  if (screenshot) {
    body.screenshot = { type: screenshot.type, data: await naarBase64(screenshot) }
  }

  // Zonder eigen foutmelding van de server (storing, netwerk) is de tekst van
  // supabase-js technisch ("Edge Function returned a non-2xx status code").
  // Daar kan een melder niets mee; geef hem dan een uitweg.
  const terugval = 'Versturen lukte niet. Probeer het zo nog eens, of mail je melding naar info@bossbase.nl.'
  const { data, error } = await supabase.functions.invoke('meldpunt', { body })
  if (error) {
    let message = null
    try { const b = await error.context?.json(); if (b?.error) message = b.error } catch { /* geen json */ }
    throw new Error(message || terugval)
  }
  if (!data?.ok) throw new Error(data?.error || terugval)
  return data
}

// ── OVERZICHT (super-admin) ──────────────────────────────────────────────────
export async function listMeldingen() {
  const { data, error } = await supabase
    .from('meldingen')
    .select('*')
    .order('aangemaakt_op', { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

export async function zetMeldingStatus(id, status) {
  const { error } = await supabase.from('meldingen').update({ status }).eq('id', id)
  if (error) throw error
}

export async function screenshotUrl(pad) {
  const { data, error } = await supabase.storage.from('meldingen').createSignedUrl(pad, 60 * 10)
  if (error) throw error
  return data.signedUrl
}
