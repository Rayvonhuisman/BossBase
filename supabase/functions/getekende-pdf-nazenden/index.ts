// getekende-pdf-nazenden (verify_jwt=true)
//
// Vangnet voor het geval de ondertekende PDF niet gemaakt kon worden.
//
// Die PDF wordt in de browser van de KLANT gemaakt, op het moment van tekenen.
// Lukt dat niet (oude telefoon, te weinig geheugen), dan gingen de bevestigings-
// mails zonder bijlage weg, werd er niets opgeslagen, en merkte niemand het: het
// scherm zei gewoon "u ontvangt een bevestiging". De handtekening zelf staat wél
// vast, dus het document kan altijd later alsnog gemaakt worden.
//
// Deze functie krijgt die alsnog gemaakte PDF van de app van het BEDRIJF (zodra
// iemand de offerte of werkbon opent), bewaart hem, en stuurt de bijlage na.
//
// Dubbel versturen voorkomen we zonder extra kolom: de update die de link zet is
// zélf de claim (`where ... url is null`). Openen twee mensen tegelijk, dan wint
// er precies één die update, en alleen die verstuurt de mails.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'
import { logMailFout } from '../_shared/mailFout.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Eén mail via de send-email relay (intern secret: geen sessie nodig, en geen
// read-only-blokkade — een ontbrekend bewijsstuk nasturen mag altijd).
async function stuurMail(supabaseUrl: string, serviceKey: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        'x-internal-secret': Deno.env.get('SEND_EMAIL_SECRET') ?? '',
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

const SOORTEN = {
  offerte: {
    tabel: 'offertes',
    urlKolom: 'signed_pdf_url',
    getekendKolom: 'signed_at',
    naamKolom: 'signed_by_name',
    emailKolom: 'signed_by_email',
    bucket: 'signed-offertes',
    label: 'offerte',
  },
  werkbon: {
    tabel: 'werkbonnen',
    urlKolom: 'ondertekende_pdf_url',
    getekendKolom: 'ondertekend_op',
    naamKolom: 'ondertekend_door_naam',
    emailKolom: 'ondertekend_door_email',
    bucket: 'signed-werkbonnen',
    label: 'werkbon',
  },
} as const

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
    const soort = body?.soort === 'offerte' || body?.soort === 'werkbon' ? body.soort : null
    const id = String(body?.id || '')
    const pdfBase64 = String(body?.pdf_base64 || '')
    if (!soort || !id) return json({ error: 'soort en id zijn verplicht' }, 400)
    if (!pdfBase64) return json({ error: 'pdf_base64 ontbreekt' }, 400)

    const cfg = SOORTEN[soort]
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: prof } = await admin
      .from('profiles').select('company_id').eq('id', user.id).maybeSingle()

    const { data: rij } = await admin
      .from(cfg.tabel)
      .select(`id, nummer, company_id, ${cfg.getekendKolom}, ${cfg.urlKolom}, ${cfg.naamKolom}, ${cfg.emailKolom}`)
      .eq('id', id).maybeSingle()

    // Eén boodschap voor "bestaat niet" en "niet van jouw bedrijf".
    if (!rij || !prof?.company_id || rij.company_id !== prof.company_id) {
      return json({ error: `${cfg.label} niet gevonden` }, 404)
    }
    if (!rij[cfg.getekendKolom]) {
      return json({ code: 'niet_ondertekend', error: `Deze ${cfg.label} is niet ondertekend.` }, 400)
    }
    if (rij[cfg.urlKolom]) {
      // Iemand anders was ons voor (of hij was er al). Niets te doen, en vooral:
      // geen tweede keer mailen.
      return json({ nagezonden: false, reden: 'bestond_al' })
    }

    // ── PDF bewaren ─────────────────────────────────────────────────────────
    const bestandsnaam = `${cfg.label}-${rij.nummer}-ondertekend.pdf`
    const pad = `${rij.company_id}/${bestandsnaam}`
    const { error: upErr } = await admin.storage
      .from(cfg.bucket)
      .upload(pad, base64ToBytes(pdfBase64), { contentType: 'application/pdf', upsert: true })
    if (upErr) {
      await logMailFout({
        soort: `nazending_${soort}`, ontvanger: null, companyId: rij.company_id,
        fout: `PDF opslaan mislukt: ${upErr.message}`, bron: 'getekende-pdf-nazenden',
        gerelateerdType: soort, gerelateerdId: rij.id,
      })
      return json({ error: 'De PDF kon niet worden opgeslagen.' }, 500)
    }

    // De bucket is privé: een ondertekende link met lange looptijd, zoals bij
    // het gewone ondertekenpad.
    const { data: ondertekend } = await admin.storage
      .from(cfg.bucket).createSignedUrl(pad, 60 * 60 * 24 * 365 * 10)
    const url = ondertekend?.signedUrl
    if (!url) return json({ error: 'Kon geen link naar de PDF maken.' }, 500)

    // ── Claim: wie deze update wint, verstuurt de mails ─────────────────────
    const { data: geclaimd } = await admin
      .from(cfg.tabel)
      .update({ [cfg.urlKolom]: url })
      .eq('id', rij.id)
      .is(cfg.urlKolom, null)
      .select('id')
    if (!geclaimd || geclaimd.length === 0) {
      return json({ nagezonden: false, reden: 'bestond_al' })
    }

    // ── Bijlage nasturen ────────────────────────────────────────────────────
    const { data: bedrijf } = await admin
      .from('companies').select('name, email, logo_url, branding_color').eq('id', rij.company_id).maybeSingle()
    const bedrijfsnaam = (bedrijf?.name as string) || 'BossBase'
    const klantEmail = rij[cfg.emailKolom] as string | null
    const bijlagen = [{ filename: `${bestandsnaam.charAt(0).toUpperCase()}${bestandsnaam.slice(1)}`, content: pdfBase64 }]

    const warnings: string[] = []

    if (klantEmail) {
      const html = mailTemplate({
        title: `Ondertekende ${cfg.label} ${rij.nummer}`,
        preheader: `Hierbij alsnog de ondertekende ${cfg.label} als bijlage`,
        body: `<p>Beste ${esc(rij[cfg.naamKolom] || 'klant')},</p>
<p>Bij uw bevestiging van ${cfg.label} <strong>${esc(rij.nummer)}</strong> ontbrak de bijlage. Hierbij sturen we die alsnog.</p>
<p>Er is verder niets gewijzigd: uw handtekening is gewoon vastgelegd.</p>
<p>Met vriendelijke groet,<br>${esc(bedrijfsnaam)}</p>`,
        companyName: bedrijfsnaam,
        logoUrl: (bedrijf?.logo_url as string) || undefined,
        brandColor: (bedrijf?.branding_color as string) || undefined,
      })
      const ok = await stuurMail(supabaseUrl, serviceKey, {
        to: klantEmail,
        subject: `Ondertekende ${cfg.label} ${rij.nummer} (bijlage)`,
        html,
        from_name: bedrijfsnaam,
        reply_to: bedrijf?.email || undefined,
        attachments: bijlagen,
        soort: `nazending_${soort}_klant`,
        company_id: rij.company_id,
        gerelateerd_type: soort,
        gerelateerd_id: rij.id,
      })
      if (!ok) warnings.push('Nazending naar klant mislukt')
    }

    if (bedrijf?.email) {
      const html = mailTemplate({
        title: `Ondertekende ${cfg.label} ${rij.nummer} alsnog opgeslagen`,
        preheader: `De ontbrekende bijlage bij ${cfg.label} ${rij.nummer} is aangevuld`,
        body: `<p>Bij het ondertekenen van ${cfg.label} <strong>${esc(rij.nummer)}</strong> kon de PDF niet in de browser van de klant gemaakt worden, waardoor de bevestiging zonder bijlage wegging.</p>
<p>Het document is nu alsnog gemaakt en opgeslagen; de klant heeft de bijlage per mail nagestuurd gekregen. Hij staat ook in BossBase bij de ${cfg.label}.</p>`,
        companyName: bedrijfsnaam,
        logoUrl: (bedrijf?.logo_url as string) || undefined,
        brandColor: (bedrijf?.branding_color as string) || undefined,
      })
      const ok = await stuurMail(supabaseUrl, serviceKey, {
        to: bedrijf.email,
        subject: `Ondertekende ${cfg.label} ${rij.nummer}: bijlage aangevuld`,
        html,
        from_name: bedrijfsnaam,
        reply_to: klantEmail || undefined,
        attachments: bijlagen,
        soort: `nazending_${soort}_bedrijf`,
        company_id: rij.company_id,
        gerelateerd_type: soort,
        gerelateerd_id: rij.id,
      })
      if (!ok) warnings.push('Nazending naar bedrijf mislukt')
    }

    return json({ nagezonden: true, url, klant: klantEmail || null, warnings })
  } catch (e) {
    console.error('getekende-pdf-nazenden', (e as Error).message)
    return json({ error: 'Nasturen mislukte.' }, 500)
  }
})
