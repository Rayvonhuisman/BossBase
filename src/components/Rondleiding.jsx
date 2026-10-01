import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RONDLEIDINGEN, PAGINAS_MET_RONDLEIDING, RL_START, RL_RESET } from '../lib/rondleidingen.js';
import { getGezien, markeerGezien } from '../services/rondleidingService.js';
import { isDemo } from '../lib/supabase.js';
import { useToast } from '../lib/toast.jsx';

// De rondleiding: wijst per pagina de belangrijkste onderdelen aan.
//
// - Start vanzelf de eerste keer dat iemand een pagina opent, en wordt dan
//   meteen als gezien vastgelegd (per gebruiker, in de database). Wie halverwege
//   wegklikt, krijgt hem dus niet nog eens.
// - Altijd over te slaan: knop, Escape, of "Geen rondleidingen meer".
// - Opnieuw te starten via het profielmenu (deze pagina) of Instellingen (alles).
// - Een stap waarvan het element niet in beeld is, valt weg (zie rondleidingen.js).

const zichtbaar = el => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const zoek = doel => document.querySelector(`[data-rl="${doel}"]`);

// Er staat iets anders open (venster, la, urenherinnering): dan wachten we.
const ietsOpen = () => Boolean(document.querySelector('.overlay, .drawer, .drawer-overlay'));

// Gezien-lijst één keer per sessie ophalen; daarna bijgehouden in het geheugen.
let gezienCache = null;
const laadGezien = () => {
  if (!gezienCache) gezienCache = getGezien().catch(() => null);
  return gezienCache;
};

const MARGE = 8;      // ruimte rond het aangewezen element
const KAART_B = 320;  // breedte van de uitlegkaart

