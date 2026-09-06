// Ondertekenen van een werkbon — de servicelaag rond de sign-werkbon edge
// function en de publieke sign-token-functies.
//
// Twee routes, één mechanisme:
//   1. Ter plekke: de monteur draait z'n telefoon om, de klant tekent in de
//      afrondmodal. De app heeft dan wél een sessie, maar loopt tóch via het
//      sign_token en de edge function — anders zijn er twee wegen naar hetzelfde
//      resultaat en lopen ze na de eerste wijziging uit elkaar.
//   2. Per mail: de klant is weg of wil het eerst nalezen. Dezelfde link
//      (/werkbon/<sign_token>), dezelfde edge function, dezelfde PDF.
//
// De PDF wordt altijd in de browser gebouwd. Zie de kop van generateWerkbonPdf.js
// voor waarom dat geen implementatiedetail is maar de afscherming zelf.

import { supabase } from '../lib/supabase'
import { sendEmail, logSentEmail } from './emailService.js'
import { mailTemplate, mailButton } from '../utils/mailTemplate.js'
import { getWerkbonPdfBase64 } from '../utils/generateWerkbonPdf.js'

/** De publieke ondertekenlink van een werkbon. */
export function werkbonSignUrl(werkbon) {
  const token = werkbon?.signToken || werkbon?.sign_token
  if (!token) return null
  return `${window.location.origin}/werkbon/${token}`
}

/**
 * Zet de losse detailgegevens om naar wat de PDF nodig heeft, en zeeft daarbij
 * alles weg wat de klant niet hoort te zien. Eén plek, gebruikt door de app én
 * door de publieke pagina, zodat de twee PDF's identiek zijn.
 */
export function bouwPdfData({ taken = [], uren = [], materialen = [], meerwerk = [], notities = [], fotos = [] }) {
  return {
    // Alleen afgevinkte regels: de klant tekent voor het uitgevoerde werk. Wat
    // nog openstaat blijft in de app staan — anders tekent hij voor een lijst
    // met wat er níét gedaan is, en dat is een discussie in plaats van een bon.
    //
    // Taken en meerwerk komen uit dezelfde tabel maar krijgen een eigen blok, zodat
    // zichtbaar is wat er tijdens de klus bij is gevraagd.
    taken: taken.filter(t => t.afgerond && !t.isMeerwerk).map(t => ({
      omschrijving: t.omschrijving, afgerond: true,
    })),
    // Geen medewerkernaam: wie het werk deed is loonadministratie en gaat de
    // klant niet aan. De opmerking blijft wél mee — die verklaart de uren.
    uren: uren.map(u => ({
      datum: u.datum,
      startTijd: u.startTijd || u.start_tijd || null,
      eindTijd: u.eindTijd || u.eind_tijd || null,
      pauzeMinuten: u.pauzeMinuten ?? u.pauze_minuten ?? 0,
      uren: Number(u.uren || 0),
      notitie: u.notitie || u.opmerking || '',
    })),
    // Alleen naam, aantal en eenheid: geen prijs_per, geen subtotaal, geen
    // inkoopprijs. Die velden zitten wel in het materiaal-object van de app,
    // dus dit filter is het enige dat ze tegenhoudt — laat het staan.
    materialen: materialen.map(m => ({
      naam: m.naam, eenheid: m.eenheid || '', aantal: Number(m.aantal || 0),
    })),
    // Meerwerk: dezelfde regel als bij taken — alleen afgevinkt. Uit `meerwerk`
    // als de aanroeper een aparte lijst meegeeft (de app), anders uit de
    // takenlijst zelf (de ondertekenpagina krijgt één lijst uit de RPC).
    meerwerk: (meerwerk.length ? meerwerk : taken.filter(t => t.isMeerwerk))
      .filter(m => m.afgerond)
      .map(m => ({ omschrijving: m.omschrijving })),
    // Alleen wat expliciet als klantnotitie is gemarkeerd.
    notities: notities.filter(n => n.voorKlant === true || n.voor_klant === true)
      .map(n => ({ note: n.note })),
    fotos: fotos.map(f => ({ url: f.url, categorie: f.categorie || '' })),
  }
}

/**
 * Werkbonobject in de vorm die generateWerkbonPdf verwacht.
 *
 * @param {string[]} [extra.uitvoerders] Namen van de uitvoerder(s) en de
 *   verantwoordelijke — wie er namens het bedrijf voor het werk staat. Dit is
 *   iets anders dan wie de uren boekte; die namen staan niet op de bon.
 */
export function bouwPdfWerkbon(werkbon, extra = {}) {
  return {
    nummer: werkbon.nummer,
    titel: werkbon.titel,
    omschrijving: werkbon.omschrijving,
    locatie: werkbon.locatie,
    geplandOp: werkbon.geplandOp || werkbon.gepland_op,
    gestartOp: werkbon.gestartOp || werkbon.gestart_op,
    afgerondOp: werkbon.afgerondOp || werkbon.afgerond_op,
    ondertekendOp: werkbon.ondertekendOp || werkbon.ondertekend_op,
    ondertekendDoorNaam: werkbon.ondertekendDoorNaam || werkbon.ondertekend_door_naam,
    ondertekendDoorEmail: werkbon.ondertekendDoorEmail || werkbon.ondertekend_door_email,
    handtekeningUrl: werkbon.handtekeningUrl || werkbon.handtekening_url,
    // Een verse handtekening zit nog niet in de opslag maar als data-URI in het
    // geheugen. Die moet mee, anders komt er een ondertekende bon uit met een
    // leeg handtekeningvak — en dat is precies het bewijsstuk dat ontbreekt.
    handtekeningDataUrl: werkbon.handtekeningDataUrl || null,
    ...extra,
  }
}

