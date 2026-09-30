// Draaien:  node --experimental-strip-types supabase/tests/wachtwoord_reset_test.ts
//
// Test van de resetlink zonder deploy: pasResetToe (apply-password-reset)
// tegen een nep-opslag. Gedekt: eenmalig gebruik (ook bij twee verzoeken
// tegelijk), vervaltijd, dat de database alleen de hash kent, en de overgang
// voor links die al vóór deze wijziging verstuurd zijn.

import { pasResetToe, hashToken, type ResetOpslag, type ResetToken } from '../functions/_shared/wachtwoordReset.ts'

let fouten = 0
const check = (naam: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${naam}${ok ? '' : `  → ${JSON.stringify(detail)}`}`)
  if (!ok) fouten++
}

const NU = new Date('2026-09-30T12:00:00Z')
const over = (min: number) => new Date(NU.getTime() + min * 60_000).toISOString()

type Rij = ResetToken & { token_hash: string }

/** Nep-opslag met dezelfde regels als de database-update in apply-password-reset. */
function maakOpslag(rijen: Rij[], opties: { wachtwoordFout?: string } = {}) {
  const gezet: { userId: string; wachtwoord: string }[] = []
  const opslag: ResetOpslag = {
    async zoek(h) {
      const r = rijen.find(x => x.token_hash === h)
      return r ? { id: r.id, user_id: r.user_id, expires_at: r.expires_at, used_at: r.used_at } : null
    },
    async claim(id, nu) {
      // Zoals "update … where used_at is null and expires_at > nu": geen await
      // tussen lezen en schrijven, dus atomair binnen deze nep-opslag.
      const r = rijen.find(x => x.id === id && x.used_at === null && new Date(x.expires_at) > nu)
      if (!r) return false
      r.used_at = nu.toISOString()
      return true
    },
    async geefVrij(id) {
      const r = rijen.find(x => x.id === id)
      if (r) r.used_at = null
    },
    async zetWachtwoord(userId, wachtwoord) {
      await new Promise(res => setTimeout(res, 5)) // de echte admin-API is traag
      if (opties.wachtwoordFout) return opties.wachtwoordFout
      gezet.push({ userId, wachtwoord })
      return null
    },
    async ruimOp(userId, behalveId) {
      for (let i = rijen.length - 1; i >= 0; i--) {
        if (rijen[i].user_id === userId && rijen[i].id !== behalveId) rijen.splice(i, 1)
      }
    },
  }
  return { opslag, gezet, rijen }
}

async function rij(id: string, token: string, userId: string, expires: string, used: string | null = null): Promise<Rij> {
  return { id, user_id: userId, expires_at: expires, used_at: used, token_hash: await hashToken(token) }
}

const T = '6f1c2d4e-8a9b-4c3d-9e1f-2a3b4c5d6e7f'
const U = 'gebruiker-1'
const klok = () => NU

// ── De hash ──
{
  const h = await hashToken(T)
  check('hash is 64 hextekens', /^[0-9a-f]{64}$/.test(h), h)
  check('hash is niet het token', h !== T)
  check('hoofdletters en spaties geven dezelfde hash', (await hashToken(` ${T.toUpperCase()} `)) === h)
}

// ── Geldige link: controleren wijzigt niets ──
{
  const { opslag, gezet, rijen } = maakOpslag([await rij('a', T, U, over(30))])
  const r = await pasResetToe({ token: T, checkOnly: true }, opslag, klok)
  check('checkOnly op geldige link geeft VALID', r.body.code === 'VALID', r)
  check('checkOnly zet geen wachtwoord en markeert niets', gezet.length === 0 && rijen[0].used_at === null)
}

// ── Eenmalig gebruik ──
{
  const { opslag, gezet } = maakOpslag([await rij('a', T, U, over(30))])
  const eerste = await pasResetToe({ token: T, newPassword: 'nieuw-1' }, opslag, klok)
  const tweede = await pasResetToe({ token: T, newPassword: 'nieuw-2' }, opslag, klok)
  const check3 = await pasResetToe({ token: T, checkOnly: true }, opslag, klok)
  check('eerste gebruik slaagt', eerste.body.code === 'OK', eerste)
  check('tweede gebruik geeft USED', tweede.body.code === 'USED', tweede)
  check('controle na gebruik geeft USED', check3.body.code === 'USED', check3)
  check('wachtwoord precies één keer gezet', gezet.length === 1 && gezet[0].wachtwoord === 'nieuw-1', gezet)
}

// ── Twee verzoeken tegelijk met dezelfde link ──
{
  const { opslag, gezet } = maakOpslag([await rij('a', T, U, over(30))])
  const [a, b] = await Promise.all([
    pasResetToe({ token: T, newPassword: 'gelijk-1' }, opslag, klok),
    pasResetToe({ token: T, newPassword: 'gelijk-2' }, opslag, klok),
  ])
  const codes = [a.body.code, b.body.code].sort()
  check('gelijktijdig: één OK, één USED', codes[0] === 'OK' && codes[1] === 'USED', codes)
  check('gelijktijdig: wachtwoord maar één keer gezet', gezet.length === 1, gezet)
}

// ── Vervaltijd ──
{
  const { opslag, gezet } = maakOpslag([await rij('a', T, U, over(-1))])
  const c = await pasResetToe({ token: T, checkOnly: true }, opslag, klok)
  const t = await pasResetToe({ token: T, newPassword: 'x' }, opslag, klok)
  check('verlopen link: controle geeft EXPIRED', c.body.code === 'EXPIRED', c)
  check('verlopen link: toepassen geeft EXPIRED', t.body.code === 'EXPIRED', t)
  check('verlopen link: geen wachtwoord gezet', gezet.length === 0)
}
{
  // Verloopt precies tussen controle en claim: de claim weigert.
  const { opslag, gezet } = maakOpslag([await rij('a', T, U, over(1))])
  let tik = 0
  const verspringendeKlok = () => (tik++ === 0 ? NU : new Date(NU.getTime() + 2 * 60_000))
  const r = await pasResetToe({ token: T, newPassword: 'x' }, opslag, verspringendeKlok)
  check('verloopt tijdens verwerken: niet toegepast', r.body.code === 'USED' && gezet.length === 0, r)
}

// ── Alleen de hash telt ──
{
  const { opslag } = maakOpslag([await rij('a', T, U, over(30))])
  const h = await hashToken(T)
  const metHash = await pasResetToe({ token: h, checkOnly: true }, opslag, klok)
  const onbekend = await pasResetToe({ token: '00000000-0000-4000-8000-000000000000', checkOnly: true }, opslag, klok)
  const leeg = await pasResetToe({ token: '', checkOnly: true }, opslag, klok)
  check('de hash zelf is geen geldige link', metHash.body.code === 'INVALID', metHash)
  check('onbekend token geeft INVALID', onbekend.body.code === 'INVALID', onbekend)
  check('leeg token geeft INVALID', leeg.body.code === 'INVALID', leeg)
}

// ── Mislukt wachtwoord: link blijft bruikbaar ──
{
  const { opslag, rijen } = maakOpslag([await rij('a', T, U, over(30))], { wachtwoordFout: 'Password should be at least 6 characters' })
  const r = await pasResetToe({ token: T, newPassword: 'kort' }, opslag, klok)
  check('te zwak wachtwoord geeft ERROR', r.body.code === 'ERROR' && r.status === 500, r)
  check('na mislukte poging is de link weer vrij', rijen[0].used_at === null, rijen[0])
}

// ── Andere openstaande links vervallen na een geslaagde reset ──
{
  const T2 = '11111111-2222-4333-8444-555555555555'
  const T3 = '99999999-8888-4777-8666-555555555555'
  const { opslag, rijen } = maakOpslag([
    await rij('oud', T2, U, over(20)),
    await rij('nieuw', T, U, over(50)),
    await rij('ander', T3, 'gebruiker-2', over(50)),
  ])
  await pasResetToe({ token: T, newPassword: 'nieuw' }, opslag, klok)
  const oud = await pasResetToe({ token: T2, checkOnly: true }, opslag, klok)
  const ander = await pasResetToe({ token: T3, checkOnly: true }, opslag, klok)
  check('oudere link van dezelfde gebruiker vervalt', oud.body.code === 'INVALID', oud)
  check('link van een andere gebruiker blijft geldig', ander.body.code === 'VALID', ander)
  check('gebruikte rij blijft (voor USED-melding)', rijen.some(x => x.id === 'nieuw' && x.used_at))
}

// ── Overgang: links die al verstuurd zijn ──
{
  // Na 20260930080504 heeft elke rij alleen token_hash, gemaakt met
  // sha256(kleine letters). Deze wijziging hasht hetzelfde, dus een link uit
  // een mail van vóór de deploy blijft werken.
  const oudeHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(T))))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  const { opslag } = maakOpslag([{ id: 'a', user_id: U, expires_at: over(30), used_at: null, token_hash: oudeHash }])
  const r = await pasResetToe({ token: T, checkOnly: true }, opslag, klok)
  check('link van vóór de deploy blijft geldig', r.body.code === 'VALID', r)
}

console.log(fouten ? `\n${fouten} test(s) mislukt` : '\nAlle tests geslaagd')
process.exit(fouten ? 1 : 0)