export default function Rondleiding({ pagina }) {
  // Via een ref: useToast geeft niet gegarandeerd elke render hetzelfde object,
  // en start() zit in de afhankelijkheden van het start-effect hieronder.
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [stappen, setStappen] = useState(null); // null = geen rondleiding actief
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const kaartRef = useRef(null);
  const [kaartPos, setKaartPos] = useState({ top: -9999, left: -9999 });

  const start = useCallback((handmatig = false) => {
    const lijst = (RONDLEIDINGEN[pagina] || []).filter(s => zichtbaar(zoek(s.doel)));
    if (lijst.length === 0) {
      if (handmatig) toastRef.current.info('Voor deze pagina is er geen rondleiding.');
      return false;
    }
    setStappen(lijst);
    setIndex(0);
    return true;
  }, [pagina]);

  const stop = useCallback(() => { setStappen(null); setRect(null); }, []);

  // ── Vanzelf starten, de eerste keer ───────────────────────────────────────
  useEffect(() => {
    stop();
    if (isDemo || !RONDLEIDINGEN[pagina]) return undefined;
    let klaar = false;
    let timer = null;
    const t0 = Date.now();

    laadGezien().then(gezien => {
      if (klaar || !gezien || gezien.has(pagina)) return;
      // Wachten tot de pagina staat en er niets anders openstaat. Na 8 seconden
      // geven we het op; dan komt hij de volgende keer.
      const probeer = () => {
        if (klaar) return;
        const eersteStap = (RONDLEIDINGEN[pagina] || []).some(s => zichtbaar(zoek(s.doel)));
        if (eersteStap && !ietsOpen()) {
          if (start(false)) {
            gezien.add(pagina);
            markeerGezien(pagina).catch(() => {});
          }
          return;
        }
        if (Date.now() - t0 < 8000) timer = setTimeout(probeer, 400);
      };
      timer = setTimeout(probeer, 600);
    });

    return () => { klaar = true; clearTimeout(timer); };
  }, [pagina, start, stop]);

  // ── Seintjes van het profielmenu en Instellingen ──────────────────────────
  useEffect(() => {
    const opStart = () => start(true);
    const opReset = () => { gezienCache = null; };
    window.addEventListener(RL_START, opStart);
    window.addEventListener(RL_RESET, opReset);
    return () => {
      window.removeEventListener(RL_START, opStart);
      window.removeEventListener(RL_RESET, opReset);
    };
  }, [start]);

  const stap = stappen?.[index];

  // ── Het aangewezen element volgen ─────────────────────────────────────────
  useLayoutEffect(() => {
    if (!stap) return undefined;
    const el = zoek(stap.doel);
    if (!el) { setRect(null); return undefined; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const meet = () => setRect(el.getBoundingClientRect());
    meet();
    window.addEventListener('resize', meet);
    window.addEventListener('scroll', meet, true);
    return () => {
      window.removeEventListener('resize', meet);
      window.removeEventListener('scroll', meet, true);
    };
  }, [stap]);

  // ── De uitlegkaart plaatsen: onder, boven, of naast een hoog element ──────
  useLayoutEffect(() => {
    if (!rect || !kaartRef.current) return;
    const kh = kaartRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top;
    let left;
    if (rect.height > vh * 0.5) {
      // Hoog element (het menu): ernaast.
      left = rect.right + MARGE + 12;
      top = Math.min(Math.max(rect.top + 80, 16), vh - kh - 16);
    } else {
      left = rect.left + rect.width / 2 - KAART_B / 2;
      top = rect.bottom + MARGE + 12;
      if (top + kh > vh - 16) top = rect.top - MARGE - 12 - kh;
    }
    left = Math.min(Math.max(left, 16), vw - KAART_B - 16);
    top = Math.max(top, 16);
    setKaartPos({ top, left });
  }, [rect]);

  // ── Toetsenbord ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stappen) return undefined;
    const opToets = e => {
      if (e.key === 'Escape') { e.stopPropagation(); stop(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        setIndex(i => (i + 1 < stappen.length ? i + 1 : (stop(), i)));
      } else if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', opToets, true);
    return () => window.removeEventListener('keydown', opToets, true);
  }, [stappen, stop]);

  if (!stap || !rect) return null;

  const laatste = index === stappen.length - 1;
  const geenMeer = () => {
    markeerGezien(PAGINAS_MET_RONDLEIDING).catch(() => {});
    laadGezien().then(g => g && PAGINAS_MET_RONDLEIDING.forEach(p => g.add(p)));
    stop();
  };

  return createPortal(
    <div className="rl-laag" role="dialog" aria-modal="true" aria-labelledby="rl-titel">
      {/* Vangt klikken naast de kaart op, zodat je niet per ongeluk de pagina
          bedient terwijl de rondleiding loopt. */}
      <div className="rl-vanger" onClick={e => e.stopPropagation()} />
      <div
        className="rl-spot"
        style={{
          top: rect.top - MARGE,
          left: rect.left - MARGE,
          width: rect.width + MARGE * 2,
          height: rect.height + MARGE * 2,
        }}
      />
      <div ref={kaartRef} className="rl-kaart" style={{ top: kaartPos.top, left: kaartPos.left, width: KAART_B }}>
        <div className="rl-teller">{index + 1} van {stappen.length}</div>
        <div id="rl-titel" className="rl-titel">{stap.titel}</div>
        <p className="rl-tekst">{stap.tekst}</p>
        {laatste && (
          <p className="rl-tekst rl-noot">Later nog eens kijken? Kies <strong>Rondleiding</strong> in je profielmenu rechtsboven.</p>
        )}
        <div className="rl-knoppen">
          <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>Overslaan</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {index > 0 && (
              <button type="button" className="btn btn-s btn-sm" onClick={() => setIndex(i => i - 1)}>Vorige</button>
            )}
            <button type="button" className="btn btn-p btn-sm" autoFocus
              onClick={() => (laatste ? stop() : setIndex(i => i + 1))}>
              {laatste ? 'Klaar' : 'Volgende'}
            </button>
          </div>
        </div>
        <button type="button" className="rl-geen-meer" onClick={geenMeer}>Geen rondleidingen meer tonen</button>
      </div>
    </div>,
    document.body,
  );
}
