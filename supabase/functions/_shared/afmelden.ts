// Afmeldlink voor de proefperiodemails. Ondertekend met HMAC, zodat er geen
// token per bedrijf hoeft te worden opgeslagen en niemand een ander bedrijf kan
// afmelden door een id te raden. Sleutel: de service role key (alleen bekend in
// de edge functions), met een eigen voorvoegsel voor dit doel.

async function hmacHex(tekst: string): Promise<string> {
  const sleutel = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`trial-mails-afmelden:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', sleutel, new TextEncoder().encode(tekst))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export async function afmeldHandtekening(companyId: string): Promise<string> {
  return hmacHex(companyId)
}

export async function kloptAfmeldHandtekening(companyId: string, s: string): Promise<boolean> {
  const verwacht = await hmacHex(companyId)
  if (typeof s !== 'string' || s.length !== verwacht.length) return false
  let verschil = 0
  for (let i = 0; i < verwacht.length; i++) verschil |= verwacht.charCodeAt(i) ^ s.charCodeAt(i)
  return verschil === 0
}

// De pagina op de site (één klik ter bevestiging) en het adres voor
// List-Unsubscribe (afmelden met één klik vanuit het mailprogramma).
export async function afmeldLinks(appUrl: string, companyId: string) {
  const q = `c=${encodeURIComponent(companyId)}&s=${await afmeldHandtekening(companyId)}`
  return {
    pagina: `${appUrl}/afmelden?${q}`,
    eenKlik: `${Deno.env.get('SUPABASE_URL')}/functions/v1/trial-mails-afmelden?${q}`,
  }
}
