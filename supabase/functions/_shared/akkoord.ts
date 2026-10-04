// Vastleggen van het akkoord met de juridische documenten bij registratie.
// Gebruikt door akkoord-vastleggen (bij het klikken op "BossBase starten") en
// door verify-code als vangnet als die eerste aanroep niet aankwam.

// Houd gelijk met de versieregel in docs/juridisch. Nieuwe versie van een
// document → hier ophogen, zodat nieuwe akkoorden de juiste versie dragen.
export const AKKOORD_VERSIES: Record<string, string> = {
  algemene_voorwaarden:   '2026-10',
  verwerkersovereenkomst: '2026-10',
  privacyverklaring:      '2026-10',
}

// Het eerste adres in x-forwarded-for is de client; de rest zijn proxies.
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim() || null
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null
}

// Eén akkoord per registratie: een tweede aanroep (dubbelklik, retry, vangnet)
// voegt niets toe. Geeft terug of er nu iets is vastgelegd.
// deno-lint-ignore no-explicit-any
export async function legAkkoordVast(admin: any, user: { id: string; email?: string | null }, req: Request, bron: string): Promise<boolean> {
  const { count, error: telFout } = await admin.from('juridisch_akkoord')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if (telFout) throw new Error(telFout.message)
  if ((count || 0) > 0) return false

  const nu = new Date().toISOString()
  const ip = clientIp(req)
  const userAgent = (req.headers.get('user-agent') || '').slice(0, 500) || null
  const rijen = Object.entries(AKKOORD_VERSIES).map(([document, versie]) => ({
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
