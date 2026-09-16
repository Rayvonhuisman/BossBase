// offerte-pdf-url (verify_jwt=true)
//
// Geeft een wérkende link naar de ondertekende offerte-PDF.
//
// Waarom een aparte function: de bucket `signed-offertes` is privé en heeft geen
// enkele policy, dus alleen de service-role komt erbij. sign-offerte bewaarde
// een *publieke* URL op die privébucket — die geeft "Bucket not found" (400), en
// de bulk-download in de app viel daardoor stil terug op een opnieuw gegenereerde
// PDF zónder handtekening. Precies het document dat je nodig hebt als een klant
// achteraf zegt niets getekend te hebben.
//
// Deze functie kijkt op drie plekken, zodat óók offertes die vóór de reparatie
// zijn getekend weer werken:
//   1. het pad uit de opgeslagen signed_pdf_url (oude én nieuwe rijen),
//   2. het nieuwe pad met bedrijfsmap,
//   3. het oude pad in de wortel van de bucket.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'signed-offertes'
const GELDIG_SECONDEN = 60 * 10

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Haalt het opslagpad uit een eerder bewaarde URL (publiek of ondertekend). */
function padUitUrl(url: string | null): string | null {
  if (!url) return null
  const zonderQuery = String(url).split('?')[0]
  const merk = `/${BUCKET}/`
  const i = zonderQuery.indexOf(merk)
  if (i === -1) return null
  const pad = zonderQuery.slice(i + merk.length)
  return pad || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Alleen POST' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Niet geautoriseerd' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Ongeldige sessie' }, 401)

    const body = await req.json().catch(() => ({}))
    const offerteId = String(body?.offerte_id || '')
    if (!offerteId) return json({ error: 'offerte_id is verplicht' }, 400)

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: prof } = await admin
      .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    const { data: offerte } = await admin
      .from('offertes')
      .select('id, nummer, company_id, signed_at, signed_pdf_url')
      .eq('id', offerteId).maybeSingle()

    // Eén boodschap voor "bestaat niet" en "niet van jouw bedrijf": anders is dit
    // een manier om te ontdekken welke offertes er bij andere bedrijven bestaan.
    if (!offerte || !prof?.company_id || offerte.company_id !== prof.company_id) {
      return json({ error: 'Offerte niet gevonden' }, 404)
    }
    if (!offerte.signed_at) {
      return json({ code: 'niet_ondertekend', error: 'Deze offerte is niet ondertekend.' }, 404)
    }

    const bestandsnaam = `offerte-${offerte.nummer}-ondertekend.pdf`
    const kandidaten = [
      padUitUrl(offerte.signed_pdf_url as string | null),
      `${offerte.company_id}/${bestandsnaam}`,
      bestandsnaam,
    ].filter((p): p is string => !!p)

    for (const pad of kandidaten) {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(pad, GELDIG_SECONDEN)
      if (!error && data?.signedUrl) return json({ url: data.signedUrl, pad })
    }

    return json({
      code: 'geen_pdf',
      error: 'Er is geen ondertekende PDF bewaard bij deze offerte.',
    }, 404)
  } catch (e) {
    console.error('offerte-pdf-url', (e as Error).message)
    return json({ error: 'Ophalen van de ondertekende PDF mislukte.' }, 500)
  }
})
