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

const euro = n => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

// Documenttotalen uit de regels — voor zowel facturen als offertes.
//
// Het eindbedrag kwam hier eerder uit document.totaalIncl. Bij facturen stonden
// de btw-regels eronder al wél uit de regels, waardoor de PDF op een factuur met
// een scheef opgeslagen totaal zichtbaar niet optelde. Bij offertes was het
// omgekeerd: daar werd het btw-bedrag berekend als incl − excl, zodat de som
// altijd klopte maar het bedrag niet bij het percentage ernaast hoefde te horen
// — "BTW 21%" met € 1.630,00 op € 7.764,00 is 20,99%.
//
// Nu is er één bron voor beide, met dezelfde regel als useRegelTotals, de
// database-triggers (bb_factuurtotalen / bb_offertetotalen) en de boekhoudexport:
// btw per tarief groeperen, per groep afronden, dan optellen. Het regime bepaalt
// óf er btw is — bij vrijgesteld en verlegd nooit, ongeacht het percentage.
//
// Het bedrag per regel heet anders: een factuurregel heeft regelprijs, een
// offerteregel subtotaal. Offerteregels hebben bovendien niet altijd een eigen
// percentage; die vallen terug op het percentage van de offerte zelf.
function documentTotalen(regels = [], { bedragVeld, standaardPct = 21 } = {}) {
  const bedragVan = r => Number(r[bedragVeld]) || 0;
  const excl = Math.round(regels.reduce((s, r) => s + bedragVan(r), 0) * 100) / 100;
  const btwPerTarief = {};
  for (const r of regels) {
    const pct = Number(r.btwPct ?? standaardPct);
    const vrij = r.btwRegime === 'vrijgesteld' || r.btwRegime === 'verlegd';
    const bedrag = vrij ? 0 : bedragVan(r) * pct / 100;
    btwPerTarief[pct] = Math.round(((btwPerTarief[pct] || 0) + bedrag) * 100) / 100;
  }
  const btw = Object.values(btwPerTarief).reduce((s, v) => s + v, 0);
  return { excl, btwPerTarief, incl: Math.round((excl + btw) * 100) / 100 };
}

export function hexToRgb(hex) {
  const h = (hex || '#1DDB62').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [isNaN(r) ? 29 : r, isNaN(g) ? 219 : g, isNaN(b) ? 98 : b];
}

export function luminance([r, g, b]) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export const fmtDate = d => {
  if (!d) return '—';
  const parts = String(d).slice(0, 10).split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

export const fmtDateTime = d => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('nl-NL', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return String(d); }
};

const TYPE_OMSCHR_DEFAULT = {
  uren: 'Arbeidsuren', m2: 'Prijs per m²', stuks: 'Materiaalkosten', km: 'Reisvergoeding', vast: 'Overige kosten',
};

// Ink palette matching the design prototype. Geëxporteerd omdat de werkbon-PDF
// (generateWerkbonPdf.js) dezelfde huisstijl aanhoudt — één palet, geen kopie
// die na de eerste kleurwijziging uit de pas loopt.
export const C = {
  dark:    [20, 22, 28],      // #14161c
  soft:    [60, 66, 80],      // #3c4250
  muted:   [128, 134, 154],   // #80869a
  faint:   [170, 176, 192],   // #aab0c0
  line:    [231, 233, 239],   // #e7e9ef
  lineStr: [211, 215, 224],   // #d3d7e0
  paper:   [255, 255, 255],
  panel:   [246, 247, 250],   // #f6f7fa
  green:   [15, 157, 88],     // #0f9d58
};

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

