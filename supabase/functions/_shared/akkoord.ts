// Vastleggen van het akkoord met de juridische documenten bij registratie.
// Gebruikt door akkoord-vastleggen (bij het klikken op "BossBase starten") en
// door verify-code als vangnet als die eerste aanroep niet aankwam.

// Houd gelijk met de versieregel in docs/juridisch. Nieuwe versie van een
// document → hier ophogen, zodat nieuwe akkoorden de juiste versie dragen.
export const AKKOORD_VERSIES: Record<string, string> = {
  // 2026-11: artikel 15 (de website bij het jaarabonnement) in de voorwaarden,
  // en de intake van de website in de privacyverklaring. Spiegelt
  // src/lib/akkoord.js, dat bestaande beheerders de nieuwe versie laat accepteren.
  algemene_voorwaarden:   '2026-11',
  verwerkersovereenkomst: '2026-10',
  privacyverklaring:      '2026-11',
}

// Het eerste adres in x-forwarded-for is de client; de rest zijn proxies.
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim() || null
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null
}

// Legt vast wat er nog ontbreekt: per document de huidige versie. Een tweede
// aanroep (dubbelklik, retry, vangnet) voegt dus niets toe. Had de gebruiker al
// een eerdere versie geaccepteerd, dan is dit het akkoord op de nieuwe versie
// (bron 'nieuwe_versie'). Geeft terug of er nu iets is vastgelegd.
// deno-lint-ignore no-explicit-any
//
// `alleenEerste`: alleen vastleggen als er nog helemaal geen akkoord is. Voor
// het vangnet in verify-code: dat mag geen akkoord op een nieuwe versie
// vastleggen die de gebruiker nooit te zien kreeg.
export async function legAkkoordVast(admin: any, user: { id: string; email?: string | null }, req: Request, bron: string, o: { alleenEerste?: boolean } = {}): Promise<boolean> {
  const { data: bestaand, error: leesFout } = await admin.from('juridisch_akkoord')
    .select('document, versie')
    .eq('user_id', user.id)
  if (leesFout) throw new Error(leesFout.message)
  const heeft = new Set((bestaand || []).map((r: { document: string; versie: string }) => `${r.document}@${r.versie}`))
  const ontbreekt = Object.entries(AKKOORD_VERSIES).filter(([document, versie]) => !heeft.has(`${document}@${versie}`))
  if (!ontbreekt.length) return false
  if (o.alleenEerste && (bestaand || []).length > 0) return false
  if ((bestaand || []).length > 0) bron = 'nieuwe_versie'

  const nu = new Date().toISOString()
  const ip = clientIp(req)
  const userAgent = (req.headers.get('user-agent') || '').slice(0, 500) || null
  const rijen = ontbreekt.map(([document, versie]) => ({
    user_id: user.id,
    email: user.email || null,
    document,
    versie,
    geaccepteerd_op: nu,
    ip,
    user_agent: userAgent,
    bron,
  }))
  const { error } = await admin.from('juridisch_akkoord').insert(rijen)
  if (error) throw new Error(error.message)
  return true
}
