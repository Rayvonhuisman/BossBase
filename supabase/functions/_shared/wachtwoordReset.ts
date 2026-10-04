// De controle en afhandeling van een resetlink, los van Supabase, zodat hij
// zonder deploy te testen is (supabase/tests/wachtwoord_reset_test.ts).
// apply-password-reset levert de opslag; hier staat de volgorde.

import { wachtwoordFout } from './wachtwoordEisen.ts'

export type ResetToken = { id: string; user_id: string; expires_at: string; used_at: string | null }

export type ResetOpslag = {
  /** Rij met deze hash, of null. */
  zoek(tokenHash: string): Promise<ResetToken | null>
  /** Zet used_at, maar alleen als het token nog ongebruikt en geldig is.
   *  Moet atomair zijn: van twee gelijktijdige aanroepen krijgt er één true. */
  claim(id: string, nu: Date): Promise<boolean>
  /** Maakt een claim ongedaan als het wachtwoord niet gezet kon worden. */
  geefVrij(id: string): Promise<void>
  /** Geeft een foutmelding terug, of null als het gelukt is. */
  zetWachtwoord(userId: string, wachtwoord: string): Promise<string | null>
  /** Verwijdert de andere tokens van deze gebruiker. */
  ruimOp(userId: string, behalveId: string): Promise<void>
}

export type ResetUitkomst = { status: number; body: { success: boolean; code: string; error?: string } }

/** De database bewaart alleen deze hash; het token zelf staat alleen in de mail. */
export async function hashToken(token: string): Promise<string> {
  // uuid's zijn hoofdletterongevoelig; het token in de mail is altijd kleine letters.
  const tekst = String(token).trim().toLowerCase()
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const fout = (status: number, code: string, error: string): ResetUitkomst =>
  ({ status, body: { success: false, code, error } })

export async function pasResetToe(
  invoer: { token?: unknown; newPassword?: unknown; checkOnly?: unknown },
  opslag: ResetOpslag,
  nu: () => Date = () => new Date(),
): Promise<ResetUitkomst> {
  const { token, newPassword, checkOnly } = invoer
  if (!token) return fout(400, 'INVALID', 'token is verplicht')
  if (!checkOnly && !newPassword) return fout(400, 'INVALID', 'newPassword is verplicht')

  // Zoek zonder filter op used_at, zodat we een specifieke foutcode kunnen geven.
  const rij = await opslag.zoek(await hashToken(String(token)))
  if (!rij) return fout(400, 'INVALID', 'Ongeldige resetlink.')
  if (rij.used_at) return fout(400, 'USED', 'Deze link is al gebruikt.')
  if (new Date(rij.expires_at) < nu()) return fout(400, 'EXPIRED', 'Deze resetlink is verlopen (1 uur).')

  // checkOnly = alleen valideren, wachtwoord nog niet instellen.
  if (checkOnly) return { status: 200, body: { success: true, code: 'VALID' } }

  // Wachtwoordeisen server-side, vóór het claimen: een te zwak wachtwoord kost
  // de link niet.
  const zwak = wachtwoordFout(newPassword)
  if (zwak) return fout(400, 'WEAK', zwak)

  // Eerst claimen, dan pas het wachtwoord zetten. Voorheen werd het token pas
  // ná het wijzigen gemarkeerd, zodat twee verzoeken tegelijk allebei slaagden.
  if (!(await opslag.claim(rij.id, nu()))) return fout(400, 'USED', 'Deze link is al gebruikt.')

  const zetFout = await opslag.zetWachtwoord(rij.user_id, String(newPassword))
  if (zetFout) {
    // Bijvoorbeeld een te zwak wachtwoord: de link blijft binnen het uur
    // bruikbaar, anders moet de gebruiker voor een tikfout een nieuwe mail aanvragen.
    await opslag.geefVrij(rij.id)
    return fout(500, 'ERROR', `Wachtwoord bijwerken mislukt: ${zetFout}`)
  }

  // Na een geslaagde reset hoort een oudere mail het wachtwoord niet nog eens
  // te kunnen wijzigen.
  await opslag.ruimOp(rij.user_id, rij.id)
  return { status: 200, body: { success: true, code: 'OK' } }
}