async function buildPdf(doc, type, document, regels, customer, company) {
  const W = 210, M = 16, CW = W - 2 * M;
  const totalen = documentTotalen(regels || [], type === 'factuur'
    ? { bedragVeld: 'regelprijs', standaardPct: 21 }
    : { bedragVeld: 'subtotaal', standaardPct: Number(document.btwPct ?? 21) });
  const accent = hexToRgb(company?.brandingColor);
  const accentInk = luminance(accent) > 0.62 ? C.dark : C.paper;

  const tc = c => doc.setTextColor(c[0], c[1], c[2]);
  const fc = c => doc.setFillColor(c[0], c[1], c[2]);
  const dc = c => doc.setDrawColor(c[0], c[1], c[2]);

  // ── ACCENT BAND (top of page) ────────────────────────────────
  fc(accent);
  doc.rect(0, 0, W, 1.6, 'F');

  let y = 17;

  // ── HEADER ───────────────────────────────────────────────────

  let headerBottom = y;

  // Logo links — als geen logo: toon bedrijfsnaam als tekst
  if (company?.logoUrl) {
    const logoData = await imgToBase64(company.logoUrl);
    if (logoData) {
      try {
        const logo = await bereidAfbeeldingVoor(logoData, 55, 20);
        if (logo) {
          doc.addImage(logo.dataUrl, logo.formaat, M, y, logo.breedte, logo.hoogte, '', 'FAST');
          headerBottom = Math.max(headerBottom, y + logo.hoogte);
        }
      } catch {}
    }
  } else if (company?.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    tc(C.dark);
    doc.text(company.name, M, y + 9);
    headerBottom = Math.max(headerBottom, y + 13);
  }

  // Bedrijfsgegevens rechts
  let ry = y + 1;
  if (company?.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    tc(C.dark);
    doc.text(company.name, W - M, ry, { align: 'right' });
    ry += 5;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  tc(C.soft);
  if (company?.address) { doc.text(company.address, W - M, ry, { align: 'right' }); ry += 4; }
  const compCity = [company?.postalCode, company?.city].filter(Boolean).join('  ');
  if (compCity) { doc.text(compCity, W - M, ry, { align: 'right' }); ry += 4; }
  if (company?.email) { doc.text(company.email, W - M, ry, { align: 'right' }); ry += 4; }
  const regParts = [
    company?.kvk ? `KvK ${company.kvk}` : null,
    company?.btwNumber ? `BTW ${company.btwNumber}` : null,
  ].filter(Boolean);
  if (regParts.length) {
    tc(C.muted);
    doc.text(regParts.join(' · '), W - M, ry, { align: 'right' });
    ry += 4;
  }

  y = Math.max(headerBottom, ry) + 9;

  // ── TITLE ROW ────────────────────────────────────────────────

  // doctitle: hoofdletter op eerste letter, rest lowercase — exact zoals design HTML
  const docTitle = document.isCredit ? 'Creditfactuur' : (type === 'factuur' ? 'Factuur' : 'Offerte');

  // Lijn 1: document type (bijv. "Offerte")
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  tc(C.dark);
  doc.text(docTitle, M, y + 11);

  // Lijn 2: nummer in accentkleur (line-height .9 op 40px = ~9.5mm)
  doc.setFontSize(30);
  tc(accent);
  doc.text(document.nummer || '', M, y + 21);

  if (document.isCredit && document.creditNote) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    tc(C.muted);
    doc.text(document.creditNote, M, y + 29);
  }

  // Meta rechts — bottom-aligned met de onderkant van de titel (y+21)
  const metaX = W - M - 72;
  let metaY = y + 8;
  const metaRow = (label, val) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    tc(C.muted);
    doc.text(label, metaX, metaY);
    doc.setFont('helvetica', 'bold');
    tc(C.dark);
    doc.text(val || '—', W - M, metaY, { align: 'right' });
    metaY += 5;
  };

  metaRow(type === 'factuur' ? 'Factuurnummer' : 'Offertenummer', document.nummer);
  // Offertedatum: pak het eerste beschikbare datumveld, ongeacht de objectvorm
  // (mapped camelCase, ruwe snake_case, of een al-geformatteerd datum-veld).
  // Zo verschijnt de datum altijd — net als de factuurdatum op de factuur-PDF.
  const offerteDatum = document.createdAt || document.created_at
    || document.datum || document.offertedatum
    || document.verzondenOp || document.verzonden_op || null;
  const docDate = type === 'factuur'
    ? document.factuurdatum
    : (offerteDatum ? String(offerteDatum).slice(0, 10) : null);
  metaRow('Datum', fmtDate(docDate));
  if (type === 'factuur') {
    metaRow('Vervaldatum', fmtDate(document.vervaldatum));
    if (document.betalingskenmerk) metaRow('Kenmerk', document.betalingskenmerk);
  } else {
    metaRow('Geldig tot', fmtDate(document.geldigTot));
    const signedAt = document.signedAt || document.signed_at;
    if (signedAt) metaRow('Ondertekend', fmtDate(signedAt?.slice(0, 10)));
  }

  y = Math.max(y + 26, metaY) + 5;

  // ── PARTIES ──────────────────────────────────────────────────

  // Accent top-border
  dc(accent);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);

  const partyStartY = y + 4;
  const colMid = M + CW / 2;

  // VAN (links — bedrijf)
  let vanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  tc(C.muted);
  doc.text('VAN', M, vanY);
  vanY += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  tc(C.dark);
  if (company?.name) { doc.text(company.name, M, vanY); vanY += 5.5; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  tc(C.soft);
  if (company?.address) { doc.text(company.address, M, vanY); vanY += 4.5; }
  const compCity2 = [company?.postalCode, company?.city].filter(Boolean).join('  ');
  if (compCity2) { doc.text(compCity2, M, vanY); vanY += 4.5; }
  if (company?.email) { doc.text(company.email, M, vanY); vanY += 4.5; }

  // AAN (rechts — klant)
  const aanX = colMid + 7;
  let aanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  tc(C.muted);
  doc.text('AAN', aanX, aanY);
  aanY += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  tc(C.dark);
  if (customer?.name) { doc.text(customer.name, aanX, aanY); aanY += 5.5; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  tc(C.soft);
  if (customer?.address) { doc.text(customer.address, aanX, aanY); aanY += 4.5; }
  const custPostal = customer?.postcode || customer?.postalCode || customer?.postal_code;
  const custCity = [custPostal, customer?.city].filter(Boolean).join('  ');
  if (custCity) { doc.text(custCity, aanX, aanY); aanY += 4.5; }
  if (customer?.email) { doc.text(customer.email, aanX, aanY); aanY += 4.5; }
  const custPhone = customer?.phone || customer?.phone_number;
  if (custPhone) { doc.text(custPhone, aanX, aanY); aanY += 4.5; }
  const custKvk = customer?.kvkNumber || customer?.kvk;
  const custBtw = customer?.btwNumber || customer?.btw_number;
  const custReg = [custKvk ? `KvK ${custKvk}` : null, custBtw ? `BTW ${custBtw}` : null].filter(Boolean);
  if (custReg.length) { tc(C.muted); doc.text(custReg.join(' · '), aanX, aanY); tc(C.soft); aanY += 4.5; }

  y = Math.max(vanY, aanY) + 4;

  // Verticale scheiding
  dc(C.line);
  doc.setLineWidth(0.3);
  doc.line(colMid, partyStartY, colMid, y - 2);

  // Onderrand
  dc(C.line);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 9;

  // ── ITEMS TABEL ───────────────────────────────────────────────

  const COL_PERC = [0.48, 0.11, 0.16, 0.10, 0.15];
  const COL_W = COL_PERC.map(p => CW * p);
  const COL_X = [];
  let cx = M;
  COL_W.forEach(w => { COL_X.push(cx); cx += w; });

  // Kolomkoppen
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  tc(C.muted);
  ['OMSCHRIJVING', 'AANTAL', 'EENHEIDSPRIJS', 'BTW', 'BEDRAG'].forEach((h, i) => {
    const isR = i >= 1;
    doc.text(h, isR ? COL_X[i] + COL_W[i] - 1 : COL_X[i], y, { align: isR ? 'right' : 'left' });
  });
  y += 4;

  // Accent scheidingslijn onder headers
  dc(accent);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 7;

  // Rijen
  (regels || []).forEach((r, idx) => {
    if (y > 238) return;

    if (idx > 0) {
      dc(C.line);
      doc.setLineWidth(0.3);
      doc.line(M, y - 3, W - M, y - 3);
    }

    // Omschrijving (vet)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    tc(C.dark);
    const omschr = doc.splitTextToSize(r.omschrijving || TYPE_OMSCHR_DEFAULT[r.type] || '', COL_W[0] - 2);
    doc.text(omschr[0] || '', COL_X[0], y);

    // Overige kolommen
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    tc(C.soft);

    // Nederlands decimaalteken, net als de bedragen ernaast: 2,5 in plaats van
    // 2.5. Hele aantallen blijven zonder decimalen (2, niet 2,00).
    const aantalTxt = Number(r.aantal ?? 1).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
    doc.text(aantalTxt, COL_X[1] + COL_W[1] - 1, y, { align: 'right' });

    const prijs = type === 'factuur' ? r.eenheidsprijs : r.prijsPer;
    doc.text(euro(prijs), COL_X[2] + COL_W[2] - 1, y, { align: 'right' });

    const btwPct = r.btwPct !== undefined ? r.btwPct : (document.btwPct ?? 21);
    doc.text(`${btwPct}%`, COL_X[3] + COL_W[3] - 1, y, { align: 'right' });

    const bedrag = type === 'factuur' ? r.regelprijs : r.subtotaal;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    tc(C.dark);
    doc.text(euro(bedrag), COL_X[4] + COL_W[4] - 1, y, { align: 'right' });

    y += 11;
  });

  // Lijn na laatste rij
  dc(C.line);
  doc.setLineWidth(0.3);
  doc.line(M, y - 2.5, W - M, y - 2.5);
  y += 7;

  // ── TOTALEN ──────────────────────────────────────────────────

  const totW = CW * 0.58;
  const totX = W - M - totW;

  const subRow = (label, val) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    tc(C.muted);
    doc.text(label, totX, y);
    doc.setFont('helvetica', 'bold');
    tc(C.dark);
    doc.text(val, W - M, y, { align: 'right' });
    y += 8;
  };

  // Facturen en offertes delen nu hetzelfde blok: subtotaal, één regel per
  // btw-tarief, eindbedrag — alle drie uit dezelfde berekening over de regels.
  subRow('Subtotaal excl. BTW', euro(totalen.excl));
  dc(C.line); doc.setLineWidth(0.3); doc.line(totX, y - 6, W - M, y - 6);
  Object.entries(totalen.btwPerTarief)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([pct, amt]) => subRow(`BTW ${pct}%`, euro(amt)));

  y += 2;

  // Grand total box (accent achtergrond)
  const grandH = 13;
  fc(accent);
  doc.roundedRect(totX - 2, y - 1, totW + 2, grandH, 2.1, 2.1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  tc(accentInk);
  doc.text('Totaal incl. BTW', totX + 4, y + 8);

  doc.setFontSize(14);
  doc.text(euro(totalen.incl), W - M - 3, y + 8, { align: 'right' });

  y += grandH + 10;

  // ── NOTITIE / GELDIGHEID ──────────────────────────────────────

  const rawNotes = document.notities || document.notes;
  const defaultNote = !rawNotes && type === 'offerte' && document.geldigTot
    ? `Deze offerte is geldig tot ${fmtDate(document.geldigTot)}. Na akkoord ontvangt u een bevestiging per e-mail.`
    : null;
  const noteText = rawNotes || defaultNote;

  if (noteText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(noteText, CW - 22);
    const noteH = Math.max(13, noteLines.length * 4 + 10);

    fc(C.panel);
    doc.roundedRect(M, y, CW, noteH, 2.1, 2.1, 'F');

    // Bereken eerste-regel baseline zodat het tekstblok verticaal gecentreerd staat
    const noteLineH = 4; // komt overeen met noteH-formule (4mm per regel)
    const noteBlockH = Math.max(0, noteLines.length - 1) * noteLineH;
    const noteTextY = y + (noteH - noteBlockH) / 2 + 1;

    // 'i' badge — gecentreerd met de visuele middenlijn van de tekst
    fc(accent);
    doc.ellipse(M + 6, noteTextY - 1, 2.1, 2.1, 'F');
    tc(accentInk);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('i', M + 6, noteTextY, { align: 'center' });

    tc(C.soft);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(noteLines.slice(0, 5), M + 11.5, noteTextY);

    y += noteH + 8;
  }

  // ── HANDTEKENING (alleen bij ondertekende offertes) ───────────

  const signedAt = type === 'offerte' ? (document.signedAt || document.signed_at) : null;
  if (signedAt) {
    const signedByName = document.signedByName || document.signed_by_name || '';
    const signedByEmail = document.signedByEmail || document.signed_by_email || '';

    // Signature image ophalen — direct dataUrl (verse ondertekening), opgeslagen URL, of via storage
    let sigImgData = null;
    if (document.signatureDataUrl) {
      sigImgData = document.signatureDataUrl;
    } else if (document.signatureUrl) {
      sigImgData = await imgToBase64(document.signatureUrl);
    } else {
      const signToken = document.sign_token || document.signToken;
      if (signToken) {
        try {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const sigUrl = `${baseUrl}/storage/v1/object/public/signatures/${signToken}.png`;
          sigImgData = await imgToBase64(sigUrl);
        } catch {}
      }
    }

    const hasImg = Boolean(sigImgData);
    const signBlockH = hasImg ? 52 : 42;

    // Nieuwe pagina als handtekening vak niet past
    if (y + signBlockH + 20 > 270) {
      doc.addPage();
      y = 17;
    }

    // Buitenrand
    dc(C.lineStr);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, signBlockH, 2.1, 2.1, 'S');

    // Header achtergrond (paneel-kleur, afgerond boven)
    fc(C.panel);
    doc.roundedRect(M, y, CW, 13, 2.1, 2.1, 'F');
    doc.rect(M, y + 7, CW, 6, 'F'); // rechte onderhoeken

    // Scheidingslijn onder header
    dc(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, y + 13, W - M, y + 13);

    // Groen vinkje badge (18px = 4.76mm diameter, radius 2.38mm)
    fc(C.green);
    doc.ellipse(M + 7, y + 6.5, 2.4, 2.4, 'F');
    // Vinkje als lijnen (Helvetica ondersteunt ✓ niet in standaard encoding)
    dc(C.paper);
    doc.setLineWidth(0.5);
    doc.line(M + 5.8, y + 6.6, M + 6.7, y + 7.6);
    doc.line(M + 6.7, y + 7.6, M + 8.4, y + 5.4);

    // Titel
    tc(C.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Digitaal ondertekend', M + 13, y + 8);

    // Datum rechts (.meta-min: 10px = 7.5pt, color muted)
    tc(C.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Akkoord · ${fmtDate(signedAt?.slice(0, 10))}`, W - M, y + 8, { align: 'right' });

    // Velden
    let fy = y + 20;
    const fields = [
      ['Ondertekend door', signedByName || '—'],
      ['E-mailadres', signedByEmail || '—'],
      ['Datum en tijd', fmtDateTime(signedAt)],
    ];
    fields.forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      tc(C.muted);
      doc.text(label, M + 5, fy);
      doc.setFont('helvetica', 'bold');
      tc(C.dark);
      doc.text(val, M + 48, fy);
      fy += 5.5;
    });

    // Handtekening afbeelding (rechts) — behoud de aspect ratio van de
    // originele afbeelding zodat de handtekening niet vervormt.
    if (hasImg) {
      try {
        const maxW = 58, maxH = 22;
        let drawW = maxW, drawH = maxH;
        const dims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve(null);
          img.src = sigImgData;
        });
        if (dims && dims.w > 0 && dims.h > 0) {
          const ratio = dims.w / dims.h;
          drawW = maxW;
          drawH = maxW / ratio;
          if (drawH > maxH) { drawH = maxH; drawW = maxH * ratio; }
        }
        const sigX = W - M - drawW - 2;
        const sigY = y + 16;
        doc.addImage(sigImgData, 'PNG', sigX, sigY, drawW, drawH, '', 'FAST');
        dc(C.lineStr);
        doc.setLineWidth(0.3);
        doc.line(sigX, sigY + drawH + 1, sigX + drawW, sigY + drawH + 1);
        tc(C.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(`Handtekening — ${signedByName}`, sigX + drawW, sigY + drawH + 5, { align: 'right' });
      } catch {}
    }

    y += signBlockH + 8;
  }

  // ── FOOTER ────────────────────────────────────────────────────

  const footY = 282;
  dc(C.line);
  doc.setLineWidth(0.3);
  doc.line(M, footY - 3, W - M, footY - 3);

  // LEFT: "Gegenereerd door **BossBase**"
  doc.setFontSize(7.5);
  const genX = M;
  doc.setFont('helvetica', 'normal');
  tc(C.faint);
  const prefixGen = 'Gegenereerd door ';
  doc.text(prefixGen, genX, footY + 4);
  const prefixGenW = doc.getTextWidth(prefixGen);
  doc.setFont('helvetica', 'bold');
  tc(C.muted);
  doc.text('BossBase', genX + prefixGenW, footY + 4);

  // RIGHT: doc reference
  doc.setFont('helvetica', 'normal');
  tc(C.faint);
  const docRef = type === 'factuur'
    ? `Factuur ${document.nummer || ''}`
    : `Offerte ${document.nummer || ''}`;
  doc.text(`${docRef} · Pagina 1 van 1`, W - M, footY + 4, { align: 'right' });
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────

export async function generateFactuurPdf(factuur, regels, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  doc.save(`${factuur.nummer || 'factuur'}.pdf`);
}

export async function generateOffertePdf(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  doc.save(`${offerte.nummer || 'offerte'}.pdf`);
}

export async function previewOffertePdf(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

export async function previewFactuurPdf(factuur, regels, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

export async function getOffertePdfUrl(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  return doc.output('bloburl');
}

export async function getFactuurPdfUrl(factuur, regels, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  return doc.output('bloburl');
}

export async function getOffertePdfBase64(offerte, items, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  return doc.output('datauristring').split(',')[1];
}

export async function getFactuurPdfBase64(factuur, regels, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  return doc.output('datauristring').split(',')[1];
}
