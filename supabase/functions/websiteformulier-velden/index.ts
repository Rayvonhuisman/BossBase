// websiteformulier-velden — leest de formulieren op een pagina van de eigen
// website, zodat een ondernemer in Instellingen › Websiteformulier per veld kan
// kiezen bij welk BossBase-veld het hoort, zonder zelf in de HTML te zoeken.
//
// Ingelogd (verify_jwt aan). Wie dit mag en welke domeinen er zijn, komt uit
// bb_websiteformulier() met de sessie van de gebruiker zelf: die RPC eist het
// recht 'instellingen' en geeft de domeinen van het eigen bedrijf.
//
// Dit is een functie die een URL ophaalt, dus de regels zijn streng:
//   - alleen http(s) naar een domein dat het bedrijf zelf heeft opgegeven;
//   - geen IP-adressen en geen localhost;
//   - doorverwijzingen alleen binnen die domeinen, hooguit drie;
//   - hooguit 2 MB en 8 seconden.
// Wat we teruggeven zijn alleen veldnamen, soorten en labels.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMParser, type Element } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })

const MAX_BYTES = 2 * 1024 * 1024
const OVERSLAAN = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password'])

function magOphalen(u: URL, domeinen: string[]): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname
  if (host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) return false
  return domeinen.includes(u.origin)
}

async function haalOp(start: URL, domeinen: string[]): Promise<string> {
  let url = start
  for (let stap = 0; stap < 4; stap++) {
    if (!magOphalen(url, domeinen)) throw new Error('niet_toegestaan')
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'BossBase-formulierlezer/1.0 (+https://www.bossbase.nl)', Accept: 'text/html' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel()
      url = new URL(res.headers.get('location')!, url)
      continue
    }
    if (!res.ok) throw new Error(`status_${res.status}`)
    const lezer = res.body?.getReader()
    if (!lezer) return ''
    const delen: Uint8Array[] = []
    let totaal = 0
    while (true) {
      const { done, value } = await lezer.read()
      if (done) break
      totaal += value.length
      if (totaal > MAX_BYTES) { await lezer.cancel(); break }
      delen.push(value)
    }
    const alles = new Uint8Array(Math.min(totaal, MAX_BYTES))
    let pos = 0
    for (const d of delen) { alles.set(d.subarray(0, alles.length - pos), pos); pos += d.length; if (pos >= alles.length) break }
    return new TextDecoder().decode(alles)
  }
  throw new Error('te_veel_doorverwijzingen')
}

const schoon = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').replace(/\*/g, '').trim().slice(0, 120)

function labelVan(el: Element, doc: ReturnType<DOMParser['parseFromString']>): string {
  const id = el.getAttribute('id')
  if (id && doc) {
    for (const l of doc.querySelectorAll('label')) {
      if ((l as Element).getAttribute('for') === id) return schoon((l as Element).textContent)
    }
  }
  let ouder = el.parentElement
  for (let i = 0; ouder && i < 4; i++, ouder = ouder.parentElement) {
    if (ouder.tagName === 'LABEL') return schoon(ouder.textContent)
  }
  return schoon(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title'))
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { ok: false, fout: 'methode_niet_toegestaan' })

  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return json(401, { ok: false, fout: 'niet_ingelogd' })
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: formulier, error } = await client.rpc('bb_websiteformulier')
  if (error || !formulier) return json(403, { ok: false, fout: 'geen_toegang' })
  const domeinen: string[] = Array.isArray(formulier.domeinen) ? formulier.domeinen : []

  let url: URL
  try {
    const body = await req.json()
    url = new URL(String(body?.url || '').trim())
  } catch {
    return json(400, { ok: false, fout: 'ongeldige_url' })
  }
  if (!magOphalen(url, domeinen)) return json(400, { ok: false, fout: 'domein_niet_opgegeven' })

  let html: string
  try {
    html = await haalOp(url, domeinen)
  } catch (e) {
    const m = (e as Error).message || ''
    console.log('[websiteformulier-velden] ophalen mislukt', { soort: m.startsWith('status_') || m === 'niet_toegestaan' || m === 'te_veel_doorverwijzingen' ? m : (e as Error).name })
    return json(200, { ok: false, fout: m === 'niet_toegestaan' ? 'doorverwijzing_buiten_domein' : 'ophalen_mislukt' })
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const formulieren: { naam: string; velden: { naam: string; soort: string; label: string }[] }[] = []
  for (const [i, f] of Array.from(doc?.querySelectorAll('form') ?? []).entries()) {
    const form = f as Element
    const gezien = new Set<string>()
    const velden: { naam: string; soort: string; label: string }[] = []
    for (const v of form.querySelectorAll('input, select, textarea')) {
      const el = v as Element
      const naam = el.getAttribute('name') || ''
      const soort = el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : el.tagName.toLowerCase()
      if (!naam || naam.length > 120 || OVERSLAAN.has(soort) || gezien.has(naam)) continue
      // Zoekformulieren en technische velden van plugins.
      if (/^(s|q|_wp.*|g-recaptcha.*|cf-turnstile.*|bossbase_hp)$/i.test(naam)) continue
      gezien.add(naam)
      velden.push({ naam, soort, label: labelVan(el, doc) })
      if (velden.length >= 40) break
    }
    if (!velden.length) continue
    const naam = schoon(form.getAttribute('aria-label') || form.getAttribute('id') || form.getAttribute('name')) || `Formulier ${i + 1}`
    formulieren.push({ naam, velden })
    if (formulieren.length >= 10) break
  }

  return json(200, { ok: true, formulieren })
})
