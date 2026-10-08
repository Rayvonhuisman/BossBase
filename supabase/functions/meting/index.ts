// meting (verify_jwt=false) — eigen cookievrije meting van bossbase.nl.
//
// De website stuurt per paginaweergave (en bij een klik op "Probeer gratis")
// een klein bericht: { soort, naam?, url, verwijzer }. Hier wordt het
// geschoond en bewaard in website_meting; zie _shared/meting.ts voor wat er
// wel en niet bewaard wordt. Altijd 204: de website wacht nergens op en een
// fout hier mag niets breken.
import { serviceClient } from '../_shared/superadmin.ts'
import { bezoekerHash, apparaatVan, kanaalVan, IS_BOT } from '../_shared/meting.ts'

const TOEGESTANE_HERKOMST = /^https:\/\/(www\.)?bossbase\.nl$/
const GEBEURTENISSEN = new Set(['registratie_klik'])
const MAX_PER_DAG = 500

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': TOEGESTANE_HERKOMST.test(origin) ? origin : 'https://www.bossbase.nl',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  }
}

Deno.serve(async req => {
  const kop = cors(req)
  const klaar = () => new Response(null, { status: 204, headers: kop })
  if (req.method === 'OPTIONS') return klaar()
  if (req.method !== 'POST') return klaar()

  try {
    const ua = req.headers.get('user-agent') ?? ''
    if (!ua || IS_BOT.test(ua)) return klaar()
    // Alleen van de echte website (sendBeacon stuurt een Origin mee).
    const origin = req.headers.get('origin') ?? ''
    if (!TOEGESTANE_HERKOMST.test(origin)) return klaar()

    const tekst = (await req.text()).slice(0, 2000)
    const b = JSON.parse(tekst)
    const soort = b?.soort === 'gebeurtenis' ? 'gebeurtenis' : 'pagina'
    const naam = soort === 'gebeurtenis' ? String(b?.naam ?? '') : null
    if (soort === 'gebeurtenis' && !GEBEURTENISSEN.has(naam!)) return klaar()

    const url = new URL(String(b?.url ?? ''))
    if (!TOEGESTANE_HERKOMST.test(url.origin)) return klaar()
    // De website schoont het pad al (anoniemeUrl); hier nog eens: alleen het
    // pad, ingekort, zonder query.
    const pad = url.pathname.slice(0, 200) || '/'
    const utm = {
      source: url.searchParams.get('utm_source')?.slice(0, 60) ?? null,
      medium: url.searchParams.get('utm_medium')?.slice(0, 60) ?? null,
      campaign: url.searchParams.get('utm_campaign')?.slice(0, 80) ?? null,
    }
    const ref = url.searchParams.get('ref')
    // Van de verwijzer alleen de domeinnaam.
    let verwijzer: string | null = null
    try { verwijzer = b?.verwijzer ? new URL(String(b.verwijzer)).hostname.slice(0, 100) : null } catch { verwijzer = null }

    const admin = serviceClient()
    const bezoeker = await bezoekerHash(admin, req)
    if (!bezoeker) return klaar()

    const dag = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date())
    const { count } = await admin.from('website_meting').select('id', { count: 'exact', head: true }).eq('bezoeker', bezoeker).eq('dag', dag)
    if ((count ?? 0) >= MAX_PER_DAG) return klaar()

    await admin.from('website_meting').insert({
      dag, soort, naam, pad,
      bron: kanaalVan(verwijzer, utm, ref),
      verwijzer: verwijzer?.replace(/^www\./, '') ?? null,
      utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign,
      apparaat: apparaatVan(ua),
      bezoeker,
    })
  } catch {
    // Meten mag nooit iets breken.
  }
  return klaar()
})
