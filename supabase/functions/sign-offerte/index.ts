import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'
import { logMailFout } from '../_shared/mailFout.ts'
import { opslagWaarde } from '../_shared/documentLink.ts'
import {
  maakOfferteExemplaar, bytesNaarBase64, isUuid, handtekeningUit, aanroeperGegevens, vandaagNl,
} from '../_shared/ondertekendExemplaar.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// HTML-escape voor door de ondertekenaar ingevoerde waarden die in de rauwe
// mailbody terechtkomen (naam). Zelfde escape als de andere mails.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Verstuur via de bestaande send-email edge function met het interne secret —
// exact hetzelfde relay-patroon als de stripe-webhook. Best-effort, gooit niet.
async function sendViaEdge(supabaseUrl: string, serviceKey: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'x-internal-secret': Deno.env.get('SEND_EMAIL_SECRET') ?? '',
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch { return false }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Volgorde, en waarom (audit 2026-10-01, H4):
//   1. Alles controleren zonder iets te schrijven: token (uuid), offerte bestaat,
//      niet al getekend, niet vervangen, verzonden (geen concept of afgewezen),
//      niet verlopen, pakket.
//   2. Handtekening en het ondertekende exemplaar op een UNIEK pad opslaan. Het
//      exemplaar maakt de server uit de database; een PDF van de ondertekenaar
//      wordt genegeerd.
//   3. Eén atomaire update met alle voorwaarden opnieuw in de WHERE. Wint een
//      gelijktijdig verzoek, dan krijgt deze 0 rijen terug, ruimt hij zijn eigen
//      bestanden op en antwoordt 409. Pas daarna mails en tijdlijn.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const warnings: string[] = []

  try {
    const body = await req.json().catch(() => ({}))
    const { sign_token, signature_data_url } = body
    const name = String(body?.name ?? '').trim().slice(0, 200)
    const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 254)

    if (!isUuid(sign_token)) return json({ success: false, code: 'ongeldig', error: 'Deze link is ongeldig.' }, 404)
    if (!name || !email || !signature_data_url) {
      return json({ success: false, error: 'Vul uw naam en e-mailadres in en zet uw handtekening.' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ success: false, error: 'Vul een geldig e-mailadres in.' }, 400)
    const sigBytes = handtekeningUit(signature_data_url)
    if (!sigBytes) return json({ success: false, error: 'De handtekening kon niet worden gelezen. Probeer het opnieuw.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // ── STAP 1: Offerte ophalen en controleren ───────────────────────────────
    const { data: offerte, error: offerteErr } = await admin
      .from('offertes')
      .select('id, nummer, omschrijving, totaal_incl, totaal_excl, company_id, customer_id, signed_at, status, geldig_tot, vervangen_op, vervangen_door_nummer, snapshot_bedrijfsnaam')
      .eq('sign_token', sign_token)
      .maybeSingle()

    if (offerteErr) {
      console.error('sign-offerte ophalen', offerteErr.message)
      return json({ success: false, error: 'De offerte kon niet worden geladen. Probeer het later opnieuw.' }, 500)
    }
    if (!offerte) return json({ success: false, code: 'ongeldig', error: 'Deze offerte is niet gevonden. Controleer de link.' }, 404)

    const { data: bedrijfNaamRij } = await admin.from('companies').select('name').eq('id', offerte.company_id).maybeSingle()
    const bij = (bedrijfNaamRij?.name as string) || 'het bedrijf'
    const weiger = (code: string, error: string) => json({ success: false, code, error }, 409)

    if (offerte.signed_at) return weiger('al_ondertekend', 'Deze offerte is al ondertekend.')
    if (offerte.vervangen_op) {
      return weiger('vervangen', `Deze offerte is vervangen door een nieuwere versie${offerte.vervangen_door_nummer ? ` (${offerte.vervangen_door_nummer})` : ''}. Gebruik de link uit de laatste mail van ${bij}.`)
    }
    if (offerte.status !== 'verzonden') {
      return weiger('niet_ondertekenbaar', offerte.status === 'geaccepteerd'
        ? 'Deze offerte is al geaccepteerd.'
        : `Deze offerte kan niet (meer) worden ondertekend. Neem contact op met ${bij}.`)
    }
    const vandaag = vandaagNl()
    if (offerte.geldig_tot && String(offerte.geldig_tot) < vandaag) {
      const op = new Date(String(offerte.geldig_tot)).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
      return weiger('verlopen', `Deze offerte was geldig tot ${op} en kan niet meer worden ondertekend. Vraag ${bij} om een nieuwe offerte.`)
    }

    // ── Feature-check (server-side, centrale matrix) ──────────────────────────
    const { data: heeftFeature } = await admin.rpc('bb_has_feature', {
      p_company_id: offerte.company_id,
      p_feature: 'digitale_handtekening',
    })
    if (heeftFeature !== true) {
      return json({ success: false, error: 'Digitaal ondertekenen is voor deze offerte niet beschikbaar.' }, 403)
    }

    // ── STAP 2: Handtekening en exemplaar opslaan (uniek pad) ─────────────────
    const now = new Date().toISOString()
    const { ip, userAgent } = aanroeperGegevens(req)
    const uniek = crypto.randomUUID()
    const sigFilename = `${offerte.id}-${uniek}.png`
    const { error: uploadErr } = await admin.storage
      .from('signatures')
      .upload(sigFilename, sigBytes, { contentType: 'image/png', upsert: false })
    if (uploadErr) {
      console.error('sign-offerte handtekening', uploadErr.message)
      return json({ success: false, error: 'De handtekening kon niet worden opgeslagen. Probeer het opnieuw.' }, 500)
    }
    const signatureUrl = await opslagWaarde(admin, 'signatures', sigFilename)

    let exemplaar: Awaited<ReturnType<typeof maakOfferteExemplaar>> | null = null
    let pdfPad: string | null = null
    try {
      exemplaar = await maakOfferteExemplaar(admin, offerte.id, { naam: name, email, tijdstip: now, ip, userAgent, handtekeningPng: sigBytes })
      pdfPad = `${offerte.company_id}/offerte-${offerte.id}-${uniek.slice(0, 8)}-ondertekend.pdf`
      const { error: pdfErr } = await admin.storage.from('signed-offertes')
        .upload(pdfPad, exemplaar.pdf, { contentType: 'application/pdf', upsert: false })
      if (pdfErr) { console.error('sign-offerte pdf opslaan', pdfErr.message); pdfPad = null; warnings.push('Ondertekend exemplaar opslaan mislukt') }
    } catch (e) {
      console.error('sign-offerte exemplaar maken', e)
      warnings.push('Ondertekend exemplaar maken mislukt')
      await logMailFout({ soort: 'ondertekende_pdf_offerte', ontvanger: null, companyId: offerte.company_id,
        fout: `Exemplaar maken mislukt: ${String(e).slice(0, 300)}`, bron: 'sign-offerte', gerelateerdType: 'offerte', gerelateerdId: offerte.id })
    }
    const signedPdfUrl = pdfPad ? await opslagWaarde(admin, 'signed-offertes', pdfPad) : null

    // ── STAP 3: Company ophalen (branding voor snapshot + mails) ─────────────
    let company: Record<string, unknown> = {}
    {
      const { data } = await admin
        .from('companies')
        .select('name, email, logo_url, branding_color, address, postal_code, city, kvk, btw_number')
        .eq('id', offerte.company_id)
        .maybeSingle()
      company = data || {}
    }

    // ── STAP 4: Atomair ondertekenen ─────────────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      signed_at: now,
      signature_url: signatureUrl,
      signed_by_name: name,
      signed_by_email: email,
      status: 'geaccepteerd',
      signed_pdf_url: signedPdfUrl,
      ondertekening_bewijs: {
        versie: 1,
        tijdstip: now, naam: name, email, ip, user_agent: userAgent,
        nummer: offerte.nummer,
        totaal_excl: exemplaar?.inhoud.totaal_excl ?? Number(offerte.totaal_excl || 0),
        totaal_incl: exemplaar?.inhoud.totaal_incl ?? Number(offerte.totaal_incl || 0),
        aantal_regels: exemplaar?.inhoud.regels.length ?? null,
        inhoud_sha256: exemplaar?.documentHash ?? null,
        pdf_sha256: pdfPad ? exemplaar?.pdfHash ?? null : null,
        pdf_pad: pdfPad,
        handtekening_pad: sigFilename,
      },
    }
    if (!offerte.snapshot_bedrijfsnaam) {
      updatePayload.snapshot_logo_url = (company?.logo_url as string) ?? null
      updatePayload.snapshot_branding_color = (company?.branding_color as string) ?? null
      updatePayload.snapshot_bedrijfsnaam = (company?.name as string) ?? null
      updatePayload.snapshot_adres = (company?.address as string) ?? null
      updatePayload.snapshot_postcode = (company?.postal_code as string) ?? null
      updatePayload.snapshot_plaats = (company?.city as string) ?? null
      updatePayload.snapshot_email = (company?.email as string) ?? null
      updatePayload.snapshot_kvk = (company?.kvk as string) ?? null
      updatePayload.snapshot_btw = (company?.btw_number as string) ?? null
    }
    const { data: gewonnen, error: updateErr } = await admin.from('offertes')
      .update(updatePayload)
      .eq('id', offerte.id)
      .is('signed_at', null)
      .eq('status', 'verzonden')
      .is('vervangen_op', null)
      .or(`geldig_tot.is.null,geldig_tot.gte.${vandaag}`)
      .select('id')

    if (updateErr || !gewonnen || gewonnen.length === 0) {
      // Een gelijktijdig verzoek was eerder (of de status veranderde net). Eigen
      // bestanden weg; die zijn nergens aan gekoppeld.
      await admin.storage.from('signatures').remove([sigFilename]).catch(() => {})
      if (pdfPad) await admin.storage.from('signed-offertes').remove([pdfPad]).catch(() => {})
      if (updateErr) {
        console.error('sign-offerte update', updateErr.message)
        return json({ success: false, error: 'Ondertekenen is niet gelukt. Probeer het opnieuw.' }, 500)
      }
      return weiger('al_ondertekend', 'Deze offerte is al ondertekend.')
    }

    const exemplaarB64 = exemplaar && pdfPad ? bytesNaarBase64(exemplaar.pdf) : null

    // ── STAP 5b: Bevestigingsmails server-side versturen ─────────────────────
    // Verstuurd VANUIT de edge function (niet meer vanaf de publieke browser-
    // pagina) via de send-email relay met het interne secret. Best-effort: een
    // mailfout mag het ondertekenen niet laten falen.
    try {
      const bedrijfsnaam = (company?.name as string) || offerte.snapshot_bedrijfsnaam || 'BossBase'
      const logoUrl      = (company?.logo_url as string) || undefined
      const brandColor   = (company?.branding_color as string) || undefined
      const bedrijfEmail = (company?.email as string) || null
      const totaalFmt    = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.totaal_incl || 0)
      const signedAtFmt  = new Date(now).toLocaleString('nl-NL')
      const omschrijving = (offerte.omschrijving as string) || ''
      const hasPdf       = !!exemplaarB64
      const attachments  = hasPdf
        ? [{ filename: `Offerte-${offerte.nummer}-ondertekend.pdf`, content: exemplaarB64 }]
        : undefined

      // 1) KLANT-bevestiging — bedrijfsbranding, reply-to naar het bedrijf.
      // ── Tekst van de klantbevestiging ────────────────────────────────────
      // Eerst de template die het bedrijf zelf beheert in Instellingen
      // ('offerte_geaccepteerd'). Die was nooit aangesloten: een bedrijf paste hem
      // aan en de klant kreeg onveranderd onze vaste tekst. Staat de template op
      // inactief of is hij leeg, dan blijft die vaste tekst de terugval.
      const { data: klantRij } = offerte.customer_id
        ? await admin.from('customers').select('name, email').eq('id', offerte.customer_id).maybeSingle()
        : { data: null }
      // {{klant_naam}}: de klant zoals hij in de administratie staat; valt terug op
      // de naam die de ondertekenaar zelf invulde.
      const klantNaam = (klantRij?.name as string) || name

      const { data: tpl } = await admin
        .from('email_templates')
        .select('onderwerp, body, body_html')
        .eq('company_id', offerte.company_id)
        .eq('type', 'offerte_geaccepteerd')
        .eq('actief', true)
        .maybeSingle()

      const variabelen: Record<string, string> = {
        klant_naam: klantNaam,
        bedrijfsnaam,
        offerte_nummer: String(offerte.nummer ?? ''),
        totaal_bedrag: totaalFmt,
      }
      // In HTML worden de wáárden ge-escaped; in het onderwerp (platte tekst) niet.
      const vulIn = (tekst: string, alsHtml: boolean) =>
        String(tekst || '').replace(/\{\{(\w+)\}\}/g, (_m, sleutel) => {
          const waarde = variabelen[sleutel]
          if (waarde == null) return `{{${sleutel}}}`
          return alsHtml ? esc(waarde) : waarde
        })
      // De template staat als platte tekst met regeleindes in de database, tenzij
      // hij in de editor is bewerkt — dan is het al HTML.
      const naarHtml = (tekst: string) => {
        const ruw = String(tekst || '')
        if (/<[a-z][\s\S]*>/i.test(ruw)) return ruw
        return esc(ruw).split(/\n{2,}/).map(alinea => `<p>${alinea.replace(/\n/g, '<br>')}</p>`).join('')
      }

      const templateTekst = (tpl?.body_html as string)?.trim() || (tpl?.body as string)?.trim() || ''
      const klantTekstHtml = templateTekst
        // De bijlagezin hoort niet in de template thuis (die weet niet of er een
        // PDF is), dus die plakken we eronder wanneer hij er daadwerkelijk is.
        ? vulIn(naarHtml(templateTekst), true) + (hasPdf ? '<p>In de bijlage vindt u de ondertekende offerte.</p>' : '')
        : `<p>Beste ${esc(name)},</p>
<p>Bedankt voor het ondertekenen van offerte <strong>${esc(offerte.nummer)}</strong>.</p>
${omschrijving ? `<p>Omschrijving: ${esc(omschrijving)}</p>` : ''}
<p>Totaal: <strong>${esc(totaalFmt)}</strong></p>
${hasPdf ? '<p>In de bijlage vindt u de ondertekende offerte.</p>' : ''}
<p>We nemen zo snel mogelijk contact met u op.</p>
<p>Met vriendelijke groet,<br>${esc(bedrijfsnaam)}</p>`

      const klantOnderwerp = (tpl?.onderwerp as string)?.trim()
        ? vulIn(tpl.onderwerp as string, false)
        : `Bevestiging: offerte ${offerte.nummer} ondertekend`

      const klantHtml = mailTemplate({
        title: `Offerte ${offerte.nummer} ondertekend`,
        preheader: `Bedankt voor het ondertekenen van offerte ${offerte.nummer}`,
        body: klantTekstHtml,
        companyName: bedrijfsnaam,
        logoUrl,
        brandColor,
      })
      // Naar het klantadres van de offerte én naar het adres van de ondertekenaar
      // (als dat anders is). Alleen naar het zelf ingevulde adres sturen maakte het
      // mogelijk een bevestiging naar een willekeurig adres te laten gaan zonder dat
      // de klant zelf iets zag.
      const ontvangers = [...new Set([(klantRij?.email as string | undefined)?.trim().toLowerCase(), email].filter(Boolean))] as string[]
      const klantBody: Record<string, unknown> = {
        to: ontvangers, subject: klantOnderwerp, html: klantHtml, from_name: bedrijfsnaam,
        soort: 'ondertekenbevestiging_klant',
        company_id: offerte.company_id,
        gerelateerd_type: 'offerte',
        gerelateerd_id: offerte.id,
      }
      if (bedrijfEmail) klantBody.reply_to = bedrijfEmail
      if (attachments) klantBody.attachments = attachments
      if (!(await sendViaEdge(supabaseUrl, serviceKey, klantBody))) warnings.push('Bevestigingsmail naar klant mislukt')

      // 2) BEDRIJF-notificatie — BossBase-stijl. Dit is systeempost aan de
      //    ondernemer zelf ("je offerte is ondertekend"), geen communicatie naar
      //    zijn klant. De eigen huisstijl blijft voorbehouden aan de klantmail
      //    hierboven; zie ook sign-werkbon, dat het al zo deed.
      if (bedrijfEmail) {
        const bedrijfHtml = mailTemplate({
          title: `Offerte ${offerte.nummer} ondertekend`,
          preheader: `${name} heeft offerte ${offerte.nummer} ondertekend`,
          body: `<p>Goed nieuws! Offerte <strong>${esc(offerte.nummer)}</strong> is zojuist ondertekend.</p>
<p>Ondertekend door: <strong>${esc(name)}</strong> (${esc(email)})<br>
Datum en tijd: ${esc(signedAtFmt)}<br>
Totaal: <strong>${esc(totaalFmt)}</strong></p>
${hasPdf ? '<p>De ondertekende offerte is als bijlage toegevoegd.</p>' : ''}`,
        })
        const bedrijfBody: Record<string, unknown> = {
          to: bedrijfEmail, subject: `Offerte ${offerte.nummer} ondertekend door ${name}`, html: bedrijfHtml, from_name: 'BossBase',
          // Antwoorden gingen naar noreply@bossbase.nl en las dus niemand. Wie op
          // deze melding reageert, wil de klant bereiken.
          reply_to: email,
          soort: 'ondertekenbevestiging_bedrijf',
          company_id: offerte.company_id,
          gerelateerd_type: 'offerte',
          gerelateerd_id: offerte.id,
        }
        if (attachments) bedrijfBody.attachments = attachments
        if (!(await sendViaEdge(supabaseUrl, serviceKey, bedrijfBody))) warnings.push('Notificatiemail naar bedrijf mislukt')
      }
    } catch (mailErr) {
      console.error('sign-offerte mails', mailErr); warnings.push('Bevestigingsmails mislukt')
    }

    // ── STAP 5c: Tijdlijn op de klantkaart ───────────────────────────────────
    // Stond op de publieke ondertekenpagina als anon-insert met een lege catch.
    // RLS weigerde die, en niemand zag het: "offerte geaccepteerd" kwam nooit op
    // de klanttijdlijn. Hier lukt het wél, want deze functie draait met de
    // service-role — zelfde plek als bij sign-werkbon.
    if (offerte.customer_id) {
      const { error: tijdlijnErr } = await admin.from('klant_tijdlijn').insert({
        customer_id: offerte.customer_id,
        company_id: offerte.company_id,
        type: 'offerte_geaccepteerd',
        omschrijving: `Offerte ${offerte.nummer} ondertekend door ${name}`,
        aangemaakt_op: now,
        meta: { nummer: offerte.nummer, signed_by: name, signed_by_email: email },
      })
      if (tijdlijnErr) { console.error('sign-offerte tijdlijn', tijdlijnErr.message); warnings.push('Tijdlijnregel schrijven mislukt') }
    }

    // ── STAP 6: Response samenstellen ────────────────────────────────────────
    const bedrijfNaam = (company?.name as string) || 'BossBase'
    const totaal = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.totaal_incl || 0)

    const responseBody: Record<string, unknown> = {
      success: true,
      offerte_nummer: offerte.nummer,
      offerte_omschrijving: offerte.omschrijving || '',
      company_name: bedrijfNaam,
      company_email: (company?.email as string) || null,
      totaal,
      signed_at: now,
      signed_by_name: name,
      signed_by_email: email,
    }

    if (warnings.length) responseBody.warnings = warnings

    return new Response(
      JSON.stringify(responseBody),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('sign-offerte onverwachte fout:', err)
    return json({ success: false, error: 'Er ging iets mis bij het ondertekenen. Probeer het later opnieuw.' }, 500)
  }
})
