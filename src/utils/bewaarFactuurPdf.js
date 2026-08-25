// De factuur-PDF vastleggen in de privé-bucket factuur-pdfs.
//
// De opmaak zit in jsPDF en draait dus alleen in de browser. Alles wat later
// zonder browser een kopie nodig heeft — de Stripe-webhook voor de
// betaalbevestiging, en de SnelStart-koppeling die het brondocument aan de
// verkoopboeking hangt — leest die opgeslagen kopie.
//
// Dat betekent dat het moment van opslaan bepalend is: gebeurt het niet, dan
// staat de boeking straks zonder factuur in de boekhouding. Daarom wordt dit
// aangeroepen zodra een factuur definitief wordt, langs welke weg dan ook —
// versturen per mail, of handmatig op verzonden/betaald zetten.
//
// Best-effort: een mislukte PDF mag het versturen of opslaan nooit blokkeren.
// De sync meldt zelf welke facturen zonder document in de boekhouding staan.

import { getFactuurPdfBase64 } from './generatePdf.js';
import { companyForDocument } from './documentSnapshot.js';
import { getFactuurRegels, uploadFactuurPdf } from '../services/factuurService.js';

/** Statussen waarbij de factuur definitief is en dus bewaard moet worden. */
export const PDF_STATUSSEN = ['verzonden', 'betaald'];

/**
 * Genereert de PDF en zet hem in de bucket. Geeft true bij succes.
 *
 * @param factuur  factuurobject (camelCase, zoals de service teruggeeft)
 * @param customer klant van de factuur
 * @param company  actief bedrijf; de snapshot op de factuur wint als die er is
 */
export async function bewaarFactuurPdf(factuur, customer, company) {
  if (!factuur?.id || !factuur?.companyId) return false;
  try {
    const regels = await getFactuurRegels(factuur.id);
    // Een creditfactuur toont zijn toelichting als creditNote — zelfde
    // behandeling als bij het mailen, anders wijkt de bewaarde PDF af van wat
    // de klant heeft gekregen.
    const voorPdf = factuur.isCredit ? { ...factuur, creditNote: factuur.notities } : factuur;
    const base64 = await getFactuurPdfBase64(voorPdf, regels, customer, companyForDocument(factuur, company));
    return await uploadFactuurPdf(factuur.id, factuur.companyId, base64);
  } catch (err) {
    console.warn('Factuur-PDF bewaren mislukt:', err?.message);
    return false;
  }
}
