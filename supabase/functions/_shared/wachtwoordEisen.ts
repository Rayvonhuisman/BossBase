// Wachtwoordeisen, server-side. Gelijk aan src/components/PasswordStrength.jsx:
// minimaal 8 tekens, een hoofdletter, een cijfer en een speciaal teken.
//
// De app controleert dit al in het formulier, maar dat is alleen een poort in de
// browser: wie de functie rechtstreeks aanroept, kon een wachtwoord als "a" zetten
// (audit 2026-10-01, B-6). Geeft een Nederlandse melding terug, of null.
export function wachtwoordFout(wachtwoord: unknown): string | null {
  const p = typeof wachtwoord === 'string' ? wachtwoord : ''
  const mist: string[] = []
  if (p.length < 8) mist.push('minimaal 8 tekens')
  if (!/[A-Z]/.test(p)) mist.push('een hoofdletter')
  if (!/[0-9]/.test(p)) mist.push('een cijfer')
  if (!/[^A-Za-z0-9]/.test(p)) mist.push('een speciaal teken')
  if (p.length > 72) return 'Je wachtwoord mag hooguit 72 tekens lang zijn.'
  return mist.length ? `Je wachtwoord moet bevatten: ${mist.join(', ')}.` : null
}
