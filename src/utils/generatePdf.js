import jsPDF from 'jspdf';

const euro = n => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

function hexToRgb(hex) {
  const h = (hex || '#1DDB62').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [isNaN(r) ? 29 : r, isNaN(g) ? 219 : g, isNaN(b) ? 98 : b];
}

function luminance([r, g, b]) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const fmtDate = d => {
  if (!d) return '—';
  const parts = String(d).slice(0, 10).split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const fmtDateTime = d => {
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

// Ink palette matching the design prototype
const C = {
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
  const W = 210, M = 16, CW = W - 2 * M;
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
          const maxW = 55, maxH = 20;
          const ratio = Math.min(maxW / imgDims.w, maxH / imgDims.h);
          const lw = imgDims.w * ratio, lh = imgDims.h * ratio;
          doc.addImage(logoData, imgFmt, M, y, lw, lh, '', 'FAST');
          headerBottom = Math.max(headerBottom, y + lh);
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
  const docDate = type === 'factuur' ? document.factuurdatum : (document.createdAt || document.created_at)?.slice(0, 10);
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
  const custPostal = customer?.postalCode || customer?.postal_code;
  const custCity = [custPostal, customer?.city].filter(Boolean).join('  ');
  if (custCity) { doc.text(custCity, aanX, aanY); aanY += 4.5; }
  if (customer?.email) { doc.text(customer.email, aanX, aanY); aanY += 4.5; }
  const custPhone = customer?.phone || customer?.phone_number;
  if (custPhone) { doc.text(custPhone, aanX, aanY); aanY += 4.5; }
  const custKvk = customer?.kvk;
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

    doc.text(String(r.aantal ?? 1), COL_X[1] + COL_W[1] - 1, y, { align: 'right' });

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

  if (type === 'factuur') {
    subRow('Subtotaal excl. BTW', euro(document.totaalExcl));
    dc(C.line); doc.setLineWidth(0.3); doc.line(totX, y - 6, W - M, y - 6);
    const btwGroups = {};
    (regels || []).forEach(r => {
      const pct = r.btwPct ?? 21;
      btwGroups[pct] = (btwGroups[pct] || 0) + (r.regelprijs || 0) * pct / 100;
    });
    Object.entries(btwGroups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([pct, amt]) => subRow(`BTW ${pct}%`, euro(amt)));
  } else {
    const btwBedrag = Math.round((document.totaalIncl - document.totaalExcl) * 100) / 100;
    subRow('Subtotaal excl. BTW', euro(document.totaalExcl));
    dc(C.line); doc.setLineWidth(0.3); doc.line(totX, y - 6, W - M, y - 6);
    subRow(`BTW ${document.btwPct ?? 21}%`, euro(btwBedrag));
  }

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
  doc.text(euro(document.totaalIncl), W - M - 3, y + 8, { align: 'right' });

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

    // 'i' badge — aligned with first text line
    const noteTextY = y + 6.5;
    fc(accent);
    doc.ellipse(M + 6, noteTextY - 0.8, 2.1, 2.1, 'F');
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

    // Signature image ophalen — direct dataUrl (verse ondertekening) of via storage
    let sigImgData = null;
    if (document.signatureDataUrl) {
      sigImgData = document.signatureDataUrl;
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
    tc(C.paper);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('✓', M + 7, y + 7.6, { align: 'center' });

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

    // Handtekening afbeelding (rechts)
    if (hasImg) {
      try {
        const sigW = 58, sigH = 15;
        const sigX = W - M - sigW - 2;
        const sigY = y + 16;
        doc.addImage(sigImgData, 'PNG', sigX, sigY, sigW, sigH, '', 'FAST');
        dc(C.lineStr);
        doc.setLineWidth(0.3);
        doc.line(sigX, sigY + sigH + 1, sigX + sigW, sigY + sigH + 1);
        tc(C.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(`Handtekening — ${signedByName}`, sigX + sigW, sigY + sigH + 5, { align: 'right' });
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

export async function previewFactuurPdf(factuur, regels, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

export async function getOffertePdfUrl(offerte, items, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  return doc.output('bloburl');
}

export async function getFactuurPdfUrl(factuur, regels, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  return doc.output('bloburl');
}

export async function getOffertePdfBase64(offerte, items, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'offerte', offerte, items, customer, company);
  return doc.output('datauristring').split(',')[1];
}

export async function getFactuurPdfBase64(factuur, regels, customer, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, 'factuur', factuur, regels, customer, company);
  return doc.output('datauristring').split(',')[1];
}
