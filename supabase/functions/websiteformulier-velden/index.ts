// websiteformulier-velden — leest de formulieren op een pagina van de eigen
// website, zodat een ondernemer in Instellingen › Websiteformulier per veld kan
// kiezen bij welk BossBase-veld het hoort, zonder zelf in de HTML te zoeken.
//
// Ingelogd (verify_jwt aan). Wie dit mag en welke domeinen er zijn, komt uit
// bb_websiteformulier() met de sessie van de gebruiker zelf: die RPC eist het
// recht 'instellingen' en geeft de domeinen van het eigen bedrijf.
//
// Dit is een functie die een URL ophaalt, dus de regels zijn streng:
//   - alleen http(s) naar een domein dat het bedrijf zelf heeft opgegeven (met
//     of zonder www), of naar bossbase.nl zelf;
//   - geen IP-adressen en geen localhost;
//   - doorverwijzingen alleen binnen die domeinen, hooguit vijf;
//   - hooguit 2 MB en 10 seconden.
// Wat we teruggeven zijn alleen veldnamen, soorten, labels en keuzeopties.
//
// De app zet het domein van de pagina eerst zelf in de lijst (en slaat op)
// voordat hij deze functie aanroept; de ondernemer hoeft dus niet eerst los
// op te slaan.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMParser, type Element } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Altijd status 200 met { ok, fout }: supabase.functions.invoke maakt van elke
// andere status een algemene fout, en dan ziet de ondernemer niet wát er mis is.
const json = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })

const MAX_BYTES = 2 * 1024 * 1024
const OVERSLAAN = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password'])
// De pagina's van BossBase zelf mogen altijd: daar staat ons eigen
// contactformulier, handig om mee te oefenen.
const BOSSBASE = /^(www\.)?bossbase\.nl$/

const zonderWww = (h: string) => h.replace(/^www\./, '')

// "mijnbedrijf.nl/contact", "www.mijnbedrijf.nl" en "http://…" mogen allemaal.
export function naarUrl(invoer: string): URL | null {
  const t = invoer.trim()
  if (!t) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    if (!/\.[a-z]{2,}$/i.test(u.hostname)) return null
    return u
  } catch {
    return null
  }
}

function magOphalen(u: URL, domeinen: string[]): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) return false
  if (BOSSBASE.test(host)) return true
  // Met of zonder www is voor de ondernemer dezelfde site.
  return domeinen.some(d => {
    try { return zonderWww(new URL(d).hostname) === zonderWww(host) } catch { return false }
  })
}

class OphaalFout extends Error {
  constructor(public code: string, public status = 0) { super(code) }
}

async function haalOp(start: URL, domeinen: string[]): Promise<{ html: string; url: string }> {
  let url = start
  for (let stap = 0; stap < 5; stap++) {
    if (!magOphalen(url, domeinen)) throw new OphaalFout('doorverwijzing_buiten_domein')
    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: {
          // Een gewone browsernaam: sommige beveiligingen (Cloudflare, Wordfence)
          // weigeren alles wat op een robot lijkt.
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 BossBase-formulierlezer',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
        },
      })
    } catch (e) {
      throw new OphaalFout((e as Error).name === 'TimeoutError' ? 'te_traag' : 'niet_bereikbaar')
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel()
      url = new URL(res.headers.get('location')!, url)
      continue
    }
    if (res.status === 404 || res.status === 410) throw new OphaalFout('niet_gevonden', res.status)
    if ([401, 403, 429, 503].includes(res.status)) throw new OphaalFout('geblokkeerd', res.status)
    if (!res.ok) throw new OphaalFout('ophalen_mislukt', res.status)
    if (!(res.headers.get('content-type') || 'text/html').includes('html')) throw new OphaalFout('geen_html')
    const lezer = res.body?.getReader()
    if (!lezer) return { html: '', url: url.href }
    const delen: Uint8Array[] = []
    let totaal = 0
    while (true) {
      const { done, value } = await lezer.read()
      if (done) break
      delen.push(value)
      totaal += value.length
      if (totaal > MAX_BYTES) { await lezer.cancel(); break }
    }
    const alles = new Uint8Array(Math.min(totaal, MAX_BYTES))
    let pos = 0
    for (const d of delen) {
      const stuk = d.subarray(0, alles.length - pos)
      alles.set(stuk, pos)
      pos += stuk.length
      if (pos >= alles.length) break
    }
    return { html: new TextDecoder().decode(alles), url: url.href }
  }
  throw new OphaalFout('te_veel_doorverwijzingen')
}

