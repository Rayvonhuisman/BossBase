// Afbeeldingen verkleinen vóór ze de opslag in gaan.
//
// De aanleiding: een bedrijfslogo van 2,6 MB stond ongewijzigd in de bucket en
// werd opgehaald bij élke offerte, factuur en werkbon die iemand opende. Dat is
// bandbreedte en laadtijd voor een plaatje dat nergens groter dan 55 mm of 220
// pixels wordt getoond.
//
// Dit is dezelfde aanpak als bereidAfbeeldingVoor() in generatePdf.js — niet
// harder comprimeren, maar niet meer pixels bewaren dan er ooit getoond worden.
// Het verschil: dáár gaat het om één afdrukmaat, hier om het bestand dat alle
// plekken moeten bedienen, dus met ruimere marges.
//
// Faalt er iets (canvas geblokkeerd, formaat dat de browser niet kan decoderen),
// dan gaat het originele bestand alsnog omhoog. Een grote upload is vervelend;
// een mislukte upload is erger.

/**
 * Verkleint een afbeelding tot maxZijde op de langste kant en comprimeert hem.
 *
 * Transparantie: JPEG kent die niet. Met behoudTransparantie blijft een
 * afbeelding mét doorzichtige pixels PNG; zonder doorzichtige pixels wordt
 * altijd de kleinste van beide gekozen.
 *
 * @param {File} file
 * @param {object} opties
 * @param {number} opties.maxZijde   maximum in pixels op de langste kant
 * @param {number} [opties.kwaliteit=0.85] JPEG-kwaliteit
 * @param {boolean} [opties.behoudTransparantie=false]
 * @returns {Promise<{file: File, voor: number, na: number, aangepast: boolean}>}
 */
export async function comprimeerAfbeelding(file, {
  maxZijde, kwaliteit = 0.85, behoudTransparantie = false,
} = {}) {
  const ongewijzigd = { file, voor: file.size, na: file.size, aangepast: false };
  if (!file || !maxZijde) return ongewijzigd;
  // SVG heeft geen pixels om te verkleinen; GIF zou z'n animatie verliezen.
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return ongewijzigd;

  let bron;
  try {
    bron = await laadAfbeelding(file);
  } catch {
    return ongewijzigd;
  }
  if (!bron || !bron.width || !bron.height) return ongewijzigd;

  const langste = Math.max(bron.width, bron.height);
  const schaal = Math.min(1, maxZijde / langste);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bron.width * schaal));
    canvas.height = Math.max(1, Math.round(bron.height * schaal));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bron, 0, 0, canvas.width, canvas.height);

    const heeftTransparantie = behoudTransparantie && bevatTransparantie(ctx, canvas);

    const kandidaten = [];
    const png = await naarBlob(canvas, 'image/png');
    if (png) kandidaten.push({ blob: png, ext: 'png', type: 'image/png' });
    if (!heeftTransparantie) {
      // Op wit samenvoegen: JPEG maakt van doorzichtig anders zwart.
      const wit = document.createElement('canvas');
      wit.width = canvas.width;
      wit.height = canvas.height;
      const wctx = wit.getContext('2d');
      wctx.fillStyle = '#ffffff';
      wctx.fillRect(0, 0, wit.width, wit.height);
      wctx.drawImage(canvas, 0, 0);
      const jpeg = await naarBlob(wit, 'image/jpeg', kwaliteit);
      if (jpeg) kandidaten.push({ blob: jpeg, ext: 'jpg', type: 'image/jpeg' });
    }
    if (!kandidaten.length) return ongewijzigd;

    const beste = kandidaten.reduce((a, b) => (b.blob.size < a.blob.size ? b : a));
    // Groter geworden? Dan is het origineel gewoon beter — dat gebeurt bij een
    // al geoptimaliseerd bestand dat toch niet geschaald hoefde te worden.
    if (beste.blob.size >= file.size) return ongewijzigd;

    const basis = file.name.replace(/\.[^.]+$/, '') || 'afbeelding';
    return {
      file: new File([beste.blob], `${basis}.${beste.ext}`, { type: beste.type }),
      voor: file.size,
      na: beste.blob.size,
      aangepast: true,
    };
  } catch {
    return ongewijzigd;
  } finally {
    if (bron?.close) bron.close();
    if (bron?._url) URL.revokeObjectURL(bron._url);
  }
}

// Via een <img>-element en niet via createImageBitmap: browsers passen de
// EXIF-oriëntatie van een telefoonfoto automatisch toe op een <img>, en na het
// hertekenen zit die draaiing in de pixels. Een foto die scheef stond, staat er
// daarna dus goed op — ook in de PDF.
function laadAfbeelding(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { img._url = url; resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('kan afbeelding niet lezen')); };
    img.src = url;
  });
}

function naarBlob(canvas, type, kwaliteit) {
  return new Promise(resolve => {
    try {
      canvas.toBlob(b => resolve(b), type, kwaliteit);
    } catch {
      resolve(null);
    }
  });
}

// Eén doorzichtige pixel is genoeg reden om PNG te blijven. We kijken op een
// raster in plaats van elke pixel: een logo met transparantie heeft dat langs de
// randen én in de hoeken, en dit scheelt bij een grote afbeelding merkbaar werk.
function bevatTransparantie(ctx, canvas) {
  try {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const stap = Math.max(1, Math.floor((canvas.width * canvas.height) / 40000)) * 4;
    for (let i = 3; i < data.length; i += stap) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    // getImageData kan falen op een getaint canvas; dan het veilige antwoord.
    return true;
  }
}

// ── Gekozen maten ───────────────────────────────────────────────────────────
// Eén plek, zodat de uploadkant en de PDF-kant niet uit elkaar lopen.

/**
 * Bedrijfslogo: 800 px op de langste kant.
 *
 * De grootste afnemer is de PDF: daar staat het logo 55 mm breed, en 55 mm op
 * 300 dpi (de drukstandaard) is 650 pixels. In e-mails is het hooguit 220 CSS-
 * pixels breed, wat op een scherm van 3× om 660 pixels vraagt. In het dashboard
 * is het nooit groter dan 48 px hoog. 800 geeft op beide de ruimte die nodig is,
 * met marge voor een liggend logo dat op de breedte wordt begrensd.
 */
export const LOGO_MAX_ZIJDE = 800;

/**
 * Werkbonfoto: 1600 px op de langste kant.
 *
 * Twee afnemers met verschillende eisen. Op de PDF staat een foto in een vak van
 * 83 × 48 mm, wat op 300 dpi om zo'n 980 pixels vraagt. Maar een klusfoto is
 * bewijsmateriaal: hij wordt aangeklikt en op volledig scherm bekeken om een
 * detail te zien, en dan is 980 te mager. 1600 dekt een breed scherm en houdt
 * inzoomen zinvol, terwijl een telefoonfoto van 4032 px er ruim onder duikt.
 */
export const FOTO_MAX_ZIJDE = 1600;
