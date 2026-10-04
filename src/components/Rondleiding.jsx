import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RONDLEIDINGEN, PAGINAS_MET_RONDLEIDING, WELKOM, START, RL_START, RL_RESET } from '../lib/rondleidingen.js';
import { getGezien, markeerGezien } from '../services/rondleidingService.js';
import { isDemo } from '../lib/supabase.js';
import { useToast } from '../lib/toast.jsx';

// De rondleiding, met Boss als gids.
//
// - Elke pagina en elk venster met een rondleiding toont hem de eerste keer dat
//   iemand het opent, ook weken later. Per gebruiker vastgelegd in de database.
// - De allereerste keer ooit begint Boss met een korte welkom. Is dat de
//   beheerder van een bedrijf dat nog niet is ingericht, dan neemt Boss hem
//   eerst mee door Instellingen (StartRondleiding hieronder).
// - Altijd over te slaan: knop, Escape, of "Geen rondleidingen meer tonen".
// - Opnieuw te starten via het profielmenu (deze pagina) of Instellingen (alles).
// - Een stap waarvan het onderdeel niet in beeld is (geen recht, niet in het
//   pakket), valt weg.
//
// Het aanwijzen: de markering volgt het onderdeel elke frame (scrollen, zijbalk
// in- of uitklappen, venster dat van grootte verandert), en omcirkelt alleen het
// deel dat echt zichtbaar is binnen het scherm en binnen scrollende blokken
// (de zijbalk, een venster). Staat het onderdeel buiten beeld, dan scrollen we
// er eerst naartoe.

const AVATAR = '/boss-gids.png';
const PAD = 6;        // ruimte tussen onderdeel en markering
const RAND = 4;       // minimale afstand van de markering tot de schermrand
const GAT = 14;       // afstand tussen markering en gids

// Een stap wijst aan met data-rl="<doel>", of met een selector als het om het
// eerste item van een lijst gaat (de eerste kaart, de eerste rij).
const zoek = stap => (stap.welkom ? null : document.querySelector(stap.selector || `[data-rl="${stap.doel}"]`));
const zichtbaar = el => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

// Er staat iets anders open: dan wachten we. Een rondleiding in een la wacht
// alleen op vensters, een rondleiding in een venster wacht nergens op.
const ietsOpen = soort => {
  if (soort === 'venster') return false;
  return Boolean(document.querySelector(soort === 'la' ? '.overlay' : '.overlay, .drawer, .drawer-overlay'));
};

// Het deel van het scherm waarin `el` zichtbaar kan zijn: het venster, ingeperkt
// door elk scrollend blok eromheen (de zijbalk, een venster, een la).
//
// Een vast (position: fixed) element, zoals een venster of la, wordt niet
// afgesneden door de blokken daarbuiten: daar houden we op. Anders begon de
// markering in een venster pas bij de rand van de zijbalk.
function zichtGebied(el) {
  let g = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
      const r = p.getBoundingClientRect();
      g = { top: Math.max(g.top, r.top), left: Math.max(g.left, r.left), right: Math.min(g.right, r.right), bottom: Math.min(g.bottom, r.bottom) };
    }
    if (cs.position === 'fixed') break;
  }
  return g;
}

// De rechthoek die we omcirkelen: het onderdeel plus wat ruimte, maar nooit
// buiten wat zichtbaar is en nooit tegen de schermrand aan.
function meetSpot(el) {
  const r = el.getBoundingClientRect();
  const g = zichtGebied(el);
  const top = Math.max(r.top - PAD, g.top, RAND);
  const left = Math.max(r.left - PAD, g.left, RAND);
  const right = Math.min(r.right + PAD, g.right, window.innerWidth - RAND);
  const bottom = Math.min(r.bottom + PAD, g.bottom, window.innerHeight - RAND);
  const straal = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top), straal: Math.min(straal + PAD, 18) };
}

// Staat (het begin van) het onderdeel buiten beeld, dan ernaartoe scrollen.
function scrollNaar(el) {
  const r = el.getBoundingClientRect();
  const g = zichtGebied(el);
  const hoog = r.height > (g.bottom - g.top) - 40;
  const buiten = r.top < g.top || r.left < g.left || r.right > g.right || (hoog ? r.top > g.bottom - 80 : r.bottom > g.bottom);
  if (!buiten) return;
  // Alleen verticaal: scrollIntoView schuift ook horizontaal als een blok
  // breder is dan zijn venster, en dan plakten de velden tegen de rand.
  const blokken = [];
  for (let p = el.parentElement; p; p = p.parentElement) blokken.push([p, p.scrollLeft]);
  el.scrollIntoView({ block: hoog ? 'start' : 'center', inline: 'nearest' });
  blokken.forEach(([p, x]) => { if (p.scrollLeft !== x) p.scrollLeft = x; });
}

