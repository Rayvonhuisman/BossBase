// Herstel bij een laadfout, zodat de gebruiker nooit een wit scherm ziet.
//
// De meest voorkomende oorzaak: er is een nieuwe versie gepubliceerd terwijl
// het tabblad nog de oude draait. Een onderdeel dat pas later wordt geladen
// (bijvoorbeeld na het inloggen) heeft dan een bestandsnaam die niet meer
// bestaat. Eén keer herladen haalt de nieuwe versie op en lost dat op.
// Lukt het daarna nog niet, dan tonen we een melding met een herlaadknop in
// plaats van een lege pagina.

const SLEUTEL = 'bb.herladenNaLaadfout';
const VENSTER_MS = 30_000;

export function isLaadfout(fout) {
  const tekst = String(fout?.message || fout || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(tekst);
}

/** Herlaadt één keer per 30 seconden; geeft false als dat al net gebeurd is. */
export function herlaadEenmaal() {
  try {
    const vorige = Number(sessionStorage.getItem(SLEUTEL) || 0);
    if (Date.now() - vorige < VENSTER_MS) return false;
    sessionStorage.setItem(SLEUTEL, String(Date.now()));
  } catch {
    // Geen sessionStorage (privémodus): niet automatisch herladen, om een lus te voorkomen.
    return false;
  }
  window.location.reload();
  return true;
}

/** Melding zonder React: werkt ook als de app zelf niet kon laden. */
export function toonLaadfout(fout) {
  console.error('[bb] laden mislukt', fout);
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  const kader = document.createElement('div');
  kader.setAttribute('role', 'alert');
  kader.style.cssText = 'max-width:520px;margin:12vh auto;padding:28px;font-family:Inter,system-ui,sans-serif;color:#0D0D0D;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.06)';
  const configuratie = fout?.name === 'ConfiguratieFout';
  const kop = document.createElement('h1');
  kop.textContent = configuratie ? 'BossBase is niet goed ingesteld' : 'BossBase kon niet goed laden';
  kop.style.cssText = 'font-size:20px;margin:0 0 10px';
  const tekst = document.createElement('p');
  tekst.textContent = configuratie
    ? 'Deze omgeving mist de instellingen voor de verbinding met de database. Dit is geen fout aan jouw kant; meld het aan info@bossbase.nl.'
    : 'Waarschijnlijk is er net een nieuwe versie verschenen, of was de verbinding even weg. Laad de pagina opnieuw. Blijft dit gebeuren, mail dan naar info@bossbase.nl.';
  tekst.style.cssText = 'margin:0 0 18px;line-height:1.55;color:#374151';
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.textContent = 'Pagina opnieuw laden';
  knop.style.cssText = 'padding:11px 18px;border-radius:10px;border:0;background:#1DDB62;color:#0D0D0D;font-weight:700;font-size:15px;cursor:pointer';
  knop.addEventListener('click', () => window.location.reload());
  const detail = document.createElement('pre');
  detail.textContent = String(fout?.message || fout || 'Onbekende fout');
  detail.style.cssText = 'margin:18px 0 0;font-size:12px;color:#374151;background:#f5f4f1;border-radius:8px;padding:12px;white-space:pre-wrap;word-break:break-word';
  kader.append(kop, tekst, knop, detail);
  root.append(kader);
}

/** Vite meldt een mislukte dynamische import met dit event. */
export function installeerLaadfoutHerstel() {
  window.addEventListener('vite:preloadError', event => {
    event.preventDefault();
    if (!herlaadEenmaal()) toonLaadfout(event.payload);
  });
}
