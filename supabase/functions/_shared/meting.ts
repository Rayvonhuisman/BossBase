// Eigen cookievrije meting van bossbase.nl. Gebruikt door de functie `meting`
// (paginaweergaven en klikken) en door verify-code en public-website-inquiry
// (langs welk kanaal kwam deze aanmelding of aanvraag binnen).
//
// Privacy, zie ook docs/juridisch/cookiebeleid.md:
//   - geen cookies en niets in de browser van de bezoeker;
//   - een bezoeker is een hash van IP-adres + browser + een zout dat per dag
//     wisselt. Het IP-adres zelf wordt nergens bewaard. Het zout van gisteren
//     wordt gewist, waarna niemand (ook wij niet) een hash nog aan een
//     IP-adres of aan een andere dag kan koppelen;
//   - van de verwijzer bewaren we alleen de domeinnaam, van de pagina alleen
//     het pad (tokens en id's eruit) en de utm-parameters.

const vandaag = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date())

function willekeurig(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// Het zout van vandaag; maakt het aan als het er nog niet is (alleen als
// `maken`). Wist meteen de zouten van eerdere dagen.
export async function zoutVanVandaag(admin: any, maken = true): Promise<string | null> {
  const dag = vandaag()
  const { data } = await admin.from('meting_zout').select('zout').eq('dag', dag).maybeSingle()
  if (data?.zout) return data.zout
  if (!maken) return null
  await admin.from('meting_zout').upsert({ dag, zout: willekeurig() }, { onConflict: 'dag', ignoreDuplicates: true })
  await admin.from('meting_zout').delete().lt('dag', dag)
  // Eén keer per dag ook de bewaartermijn van de meting zelf: 25 maanden.
  const grens = new Date(Date.now() - 761 * 86400000).toISOString().slice(0, 10)
  await admin.from('website_meting').delete().lt('dag', grens)
  const { data: opnieuw } = await admin.from('meting_zout').select('zout').eq('dag', dag).maybeSingle()
  return opnieuw?.zout ?? null
}

export function ipVan(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || ''
}

async function sha256(tekst: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst))
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('')
}

export async function bezoekerHash(admin: any, req: Request, maken = true): Promise<string | null> {
  const zout = await zoutVanVandaag(admin, maken)
  if (!zout) return null
  return (await sha256(`${zout}|${ipVan(req)}|${req.headers.get('user-agent') ?? ''}`)).slice(0, 32)
}

export const IS_BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|httpclient|facebookexternalhit|embedly|vercel/i

export function apparaatVan(ua: string): string {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|android/i.test(ua)) return 'mobiel'
  return 'desktop'
}

// Het kanaal waarlangs iemand binnenkwam, in gewone taal.
export function kanaalVan(verwijzer: string | null, utm: { source?: string | null; medium?: string | null }, ref?: string | null): string {
  const bron = (utm.source ?? '').toLowerCase().trim()
  const medium = (utm.medium ?? '').toLowerCase().trim()
  if (ref) return 'Doorverwezen'
  if (bron) {
    const betaald = /cpc|ppc|paid|ads?$|advert|display|social_paid/.test(medium)
    if (/google/.test(bron)) return betaald ? 'Google Ads' : 'Google (campagne)'
    if (/facebook|instagram|meta|fb|ig/.test(bron)) return betaald ? 'Facebook/Instagram (advertentie)' : 'Facebook/Instagram (campagne)'
    if (/linkedin/.test(bron)) return betaald ? 'LinkedIn (advertentie)' : 'LinkedIn (campagne)'
    if (/mail|nieuwsbrief|newsletter/.test(bron) || medium === 'email') return 'E-mail (campagne)'
    return `${bron.charAt(0).toUpperCase()}${bron.slice(1, 40)} (campagne)`
  }
  const host = (verwijzer ?? '').toLowerCase().replace(/^www\./, '')
  if (!host) return 'Direct'
  if (host === 'bossbase.nl' || host.endsWith('.bossbase.nl') || host === 'localhost') return 'Intern'
  if (/(^|\.)google\./.test(host)) return 'Google (organisch)'
  if (/(^|\.)bing\.com$/.test(host)) return 'Bing'
  if (/duckduckgo\.com$/.test(host)) return 'DuckDuckGo'
  if (/ecosia\.org$/.test(host)) return 'Ecosia'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'Facebook'
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram'
  if (/(^|\.)(linkedin\.com|lnkd\.in)$/.test(host)) return 'LinkedIn'
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'YouTube'
  if (/(^|\.)tiktok\.com$/.test(host)) return 'TikTok'
  if (/(chatgpt\.com|openai\.com)$/.test(host)) return 'ChatGPT'
  if (/perplexity\.ai$/.test(host)) return 'Perplexity'
  if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(host)) return 'X (Twitter)'
  if (/whatsapp/.test(host)) return 'WhatsApp'
  return host.slice(0, 60)
}

// Langs welk kanaal kwam de bezoeker achter dit verzoek vandaag binnen?
// Alleen op dezelfde dag te bepalen (het zout wisselt per dag); anders null.
export async function bronVanBezoeker(admin: any, req: Request): Promise<string | null> {
  try {
    const hash = await bezoekerHash(admin, req, false)
    if (!hash) return null
    const { data } = await admin.from('website_meting').select('bron')
      .eq('bezoeker', hash).eq('dag', vandaag()).eq('soort', 'pagina')
      .order('op', { ascending: true }).limit(50)
    if (!data?.length) return null
    return data.find((r: any) => r.bron && r.bron !== 'Intern')?.bron ?? 'Direct'
  } catch {
    return null
  }
}