const gelijk = (a, b) => a && b && ['top', 'left', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) < 0.5);

// Naar een pagina (en tabblad) in de app. Zelfde weg als een melding bij de
// bel: de URL zetten en de app laten meelezen via popstate.
function gaNaarPad(pad) {
  if (window.location.pathname + window.location.search === pad) return;
  try { window.history.pushState({}, '', pad); } catch { /* niet blokkerend */ }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// ── Gedeelde stand ─────────────────────────────────────────────────────────
// Gezien-lijst één keer per sessie ophalen; daarna bijgehouden in het geheugen.
let gezienCache = null;
const laadGezien = () => {
  if (!gezienCache) gezienCache = getGezien().catch(() => null);
  return gezienCache;
};
// Er is er maar één tegelijk in beeld. Wie later klaarstaat, wacht.
let bezet = null;
// De startrondleiding beslist eerst of hij loopt; tot die tijd wachten de
// pagina's. 'onbekend' | 'loopt' | 'klaar'.
let startStand = 'onbekend';
// Hoeveel rondleidingen er in een open la of venster gemonteerd zijn. Staat er
// een, dan start "Rondleiding" in het profielmenu die, en niet ook die van de
// pagina eronder.
let binnenActief = 0;

function geenRondleidingenMeer() {
  markeerGezien(PAGINAS_MET_RONDLEIDING).catch(() => {});
  laadGezien().then(g => g && PAGINAS_MET_RONDLEIDING.forEach(p => g.add(p)));
}

// ── De gids: Boss met tekstballon, en de markering ────────────────────────
// `geduld`: hoe lang een stap op zijn onderdeel wacht voordat hij wordt
// overgeslagen. Op een pagina staat alles er al (kort); in de startrondleiding
// moet eerst een tabblad laden (langer).
function Gids({ stappen, onStop, onKlaar, voorStap, geduld = 400 }) {
  const [index, setIndex] = useState(0);
  const richting = useRef(1);
  const laatsteEchtRef = useRef(false);
  const [spot, setSpot] = useState(null);
  const gidsRef = useRef(null);
  const [gidsPos, setGidsPos] = useState(null);
  const stap = stappen[Math.min(index, stappen.length - 1)];

  // Voorbij de laatste stap (de laatste werd overgeslagen): klaar.
  useEffect(() => { if (index >= stappen.length) onKlaar(); }, [index, stappen.length, onKlaar]);

  // Voor de stap: eventueel eerst naar de juiste pagina of het juiste tabblad.
  useEffect(() => { voorStap?.(stap); }, [stap, voorStap]);

  // Het onderdeel volgen, elke frame. Een frame-lus en geen losse resize- of
  // scroll-luisteraars: het in- en uitklappen van de zijbalk is een
  // CSS-overgang, en die vuurt geen van beide. De lus zoekt ook door tot het
  // onderdeel er is: na een tabbladwissel staat het er niet meteen.
  useEffect(() => {
    setSpot(null);
    if (stap.welkom) return undefined;
    let raf = 0;
    let vorige = null;
    let gescrold = false;
    let gevonden = false;
    const t0 = Date.now();
    const lus = () => {
      const el = zoek(stap);
      // Na `geduld` nog niets: dit onderdeel is er voor deze gebruiker niet
      // (geen recht, niet in het pakket, lege lijst). Dan door in de richting
      // waarin je bladerde; terug voorbij het begin wordt weer vooruit.
      if (!gevonden && !(el && zichtbaar(el)) && Date.now() - t0 > geduld) {
        setIndex(i => {
          const n = i + richting.current;
          if (n < 0) { richting.current = 1; return i + 1; }
          return n;
        });
        return;
      }
      if (el && zichtbaar(el)) {
        gevonden = true;
        if (!gescrold) { scrollNaar(el); gescrold = true; }
        const s = meetSpot(el);
        if (!gelijk(s, vorige)) { vorige = s; setSpot(s); }
      }
      raf = requestAnimationFrame(lus);
    };
    raf = requestAnimationFrame(lus);
    return () => cancelAnimationFrame(raf);
  }, [stap]);

  // De gids plaatsen: naast de markering, nooit eroverheen.
  useLayoutEffect(() => {
    const g = gidsRef.current;
    if (!g) return;
    const gw = g.offsetWidth;
    const gh = g.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const past = (top, left) => top >= RAND && left >= RAND && top + gh <= vh - RAND && left + gw <= vw - RAND;
    const klem = (v, min, max) => Math.min(Math.max(v, min), max);
    let pos;
    if (stap.welkom || !spot) {
      pos = { top: (vh - gh) / 2, left: (vw - gw) / 2 };
    } else {
      const midX = spot.left + spot.width / 2 - gw / 2;
      const midY = spot.top + spot.height / 2 - gh / 2;
      const kandidaten = [
        { top: spot.top + spot.height + GAT, left: klem(midX, RAND, vw - gw - RAND) }, // onder
        { top: spot.top - gh - GAT, left: klem(midX, RAND, vw - gw - RAND) },          // boven
        { top: klem(midY, RAND, vh - gh - RAND), left: spot.left + spot.width + GAT },  // rechts
        { top: klem(midY, RAND, vh - gh - RAND), left: spot.left - gw - GAT },          // links
      ];
      // Past hij nergens helemaal naast (een groot vlak: een kaart, rooster,
      // tijdlijn), dan de plek binnen beeld waar hij het minst overlapt.
      const overlap = k => {
        const x = Math.max(0, Math.min(k.left + gw, spot.left + spot.width) - Math.max(k.left, spot.left));
        const y = Math.max(0, Math.min(k.top + gh, spot.top + spot.height) - Math.max(k.top, spot.top));
        return x * y;
      };
      const binnen = k => ({ top: klem(k.top, RAND, vh - gh - RAND), left: klem(k.left, RAND, vw - gw - RAND) });
      pos = kandidaten.find(k => past(k.top, k.left))
        || [...kandidaten.map(binnen), { top: vh - gh - 20, left: vw - gw - 20 }]
          .sort((a, b) => overlap(a) - overlap(b))[0];
    }
    setGidsPos(p => (p && Math.abs(p.top - pos.top) < 0.5 && Math.abs(p.left - pos.left) < 0.5 ? p : pos));
  });

  const laatste = index >= stappen.length - 1;
  const volgende = useCallback(() => {
    richting.current = 1;
    if (laatsteEchtRef.current) { onKlaar(); return; }
    if (index + 1 < stappen.length) setIndex(index + 1); else onKlaar();
  }, [index, stappen.length, onKlaar]);
  const vorige = useCallback(() => { richting.current = -1; setIndex(i => Math.max(0, i - 1)); }, []);

  // Toetsenbord: Escape is overslaan, pijltjes en Enter bladeren.
  useEffect(() => {
    const opToets = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onStop(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); volgende(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); vorige(); }
    };
    window.addEventListener('keydown', opToets, true);
    return () => window.removeEventListener('keydown', opToets, true);
  }, [onStop, volgende, vorige]);

  // Nummering zonder de welkom- en slotstap, en alleen over de stappen waarvan
  // het onderdeel er nu is.
  const echte = stappen.filter(s => !s.welkom && (s === stap || zichtbaar(zoek(s)) || s.tab));
  const nummer = echte.indexOf(stap) + 1;
  // "Klaar" op de laatste stap die er echt is, niet pas op een stap die straks
  // wordt overgeslagen.
  const laatsteEcht = !stap.welkom && !stappen.slice(index + 1).some(s => s.welkom || zichtbaar(zoek(s)) || s.tab);
  laatsteEchtRef.current = laatsteEcht;
  const wachtOpOnderdeel = !stap.welkom && !spot;

  return createPortal(
    <div className="rl-laag" role="dialog" aria-modal="true" aria-labelledby="rl-titel">
      {/* Vangt klikken naast de gids op, zodat je niet per ongeluk de pagina
          bedient terwijl de rondleiding loopt. Bij de welkom dimt hij zelf; bij
          een stap doet de markering dat. */}
      <div className={`rl-vanger${stap.welkom || wachtOpOnderdeel ? ' rl-dim' : ''}`} onClick={e => e.stopPropagation()} />
      {spot && !stap.welkom && (
        <div className="rl-spot" data-doel={stap.selector || `[data-rl="${stap.doel}"]`} style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, borderRadius: spot.straal }} />
      )}
      {!wachtOpOnderdeel && (
        <div
          ref={gidsRef}
          className={`rl-gids${stap.welkom ? ' rl-gids-welkom' : ''}`}
          style={gidsPos ? { top: gidsPos.top, left: gidsPos.left } : { top: -9999, left: -9999 }}
        >
          <div className="rl-boss" aria-hidden="true"><img src={AVATAR} alt="" /></div>
          <div className="rl-ballon">
            {!stap.welkom && <div className="rl-teller">{nummer} van {echte.length}</div>}
            <div id="rl-titel" className="rl-titel">{stap.titel}</div>
            <p className="rl-tekst">{stap.tekst}</p>
            {(laatste || laatsteEcht) && !stap.einde && (
              <p className="rl-tekst rl-noot">Vragen? Klik rechtsboven op mij, dan help ik je verder.</p>
            )}
            <div className="rl-knoppen">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onStop}>Overslaan</button>
              <div className="rl-knoppen-rechts">
                {index > 0 && <button type="button" className="btn btn-s btn-sm" onClick={vorige}>Vorige</button>}
                <button type="button" className="btn btn-p btn-sm" autoFocus onClick={volgende}>
                  {stap.einde ? 'Verder' : stap.welkom ? 'Laat zien' : (laatste || laatsteEcht) ? 'Klaar' : 'Volgende'}
                </button>
              </div>
            </div>
            <button type="button" className="rl-geen-meer" onClick={() => { geenRondleidingenMeer(); onStop(); }}>
              Geen rondleidingen meer tonen
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// Na "Klaar": de Boss-knop rechtsboven licht even op, zodat duidelijk is waar
// je hem later vindt.
function pulsBoss() {
  const knop = document.querySelector('[data-rl="boss"]');
  if (!knop) return;
  knop.classList.add('rl-boss-puls');
  setTimeout(() => knop.classList.remove('rl-boss-puls'), 3200);
}

// ── Rondleiding van een pagina, la of venster ──────────────────────────────
export default function Rondleiding({ pagina, inLa = false, inVenster = false }) {
  const soort = inVenster ? 'venster' : inLa ? 'la' : 'pagina';
  // Via een ref: useToast geeft niet gegarandeerd elke render hetzelfde object.
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [stappen, setStappen] = useState(null); // null = geen rondleiding actief
  const sleutel = useRef(0);

  const start = useCallback((handmatig = false, metWelkom = false) => {
    if (bezet && bezet !== pagina) return false;
    const alle = RONDLEIDINGEN[pagina] || [];
    // Er moet minstens één onderdeel staan; de rest beoordeelt de gids per stap
    // (een lijst die net iets later laadt, valt dan niet weg).
    const eerste = alle.findIndex(s => zichtbaar(zoek(s)));
    const lijst = eerste >= 0 ? alle.slice(eerste) : [];
    if (lijst.length === 0) {
      if (handmatig) toastRef.current.info('Voor deze pagina is er geen rondleiding.');
      return false;
    }
    bezet = pagina;
    sleutel.current += 1;
    setStappen(metWelkom ? [WELKOM, ...lijst] : lijst);
    return true;
  }, [pagina]);

  const stop = useCallback(() => {
    if (bezet === pagina) bezet = null;
    setStappen(null);
  }, [pagina]);
  const klaar = useCallback(() => { stop(); pulsBoss(); }, [stop]);

  // Vanzelf starten, de eerste keer.
  useEffect(() => {
    if (isDemo || !RONDLEIDINGEN[pagina]) return undefined;
    let weg = false;
    let timer = null;
    let t0 = null;
    let tStaat = null;

    laadGezien().then(gezien => {
      if (weg || !gezien || gezien.has(pagina)) return;
      // Wachten tot de startrondleiding klaar is, er geen andere rondleiding
      // loopt, er niets anders openstaat en het onderdeel er staat. Pas daarna
      // tellen de 8 seconden waarna we het opgeven (dan komt hij later).
      const probeer = () => {
        if (weg) return;
        if (startStand !== 'klaar' || bezet) { timer = setTimeout(probeer, 500); return; }
        if (t0 === null) t0 = Date.now();
        const iets = (RONDLEIDINGEN[pagina] || []).some(s => zichtbaar(zoek(s)));
        // Het eerste onderdeel staat er: nog even wachten tot de rest van de
        // pagina geladen is (lijsten, kaarten), anders vallen die stappen weg.
        if (iets && tStaat === null) tStaat = Date.now();
        if (iets && Date.now() - tStaat >= 1200 && !ietsOpen(soort)) {
          const welkom = !gezien.has('welkom');
          if (start(false, welkom)) {
            gezien.add(pagina);
            if (welkom) gezien.add('welkom');
            markeerGezien(welkom ? [pagina, 'welkom'] : pagina).catch(() => {});
          }
          return;
        }
        if (Date.now() - t0 < 8000) timer = setTimeout(probeer, 400);
      };
      timer = setTimeout(probeer, soort === 'pagina' ? 600 : 350);
    });

    return () => { weg = true; clearTimeout(timer); if (bezet === pagina) bezet = null; };
  }, [pagina, soort, start]);

  // Seintjes van het profielmenu en Instellingen.
  useEffect(() => {
    const binnen = soort !== 'pagina';
    if (binnen) binnenActief += 1;
    const opStart = () => { if (binnen || binnenActief === 0) start(true); };
    const opReset = () => { gezienCache = null; };
    window.addEventListener(RL_START, opStart);
    window.addEventListener(RL_RESET, opReset);
    return () => {
      window.removeEventListener(RL_START, opStart);
      window.removeEventListener(RL_RESET, opReset);
      if (binnen) binnenActief -= 1;
    };
  }, [start, soort]);

  if (!stappen) return null;
  return <Gids key={sleutel.current} stappen={stappen} onStop={stop} onKlaar={klaar} />;
}

// ── Startrondleiding: een nieuw bedrijf inrichten ──────────────────────────
// Eén keer, voor de beheerder van een bedrijf waarvan de basisgegevens nog niet
// compleet zijn. Na de welkom gaat Boss naar Instellingen en wijst aan wat er
// ingevuld moet zijn voordat de eerste offerte de deur uit gaat; daarna terug
// naar het Dashboard, waar de gewone rondleiding verdergaat.
const bedrijfIngericht = c => Boolean(c && c.kvk && c.address && c.btwNumber && c.iban && c.logoUrl);

// `rol` is de rol uit het profiel, of leeg zolang dat nog laadt. Beslissen met
// een leeg profiel gaf "geen beheerder", waarna de gewone rondleiding begon en
// de startrondleiding er later doorheen kwam.
export function StartRondleiding({ rol, company }) {
  const [stappen, setStappen] = useState(null);
  const [opnieuw, setOpnieuw] = useState(0);
  const companyRef = useRef(company);
  companyRef.current = company;

  useEffect(() => {
    if (isDemo) { startStand = 'klaar'; return undefined; }
    if (!company || !rol) {
      // Nog aan het laden. Komt er niets (account zonder bedrijf), dan na een
      // paar seconden de pagina's niet langer laten wachten.
      const t = setTimeout(() => { if (startStand === 'onbekend') startStand = 'klaar'; }, 6000);
      return () => clearTimeout(t);
    }
    let weg = false;
    startStand = 'onbekend';
    laadGezien().then(gezien => {
      if (weg) return;
      const nodig = gezien && rol === 'admin' && !gezien.has('start') && !gezien.has('welkom') && !bedrijfIngericht(companyRef.current);
      if (!nodig) { startStand = 'klaar'; return; }
      // Even wachten tot er niets anders openstaat (de urenherinnering).
      const probeer = () => {
        if (weg) return;
        if (bezet || document.querySelector('.overlay')) { setTimeout(probeer, 500); return; }
        startStand = 'loopt';
        bezet = 'start';
        gezien.add('start'); gezien.add('welkom');
        markeerGezien(['start', 'welkom']).catch(() => {});
        // Stappen die er voor deze gebruiker niet zijn (geen koppelingen in
        // het pakket) vallen weg zodra we op dat tabblad niets vinden; zie
        // overslaanAlsAfwezig hieronder.
        setStappen(START);
      };
      setTimeout(probeer, 600);
    });
    return () => { weg = true; };
  // company?.id: opnieuw beslissen bij een ander bedrijf, niet bij elke wijziging.
  }, [rol, company?.id, opnieuw]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Rondleidingen opnieuw starten" in Instellingen: opnieuw beslissen.
  useEffect(() => {
    const opReset = () => { gezienCache = null; setOpnieuw(n => n + 1); };
    window.addEventListener(RL_RESET, opReset);
    return () => window.removeEventListener(RL_RESET, opReset);
  }, []);

  const klaarMet = useCallback(naarDashboard => {
    if (bezet === 'start') bezet = null;
    startStand = 'klaar';
    setStappen(null);
    if (naarDashboard) gaNaarPad('/dashboard');
  }, []);

  const voorStap = useCallback(stap => {
    if (stap.tab) gaNaarPad(`/dashboard/instellingen?tab=${stap.tab}`);
  }, []);

  if (!stappen) return null;
  return (
    <Gids
      stappen={stappen}
      geduld={3000}
      voorStap={voorStap}
      onStop={() => klaarMet(false)}
      onKlaar={() => klaarMet(true)}
    />
  );
}
