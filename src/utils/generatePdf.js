// De opmaak zelf staat in supabase/functions/_shared/pdfOpbouw.js: dezelfde code
// maakt op de server het ondertekende exemplaar. Hier alleen wat de browser
// nodig heeft (jsPDF laden, afbeeldingen ophalen en verkleinen).
import { buildPdf, hexToRgb, luminance, fmtDate, fmtDateTime, C, formatIban } from '../../supabase/functions/_shared/pdfOpbouw.js';
export { buildPdf, hexToRgb, luminance, fmtDate, fmtDateTime, C, formatIban };

// jsPDF wordt dynamisch geladen zodat de ~350KB lib niet in de hoofdbundle
// zit — pas opgehaald wanneer er daadwerkelijk een PDF gemaakt wordt.
let _jsPDF = null;
export async function loadJsPDF() {
  if (!_jsPDF) {
    const mod = await import('jspdf');
    _jsPDF = mod.jsPDF || mod.default;
  }
  return _jsPDF;
}

export async function imgToBase64(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}


// ── Afbeeldingen verkleinen vóór ze de PDF in gaan ──────────────────────────
// jsPDF neemt een afbeelding op zoals hij hem krijgt. Een bedrijfslogo van 2,5 MB
// levert dus een PDF van 3 MB op voor een plaatje dat op papier 55 mm breed is —
// en die PDF gaat als bijlage mee met elke offerte, factuur en werkbon. Sommige
// mailservers weigeren grote bijlagen, dus dit is geen cosmetisch probleem.
//
// De oplossing is niet "harder comprimeren" maar "niet meer pixels meesturen dan
// er afgedrukt worden". 300 dpi is de drukstandaard; boven die dichtheid ziet
// niemand nog verschil, ook niet op papier.
const DPI = 300;
const MM_PER_INCH = 25.4;
const mmNaarPx = mm => Math.ceil((mm / MM_PER_INCH) * DPI);

const FORMAAT_UIT_MIME = { jpeg: 'JPEG', jpg: 'JPEG', png: 'PNG', gif: 'GIF', webp: 'WEBP' };

function afbeeldingAfmetingen(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, img });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Bereidt een afbeelding voor op plaatsing in de PDF: past hem in een vak van
 * maxWmm × maxHmm en levert niet meer pixels dan daar op 300 dpi in passen.
 *
 * Geeft ook een JPEG-variant terug als die kleiner is. Dat kost transparantie,
 * dus dat mag alleen omdat de ondergrond wit papier is — de afbeelding wordt dan
 * eerst op wit samengevoegd en ziet er identiek uit.
 *
 * @returns {Promise<{dataUrl:string, formaat:string, breedte:number, hoogte:number}|null>}
 *          breedte/hoogte in mm, klaar voor doc.addImage.
 */
export async function bereidAfbeeldingVoor(dataUrl, maxWmm, maxHmm) {
  if (!dataUrl) return null;
  const dims = await afbeeldingAfmetingen(dataUrl);
  if (!dims || !dims.w || !dims.h) return null;

  // Afmetingen op papier: passend binnen het vak, met behoud van de verhouding.
  const schaalMm = Math.min(maxWmm / dims.w, maxHmm / dims.h);
  const breedte = dims.w * schaalMm;
  const hoogte = dims.h * schaalMm;

  const doelPx = mmNaarPx(breedte);
  const bronMime = (dataUrl.match(/^data:image\/([^;]+)/i)?.[1] || 'jpeg').toLowerCase();
  const origineelFormaat = FORMAAT_UIT_MIME[bronMime] || 'JPEG';

  // Al klein genoeg? Dan niets aanraken — hertekenen kan alleen kwaliteit kosten.
  if (dims.w <= doelPx) {
    return { dataUrl, formaat: origineelFormaat, breedte, hoogte };
  }

  try {
    const schaal = doelPx / dims.w;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(dims.w * schaal));
    canvas.height = Math.max(1, Math.round(dims.h * schaal));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dims.img, 0, 0, canvas.width, canvas.height);

    const alsPng = canvas.toDataURL('image/png');

    // JPEG erbij, op wit samengevoegd. Vlakke logo's blijven als PNG kleiner;
    // fotografische logo's en klusfoto's winnen fors met JPEG.
    const witCanvas = document.createElement('canvas');
    witCanvas.width = canvas.width;
    witCanvas.height = canvas.height;
    const wctx = witCanvas.getContext('2d');
    wctx.fillStyle = '#ffffff';
    wctx.fillRect(0, 0, witCanvas.width, witCanvas.height);
    wctx.drawImage(canvas, 0, 0);
    const alsJpeg = witCanvas.toDataURL('image/jpeg', 0.9);

    const kleinste = alsJpeg.length < alsPng.length
      ? { dataUrl: alsJpeg, formaat: 'JPEG' }
      : { dataUrl: alsPng, formaat: 'PNG' };
    return { ...kleinste, breedte, hoogte };
  } catch {
    // Canvas kan getaint zijn of ontbreken; dan liever een grote PDF dan geen.
    return { dataUrl, formaat: origineelFormaat, breedte, hoogte };
  }
}

// Wat de gedeelde opbouw in de browser gebruikt.
export const browserOmgeving = {
  naarDataUrl: imgToBase64,
  bereidAfbeelding: bereidAfbeeldingVoor,
  afmetingen: async dataUrl => {
    const r = await afbeeldingAfmetingen(dataUrl);
    return r ? { w: r.w, h: r.h } : null;
  },
  // Korte link op het moment van gebruik (document-url); zie documentService.
  documentUrl: async args => (await import('../services/documentService.js')).documentUrl(args),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
};

// ── EXPORTS ──────────────────────────────────────────────────────────────────

export async function generateOffertePdf(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company, browserOmgeving);
  doc.save(`${offerte.nummer || 'offerte'}.pdf`);
}

export async function previewOffertePdf(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company, browserOmgeving);
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

export async function previewFactuurPdf(factuur, regels, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company, browserOmgeving);
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

export async function getOffertePdfUrl(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company, browserOmgeving);
  return doc.output('bloburl');
}

export async function getOffertePdfBase64(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company, browserOmgeving);
  return doc.output('datauristring').split(',')[1];
}

export async function getFactuurPdfBase64(factuur, regels, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company, browserOmgeving);
  return doc.output('datauristring').split(',')[1];
}
