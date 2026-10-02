// Gedeelde code-hash voor e-mailverificatiecodes. De code wordt nooit plain
// opgeslagen.
//
// Sinds de audit van 2026-10-01 (B-13) een HMAC-SHA256 met een servergeheim over
// `${code}:${userId}`. Een gewone SHA-256 over code + (bekend) gebruikers-id was
// bij een lek van de tabel in een fractie van een seconde terug te rekenen: er
// zijn maar 900.000 codes. Met het geheim kan dat alleen nog op de server.
// Het geheim is de service-rolsleutel die elke functie al heeft; hij verlaat de
// server nooit. Wordt die sleutel geroteerd, dan vervallen lopende codes (max.
// 10 minuten geldig) — dat is aanvaardbaar.

const enc = new TextEncoder()
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')

export async function hashVerificationCode(code: string, userId: string): Promise<string> {
  const geheim = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!geheim) throw new Error('Servergeheim voor verificatiecodes ontbreekt')
  const key = await crypto.subtle.importKey('raw', enc.encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${code}:${userId}`)))
}

// De oude hash (zonder geheim). Alleen om codes te accepteren die vlak vóór de
// overstap zijn verstuurd; zie LEGACY_TOT.
export async function legacyHashVerificationCode(code: string, userId: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`${code}:${userId}`)))
}
export const LEGACY_TOT = '2026-10-02T20:00:00Z'

// Uniform verdeelde 6-cijferige code uit een cryptografische bron.
export function nieuweCode(): string {
  const buf = new Uint32Array(1)
  // 4294967296 % 900000 ≠ 0: waarden boven de laatste volle reeks weggooien.
  const grens = Math.floor(0x100000000 / 900000) * 900000
  do { crypto.getRandomValues(buf) } while (buf[0] >= grens)
  return String(100000 + (buf[0] % 900000))
}

export function gelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
