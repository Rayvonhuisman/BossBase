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
// De PDF wordt in de BROWSER gebouwd, onder de sessie van de gebruiker of via de
// publieke sign-token-functies. Nooit server-side met de service-role, want dat
// zou precies de afscherming omzeilen die hierboven staat.

import {
  loadJsPDF, hexToRgb, luminance, fmtDate, fmtDateTime, imgToBase64,
  bereidAfbeeldingVoor, C,
} from './generatePdf.js';

const W = 210, M = 16, CW = W - 2 * M;
const PAGE_BOTTOM = 272; // onder deze y past niets meer; footer staat op 282

const uurFmt = n => `${Number(n || 0).toFixed(2).replace('.', ',')} u`;
const aantalFmt = n => Number(n ?? 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 });

const tijdFmt = t => (t ? String(t).slice(0, 5) : null);

/**
 * Bouwt de werkbon-PDF.
 *
 * @param {object} doc      jsPDF-document
 * @param {object} werkbon  { nummer, titel, omschrijving, locatie, geplandOp,
 *                            gestartOp, afgerondOp, ondertekendOp,
 *                            ondertekendDoorNaam, ondertekendDoorEmail,
 *                            handtekeningDataUrl | handtekeningUrl }
 * @param {object} data     { taken, uren, materialen, notities, fotos }
 * @param {object} customer klantgegevens
 * @param {object} company  bedrijfsgegevens incl. brandingColor/logoUrl
 */
