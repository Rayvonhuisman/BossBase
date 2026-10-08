import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ImagePlus, RotateCw, X, FileText, Info, Minus, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { Logo } from '../bb-shared.jsx';
import {
  PAKKETTEN, getPakket, HOSTING_PER_MAAND, DOMEIN_PER_JAAR, EMAIL_PER_MAAND, TERMIJNEN,
  upgradePrijs, perTermijn, euroBedrag, extrasVoor, extrasPrijs, getExtra,
} from '../lib/website.js';
import { BEDRIJF_VELDEN, stappenVoor, veldenVoor, ontbrekendeZaken, keuzeUit } from '../lib/websiteIntakeVelden.js';
import './websiteIntake.css';

// ── INTAKE GRATIS WEBSITE ────────────────────────────────────────────────────
// Publieke pagina op /intake/<sleutel>. De klant is niet ingelogd; alles hangt
// aan de sleutel uit de link, die supabase/functions/website-intake controleert.
// Zonder geldige sleutel laat deze pagina geen enkel bedrijfsgegeven zien.
//
// Opbouw overgenomen van de intake van NG Digital: één onderwerp per stap, heen
// en weer, en alles wordt onderweg in de browser bewaard. De sleutels van de
// antwoorden zijn de sleutels uit het contentbestand van een klantsite
// (`bedrijf.naam`, `diensten.items[1].titel`), zodat een inzending later zonder
// vertaalslag om te zetten is.
//
// Foto's gaan rechtstreeks van de browser naar de private bucket website-intake,
// met een ondertekende upload-URL per bestand. In de antwoorden staat alleen
// naam en pad; een blob-adres overleeft het bewaren niet.

const TOEGESTAAN_ATTR = '.jpg,.jpeg,.png,.webp,.heic,.heif,.svg,.gif,.pdf';
const MAX_BYTES = 25 * 1024 * 1024;
const VERKLEIN_VANAF = 1_200_000;
const MAX_ZIJDE = 2400;

// ── Server ──────────────────────────────────────────────────────────────────

// Leesbare fout uit een functie-aanroep. Bij een non-2xx zit de JSON-body met
// onze eigen melding in error.context; de standaardmelding van supabase-js
// ("Edge Function returned a non-2xx status code") zegt een klant niets.
async function roep(actie, extra = {}) {
  const { data, error } = await supabase.functions.invoke('website-intake', { body: { actie, ...extra } });
  if (!error) return data;
  let body = null;
  try { body = await error.context?.json(); } catch { /* geen json */ }
  const fout = new Error(body?.error || 'De verbinding met BossBase lukte niet. Probeer het zo nog eens.');
  fout.code = body?.code || null;
  throw fout;
}

// Nepdata om de stappen lokaal te kunnen doorlopen (alleen in de devserver,
// met ?demo=1). Komt nooit in een productiebundel terecht.
const DEMO = import.meta.env.DEV && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('demo');
const DEMO_LAAD = {
  bedrijf: {
    naam: 'Hoveniersbedrijf Duinrand', email: 'info@duinrand.nl', telefoon: '072 - 512 34 56',
    straat: 'Landweg 27', postcode: '1861 EK', plaats: 'Bergen', kvk: '37129845', btw: '',
    website: 'www.duinrand.nl', branche: 'Hovenier', logoUrl: '/brand/icon-512.png',
  },
  verlooptOp: new Date(Date.now() + 29 * 86400_000).toISOString(),
  termijnenMogelijk: true,
};

// ── Bestanden ───────────────────────────────────────────────────────────────

function mimeVanNaam(naam) {
  const ext = String(naam).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml', gif: 'image/gif', pdf: 'application/pdf',
  }[ext];
}

