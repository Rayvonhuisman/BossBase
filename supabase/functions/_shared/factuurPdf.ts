// De factuur-PDF, gemaakt op de server.
//
// Tot nu toe maakte alleen de browser de factuur-PDF (jsPDF), bij versturen of
// op betaald zetten, en zette hem in de privé-bucket factuur-pdfs. Alles zonder
// browser — de boekhoudkoppelingen, de betaalbevestiging na een Stripe-betaling —
// las die opgeslagen kopie. Werd een factuur nooit vanuit de app verstuurd, dan
// was er geen PDF, en stond de boeking zonder brondocument in de boekhouding.
//
// Nu kan de server hem zelf maken, in precies dezelfde opmaak: dezelfde code
// (_shared/pdfOpbouw.js, buildPdf 'factuur') als de app, met de bevroren
// bedrijfsgegevens van de factuur (snapshot) zoals companyForDocument in de app,
// en dezelfde afbeeldingsomgeving als het ondertekende exemplaar van offertes en
// werkbonnen (_shared/ondertekendExemplaar.ts).
//
// factuurPdf() geeft de opgeslagen PDF als die er is (de app-versie gaat voor:
// dat is wat de klant kreeg), en maakt en bewaart hem anders. Daarna heeft elke
// lezer hetzelfde bestand.

import { jsPDF } from 'npm:jspdf@4.2.1'
import { buildPdf } from './pdfOpbouw.js'
import { regimeVanPct } from './btwRegime.js'
import { serverOmgeving, bedrijfVoorDocument } from './ondertekendExemplaar.ts'

const FACTUUR_KOLOMMEN = 'id, nummer, factuurdatum, vervaldatum, betalingskenmerk, notities, is_credit, status, company_id, customer_id, '
  + 'snapshot_logo_url, snapshot_branding_color, snapshot_bedrijfsnaam, snapshot_adres, snapshot_postcode, snapshot_plaats, '
  + 'snapshot_email, snapshot_kvk, snapshot_btw, snapshot_iban, snapshot_iban_tnv'

/** Maakt de PDF van één factuur uit de database. Concepten niet: die zijn niet definitief. */
export async function maakFactuurPdf(admin: any, factuurId: string): Promise<Uint8Array> {
  const { data: f, error } = await admin.from('facturen').select(FACTUUR_KOLOMMEN).eq('id', factuurId).maybeSingle()
  if (error || !f) throw new Error('factuur niet gevonden')
  if (f.status === 'concept') throw new Error('van een concept wordt geen PDF gemaakt')

  const [{ data: regels, error: regelFout }, { data: bedrijf }, { data: klant }] = await Promise.all([
    admin.from('factuur_regels')
      .select('type, omschrijving, aantal, eenheidsprijs, btw_pct, btw_regime, regelprijs, volgorde')
      .eq('factuur_id', f.id).order('volgorde', { ascending: true }),
    admin.from('companies').select('name, address, postal_code, city, email, phone, kvk, btw_number, logo_url, branding_color, iban, iban_tnv')
      .eq('id', f.company_id).maybeSingle(),
    f.customer_id
      ? admin.from('customers').select('name, address, postcode, city, email, phone, kvk_number, btw_number').eq('id', f.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  // Liever geen PDF dan een PDF zonder regels.
  if (regelFout) throw new Error(`factuurregels: ${regelFout.message}`)
  if (!regels?.length) throw new Error('factuur heeft geen regels')

  // Zelfde vorm als toRegel en toFactuur in de app (factuurService).
  const items = regels.map((r: any) => ({
    type: r.type || 'stuks', omschrijving: r.omschrijving || '',
    aantal: Number(r.aantal || 1), eenheidsprijs: Number(r.eenheidsprijs || 0),
    btwPct: Number(r.btw_pct ?? 21), btwRegime: r.btw_regime || regimeVanPct(r.btw_pct),
    regelprijs: Number(r.regelprijs || 0),
  }))
  const document = {
    id: f.id, nummer: f.nummer || '', factuurdatum: f.factuurdatum, vervaldatum: f.vervaldatum,
    betalingskenmerk: f.betalingskenmerk || '', notities: f.notities || '', isCredit: !!f.is_credit,
    // Een creditfactuur toont zijn toelichting als creditNote, net als bij het mailen.
    ...(f.is_credit ? { creditNote: f.notities || '' } : {}),
  }
  const customer = klant ? {
    name: klant.name || '', address: klant.address || '', postcode: klant.postcode || '', city: klant.city || '',
    email: klant.email || '', phone: klant.phone || '', kvkNumber: klant.kvk_number || '', btwNumber: klant.btw_number || '',
  } : null

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `${f.is_credit ? 'Creditfactuur' : 'Factuur'} ${f.nummer ?? ''}`, creator: 'BossBase' })
  await buildPdf(doc, 'factuur', document, items, customer, bedrijfVoorDocument(bedrijf, f), serverOmgeving(admin))
  return new Uint8Array(doc.output('arraybuffer'))
}

/**
 * De PDF van een factuur: de opgeslagen kopie, of — als die er niet is — een
 * nieuw gemaakte, die meteen wordt bewaard op {company_id}/{factuur_id}.pdf.
 * Null als er geen te maken is (concept, geen regels).
 */
export async function factuurPdf(
  admin: any, companyId: string, factuurId: string,
): Promise<{ bytes: Uint8Array; gemaakt: boolean } | null> {
  const pad = `${companyId}/${factuurId}.pdf`
  try {
    const { data, error } = await admin.storage.from('factuur-pdfs').download(pad)
    if (!error && data) return { bytes: new Uint8Array(await data.arrayBuffer()), gemaakt: false }
  } catch { /* niet gevonden: maken */ }
  try {
    const bytes = await maakFactuurPdf(admin, factuurId)
    const { error } = await admin.storage.from('factuur-pdfs')
      .upload(pad, bytes, { contentType: 'application/pdf', upsert: true })
    if (error) console.warn('Gemaakte factuur-PDF niet bewaard:', error.message)
    return { bytes, gemaakt: true }
  } catch (e: any) {
    console.warn(`Factuur-PDF ${factuurId} niet te maken:`, e?.message)
    return null
  }
}