// ── ONDERTEKENEN ────────────────────────────────────────────────────────────

/**
 * Roept de sign-werkbon edge function aan. Werkt zowel vanaf de publieke pagina
 * (geen sessie) als vanuit de app.
 */
export async function signWerkbon({ signToken, name, email, signatureDataUrl, signedPdfBase64 }) {
  const body = { sign_token: signToken, name, email, signature_data_url: signatureDataUrl }
  if (signedPdfBase64) body.signed_pdf_base64 = signedPdfBase64

  const { data, error } = await supabase.functions.invoke('sign-werkbon', { body })
  if (error) {
    // De echte melding zit in de response body, niet in error.message.
    let message = error.message
    try {
      const b = await error.context?.json()
      if (b?.error) message = b.error
    } catch { /* val terug op error.message */ }
    throw new Error(message)
  }
  if (!data?.success) throw new Error(data?.error || 'Ondertekenen mislukt')
  return data
}

/**
 * Signed URLs voor de foto's bij een sign_token. Alleen nodig op de publieke
 * pagina: de bucket is privé en een signed URL is niet in SQL te maken, dus dat
 * loopt via dezelfde edge function.
 */
export async function getFotosViaToken(signToken) {
  const { data, error } = await supabase.functions.invoke('sign-werkbon', {
    body: { action: 'fotos', sign_token: signToken },
  })
  if (error || !data?.success) return []
  return data.fotos || []
}

// ── PER MAIL VERSTUREN ──────────────────────────────────────────────────────

/**
 * Stuurt de klant de ondertekenlink met de werkbon als bijlage. Loopt vanuit de
 * ingelogde app via sendEmail (de gewone weg); alleen de bevestiging ná het
 * tekenen gaat server-side, omdat de ondertekenpagina geen sessie heeft.
 *
 * @returns {Promise<{email: string, link: string}>}
 */
export async function verstuurWerkbonTerOndertekening({ werkbon, email, detail, customer, company }) {
  const adres = String(email || '').trim()
  if (!adres) throw new Error('Vul een e-mailadres in')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres)) throw new Error('Dat is geen geldig e-mailadres')

  const link = werkbonSignUrl(werkbon)
  if (!link) throw new Error('Deze werkbon heeft nog geen ondertekenlink. Herlaad de pagina en probeer het opnieuw.')

  // De bon gaat mee als bijlage, zodat de klant hem kan lezen zonder eerst op
  // een link te klikken. Mislukt dat, dan gaat de mail alsnog: de link is het
  // eigenlijke doel.
  let bijlage = null
  try {
    const base64 = await getWerkbonPdfBase64(
      bouwPdfWerkbon(werkbon), bouwPdfData(detail || {}), customer, company)
    bijlage = { filename: `Werkbon-${werkbon.nummer || ''}.pdf`, content: base64 }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[werkbon] PDF-bijlage overgeslagen:', e.message)
  }

  // Klantmail, dus in de huisstijl van het bedrijf — dezelfde centrale template
  // als de offertemail. (De melding ná het tekenen gaat naar het bedrijf zélf en
  // is daarom BossBase-stijl; die staat in de edge function.)
  const bedrijf = company?.name || 'ons bedrijf'
  const onderwerp = `Werkbon ${werkbon.nummer || ''} — graag uw akkoord`
  const html = mailTemplate({
    title: onderwerp,
    preheader: `Werkbon ${werkbon.nummer || ''} ligt klaar om af te tekenen`,
    body: `<p>Beste ${escapeHtml(customer?.name || 'klant')},</p>
<p>Het werk aan <strong>${escapeHtml(werkbon.titel || '')}</strong> is klaar. Wilt u de werkbon nalezen en digitaal aftekenen?</p>
${mailButton('Werkbon bekijken en ondertekenen', link, company?.brandingColor)}
<p style="font-size:13px;color:#6b7280">Werkt de knop niet? Kopieer deze link in uw browser:<br>${link}</p>
<p>Met vriendelijke groet,<br>${escapeHtml(bedrijf)}</p>`,
    companyName: bedrijf,
    logoUrl: company?.logoUrl,
    brandColor: company?.brandingColor,
  })

  await sendEmail({
    to: adres,
    subject: onderwerp,
    html,
    attachments: bijlage ? [bijlage] : undefined,
  })

  // In het mailarchief op de klantkaart, net als bij offertes en facturen.
  logSentEmail({
    toEmail: adres, subject: onderwerp, bodyHtml: html,
    relatedType: 'werkbon', relatedId: werkbon.id,
    customerId: werkbon.customerId || werkbon.customer_id || null,
  }).catch(() => {})

  // Vastleggen waar de link heen is; de ondertekenpagina vult het adres
  // daarmee voor, en op de werkbon is te zien dat er al iets verstuurd is.
  await supabase.from('werkbonnen')
    .update({ verstuurd_naar_email: adres, verstuurd_op: new Date().toISOString() })
    .eq('id', werkbon.id)

  return { email: adres, link }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
