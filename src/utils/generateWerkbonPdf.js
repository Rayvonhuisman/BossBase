// De werkbon-PDF: het document dat de klant ondertekent.
//
// Deelt huisstijl en bouwstenen met de factuur- en offerte-PDF (generatePdf.js),
// maar is bewust een ander document: een werkbon bewijst wát er gedaan is, geen
// factuur die zegt wat het kost.
//
// ── WAT ER NIET OP STAAT, EN WAAROM ─────────────────────────────────────────
// Geen bedragen. Niet de inkoopprijs (die zit achter bb_mag_inkoopprijs_zien en
// hoort nergens buiten het bedrijf), niet de verkoopprijs, niet het uurtarief,
// niet het meerwerkbedrag. Twee redenen: een monteur laat de klant tekenen op
// een telefoon en mag niet per ongeluk de marge tonen, en de klant hoort pas bij
// de factuur over geld te lezen — anders wordt de werkbon een onderhandeling.
//
// Ook niet: de interne briefing (werkbon.notes) en elke logregel die niet als
// klantnotitie is gemarkeerd. De ondertekenpagina krijgt die velden al niet van
// de database (get_werkbon_*_by_sign_token); deze functie mag de enige andere
// route niet alsnog openzetten.
//
// Twee dingen die er eerder wél op stonden en er bewust af zijn:
//   * De naam van de monteur per urenregel. Die hoort bij de loonadministratie,
//     niet bij de klant. Wie er namens het bedrijf verantwoordelijk is, staat
//     onder UITGEVOERD DOOR — dat is een ander gegeven.
//   * Het bedrag bij meerwerk. Dat is een interne inschatting van de monteur,
//     geen prijs — de prijs wordt bij het factureren bepaald. De omschrijving
//     staat er wél op: de klant tekent dat het extra werk is uitgevoerd.
//   * Taken die níét zijn afgevinkt. De klant tekent voor het uitgevoerde werk;
//     een lijst met wat er nog openstaat maakt het aftekenen een onderhandeling.
//     Openstaande punten blijven in de werkbon in de app staan.
//
// De PDF wordt in de browser gebouwd onder de sessie van de gebruiker, of — voor
// het ondertekende exemplaar — op de server uit dezelfde publieke
// sign-token-functies als de ondertekenpagina. Die functies zijn de
// afscherming; de server gebruikt geen ruimere bron.

// De opbouw staat in supabase/functions/_shared/pdfOpbouw.js; de server maakt
// er het ondertekende exemplaar mee. De kop hierboven beschrijft wat er wel en
// niet op staat — dat geldt voor beide routes.
import { loadJsPDF, browserOmgeving } from './generatePdf.js';
import { buildWerkbonPdf } from '../../supabase/functions/_shared/pdfOpbouw.js';

async function nieuwDoc(werkbon, data, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildWerkbonPdf(doc, werkbon, data, customer, company, browserOmgeving);
  return doc;
}

const bestandsnaam = werkbon => `Werkbon-${werkbon?.nummer || 'concept'}.pdf`;

export async function downloadWerkbonPdf(werkbon, data, customer, company) {
  const doc = await nieuwDoc(werkbon, data, customer, company);
  doc.save(bestandsnaam(werkbon));
}

export async function getWerkbonPdfUrl(werkbon, data, customer, company) {
  const doc = await nieuwDoc(werkbon, data, customer, company);
  return doc.output('bloburl');
}

/** Base64 zonder data-URI-prefix — dat is wat de edge function verwacht. */
export async function getWerkbonPdfBase64(werkbon, data, customer, company) {
  const doc = await nieuwDoc(werkbon, data, customer, company);
  return doc.output('datauristring').split(',')[1];
}