async function buildWerkbonPdf(doc, werkbon, data, customer, company) {
  const { taken = [], uren = [], materialen = [], meerwerk = [], notities = [], fotos = [] } = data || {};
  const accent = hexToRgb(company?.brandingColor);
  const accentInk = luminance(accent) > 0.62 ? C.dark : C.paper;

  const tc = c => doc.setTextColor(c[0], c[1], c[2]);
  const fc = c => doc.setFillColor(c[0], c[1], c[2]);
  const dc = c => doc.setDrawColor(c[0], c[1], c[2]);

  // Elke pagina begint met dezelfde accentband, zodat een werkbon met veel
  // foto's er op pagina 3 niet ineens anders uitziet.
  const bandje = () => { fc(accent); doc.rect(0, 0, W, 1.6, 'F'); };
  bandje();

  let y = 17;
  let paginas = 1;

  /** Nieuwe pagina zodra `nodig` mm niet meer past. Geeft terug of hij sprong. */
  const ruimte = (nodig) => {
    if (y + nodig <= PAGE_BOTTOM) return false;
    doc.addPage();
    paginas += 1;
    bandje();
    y = 17;
    return true;
  };

  // ── HEADER ──────────────────────────────────────────────────────────────
  let headerBottom = y;
  if (company?.logoUrl) {
    const logoData = await imgToBase64(company.logoUrl);
    if (logoData) {
      try {
        const logo = await bereidAfbeeldingVoor(logoData, 55, 20);
        if (logo) {
          doc.addImage(logo.dataUrl, logo.formaat, M, y, logo.breedte, logo.hoogte, '', 'FAST');
          headerBottom = Math.max(headerBottom, y + logo.hoogte);
        }
      } catch { /* logo is niet essentieel */ }
    }
  } else if (company?.name) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); tc(C.dark);
    doc.text(company.name, M, y + 9);
    headerBottom = Math.max(headerBottom, y + 13);
  }

  let ry = y + 1;
  if (company?.name) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(C.dark);
    doc.text(company.name, W - M, ry, { align: 'right' }); ry += 5;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
  if (company?.address) { doc.text(company.address, W - M, ry, { align: 'right' }); ry += 4; }
  const compCity = [company?.postalCode, company?.city].filter(Boolean).join('  ');
  if (compCity) { doc.text(compCity, W - M, ry, { align: 'right' }); ry += 4; }
  if (company?.email) { doc.text(company.email, W - M, ry, { align: 'right' }); ry += 4; }
  if (company?.phone) { doc.text(company.phone, W - M, ry, { align: 'right' }); ry += 4; }

  y = Math.max(headerBottom, ry) + 9;

  // ── TITEL ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30); tc(C.dark);
  doc.text('Werkbon', M, y + 11);
  doc.setFontSize(30); tc(accent);
  doc.text(werkbon?.nummer || '', M, y + 21);

  const metaX = W - M - 72;
  let metaY = y + 8;
  const metaRow = (label, val) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(C.muted);
    doc.text(label, metaX, metaY);
    doc.setFont('helvetica', 'bold'); tc(C.dark);
    doc.text(val || '', W - M, metaY, { align: 'right' });
    metaY += 5;
  };
  metaRow('Werkbonnummer', werkbon?.nummer);
  const uitgevoerdOp = werkbon?.afgerondOp || werkbon?.gestartOp || werkbon?.geplandOp;
  metaRow('Uitgevoerd op', fmtDate(uitgevoerdOp ? String(uitgevoerdOp).slice(0, 10) : null));
  if (werkbon?.locatie) {
    // Lange adressen mogen de meta-kolom niet uit lopen.
    const kort = doc.splitTextToSize(werkbon.locatie, 50)[0];
    metaRow('Locatie', kort);
  }
  if (werkbon?.ondertekendOp) {
    metaRow('Ondertekend', fmtDate(String(werkbon.ondertekendOp).slice(0, 10)));
  }

  y = Math.max(y + 26, metaY) + 5;

  // ── PARTIJEN ────────────────────────────────────────────────────────────
  dc(accent); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  const partyStartY = y + 4;
  const colMid = M + CW / 2;

  let vanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
  doc.text('UITGEVOERD DOOR', M, vanY); vanY += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); tc(C.dark);
  if (company?.name) { doc.text(company.name, M, vanY); vanY += 5.5; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
  if (company?.address) { doc.text(company.address, M, vanY); vanY += 4.5; }
  if (compCity) { doc.text(compCity, M, vanY); vanY += 4.5; }
  // Wie er namens het bedrijf voor staat: de uitvoerder(s) en de
  // verantwoordelijke van de werkbon. Bewust NIET afgeleid uit de urenregels —
  // dat zou de namen die we net van de urentabel hebben gehaald hier weer
  // binnenhalen, en het is ook een ander gegeven.
  const uitvoerders = (werkbon?.uitvoerders || []).filter(Boolean);
  if (uitvoerders.length) {
    tc(C.muted);
    doc.splitTextToSize(uitvoerders.join(', '), CW / 2 - 10).slice(0, 2)
      .forEach(r => { doc.text(r, M, vanY); vanY += 4.5; });
  }

  const aanX = colMid + 7;
  let aanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
  doc.text('KLANT', aanX, aanY); aanY += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); tc(C.dark);
  if (customer?.name) { doc.text(customer.name, aanX, aanY); aanY += 5.5; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
  if (customer?.address) { doc.text(customer.address, aanX, aanY); aanY += 4.5; }
  const custCity = [customer?.postcode || customer?.postalCode, customer?.city].filter(Boolean).join('  ');
  if (custCity) { doc.text(custCity, aanX, aanY); aanY += 4.5; }
  if (customer?.email) { doc.text(customer.email, aanX, aanY); aanY += 4.5; }
  if (customer?.phone) { doc.text(customer.phone, aanX, aanY); aanY += 4.5; }

  y = Math.max(vanY, aanY) + 4;
  dc(C.line); doc.setLineWidth(0.3);
  doc.line(colMid, partyStartY, colMid, y - 2);
  doc.line(M, y, W - M, y);
  y += 9;

  // ── Gedeelde bouwstenen voor de blokken hieronder ───────────────────────
  const sectieKop = (titel, extra) => {
    ruimte(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
    doc.text(titel.toUpperCase(), M, y);
    if (extra) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.dark);
      doc.text(extra, W - M, y, { align: 'right' });
    }
    y += 3;
    dc(accent); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
    y += 6;
  };

  const scheiding = () => { dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 3, W - M, y - 3); };

  // ── UITGEVOERD WERK ─────────────────────────────────────────────────────
  const werkTekst = werkbon?.omschrijving || werkbon?.titel || '';
  if (werkTekst) {
    sectieKop('Uitgevoerd werk');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); tc(C.soft);
    const regels = doc.splitTextToSize(werkTekst, CW);
    for (const r of regels) {
      ruimte(6);
      doc.text(r, M, y);
      y += 4.6;
    }
    y += 5;
  }

  // ── TAKEN ───────────────────────────────────────────────────────────────
  // Uitsluitend de afgevinkte taken: dat is het werk waarvoor de klant tekent.
  // De aanroeper zeeft ze al (bouwPdfData) en de sign-token-functie levert ze
  // niet uit; deze filter is het derde slot op dezelfde deur.
  const gedaan = taken.filter(t => t.afgerond);
  if (gedaan.length) {
    sectieKop('Uitgevoerde werkzaamheden');
    gedaan.forEach((t, i) => {
      ruimte(9);
      if (i > 0) scheiding();
      // Vinkje getekend als lijnen — de standaard Helvetica-encoding kent geen ✓.
      fc(C.green); doc.ellipse(M + 2, y - 1.2, 1.9, 1.9, 'F');
      dc(C.paper); doc.setLineWidth(0.45);
      doc.line(M + 1.1, y - 1.2, M + 1.8, y - 0.4);
      doc.line(M + 1.8, y - 0.4, M + 3.1, y - 2.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9); tc(C.dark);
      const regels = doc.splitTextToSize(t.omschrijving || '', CW - 12);
      doc.text(regels[0] || '', M + 7, y);
      y += 7.5;
    });
    y += 4;
  }

  // ── GEWERKTE UREN ───────────────────────────────────────────────────────
  if (uren.length) {
    const totaal = uren.reduce((s, u) => s + Number(u.uren || 0), 0);
    sectieKop('Gewerkte uren', `Totaal ${uurFmt(totaal)}`);
    // Geen kolom MEDEWERKER: wie het werk deed is loonadministratie. Datum,
    // tijden, pauze, opmerking en totaal blijven — dat is wat de uren verklaart.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
    doc.text('DATUM', M, y);
    doc.text('TIJD', M + 34, y);
    doc.text('UREN', W - M, y, { align: 'right' });
    y += 6;
    uren.forEach((u, i) => {
      ruimte(10);
      if (i > 0) scheiding();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); tc(C.dark);
      doc.text(fmtDate(u.datum), M, y);
      doc.setFont('helvetica', 'normal'); tc(C.soft);
      const van = tijdFmt(u.startTijd || u.start_tijd);
      const tot = tijdFmt(u.eindTijd || u.eind_tijd);
      const pauze = Number(u.pauzeMinuten ?? u.pauze_minuten ?? 0);
      doc.text(van && tot ? `${van} – ${tot}${pauze ? ` (${pauze} min pauze)` : ''}` : '', M + 34, y);
      doc.setFont('helvetica', 'bold'); tc(C.dark);
      doc.text(uurFmt(u.uren), W - M, y, { align: 'right' });
      // De opmerking verklaart een uitloop en is voor de klant het antwoord op
      // "waarom stond je daar zo lang" — dus onder de regel, niet ernaast.
      const opmerking = u.notitie || u.opmerking;
      if (opmerking) {
        y += 4.4;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(C.muted);
        const regels = doc.splitTextToSize(opmerking, CW - 40);
        doc.text(regels[0] || '', M + 34, y);
      }
      y += 7;
    });
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 2.5, W - M, y - 2.5);
    y += 8;
  }

  // ── GEBRUIKT MATERIAAL (zonder prijzen — zie kop van dit bestand) ───────
  if (materialen.length) {
    sectieKop('Gebruikt materiaal');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
    doc.text('OMSCHRIJVING', M, y);
    doc.text('AANTAL', W - M, y, { align: 'right' });
    y += 6;
    materialen.forEach((m, i) => {
      ruimte(9);
      if (i > 0) scheiding();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); tc(C.dark);
      doc.text(doc.splitTextToSize(m.naam || '', CW - 40)[0] || '', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
      doc.text(`${aantalFmt(m.aantal)}${m.eenheid ? ` ${m.eenheid}` : ''}`, W - M, y, { align: 'right' });
      y += 7.5;
    });
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 2.5, W - M, y - 2.5);
    y += 8;
  }

  // ── EXTRA UITGEVOERD WERK ───────────────────────────────────────────────
  // Meerwerk staat hier als omschrijving, zonder bedrag. De klant tekent dat het
  // werk is uitgevoerd; wat het kost bepaalt het bedrijf bij het factureren. De
  // interne inschatting van de monteur komt hier dus niet — die is geen prijs.
  if (meerwerk.length) {
    sectieKop('Extra uitgevoerd werk');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(C.muted);
    ruimte(6);
    doc.text('Dit werk zat niet in de oorspronkelijke opdracht.', M, y);
    y += 6;
    meerwerk.forEach((mw, i) => {
      ruimte(9);
      if (i > 0) scheiding();
      // Zelfde vinkje als bij de werkzaamheden: het ís uitgevoerd.
      fc(C.green); doc.ellipse(M + 2, y - 1.2, 1.9, 1.9, 'F');
      dc(C.paper); doc.setLineWidth(0.45);
      doc.line(M + 1.1, y - 1.2, M + 1.8, y - 0.4);
      doc.line(M + 1.8, y - 0.4, M + 3.1, y - 2.2);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); tc(C.dark);
      const regels = doc.splitTextToSize(mw.omschrijving || '', CW - 12);
      doc.text(regels[0] || '', M + 7, y);
      y += 7.5;
    });
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 2.5, W - M, y - 2.5);
    y += 8;
  }

  // ── TOELICHTING VOOR DE KLANT ───────────────────────────────────────────
  // Alleen regels die als klantnotitie zijn gemarkeerd. Interne notities komen
  // hier niet binnen: de aanroeper geeft ze niet mee en de sign-token-functie
  // levert ze niet uit.
  if (notities.length) {
    sectieKop('Toelichting');
    notities.forEach((n, i) => {
      const tekst = n.note || n.body || '';
      if (!tekst) return;
      const regels = doc.splitTextToSize(tekst, CW - 22);
      const blokH = Math.max(13, regels.length * 4 + 10);
      ruimte(blokH + 4);
      fc(C.panel);
      doc.roundedRect(M, y, CW, blokH, 2.1, 2.1, 'F');
      const eersteRegelY = y + (blokH - Math.max(0, regels.length - 1) * 4) / 2 + 1;
      fc(accent); doc.ellipse(M + 6, eersteRegelY - 1, 2.1, 2.1, 'F');
      tc(accentInk); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text('i', M + 6, eersteRegelY, { align: 'center' });
      tc(C.soft); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(regels, M + 11.5, eersteRegelY);
      y += blokH + (i < notities.length - 1 ? 4 : 8);
    });
  }

  // ── FOTO'S ──────────────────────────────────────────────────────────────
  // Twee per rij. De bijschriften komen uit de categorie ("voor", "na", …) —
  // dat is precies waar de foto's bij een discussie voor dienen.
  if (fotos.length) {
    const gap = 6;
    const vakW = (CW - gap) / 2;
    const vakH = 52;
    const pad = 2;

    // Elke foto teruggebracht tot wat er in het vak wordt afgedrukt. Een
    // telefoonfoto is al gauw 4 MB; met acht foto's op een bon is de bijlage
    // anders niet meer te mailen. Zie bereidAfbeeldingVoor in generatePdf.js.
    const geladen = [];
    for (const f of fotos) {
      const dataUrl = f.dataUrl || (f.url ? await imgToBase64(f.url) : null);
      if (!dataUrl) continue;
      const klaar = await bereidAfbeeldingVoor(dataUrl, vakW - pad * 2, vakH - pad * 2);
      if (klaar) geladen.push({ ...klaar, categorie: f.categorie || '' });
    }

    if (geladen.length) {
      sectieKop("Foto's", `${geladen.length} ${geladen.length === 1 ? 'foto' : "foto's"}`);
      for (let i = 0; i < geladen.length; i += 2) {
        const rij = geladen.slice(i, i + 2);
        ruimte(vakH + 9);
        rij.forEach((f, k) => {
          const x = M + k * (vakW + gap);
          dc(C.line); doc.setLineWidth(0.3);
          doc.roundedRect(x, y, vakW, vakH, 2.1, 2.1, 'S');
          // Gecentreerd in het vak, met de originele verhouding — een uitgerekte
          // 'voor'-foto is geen bewijs meer.
          const ix = x + (vakW - f.breedte) / 2;
          const iy = y + (vakH - f.hoogte) / 2;
          try { doc.addImage(f.dataUrl, f.formaat, ix, iy, f.breedte, f.hoogte, '', 'FAST'); } catch { /* sla over */ }
          if (f.categorie) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
            doc.text(f.categorie.toUpperCase(), x, y + vakH + 4);
          }
        });
        y += vakH + 9;
      }
      y += 2;
    }
  }

  // ── HANDTEKENING ────────────────────────────────────────────────────────
  // Zelfde blok als op de ondertekende offerte, zodat een klant die beide krijgt
  // hetzelfde bewijsstuk herkent.
  const ondertekendOp = werkbon?.ondertekendOp || werkbon?.ondertekend_op;
  if (ondertekendOp) {
    const naam = werkbon.ondertekendDoorNaam || werkbon.ondertekend_door_naam || '';
    const email = werkbon.ondertekendDoorEmail || werkbon.ondertekend_door_email || '';
    let sigData = werkbon.handtekeningDataUrl || null;
    if (!sigData && werkbon.handtekeningUrl) sigData = await imgToBase64(werkbon.handtekeningUrl);

    const hasImg = Boolean(sigData);
    const blokH = hasImg ? 52 : 42;
    ruimte(blokH + 6);

    dc(C.lineStr); doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, blokH, 2.1, 2.1, 'S');
    fc(C.panel);
    doc.roundedRect(M, y, CW, 13, 2.1, 2.1, 'F');
    doc.rect(M, y + 7, CW, 6, 'F');
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y + 13, W - M, y + 13);

    fc(C.green); doc.ellipse(M + 7, y + 6.5, 2.4, 2.4, 'F');
    dc(C.paper); doc.setLineWidth(0.5);
    doc.line(M + 5.8, y + 6.6, M + 6.7, y + 7.6);
    doc.line(M + 6.7, y + 7.6, M + 8.4, y + 5.4);

    tc(C.dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Akkoord met het uitgevoerde werk', M + 13, y + 8);
    tc(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`Ondertekend · ${fmtDate(String(ondertekendOp).slice(0, 10))}`, W - M, y + 8, { align: 'right' });

    let fy = y + 20;
    [['Ondertekend door', naam || ''],
     ['E-mailadres', email || ''],
     ['Datum en tijd', fmtDateTime(ondertekendOp)]].forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.muted);
      doc.text(label, M + 5, fy);
      doc.setFont('helvetica', 'bold'); tc(C.dark);
      doc.text(val, M + 48, fy);
      fy += 5.5;
    });

    if (hasImg) {
      try {
        const dims = await imgDims(sigData);
        const maxW = 58, maxH = 22;
        let drawW = maxW, drawH = maxH;
        if (dims?.w > 0 && dims?.h > 0) {
          drawW = maxW; drawH = maxW / (dims.w / dims.h);
          if (drawH > maxH) { drawH = maxH; drawW = maxH * (dims.w / dims.h); }
        }
        const sigX = W - M - drawW - 2;
        const sigY = y + 16;
        doc.addImage(sigData, 'PNG', sigX, sigY, drawW, drawH, '', 'FAST');
        dc(C.lineStr); doc.setLineWidth(0.3);
        doc.line(sigX, sigY + drawH + 1, sigX + drawW, sigY + drawH + 1);
        tc(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text(`Handtekening — ${naam}`, sigX + drawW, sigY + drawH + 5, { align: 'right' });
      } catch { /* zonder afbeelding blijven de velden staan */ }
    }
    y += blokH + 8;
  } else {
    // Nog niet getekend: een leeg vak, zodat een uitgeprinte bon ter plekke met
    // pen kan worden afgetekend als de telefoon leeg is.
    ruimte(40);
    dc(C.lineStr); doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, 34, 2.1, 2.1, 'S');
    tc(C.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text('AKKOORD MET HET UITGEVOERDE WERK', M + 5, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text('Naam', M + 5, y + 17);
    doc.text('Datum', M + 5, y + 27);
    dc(C.line); doc.setLineWidth(0.3);
    doc.line(M + 22, y + 18, M + 90, y + 18);
    doc.line(M + 22, y + 28, M + 90, y + 28);
    doc.text('Handtekening', W - M - 62, y + 27);
    doc.line(W - M - 62, y + 20, W - M - 5, y + 20);
    y += 40;
  }

  // ── FOOTER op elke pagina ───────────────────────────────────────────────
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    const footY = 282;
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, footY - 3, W - M, footY - 3);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal'); tc(C.faint);
    const prefix = 'Gegenereerd door ';
    doc.text(prefix, M, footY + 4);
    doc.setFont('helvetica', 'bold'); tc(C.muted);
    doc.text('BossBase', M + doc.getTextWidth(prefix), footY + 4);
    doc.setFont('helvetica', 'normal'); tc(C.faint);
    doc.text(`Werkbon ${werkbon?.nummer || ''} · Pagina ${p} van ${paginas}`, W - M, footY + 4, { align: 'right' });
  }
}

function imgDims(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function nieuwDoc(werkbon, data, customer, company) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildWerkbonPdf(doc, werkbon, data, customer, company);
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