// Grote foto's eerst verkleinen: tien telefoonfoto's van 8 MB zijn op een
// trage verbinding niet te doen. HEIC kan een browser niet op een canvas
// tekenen; die gaat ongewijzigd mee. Lukt verkleinen niet, dan het origineel.
async function verklein(bestand) {
  const type = bestand.type || mimeVanNaam(bestand.name) || '';
  const metType = () => (bestand.type || !type ? bestand : new File([bestand], bestand.name, { type }));
  if (!/^image\/(jpeg|png|webp)$/.test(type) || bestand.size <= VERKLEIN_VANAF) return metType();
  try {
    const bitmap = await createImageBitmap(bestand);
    const factor = Math.min(1, MAX_ZIJDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * factor);
    canvas.height = Math.round(bitmap.height * factor);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(klaar => canvas.toBlob(klaar, 'image/jpeg', 0.82));
    if (!blob || blob.size >= bestand.size) return metType();
    return new File([blob], bestand.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return metType();
  }
}

async function upload(sleutel, bestand) {
  const klaar = await verklein(bestand);
  const type = klaar.type || mimeVanNaam(klaar.name) || '';
  if (DEMO) { await new Promise(r => setTimeout(r, 700)); return `demo/${klaar.name}`; }
  const { pad, token } = await roep('upload', { sleutel, naam: klaar.name, type, grootte: klaar.size });
  const { error } = await supabase.storage.from('website-intake').uploadToSignedUrl(pad, token, klaar, { contentType: type });
  if (error) throw new Error(/size|large/i.test(error.message) ? 'Dit bestand is te groot. Maximaal 25 MB.' : 'Uploaden mislukt. Probeer het opnieuw.');
  return pad;
}

const nieuweId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Bewaren ─────────────────────────────────────────────────────────────────

// Per link een eigen plek. Niet de hele sleutel in de opslag: een prefix is
// genoeg om twee intakes op één computer uit elkaar te houden.
const opslagSleutel = sleutel => `bb-intake-${String(sleutel).slice(0, 12)}`;

function leesBewaard(sleutel) {
  try {
    const ruw = localStorage.getItem(opslagSleutel(sleutel));
    if (!ruw) return null;
    const d = JSON.parse(ruw);
    return d?.antwoorden ? d : null;
  } catch { return null; }
}

// Foto's die nog niet in de opslag stonden toen de pagina sloot, zijn weg: de
// blob-voorvertoning bestaat na herladen niet meer en het bestand ook niet.
function zonderHalveUploads(antwoorden) {
  const uit = {};
  for (const [k, v] of Object.entries(antwoorden || {})) {
    uit[k] = Array.isArray(v) && v.some(f => f && typeof f === 'object' && 'id' in f)
      ? v.filter(f => f.pad).map(f => ({ id: f.id, naam: f.naam, pad: f.pad }))
      : v;
  }
  return uit;
}

// Wat er naar de server gaat: bij bestanden alleen naam en pad.
function opgeschoond(antwoorden) {
  const uit = {};
  for (const [k, v] of Object.entries(antwoorden)) {
    uit[k] = Array.isArray(v) && v.some(f => f && typeof f === 'object' && 'id' in f)
      ? v.filter(f => f.pad).map(f => ({ naam: f.naam, pad: f.pad }))
      : v;
  }
  return uit;
}

const vooraf = b => ({
  'bedrijf.naam': b.naam || '',
  'bedrijf.branche': b.branche || '',
  'bedrijf.telefoon': b.telefoon || '',
  'bedrijf.email': b.email || '',
  'bedrijf.adres.straat': b.straat || '',
  'bedrijf.adres.postcode': b.postcode || '',
  'bedrijf.adres.plaats': b.plaats || '',
  'bedrijf.kvk': b.kvk || '',
  'bedrijf.btw': b.btw || '',
  'huisstijl.huidigeSite': b.website || '',
  'huisstijl.logoKeuze': b.logoUrl ? 'huidig' : 'ander',
  'website.pakket': 'basis',
  'website.betaalwijze': 'ideal',
});

// ════════════════════════════════════════════════════════════════════════════

export default function WebsiteIntake({ sleutel }) {
  if (!sleutel || sleutel === 'bedankt') return <Bedankt />;
  return <Laden sleutel={sleutel} />;
}

function Schil({ bedrijf, children }) {
  return (
    <div className="wi">
      <header className="wi-kop">
        <div className="wi-kop-in">
          <a href="https://www.bossbase.nl" className="wi-logo" aria-label="BossBase"><Logo /></a>
          <span className="wi-kop-titel">
            Intake gratis website{bedrijf ? <span className="wi-kop-bedrijf"> · {bedrijf}</span> : null}
          </span>
        </div>
      </header>
      <main className="wi-main">{children}</main>
      <footer className="wi-voet">
        BossBase, een handelsnaam van NG E-Commerce B.V. · <a href="/voorwaarden" target="_blank" rel="noreferrer">Algemene voorwaarden</a> · <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
      </footer>
    </div>
  );
}

function Melding({ titel, children }) {
  return (
    <Schil>
      <div className="wi-melding">
        <h1>{titel}</h1>
        {children}
      </div>
    </Schil>
  );
}

function Bedankt() {
  const betaling = new URLSearchParams(window.location.search).get('betaling');
  // Betaald: de bewaarde antwoorden zijn niet meer nodig.
  if (betaling === 'gelukt') {
    try { Object.keys(localStorage).filter(k => k.startsWith('bb-intake-')).forEach(k => localStorage.removeItem(k)); } catch { /* geen opslag */ }
  }
  if (betaling === 'afgebroken') {
    return (
      <Melding titel="Je intake is binnen">
        <p>De betaling is niet afgerond. Geen probleem: je rondt hem af in BossBase onder <strong>Website</strong>.</p>
        <a className="wi-knop wi-knop-p" href="/dashboard/website">Naar Website in BossBase</a>
      </Melding>
    );
  }
  return (
    <Melding titel={betaling === 'gelukt' ? 'Bedankt, betaling ontvangen' : 'Bedankt, je intake is binnen'}>
      <p>
        {betaling === 'gelukt' ? 'Je betaling is gelukt en je intake is verstuurd. Je krijgt een bevestiging per mail. ' : 'We hebben je intake ontvangen. '}
        We gaan aan de slag. Zodra er een eerste versie staat, krijg je een link om hem te bekijken.
      </p>
      <p>Hoe ver we zijn, zie je in BossBase onder <strong>Website</strong>.</p>
      <a className="wi-knop wi-knop-p" href="/dashboard/website">Naar Website in BossBase</a>
    </Melding>
  );
}

function Laden({ sleutel }) {
  const [stand, setStand] = useState({ laden: true });

  useEffect(() => {
    let leeft = true;
    (DEMO ? Promise.resolve(DEMO_LAAD) : roep('laad', { sleutel }))
      .then(d => leeft && setStand({ data: d }))
      .catch(e => leeft && setStand({ fout: e }));
    return () => { leeft = false; };
  }, [sleutel]);

  if (stand.laden) return <Schil><div className="wi-laden">Even laden…</div></Schil>;
  if (stand.fout) {
    if (stand.fout.code === 'al_ingevuld') {
      return (
        <Melding titel="Je intake is al binnen">
          <p>Hoe ver we zijn, zie je in BossBase onder <strong>Website</strong>.</p>
          <a className="wi-knop wi-knop-p" href="/dashboard/website">Naar Website in BossBase</a>
        </Melding>
      );
    }
    if (stand.fout.code === 'ongeldige_sleutel') {
      return (
        <Melding titel="Deze link werkt niet meer">
          <p>Een intakelink is 30 dagen geldig en werkt niet meer nadat de intake is verstuurd.</p>
          <p>Log in bij BossBase en open <strong>Website</strong> in het menu. Daar maak je met één klik een nieuwe link.</p>
          <a className="wi-knop wi-knop-p" href="/dashboard/website">Naar Website in BossBase</a>
        </Melding>
      );
    }
    return (
      <Melding titel="Laden mislukt">
        <p>{stand.fout.message}</p>
        <button type="button" className="wi-knop wi-knop-p" onClick={() => window.location.reload()}>Opnieuw proberen</button>
      </Melding>
    );
  }
  return <Formulier sleutel={sleutel} laad={stand.data} />;
}

// ── Het formulier ───────────────────────────────────────────────────────────

function Formulier({ sleutel, laad }) {
  const [begin] = useState(() => leesBewaard(sleutel));
  const [antwoorden, setAntwoorden] = useState(() => ({ ...vooraf(laad.bedrijf), ...zonderHalveUploads(begin?.antwoorden) }));
  const [rijen, setRijen] = useState(() => begin?.rijen || {});
  // Terug van een betaling die niet lukte: naar de laatste stap, met melding.
  const [afgebroken] = useState(() => new URLSearchParams(window.location.search).get('betaling') === 'afgebroken');
  const [stap, setStap] = useState(() => (afgebroken ? 99 : begin?.stap || 0));
  const [fouten, setFouten] = useState({});
  const [hervat, setHervat] = useState(Boolean(begin));
  const [bezig, setBezig] = useState(false);
  const [verzendfout, setVerzendfout] = useState(null);
  const bovenkant = useRef(null);

  // Wat er gevraagd wordt hangt af van pakket, extra's, domein en e-mail.
  const keuze = keuzeUit(antwoorden);
  const pakket = keuze.pakket;
  const stappen = [
    { sleutel: 'bedrijf', titel: 'Je bedrijf' },
    { sleutel: 'pakket', titel: 'Je pakket' },
    ...stappenVoor(keuze),
  ];
  const huidigeStap = Math.min(stap, stappen.length - 1);
  const huidig = stappen[huidigeStap];
  const laatste = huidigeStap === stappen.length - 1;
  const bedrag = upgradePrijs('basis', pakket, true) + extrasPrijs(keuze.extras, pakket, true);

  useEffect(() => {
    try { localStorage.setItem(opslagSleutel(sleutel), JSON.stringify({ antwoorden: zonderHalveUploads(antwoorden), rijen, stap: huidigeStap })); }
    catch { /* volle of geblokkeerde opslag mag het invullen niet stilleggen */ }
  }, [antwoorden, rijen, huidigeStap, sleutel]);

  // Een waarde, of een functie die de vorige lijst omzet. Uploads lopen naast
  // elkaar en zouden elkaars wijziging overschrijven als ze allemaal van
  // dezelfde momentopname uitgingen.
  const zet = useCallback((naam, waarde) => {
    setAntwoorden(v => ({
      ...v,
      [naam]: typeof waarde === 'function' ? waarde(Array.isArray(v[naam]) ? v[naam] : []) : waarde,
    }));
    setFouten(v => {
      if (!v[naam]) return v;
      const rest = { ...v }; delete rest[naam]; return rest;
    });
  }, []);

  // Nooit meer rijen dan de keuze toelaat: wie een extra pagina weer
  // uitzet, ziet die rij ook niet meer.
  const aantalRijen = h => Math.min(h.maximum, rijen[h.naam] ?? Math.max(h.start, h.minimum));

  function controleer() {
    const nieuw = {};
    const vervalt = s => s !== undefined && antwoorden[s] === true;
    const check = (veld, naam, geenNaam) => {
      if (!veld.verplicht || vervalt(geenNaam)) return;
      const w = antwoorden[naam];
      if (veld.type === 'fotos') {
        const lijst = Array.isArray(w) ? w : [];
        const klaar = lijst.filter(f => f?.pad);
        if (klaar.length < (veld.minimum ?? 1)) {
          nieuw[naam] = lijst.length > klaar.length
            ? 'Deze bestanden zijn nog niet klaar met uploaden, of er ging iets mis.'
            : 'Hier hebben we minstens één foto nodig.';
        }
      } else if (veld.type === 'aanvinken') {
        if (w !== true) nieuw[naam] = 'Zet hier even een vinkje.';
      } else if (typeof w !== 'string' || !w.trim()) {
        nieuw[naam] = 'Dit veld hebben we nodig om verder te kunnen.';
      } else if (veld.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w.trim())) {
        nieuw[naam] = 'Dit lijkt geen geldig e-mailadres.';
      }
    };

    if (huidig.sleutel === 'bedrijf') {
      for (const v of BEDRIJF_VELDEN) check(v, v.naam, v.geenOptie?.naam);
      if (antwoorden['huisstijl.logoKeuze'] !== 'huidig') {
        const logo = Array.isArray(antwoorden['huisstijl.logo']) ? antwoorden['huisstijl.logo'] : [];
        if (logo.some(f => !f.pad)) nieuw['huisstijl.logo'] = 'Je logo is nog niet klaar met uploaden, of er ging iets mis.';
      }
    } else if (huidig.sleutel === 'pakket') {
      if (antwoorden['website.domeinViaOns'] === true) {
        const d = String(antwoorden['website.domein'] || '').trim().toLowerCase();
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
          nieuw['website.domein'] = 'Vul de domeinnaam in die je wilt, zoals jouwbedrijf.nl.';
        }
      }
    } else {
      for (const v of veldenVoor(huidig.velden, keuze)) check(v, v.naam, v.geenOptie?.naam);
      if (huidig.herhaling) {
        const h = huidig.herhaling;
        for (let i = 0; i < aantalRijen(h); i++) {
          if (h.overslaan && vervalt(`${h.naam}[${i}].${h.overslaan.naam}`)) continue;
          for (const v of veldenVoor(h.velden, keuze)) {
            check(v, `${h.naam}[${i}].${v.naam}`, v.geenOptie && `${h.naam}[${i}].${v.geenOptie.naam}`);
          }
        }
      }
    }
    setFouten(nieuw);
    return Object.keys(nieuw).length === 0;
  }

  function naarStap(n) {
    setStap(n);
    setFouten({});
    bovenkant.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function verder() {
    if (!controleer()) {
      requestAnimationFrame(() => document.querySelector('.wi [aria-invalid="true"], .wi .wi-fout')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    if (!laatste) naarStap(huidigeStap + 1);
    else verstuur();
  }

  // Rij `index` weghalen en de rijen erachter een plaats naar voren schuiven,
  // anders verdwijnt altijd de laatste rij en blijven de antwoorden van de
  // weggehaalde rij in de inzending staan.
  function verwijderRij(h, index, aantal) {
    const patroon = new RegExp(`^${h.naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]\\.(.+)$`);
    setAntwoorden(vorig => {
      const nieuw = {};
      for (const [k, w] of Object.entries(vorig)) {
        const m = patroon.exec(k);
        if (!m) { nieuw[k] = w; continue; }
        const rij = Number(m[1]);
        if (rij < index) nieuw[k] = w;
        else if (rij > index) nieuw[`${h.naam}[${rij - 1}].${m[2]}`] = w;
      }
      return nieuw;
    });
    setRijen(v => ({ ...v, [h.naam]: aantal - 1 }));
    setFouten({});
  }

  async function verstuur() {
    setBezig(true);
    setVerzendfout(null);
    const betaalwijze = bedrag > 0 ? (antwoorden['website.betaalwijze'] === 'termijnen' ? 'termijnen' : 'ideal') : null;
    const domein = antwoorden['website.domeinViaOns'] === true ? String(antwoorden['website.domein'] || '').trim().toLowerCase() : '';
    try {
      if (DEMO) {
        await new Promise(r => setTimeout(r, 800));
        console.info('[intake demo] verzenden', { pakket, extras: keuze.extras, emailAantal: keuze.emailAantal, betaalwijze, domein, antwoorden: opgeschoond(antwoorden), ontbreekt: ontbrekendeZaken(keuze, antwoorden) });
        try { localStorage.removeItem(opslagSleutel(sleutel)); } catch { /* geen opslag */ }
        window.location.href = '/intake/bedankt';
        return;
      }
      const r = await roep('verzenden', {
        sleutel, pakket, betaalwijze, domein, extras: keuze.extras, emailAantal: keuze.emailAantal,
        antwoorden: opgeschoond(antwoorden),
        ontbreekt: ontbrekendeZaken(keuze, antwoorden),
      });
      // Naar betalen: de antwoorden blijven bewaard. Breekt de klant af, dan
      // komt hij hier terug en staat alles er nog. Ingediend wordt de intake
      // pas als Stripe meldt dat er betaald is.
      if (r?.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
      try { localStorage.removeItem(opslagSleutel(sleutel)); } catch { /* geen opslag */ }
      window.location.href = '/intake/bedankt';
    } catch (e) {
      if (e.code === 'al_ingevuld') { window.location.href = '/intake/bedankt'; return; }
      setVerzendfout(`${e.message} Je antwoorden staan nog bewaard, dus je kunt het zo nog eens proberen.`);
      setBezig(false);
    }
  }

  const voortgang = ((huidigeStap + 1) / stappen.length) * 100;
  const veldProps = naam => ({
    naam, waarde: antwoorden[naam], fout: fouten[naam],
    opSlaan: w => zet(naam, w), sleutel,
  });

  return (
    <Schil bedrijf={laad.bedrijf?.naam}>
      <div ref={bovenkant} className="wi-wrap">
        <div className="wi-voortgang">
          <div className="wi-voortgang-regel">
            <span className="wi-stapnr">Stap {huidigeStap + 1} van {stappen.length}</span>
            <span className="wi-zacht">{Math.round(voortgang)}% ingevuld</span>
          </div>
          <div className="wi-balk"><div style={{ width: `${voortgang}%` }} /></div>
          <nav className="wi-stappen" aria-label="Stappen">
            {stappen.map((s, i) => (
              <button key={s.sleutel} type="button" onClick={() => naarStap(i)}
                className={i === huidigeStap ? 'on' : i < huidigeStap ? 'gedaan' : ''}
                aria-current={i === huidigeStap ? 'step' : undefined}>
                {i < huidigeStap && <Check size={13} strokeWidth={3} />} {s.titel}
              </button>
            ))}
          </nav>
        </div>

        {afgebroken && (
          <div className="wi-hervat wi-afgebroken" role="alert">
            <span>De betaling is niet gelukt of afgebroken, dus je intake is nog niet verstuurd. Je antwoorden staan er nog: kies hieronder opnieuw hoe je wilt betalen.</span>
          </div>
        )}
        {!afgebroken && hervat && (
          <div className="wi-hervat">
            <span>We hebben je eerdere antwoorden teruggezet. Je kunt verder waar je gebleven was.</span>
            <button type="button" onClick={() => setHervat(false)}>Sluiten</button>
          </div>
        )}

        <h1 className="wi-titel">{huidig.titel}</h1>

        {huidig.sleutel === 'bedrijf' && (
          <StapBedrijf laad={laad} antwoorden={antwoorden} fouten={fouten} zet={zet} veldProps={veldProps} sleutel={sleutel} />
        )}
        {huidig.sleutel === 'pakket' && (
          <StapPakket antwoorden={antwoorden} fouten={fouten} zet={zet} />
        )}
        {huidig.sleutel !== 'bedrijf' && huidig.sleutel !== 'pakket' && (
          <>
            {huidig.intro && <p className="wi-intro">{huidig.intro}</p>}
            {huidig.letOp && <p className="wi-letop">{huidig.letOp}</p>}
            <div className="wi-velden">
              {veldenVoor(huidig.velden, keuze).map(v => (
                <VeldRegel key={v.naam} veld={v} {...veldProps(v.naam)}
                  geen={v.geenOptie ? antwoorden[v.geenOptie.naam] === true : undefined}
                  zetGeen={v.geenOptie ? aan => zet(v.geenOptie.naam, aan) : undefined} />
              ))}
              {huidig.herhaling && (
                <Herhaling h={huidig.herhaling} aantal={aantalRijen(huidig.herhaling)} keuze={keuze}
                  antwoorden={antwoorden} fouten={fouten} zet={zet} sleutel={sleutel}
                  zetAantal={n => setRijen(v => ({ ...v, [huidig.herhaling.naam]: n }))}
                  verwijderRij={(i, n) => verwijderRij(huidig.herhaling, i, n)} />
              )}
            </div>
            {laatste && (
              <Afronden antwoorden={antwoorden} zet={zet} keuze={keuze} bedrag={bedrag}
                />
            )}
          </>
        )}

        {verzendfout && <p role="alert" className="wi-verzendfout">{verzendfout}</p>}

        <div className="wi-navigatie">
          <button type="button" className="wi-knop wi-knop-s" onClick={() => naarStap(Math.max(0, huidigeStap - 1))}
            disabled={huidigeStap === 0 || bezig} style={huidigeStap === 0 ? { visibility: 'hidden' } : undefined}>
            <ChevronLeft size={17} /> Vorige
          </button>
          <div className="wi-navigatie-rechts">
            <span className="wi-zacht wi-bewaard">Je antwoorden worden vanzelf bewaard.</span>
            <button type="button" className="wi-knop wi-knop-p" onClick={verder} disabled={bezig}>
              {bezig ? 'Bezig met versturen…'
                : laatste ? (bedrag > 0 ? 'Naar betalen' : 'Versturen')
                  : <>Volgende <ChevronRight size={17} /></>}
            </button>
          </div>
        </div>
        {laad.verlooptOp && (
          <p className="wi-geldig">
            Deze link is geldig tot {new Date(laad.verlooptOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        )}
      </div>
    </Schil>
  );
}

// ── Stap 1: je bedrijf ──────────────────────────────────────────────────────

function StapBedrijf({ laad, antwoorden, fouten, zet, veldProps }) {
  const logoUrl = laad.bedrijf?.logoUrl;
  const keuze = antwoorden['huisstijl.logoKeuze'] || (logoUrl ? 'huidig' : 'ander');
  return (
    <>
      <p className="wi-intro">
        Dit hebben we alvast ingevuld uit je BossBase-account. Klopt iets niet, of wil je op je site iets anders laten zien? Pas het gewoon aan.
      </p>

      <div className="wi-blok">
        <div className="wi-label">Je logo</div>
        {logoUrl ? (
          <div className="wi-logokeuze">
            <label className={`wi-optie${keuze === 'huidig' ? ' on' : ''}`}>
              <input type="radio" name="logoKeuze" checked={keuze === 'huidig'} onChange={() => zet('huisstijl.logoKeuze', 'huidig')} />
              <span className="wi-logo-voorbeeld"><img src={logoUrl} alt="Je huidige logo" /></span>
              <span><strong>Gebruik dit logo</strong><span className="wi-zacht">Het logo uit je BossBase-account.</span></span>
            </label>
            <label className={`wi-optie${keuze === 'ander' ? ' on' : ''}`}>
              <input type="radio" name="logoKeuze" checked={keuze === 'ander'} onChange={() => zet('huisstijl.logoKeuze', 'ander')} />
              <span className="wi-logo-voorbeeld wi-logo-leeg"><ImagePlus size={22} /></span>
              <span><strong>Ander logo voor de site</strong><span className="wi-zacht">Bijvoorbeeld een versie met doorzichtige achtergrond.</span></span>
            </label>
          </div>
        ) : (
          <p className="wi-hulp">We hebben nog geen logo van je. Upload het hieronder, het liefst als PNG met doorzichtige achtergrond of het bestand van je ontwerper.</p>
        )}
        {keuze === 'ander' && (
          <>
            <FotoVeld {...veldProps('huisstijl.logo')} maximum={3} />
            {fouten['huisstijl.logo'] && <p role="alert" className="wi-fout">{fouten['huisstijl.logo']}</p>}
            <p className="wi-hulp">Heb je geen logo? Laat dit dan leeg. In de volgende stap kun je er een laten ontwerpen; anders zetten we je bedrijfsnaam netjes neer.</p>
          </>
        )}
      </div>

      <div className="wi-velden wi-raster">
        {BEDRIJF_VELDEN.map(v => (
          <VeldRegel key={v.naam} veld={v} {...veldProps(v.naam)}
            geen={v.geenOptie ? antwoorden[v.geenOptie.naam] === true : undefined}
            zetGeen={v.geenOptie ? aan => zet(v.geenOptie.naam, aan) : undefined} />
        ))}
      </div>
    </>
  );
}

// ── Stap 2: je pakket ───────────────────────────────────────────────────────
// Drie kaarten met dezelfde opbouw (beeld, naam, prijs, lijst, knop), zodat ze
// even hoog zijn en de knoppen op één lijn staan. Daaronder de extra's, met net
// als de pakketten de latere prijs doorgestreept naast de aanmeldprijs.

function StapPakket({ antwoorden, fouten, zet }) {
  const gekozen = antwoorden['website.pakket'] || 'basis';
  const domeinAan = antwoorden['website.domeinViaOns'] === true;
  const emailAantal = domeinAan ? Math.min(Math.max(Number(antwoorden['website.emailAantal']) || 0, 0), 10) : 0;
  const emailAan = emailAantal > 0;
  const extras = antwoorden['website.extras'] || {};
  const zetExtra = (key, n) => zet('website.extras', { ...extras, [key]: n });
  return (
    <>
      <p className="wi-intro">
        De Basis-site krijg je gratis bij je jaarabonnement. Wil je meer, dan kies je het nu voor een lagere prijs dan later.
      </p>

      <div className="wi-pakketten" role="radiogroup" aria-label="Pakket">
        {PAKKETTEN.map(p => {
          const on = gekozen === p.key;
          return (
            <label key={p.key} className={`wi-pakket${on ? ' on' : ''}${p.aanbevolen ? ' hot' : ''}`}>
              <input type="radio" name="pakket" value={p.key} checked={on} onChange={() => zet('website.pakket', p.key)} />
              {p.aanbevolen && <span className="wi-badge">Meest gekozen</span>}
              <img className="wi-pakket-beeld" src={p.voorbeeld} alt={`Voorbeeld van een ${p.label}-site`} loading="lazy" width="1440" height="900" />
              <span className="wi-pakket-in">
                <span className="wi-pakket-naam">{p.label}</span>
                <span className="wi-pakket-omvang">{p.omvang}</span>
                <span className="wi-prijsblok">
                  {p.aanmeldPrijs === 0 ? (
                    <>
                      <span className="wi-prijs"><strong>Gratis</strong></span>
                      <span className="wi-zacht">bij je jaarabonnement</span>
                    </>
                  ) : (
                    <>
                      <span className="wi-prijs">
                        <s aria-label={`Later ${euroBedrag(p.laterPrijs)}`}>{euroBedrag(p.laterPrijs)}</s>
                        <strong>{euroBedrag(p.aanmeldPrijs)}</strong>
                      </span>
                      {/* Betalen in termijnen is een sterk punt: direct onder de prijs. */}
                      <span className="wi-termijnprijs">of {TERMIJNEN} × {euroBedrag(perTermijn(p.aanmeldPrijs))} per maand</span>
                      <span className="wi-zacht">excl. btw</span>
                      <span className="wi-actie">Alleen bij je aanmelding</span>
                    </>
                  )}
                </span>
                <ul className="wi-punten">
                  {p.erft && <li className="wi-erft">Alles van {getPakket(p.erft).label}, plus:</li>}
                  {p.punten.map(t => <li key={t}><Check size={14} strokeWidth={2.6} /> {t}</li>)}
                </ul>
                <span className={`wi-kies${on ? ' on' : ''}`}>{on ? <><Check size={15} strokeWidth={3} /> Gekozen</> : `Kies ${p.label}`}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="wi-termijnbalk">
        <span className="wi-termijnbalk-icoon" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        <div>
          <strong>Betaal in één keer, of verspreid over {TERMIJNEN} maanden.</strong>{' '}
          Compleet heb je al voor {euroBedrag(perTermijn(getPakket('compleet').aanmeldPrijs))} per maand, Pro voor {euroBedrag(perTermijn(getPakket('pro').aanmeldPrijs))} per maand. Je kiest het in de laatste stap.
          <span className="wi-termijnbalk-klein">
            Deze prijzen gelden alleen nu, bij je aanmelding. Later kost Compleet {euroBedrag(getPakket('compleet').laterPrijs)} en Pro {euroBedrag(getPakket('pro').laterPrijs)}.
          </span>
        </div>
      </div>

      <div className="wi-blok">
        <div className="wi-label">Extra's <span className="wi-actie">aanmeldkorting</span></div>
        <p className="wi-hulp">Wat je hier aanvinkt, kost nu minder dan als je het later bestelt.</p>
        <div className="wi-extras">
          {extrasVoor(gekozen).map(e => {
            const n = Math.min(Number(extras[e.key]) || 0, e.maximum || 1);
            const aan = n > 0;
            return (
              <div key={e.key} className={`wi-extra${aan ? ' on' : ''}`}>
                <label className="wi-extra-kop">
                  <input type="checkbox" checked={aan} onChange={ev => zetExtra(e.key, ev.target.checked ? 1 : 0)} />
                  <span className="wi-extra-naam">{e.label}{e.perStuk ? ' (per stuk)' : ''}</span>
                  <span className="wi-extra-prijs"><s>{euroBedrag(e.laterPrijs)}</s> <strong>{euroBedrag(e.aanmeldPrijs)}</strong></span>
                </label>
                <p className="wi-extra-uitleg">{e.uitleg}</p>
                {e.perStuk && aan && (
                  <div className="wi-teller" role="group" aria-label={`Aantal ${e.label.toLowerCase()}`}>
                    <button type="button" aria-label="Minder" onClick={() => zetExtra(e.key, n - 1)}><Minus size={15} /></button>
                    <span>{n}</span>
                    <button type="button" aria-label="Meer" disabled={n >= (e.maximum || 10)} onClick={() => zetExtra(e.key, n + 1)}><Plus size={15} /></button>
                    <span className="wi-zacht">= {euroBedrag(n * e.aanmeldPrijs)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {gekozen !== 'basis' && (
          <p className="wi-hulp">Een Google Bedrijfsprofiel en de fotoset zitten al in {getPakket(gekozen).label}.</p>
        )}
      </div>

      <div className="wi-blok">
        <div className="wi-label">Hosting</div>
        <p className="wi-hulp wi-rustig">
          <Info size={15} /> Hosting kost {euroBedrag(HOSTING_PER_MAAND)} per maand en hoort bij elke website: wij zetten hem online en houden hem draaiend.
          Je hoeft het niet te kiezen. Het gaat pas in als je site live staat, als extra regel op je BossBase-abonnement.
        </p>
      </div>

      <div className="wi-blok">
        <div className="wi-label">Domeinnaam en e-mail</div>
        <VeldRegel veld={{ label: 'Heb je al een website of domeinnaam?', type: 'tekst', placeholder: 'www.jouwbedrijf.nl',
          hulp: 'Dan koppelen we je nieuwe site daaraan. Laat leeg als je er nog geen hebt.' }}
          naam="huisstijl.huidigeSite" waarde={antwoorden['huisstijl.huidigeSite']} opSlaan={w => zet('huisstijl.huidigeSite', w)} />
        <label className={`wi-vink wi-vink-blok${domeinAan ? ' on' : ''}`}>
          <input type="checkbox" checked={domeinAan} onChange={e => zet('website.domeinViaOns', e.target.checked)} />
          <span>
            <strong>Domeinnaam via ons · {euroBedrag(DOMEIN_PER_JAAR)} per jaar</strong>
            <span className="wi-zacht">
              Wij registreren en beheren hem, als jaarlijkse regel op je abonnement vanaf livegang. Er zit geen gratis domeinnaam bij de website.
            </span>
          </span>
        </label>
        {domeinAan && (
          <>
            <VeldRegel veld={{ label: 'Welke domeinnaam wil je?', type: 'tekst', verplicht: true, placeholder: 'jouwbedrijf.nl',
              hulp: 'We kijken of hij vrij is. Is hij bezet, dan nemen we contact met je op.' }}
              naam="website.domein" waarde={antwoorden['website.domein']} fout={fouten['website.domein']}
              opSlaan={w => zet('website.domein', w)} />
            <label className={`wi-vink wi-vink-blok${emailAan ? ' on' : ''}`}>
              <input type="checkbox" checked={emailAan} onChange={e => zet('website.emailAantal', e.target.checked ? 1 : 0)} />
              <span>
                <strong>Zakelijke e-mail · {euroBedrag(EMAIL_PER_MAAND)} per adres per maand</strong>
                <span className="wi-zacht">
                  Adressen op je eigen domeinnaam, zoals info@jouwbedrijf.nl. Wij richten ze in. Als regel op je abonnement vanaf livegang.
                </span>
              </span>
            </label>
            {emailAan && (
              <div className="wi-teller wi-teller-los" role="group" aria-label="Aantal e-mailadressen">
                <button type="button" aria-label="Minder" disabled={emailAantal <= 1} onClick={() => zet('website.emailAantal', emailAantal - 1)}><Minus size={15} /></button>
                <span>{emailAantal}</span>
                <button type="button" aria-label="Meer" disabled={emailAantal >= 10} onClick={() => zet('website.emailAantal', emailAantal + 1)}><Plus size={15} /></button>
                <span className="wi-zacht">{emailAantal === 1 ? 'adres' : 'adressen'} = {euroBedrag(emailAantal * EMAIL_PER_MAAND)} per maand</span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Laatste stap: betalen en samenvatting ───────────────────────────────────

function Afronden({ antwoorden, zet, keuze, bedrag }) {
  const p = getPakket(keuze.pakket);
  const wijze = antwoorden['website.betaalwijze'] === 'termijnen' ? 'termijnen' : 'ideal';
  const domein = keuze.domeinViaOns ? String(antwoorden['website.domein'] || '').trim() : '';
  const extraRegels = Object.entries(keuze.extras).map(([k, n]) => {
    const e = getExtra(k);
    return `${n > 1 ? `${n} × ` : ''}${e.label} (${euroBedrag(n * e.aanmeldPrijs)})`;
  });
  const wat = [p.aanmeldPrijs > 0 ? p.label : null, extraRegels.length ? "je extra's" : null].filter(Boolean).join(' en ');
  return (
    <>
      {bedrag > 0 && (
        <div className="wi-blok">
          <div className="wi-label">Hoe wil je {wat} betalen?</div>
          <div className="wi-betaal">
            <label className={`wi-optie${wijze === 'ideal' ? ' on' : ''}`}>
              <input type="radio" name="betaalwijze" checked={wijze === 'ideal'} onChange={() => zet('website.betaalwijze', 'ideal')} />
              <span>
                <strong>In één keer · {euroBedrag(bedrag)}</strong>
                <span className="wi-zacht">Met iDEAL, creditcard of een andere betaalmethode op de betaalpagina.</span>
              </span>
            </label>
            <label className={`wi-optie${wijze === 'termijnen' ? ' on' : ''}`}>
              <input type="radio" name="betaalwijze" checked={wijze === 'termijnen'}
                onChange={() => zet('website.betaalwijze', 'termijnen')} />
              <span>
                <strong>Verspreid over {TERMIJNEN} maanden · {euroBedrag(perTermijn(bedrag))} per maand</strong>
                <span className="wi-zacht">
                  De eerste termijn betaal je nu, daarna gaat het {TERMIJNEN - 1} maanden automatisch en dan stopt het vanzelf.
                </span>
              </span>
            </label>
          </div>
          <p className="wi-hulp">
            Bedragen zijn exclusief btw. Je intake wordt verstuurd zodra de betaling gelukt is. Lukt het niet, dan kom je hier terug en staan je antwoorden er nog.
          </p>
        </div>
      )}

      <div className="wi-samenvatting">
        <div className="wi-label">Wat je kiest</div>
        <dl>
          <dt>Pakket</dt><dd>{p.label} · {p.omvang}{p.aanmeldPrijs ? ` (${euroBedrag(p.aanmeldPrijs)})` : ' (gratis)'}</dd>
          {extraRegels.length > 0 && <><dt>Extra's</dt><dd>{extraRegels.join(', ')}</dd></>}
          <dt>Eenmalig</dt>
          <dd>{bedrag > 0 ? (wijze === 'termijnen' ? `${TERMIJNEN} × ${euroBedrag(perTermijn(bedrag))} per maand, samen ${euroBedrag(bedrag)}` : `${euroBedrag(bedrag)} in één keer`) : 'Niets'}</dd>
          <dt>Hosting</dt><dd>{euroBedrag(HOSTING_PER_MAAND)} per maand, vanaf livegang</dd>
          <dt>Domeinnaam</dt><dd>{domein ? `${domein} · ${euroBedrag(DOMEIN_PER_JAAR)} per jaar, vanaf livegang` : (antwoorden['huisstijl.huidigeSite'] ? `Eigen: ${antwoorden['huisstijl.huidigeSite']}` : 'Niet via ons')}</dd>
          {keuze.email && <><dt>E-mail</dt><dd>{keuze.emailAantal} {keuze.emailAantal === 1 ? 'adres' : 'adressen'} · {euroBedrag(keuze.emailAantal * EMAIL_PER_MAAND)} per maand, vanaf livegang</dd></>}
        </dl>
        <p className="wi-hulp">
          Bedragen excl. btw. Na de eerste versie geef je je wijzigingen één keer door; daarna gaat je site live.
          Kleine wijzigingen en uitbreidingen daarna zijn meerwerk; daarvoor krijg je vooraf een prijs.
        </p>
      </div>

      <p className="wi-akkoord">
        Door te {bedrag > 0 ? 'betalen en te versturen' : 'versturen'} ga je akkoord met de <a href="/voorwaarden" target="_blank" rel="noreferrer">algemene voorwaarden</a>.
      </p>
    </>
  );
}

// ── Velden ──────────────────────────────────────────────────────────────────

function VeldRegel({ veld, naam, waarde, opSlaan, fout, geen, zetGeen, sleutel }) {
  const tekst = typeof waarde === 'string' ? waarde : '';
  const uit = geen === true;
  const id = `wi-${naam}`;
  return (
    <div className={`wi-veld${veld.half ? ' half' : ''}${uit ? ' uit' : ''}`}>
      {veld.type !== 'aanvinken' && (
        <label htmlFor={id} className="wi-veld-label">
          {veld.label}{veld.verplicht && !uit && <span className="wi-ster" aria-hidden="true"> *</span>}
        </label>
      )}
      {veld.hulp && veld.type !== 'aanvinken' && <p className="wi-hulp">{veld.hulp}</p>}

      {veld.type === 'langeTekst' ? (
        <textarea id={id} rows={4} value={tekst} placeholder={veld.placeholder} disabled={uit}
          aria-invalid={fout ? true : undefined} onChange={e => opSlaan(e.target.value)} />
      ) : veld.type === 'aanvinken' ? (
        <label className={`wi-vink wi-vink-blok${waarde === true ? ' on' : ''}`} aria-invalid={fout ? true : undefined}>
          <input id={id} type="checkbox" checked={waarde === true} onChange={e => opSlaan(e.target.checked)} />
          <span>{veld.label}</span>
        </label>
      ) : veld.type === 'fotos' ? (
        uit ? null : <FotoVeld naam={naam} waarde={waarde} opSlaan={opSlaan} sleutel={sleutel} maximum={veld.maximum ?? 8} />
      ) : (
        <input id={id} value={tekst} placeholder={veld.placeholder} disabled={uit}
          type={veld.type === 'email' ? 'email' : veld.type === 'telefoon' ? 'tel' : 'text'}
          inputMode={veld.type === 'telefoon' ? 'tel' : undefined}
          aria-invalid={fout ? true : undefined} onChange={e => opSlaan(e.target.value)} />
      )}

      {veld.geenOptie && zetGeen && (
        <>
          <label className="wi-vink">
            <input type="checkbox" checked={uit} onChange={e => zetGeen(e.target.checked)} />
            <span>{veld.geenOptie.label}</span>
          </label>
          {uit && veld.geenOptie.hulp && <p className="wi-hulp">{veld.geenOptie.hulp}</p>}
        </>
      )}
      {fout && <p role="alert" className="wi-fout">{fout}</p>}
    </div>
  );
}

function Herhaling({ h, aantal, keuze, antwoorden, fouten, zet, sleutel, zetAantal, verwijderRij }) {
  return (
    <div className="wi-rijen">
      {Array.from({ length: aantal }, (_, i) => {
        const overNaam = h.overslaan ? `${h.naam}[${i}].${h.overslaan.naam}` : null;
        const over = overNaam && antwoorden[overNaam] === true;
        return (
          <fieldset key={i} className="wi-rij">
            <legend>{h.enkelvoud} {i + 1}</legend>
            {overNaam && (
              <label className="wi-vink">
                <input type="checkbox" checked={Boolean(over)} onChange={e => zet(overNaam, e.target.checked)} />
                <span>{h.overslaan.label}</span>
              </label>
            )}
            {!over && (
              <div className="wi-velden">
                {veldenVoor(h.velden, keuze).map(v => {
                  const naam = `${h.naam}[${i}].${v.naam}`;
                  const geenNaam = v.geenOptie ? `${h.naam}[${i}].${v.geenOptie.naam}` : null;
                  return (
                    <VeldRegel key={naam} veld={v} naam={naam} waarde={antwoorden[naam]} fout={fouten[naam]}
                      opSlaan={w => zet(naam, w)} sleutel={sleutel}
                      geen={geenNaam ? antwoorden[geenNaam] === true : undefined}
                      zetGeen={geenNaam ? aan => zet(geenNaam, aan) : undefined} />
                  );
                })}
              </div>
            )}
            {aantal > h.minimum && (
              <button type="button" className="wi-rij-weg" onClick={() => verwijderRij(i, aantal)}>
                {h.enkelvoud} {i + 1} verwijderen
              </button>
            )}
          </fieldset>
        );
      })}
      {h.voetnoot && <p className="wi-hulp">{h.voetnoot}</p>}
      {aantal < h.maximum
        ? <button type="button" className="wi-erbij" onClick={() => zetAantal(aantal + 1)}>Nog een {h.enkelvoud.toLowerCase()} toevoegen</button>
        : <p className="wi-hulp">Meer dan {h.maximum} {h.meervoud.toLowerCase()} passen niet in dit pakket.</p>}
    </div>
  );
}

// ── Foto's en bestanden ─────────────────────────────────────────────────────
// Elke foto krijgt meteen een voorvertoning uit het bestand zelf. Wat er met een
// bestand gebeurt is altijd zichtbaar: bezig, opgeslagen of mislukt met de
// reden en een knop om het opnieuw te proberen. Stil falen is hier het ergste:
// de klant denkt dat hij klaar is en wij krijgen een lege verwijzing.

function FotoVeld({ naam, waarde, opSlaan, sleutel, maximum = 8 }) {
  const lijst = Array.isArray(waarde) ? waarde : [];
  const invoer = useRef(null);
  const bestanden = useRef(new Map());
  const [sleept, setSleept] = useState(false);
  const [melding, setMelding] = useState(null);

  const werkBij = (id, velden) => opSlaan(v => v.map(f => (f.id === id ? { ...f, ...velden } : f)));

  async function verstuurEen(id, bestand) {
    werkBij(id, { bezig: true, fout: null });
    try {
      const pad = await upload(sleutel, bestand);
      werkBij(id, { bezig: false, pad });
      bestanden.current.delete(id);
    } catch (e) {
      werkBij(id, { bezig: false, fout: e.message || 'Uploaden mislukt.' });
    }
  }

  function kies(files) {
    setMelding(null);
    const ruimte = maximum - lijst.length;
    const gekozen = Array.from(files || []);
    if (gekozen.length > ruimte) setMelding(`Hier passen er maximaal ${maximum}. De rest is niet toegevoegd.`);
    const nieuw = [];
    for (const f of gekozen.slice(0, Math.max(0, ruimte))) {
      const type = f.type || mimeVanNaam(f.name);
      if (!type || !TOEGESTAAN_ATTR.split(',').some(ext => f.name.toLowerCase().endsWith(ext))) {
        setMelding('Dit bestandstype gaat niet. Gebruik JPG, PNG, HEIC, WebP, SVG of PDF.'); continue;
      }
      if (f.size > MAX_BYTES) { setMelding(`${f.name} is te groot. Maximaal 25 MB.`); continue; }
      const id = nieuweId();
      const toonbaar = /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(type);
      bestanden.current.set(id, f);
      nieuw.push({ id, naam: f.name, voorbeeld: toonbaar ? URL.createObjectURL(f) : null, bezig: true });
    }
    if (!nieuw.length) return;
    opSlaan(v => [...v, ...nieuw]);
    for (const n of nieuw) verstuurEen(n.id, bestanden.current.get(n.id));
  }

  const weg = id => {
    bestanden.current.delete(id);
    opSlaan(v => v.filter(f => f.id !== id));
  };

  return (
    <div className="wi-foto">
      {lijst.length > 0 && (
        <ul className="wi-foto-lijst">
          {lijst.map(f => (
            <li key={f.id} className={f.fout ? 'fout' : f.pad ? 'klaar' : 'bezig'}>
              <span className="wi-foto-beeld">
                {f.voorbeeld ? <img src={f.voorbeeld} alt="" /> : <FileText size={20} />}
              </span>
              <span className="wi-foto-info">
                <span className="wi-foto-naam">{f.naam}</span>
                <span className="wi-foto-status">
                  {f.fout ? f.fout : f.pad ? <><Check size={13} strokeWidth={3} /> Opgeslagen</> : 'Bezig met uploaden…'}
                </span>
                {f.bezig && <span className="wi-foto-balk loopt" aria-hidden="true" />}
              </span>
              {f.fout && bestanden.current.has(f.id) && (
                <button type="button" className="wi-ikoon" onClick={() => verstuurEen(f.id, bestanden.current.get(f.id))} aria-label={`${f.naam} opnieuw proberen`}>
                  <RotateCw size={16} />
                </button>
              )}
              <button type="button" className="wi-ikoon" onClick={() => weg(f.id)} aria-label={`${f.naam} verwijderen`}>
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {lijst.length < maximum && (
        <div
          className={`wi-drop${sleept ? ' sleept' : ''}`}
          onDragOver={e => { e.preventDefault(); setSleept(true); }}
          onDragLeave={() => setSleept(false)}
          onDrop={e => { e.preventDefault(); setSleept(false); kies(e.dataTransfer.files); }}
        >
          <button type="button" className="wi-knop wi-knop-s" onClick={() => invoer.current?.click()}>
            <ImagePlus size={17} /> {lijst.length ? 'Nog meer kiezen' : 'Bestanden kiezen'}
          </button>
          <span className="wi-zacht">of sleep ze hierheen · max. {maximum}</span>
          <input ref={invoer} id={`wi-${naam}`} type="file" multiple accept={TOEGESTAAN_ATTR} hidden
            onChange={e => { kies(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {melding && <p className="wi-fout" role="alert">{melding}</p>}
    </div>
  );
}