// Een paar varianten proberen: het adres zoals getypt, en zonder of met www.
// Een site die alleen op www draait (of juist niet) is zo geen fout van de
// ondernemer.
async function haalOpMetVarianten(u: URL, domeinen: string[]) {
  const varianten = [u]
  const ander = new URL(u.href)
  ander.hostname = u.hostname.startsWith('www.') ? zonderWww(u.hostname) : `www.${u.hostname}`
  varianten.push(ander)
  let laatste: OphaalFout | null = null
  for (const v of varianten) {
    try {
      return await haalOp(v, domeinen)
    } catch (e) {
      laatste = e instanceof OphaalFout ? e : new OphaalFout('ophalen_mislukt')
      // Alleen bij "niet bereikbaar" de andere variant proberen; een 404 of
      // een blokkade verandert daar niet door.
      if (laatste.code !== 'niet_bereikbaar' && laatste.code !== 'te_traag') break
    }
  }
  throw laatste!
}

// Herkent een pagina waarvan het formulier pas door JavaScript wordt gemaakt.
function bouwerVan(html: string): string | null {
  if (/static\.parastorage\.com|wixstatic\.com|wix-thunderbolt/i.test(html)) return 'wix'
  if (/squarespace\.com|static1\.squarespace/i.test(html)) return 'squarespace'
  if (/assets\.website-files\.com|webflow/i.test(html)) return 'webflow'
  if (/jimdo/i.test(html)) return 'jimdo'
  return null
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
  if (req.method !== 'POST') return json({ ok: false, fout: 'methode_niet_toegestaan' })

  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, fout: 'niet_ingelogd' })
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: formulier, error } = await client.rpc('bb_websiteformulier')
  if (error || !formulier) return json({ ok: false, fout: 'geen_toegang' })
  const domeinen: string[] = Array.isArray(formulier.domeinen) ? formulier.domeinen : []

  let invoer = ''
  try {
    invoer = String((await req.json())?.url || '')
  } catch { /* lege invoer */ }
  const url = naarUrl(invoer)
  if (!url) return json({ ok: false, fout: 'ongeldige_url' })
  if (!magOphalen(url, domeinen)) return json({ ok: false, fout: 'domein_niet_opgegeven' })

  let html: string
  let gelezen: string
  try {
    ({ html, url: gelezen } = await haalOpMetVarianten(url, domeinen))
  } catch (e) {
    const f = e instanceof OphaalFout ? e : new OphaalFout('ophalen_mislukt')
    console.log('[websiteformulier-velden] ophalen mislukt', { fout: f.code, status: f.status })
    return json({ ok: false, fout: f.code, status: f.status || undefined })
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const formulieren: { naam: string; velden: { naam: string; soort: string; label: string; opties?: string[] }[] }[] = []
  for (const [i, f] of Array.from(doc?.querySelectorAll('form') ?? []).entries()) {
    const form = f as Element
    const gezien = new Set<string>()
    const velden: { naam: string; soort: string; label: string; opties?: string[] }[] = []
    for (const v of form.querySelectorAll('input, select, textarea')) {
      const el = v as Element
      const naam = el.getAttribute('name') || ''
      const soort = el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : el.tagName.toLowerCase()
      if (!naam || naam.length > 120 || OVERSLAAN.has(soort) || gezien.has(naam)) continue
      // Zoekvelden, de verborgen velden van formulierplugins en ons eigen
      // anti-spamveld.
      if (/^(s|q|_wp.*|g-recaptcha.*|cf-turnstile.*|bossbase_hp|bedrijfswebsite)$/i.test(naam)) continue
      gezien.add(naam)
      const veld: { naam: string; soort: string; label: string; opties?: string[] } = { naam, soort, label: labelVan(el, doc) }
      if (soort === 'select') {
        veld.opties = Array.from(el.querySelectorAll('option')).map(o => schoon((o as Element).textContent)).filter(Boolean).slice(0, 20)
      }
      velden.push(veld)
      if (velden.length >= 40) break
    }
    if (!velden.length) continue
    const naam = schoon(form.getAttribute('aria-label') || form.getAttribute('id') || form.getAttribute('name')) || `Formulier ${i + 1}`
    formulieren.push({ naam, velden })
    if (formulieren.length >= 10) break
  }

  if (!formulieren.length) {
    return json({ ok: false, fout: 'geen_formulier', bouwer: bouwerVan(html), url: gelezen })
  }
  return json({ ok: true, formulieren, url: gelezen })
})
