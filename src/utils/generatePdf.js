import jsPDF from 'jspdf';

const euro = n => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

function hexToRgb(hex) {
  const h = (hex || '#f97316').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [isNaN(r) ? 249 : r, isNaN(g) ? 115 : g, isNaN(b) ? 22 : b];
}

const fmtDate = d => {
  if (!d) return '—';
  const parts = String(d).slice(0, 10).split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const C = {
  dark:   [17, 24, 39],
  gray:   [107, 114, 128],
  light:  [249, 250, 251],
  border: [229, 231, 235],
  white:  [255, 255, 255],
};

async function imgToBase64(url) {
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

async function buildPdf(doc, type, document, regels, customer, company) {
  const W = 210, M = 18, CW = W - 2 * M;

  const accent = hexToRgb(company?.brandingColor);
  const accentLight = accent.map(v => Math.round(v + (255 - v) * 0.88));

  const tc = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const fc = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const dc = (c) => doc.setDrawColor(c[0], c[1], c[2]);

  let y = M;

  // ── HEADER ─────────────────────────────────────────────────────────────────

  // Logo links
  if (company?.logoUrl) {
    const logoData = await imgToBase64(company.logoUrl);
    if (logoData) {
      try {
        const match = logoData.match(/^data:image\/([^;]+)/i);
        const ext = match?.[1]?.toLowerCase();
        const fmtMap = { jpeg: 'JPEG', jpg: 'JPEG', png: 'PNG', gif: 'GIF', webp: 'WEBP' };
        const imgFmt = fmtMap[ext] || 'JPEG';
        const imgDims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve(null);
          img.src = logoData;
        });
        if (imgDims) {
          const maxWidth = 60, maxHeight = 30;
          const ratio = Math.min(maxWidth / imgDims.w, maxHeight / imgDims.h);
          const logoW = imgDims.w * ratio;
          const logoH = imgDims.h * ratio;
          doc.addImage(logoData, imgFmt, M, y, logoW, logoH, '', 'FAST');
        }
      } catch {}
    }
  }

  // Bedrijfsinfo rechts
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  tc(C.dark);
  doc.text(company?.name || '', W - M, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  tc(C.gray);
  let ry = y + 10;
  if (company?.address) { doc.text(company.address, W - M, ry, { align: 'right' }); ry += 4.5; }
  const companyCity = [company?.postalCode, company?.city].filter(Boolean).join('  ');
  if (companyCity) { doc.text(companyCity, W - M, ry, { align: 'right' }); ry += 4.5; }
  if (company?.email) { doc.text(company.email, W - M, ry, { align: 'right' }); ry += 4.5; }
  if (company?.kvk) { doc.text(`KvK: ${company.kvk}`, W - M, ry, { align: 'right' }); ry += 4.5; }
  if (company?.btwNumber) { doc.text(`BTW: ${company.btwNumber}`, W - M, ry, { align: 'right' }); }

  y = Math.max(y + 26, ry + 4);

  // Accentlijn
  dc(accent);
  doc.setLineWidth(0.7);
  doc.line(M, y, W - M, y);
  y += 10;

  // ── DOCUMENT TITEL ─────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  tc(C.dark);
  const docTitle = document.isCredit ? 'CREDITFACTUUR' : (type === 'factuur' ? 'FACTUUR' : 'OFFERTE');
  doc.text(docTitle, M, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  tc(accent);
  doc.text(document.nummer || '', M, y + 7);
  if (document.isCredit && document.creditNote) {
    tc(C.gray);
    doc.setFontSize(8.5);
    doc.text(document.creditNote, M, y + 14);
    y += 6;
  }
  y += 18;

  // ── KLANT + DOCUMENT INFO (twee kolommen) ──────────────────────────────────

  const col2 = M + CW * 0.5 + 4;
  const custStartY = y;

  // Links: "AAN" + klantgegevens
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  tc(accent);
  doc.text('AAN', M, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  tc(C.dark);
  doc.text(customer?.name || '—', M, y); y += 5.5;
  if (customer?.address) { doc.text(customer.address, M, y); y += 5.5; }
  const custCity = [customer?.postalCode, customer?.city].filter(Boolean).join('  ');
  if (custCity) { doc.text(custCity, M, y); y += 5.5; }
  if (customer?.email) {
    doc.setFontSize(8.5);
    tc(C.gray);
    doc.text(customer.email, M, y); y += 5.5;
  }

  // Rechts: document metagegevens
  let infoY = custStartY;
  const infoRow = (label, val) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    tc(C.gray);
    doc.text(label, col2, infoY);
    tc(C.dark);
    doc.text(val || '—', col2 + 33, infoY);
    infoY += 5.5;
  };

  infoRow(type === 'factuur' ? 'Factuurnummer' : 'Offertenummer', document.nummer);
  infoRow('Datum', fmtDate(type === 'factuur' ? document.factuurdatum : document.createdAt?.slice(0, 10)));
  if (type === 'factuur') {
    infoRow('Vervaldatum', fmtDate(document.vervaldatum));
    if (document.betalingskenmerk) infoRow('Betalingskenmerk', document.betalingskenmerk);
  } else {
    infoRow('Geldig tot', fmtDate(document.geldigTot));
  }

  y = Math.max(y, infoY) + 10;

  // ── REGELITEMS TABEL ───────────────────────────────────────────────────────

  const COL_PERC = [0.40, 0.10, 0.19, 0.11, 0.20];
  const COL_W = COL_PERC.map(p => CW * p);
  const COL_X = [];
  let cx = M;
  COL_W.forEach(w => { COL_X.push(cx); cx += w; });
  const ROW_H = 7;
  const HEADERS = ['Omschrijving', 'Aantal', 'Eenheidsprijs', 'BTW', 'Bedrag'];

  // Tabel header
  fc(accent);
  doc.rect(M, y, CW, ROW_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  tc(C.white);
  HEADERS.forEach((h, i) => {
    const isRight = i === 4;
    const x = isRight ? COL_X[i] + COL_W[i] - 2 : COL_X[i] + 2;
    doc.text(h, x, y + ROW_H - 2, { align: isRight ? 'right' : 'left' });
  });
  y += ROW_H;

  // Rijen
  (regels || []).forEach((r, idx) => {
    if (y > 245) return; // pagina-overflow bewaking (simpel)

    if (idx % 2 === 0) {
      fc(C.light);
      doc.rect(M, y, CW, ROW_H, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    tc(C.dark);

    // Type label + omschrijving
    const typeLabel = r.type ? `[${r.type}] ` : '';
    const omschr = typeLabel + (r.omschrijving || '');
    const omschrLines = doc.splitTextToSize(omschr, COL_W[0] - 4);
    doc.text(omschrLines[0] || '', COL_X[0] + 2, y + ROW_H - 2);

    // Aantal
    const isVast = r.type === 'vast';
    doc.text(isVast ? '—' : String(r.aantal ?? 1), COL_X[1] + 2, y + ROW_H - 2);

    // Eenheidsprijs
    const prijs = type === 'factuur' ? r.eenheidsprijs : r.prijsPer;
    doc.text(euro(prijs), COL_X[2] + 2, y + ROW_H - 2);

    // BTW
    const btwPct = r.btwPct !== undefined ? r.btwPct : (document.btwPct ?? 21);
    doc.text(`${btwPct}%`, COL_X[3] + 2, y + ROW_H - 2);

    // Bedrag
    const bedrag = type === 'factuur' ? r.regelprijs : r.subtotaal;
    doc.text(euro(bedrag), COL_X[4] + COL_W[4] - 2, y + ROW_H - 2, { align: 'right' });

    y += ROW_H;
  });

  y += 6;

  // ── TOTALEN ────────────────────────────────────────────────────────────────

  const totLeft = M + CW * 0.6;
  const totW = W - M - totLeft;

  const totRow = (label, val, isFinal = false) => {
    if (isFinal) {
      fc(accentLight);
      doc.rect(totLeft - 4, y - 4.5, totW + 4, 8, 'F');
    }
    doc.setFont('helvetica', isFinal ? 'bold' : 'normal');
    doc.setFontSize(isFinal ? 10 : 8.5);
    tc(isFinal ? C.dark : C.gray);
    doc.text(label, totLeft, y);
    tc(isFinal ? accent : C.dark);
    doc.text(val, W - M, y, { align: 'right' });
    y += 7;
  };

  if (type === 'factuur') {
    totRow('Subtotaal excl. BTW', euro(document.totaalExcl));
    const btwGroups = {};
    (regels || []).forEach(r => {
      const pct = r.btwPct ?? 21;
      btwGroups[pct] = (btwGroups[pct] || 0) + (r.regelprijs || 0) * pct / 100;
    });
    Object.entries(btwGroups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([pct, amt]) => totRow(`BTW ${pct}%`, euro(amt)));
    totRow('Totaal incl. BTW', euro(document.totaalIncl), true);
  } else {
    const btwBedrag = Math.round((document.totaalIncl - document.totaalExcl) * 100) / 100;
    totRow('Subtotaal excl. BTW', euro(document.totaalExcl));
    totRow(`BTW ${document.btwPct ?? 21}%`, euro(btwBedrag));
    totRow('Totaal incl. BTW', euro(document.totaalIncl), true);
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────

  const footY = 276;
  dc(C.border);
  doc.setLineWidth(0.3);
  doc.line(M, footY - 5, W - M, footY - 5);

  const notes = document.notities || document.notes;
  if (notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    tc(C.gray);
    const lines = doc.splitTextToSize(notes, CW * 0.65);
    doc.text(lines.slice(0, 4), M, footY);
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  tc(C.gray);
  doc.text('Gegenereerd door BossBase', W - M, footY + 7, { align: 'right' });
}

export async function generateFactuurPdf(factuur, regels, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  doc.save(`${factuur.nummer || 'factuur'}.pdf`);
}

export async function generateOffertePdf(offerte, items, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  doc.save(`${offerte.nummer || 'offerte'}.pdf`);
}

export async function previewOffertePdf(offerte, items, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}
