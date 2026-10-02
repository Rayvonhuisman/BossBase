// document-url (verify_jwt=true; ook de anon-sleutel volstaat, voor klantlinks)
//
// Geeft een korte link (10 minuten) naar een handtekening of ondertekende PDF.
// Twee manieren om toegang te krijgen:
//   - met { soort, token }: de klant via het teken-token van die offerte of
//     werkbon (dezelfde toegang als de publieke ondertekenpagina);
//   - met { soort, id } en een ingelogde gebruiker: alleen een actief profiel
//     van hetzelfde bedrijf.
// Er gaat niets naar buiten zonder die controle; zie _shared/documentLink.ts.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { kortLink } from '../_shared/documentLink.ts'
import { inactiefReden } from '../_shared/actieveGebruiker.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SOORTEN: Record<string, { tabel: string; kolom: string; bucket: string }> = {
  offerte_pdf:          { tabel: 'offertes',   kolom: 'signed_pdf_url',       bucket: 'signed-offertes' },
  offerte_handtekening: { tabel: 'offertes',   kolom: 'signature_url',        bucket: 'signatures' },
  werkbon_pdf:          { tabel: 'werkbonnen', kolom: 'ondertekende_pdf_url', bucket: 'signed-werkbonnen' },
  werkbon_handtekening: { tabel: 'werkbonnen', kolom: 'handtekening_url',     bucket: 'signatures' },
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { soort, id, token } = await req.json().catch(() => ({}))
    const cfg = SOORTEN[soort]
    if (!cfg) return json({ error: 'Onbekend document' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })

    let rij: Record<string, unknown> | null = null
    if (token) {
      if (!UUID.test(String(token))) return json({ error: 'Document niet gevonden' }, 404)
      const { data } = await admin.from(cfg.tabel).select(`id, ${cfg.kolom}`).eq('sign_token', token).maybeSingle()
      rij = data
    } else {
      if (!id || !UUID.test(String(id))) return json({ error: 'Document niet gevonden' }, 404)
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Niet ingelogd' }, 401)
      const inactief = await inactiefReden(user.id)
      if (inactief) return json({ error: inactief }, 403)
      // Mag deze gebruiker het stuk zelf zien? Dat beslist de RLS van de tabel
      // (bedrijf én recht: offertes resp. werkbonnen/planning). Dan volgt het
      // document precies dezelfde rechten als de offerte of werkbon.
      const { data: zichtbaar } = await userClient.from(cfg.tabel).select('id').eq('id', id).maybeSingle()
      const { data } = zichtbaar
        ? await admin.from(cfg.tabel).select(`id, ${cfg.kolom}`).eq('id', id).maybeSingle()
        : { data: null }
      // Eén antwoord voor "bestaat niet", "niet van jouw bedrijf" en "geen recht".
      rij = data
    }
    if (!rij) return json({ error: 'Document niet gevonden' }, 404)

    const link = await kortLink(admin, cfg.bucket, rij[cfg.kolom] as string | null)
    if (!link) return json({ code: 'geen_bestand', error: 'Er is geen bestand bewaard bij dit document.' }, 404)
    return json({ url: link, geldig_seconden: 600 })
  } catch (e) {
    console.error('document-url', (e as Error).message)
    return json({ error: 'Document ophalen mislukte.' }, 500)
  }
})
