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
// Sinds oktober 2026 maakt de SERVER het exemplaar, uit de database en de
// vastgelegde handtekening (_shared/ondertekendExemplaar.ts). Vroeger stuurde de
// app van het bedrijf een PDF mee en werd die ongezien bewaard en naar de klant
// gemaild — elke gebruiker kon zo een willekeurig bestand als "ondertekend
// exemplaar" laten opslaan (audit 2026-10-01, H4/B-9). Een meegestuurde
// `pdf_base64` wordt genegeerd.
//
// Dubbel versturen voorkomen we zonder extra kolom: de update die de link zet is
// zélf de claim (`where ... url is null`). Openen twee mensen tegelijk, dan wint
// er precies één die update, en alleen die verstuurt de mails.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'
import { logMailFout } from '../_shared/mailFout.ts'
import { inactiefReden } from '../_shared/actieveGebruiker.ts'
import { opslagWaarde, padUit } from '../_shared/documentLink.ts'
import { maakOfferteExemplaar, maakWerkbonExemplaar, bytesNaarBase64, isUuid, type Ondertekening } from '../_shared/ondertekendExemplaar.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')


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
    handtekeningKolom: 'signature_url',
    label: 'offerte',
  },
  werkbon: {
    tabel: 'werkbonnen',
    urlKolom: 'ondertekende_pdf_url',
    getekendKolom: 'ondertekend_op',
    naamKolom: 'ondertekend_door_naam',
    emailKolom: 'ondertekend_door_email',
    bucket: 'signed-werkbonnen',
    handtekeningKolom: 'handtekening_url',
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
    // service_role omzeilt RLS: zelf controleren dat account en bedrijf actief zijn.
    const inactief = await inactiefReden(user.id)
    if (inactief) return json({ error: inactief }, 403)

    const body = await req.json().catch(() => ({}))
    const soort = body?.soort === 'offerte' || body?.soort === 'werkbon' ? body.soort : null
    const id = String(body?.id || '')
    if (!soort || !isUuid(id)) return json({ error: 'soort en id zijn verplicht' }, 400)

    const cfg = SOORTEN[soort]
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: prof } = await admin
      .from('profiles').select('company_id').eq('id', user.id).maybeSingle()

    const { data: rij } = await admin
      .from(cfg.tabel)
      .select(`id, nummer, company_id, sign_token, ondertekening_bewijs, ${cfg.getekendKolom}, ${cfg.urlKolom}, ${cfg.naamKolom}, ${cfg.emailKolom}, ${cfg.handtekeningKolom}`)
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

    // ── Exemplaar maken op de server ────────────────────────────────────────
    const r = rij as Record<string, any>
    const bewijs = (r.ondertekening_bewijs || {}) as Record<string, any>
    let handtekeningPng: Uint8Array | null = null
    const sigPad = padUit('signatures', r[cfg.handtekeningKolom])
    if (sigPad) {
      const { data: blob } = await admin.storage.from('signatures').download(sigPad)
      if (blob) handtekeningPng = new Uint8Array(await blob.arrayBuffer())
    }
    const ondertekening: Ondertekening = {
      naam: r[cfg.naamKolom] || '', email: r[cfg.emailKolom] || '',
      tijdstip: r[cfg.getekendKolom], ip: bewijs.ip ?? null, userAgent: bewijs.user_agent ?? null,
      handtekeningPng,
    }
    let exemplaar
    try {
      exemplaar = soort === 'offerte'
        ? await maakOfferteExemplaar(admin, r.id, ondertekening)
        : await maakWerkbonExemplaar(admin, r.sign_token, ondertekening)
    } catch (e) {
      console.error('getekende-pdf-nazenden exemplaar', e)
      return json({ error: 'Het document kon niet worden gemaakt.' }, 500)
    }
    const pdfBase64 = bytesNaarBase64(exemplaar.pdf)
    const bestandsnaam = `${cfg.label}-${rij.nummer || rij.id}-ondertekend.pdf`
    const pad = `${rij.company_id}/${cfg.label}-${rij.id}-${crypto.randomUUID().slice(0, 8)}-ondertekend.pdf`
    const { error: upErr } = await admin.storage
      .from(cfg.bucket)
      .upload(pad, exemplaar.pdf, { contentType: 'application/pdf', upsert: false })
    if (upErr) {
      await logMailFout({
        soort: `nazending_${soort}`, ontvanger: null, companyId: rij.company_id,
        fout: `PDF opslaan mislukt: ${upErr.message}`, bron: 'getekende-pdf-nazenden',
        gerelateerdType: soort, gerelateerdId: rij.id,
      })
      return json({ error: 'De PDF kon niet worden opgeslagen.' }, 500)
    }

    // De bucket is privé: een link van 24 uur bewaren (overgang), geen lange link
    // (_shared/documentLink.ts).
    const url = await opslagWaarde(admin, cfg.bucket, pad)

    // ── Claim: wie deze update wint, verstuurt de mails ─────────────────────
    const { data: geclaimd } = await admin
      .from(cfg.tabel)
      .update({
        [cfg.urlKolom]: url,
        ondertekening_bewijs: { ...bewijs, nagezonden_op: new Date().toISOString(), inhoud_sha256_nazending: exemplaar.documentHash, pdf_sha256_nazending: exemplaar.pdfHash, pdf_pad_nazending: pad },
      })
      .eq('id', rij.id)
      .is(cfg.urlKolom, null)
      .select('id')
    if (!geclaimd || geclaimd.length === 0) {
      await admin.storage.from(cfg.bucket).remove([pad]).catch(() => {})
      return json({ nagezonden: false, reden: 'bestond_al' })
    }

    // ── Bijlage nasturen ────────────────────────────────────────────────────
    const { data: bedrijf } = await admin
      .from('companies').select('name, email, logo_url, branding_color').eq('id', rij.company_id).maybeSingle()
    const bedrijfsnaam = (bedrijf?.name as string) || 'Ons bedrijf'
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
        body: `<p>Bij het ondertekenen van ${cfg.label} <strong>${esc(rij.nummer)}</strong> kon het ondertekende exemplaar niet worden gemaakt, waardoor de bevestiging zonder bijlage wegging.</p>
<p>Het document is nu alsnog gemaakt en opgeslagen; de klant heeft de bijlage per mail nagestuurd gekregen. Hij staat ook in BossBase bij de ${cfg.label}.</p>`,
        // Interne melding aan het bedrijf zelf: BossBase-stijl, dus bewust geen
        // companyName/logo/kleur. Zonder companyName kiest mailTemplate vanzelf
        // de BossBase-variant. De klantmail hierboven houdt wél de eigen
        // huisstijl — die is voor hún klant, deze is systeempost.
      })
      const ok = await stuurMail(supabaseUrl, serviceKey, {
        to: bedrijf.email,
        subject: `Ondertekende ${cfg.label} ${rij.nummer}: bijlage aangevuld`,
        html,
        from_name: 'BossBase',
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
