import { useEffect, useRef, useState } from 'react';

// Een blok in de planning verslepen (begin en eind schuiven mee) of aan de
// boven- of onderrand rekken (alleen begin of alleen eind).
//
// Muis: slepen begint pas na een paar pixels, zodat een klik een klik blijft.
// Vinger: pas na even vasthouden. Anders kun je de tijdlijn niet meer scrollen
// zodra je vinger op een blok landt — en op een tablet staat de week vol.
//
// Tijden in minuten sinds middernacht, vastgeklikt op STAP_MIN. Tijdens het
// slepen staat de voorlopige tijd in `voorlopig`; pas bij loslaten gaat hij
// naar onKlaar. Die geeft een promise: tot hij klaar is blijft het blok op de
// nieuwe tijd staan, bij een fout springt het terug.

export const STAP_MIN = 15;

const MUIS_DREMPEL_PX = 4;
const VASTHOUDEN_MS = 300;
const VINGER_SPELING_PX = 8;
const RAND_MUIS_PX = 7;
const RAND_VINGER_PX = 14;

const klik = m => Math.round(m / STAP_MIN) * STAP_MIN;

export function useBlokSlepen({ start, eind, pxPerMin, min, max, uit = false, onKlaar }) {
  const [voorlopig, setVoorlopig] = useState(null); // { start, eind, modus }
  const [bezig, setBezig] = useState(false);
  const staat = useRef(null);
  const klikNegeren = useRef(false);
  const elRef = useRef(null);

  // Scrollen tegenhouden zodra een vinger aan het slepen is. Moet een niet-
  // passieve listener zijn: React registreert touchmove passief, en dan mag
  // preventDefault niet.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;
    const tegen = e => { if (staat.current?.actief) e.preventDefault(); };
    el.addEventListener('touchmove', tegen, { passive: false });
    return () => el.removeEventListener('touchmove', tegen);
  }, []);

  useEffect(() => () => clearTimeout(staat.current?.timer), []);

  const bereken = (s, dy) => {
    const verschil = dy / pxPerMin;
    if (s.modus === 'verplaats') {
      // De duur blijft exact zoals hij was: verplaatsen verzet alleen het
      // tijdstip. Alleen de begintijd klikt vast op een kwartier — rekte je de
      // duur af, dan zou een afspraak van een uur bij het verschuiven zomaar
      // korter worden.
      const duur = Math.max(STAP_MIN, s.eind - s.start);
      const nieuwStart = Math.min(Math.max(klik(s.start + verschil), min), max - duur);
      return { start: nieuwStart, eind: nieuwStart + duur };
    }
    if (s.modus === 'begin') {
      // Eindtijd blijft na de begintijd: minstens één stap ertussen.
      return { start: Math.min(Math.max(klik(s.start + verschil), min), s.eind - STAP_MIN), eind: s.eind };
    }
    return { start: s.start, eind: Math.max(Math.min(klik(s.eind + verschil), max), s.start + STAP_MIN) };
  };

  const activeer = s => {
    s.actief = true;
    try { s.el.setPointerCapture(s.id); } catch { /* element al weg */ }
    setVoorlopig({ start: s.start, eind: s.eind, modus: s.modus });
  };

  const stop = () => {
    clearTimeout(staat.current?.timer);
    staat.current = null;
  };

  const onPointerDown = e => {
    klikNegeren.current = false;
    if (uit || bezig) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vinger = e.pointerType !== 'mouse';
    // Bij een laag blok blijft er altijd een middenstuk over om te verslepen.
    const rand = Math.min(vinger ? RAND_VINGER_PX : RAND_MUIS_PX, rect.height / 3);
    const y = e.clientY - rect.top;
    const modus = y <= rand ? 'begin' : y >= rect.height - rand ? 'eind' : 'verplaats';
    const s = { id: e.pointerId, x0: e.clientX, y0: e.clientY, start, eind, modus, vinger, actief: false, timer: null, el: e.currentTarget };
    staat.current = s;
    if (vinger) {
      s.timer = setTimeout(() => {
        if (staat.current !== s) return;
        activeer(s);
        navigator.vibrate?.(10);
      }, VASTHOUDEN_MS);
    }
  };

  const onPointerMove = e => {
    const s = staat.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.actief) {
      // Vinger beweegt vóór het vasthouden om is: dat is scrollen, geen slepen.
      if (s.vinger) {
        if (Math.hypot(dx, dy) > VINGER_SPELING_PX) stop();
        return;
      }
      if (Math.abs(dx) < MUIS_DREMPEL_PX && Math.abs(dy) < MUIS_DREMPEL_PX) return;
      activeer(s);
    }
    e.preventDefault();
    setVoorlopig({ ...bereken(s, dy), modus: s.modus });
  };

  const onPointerUp = async e => {
    const s = staat.current;
    if (!s || e.pointerId !== s.id) return;
    stop();
    if (!s.actief) return; // gewone klik of tik: laat die door
    klikNegeren.current = true;
    const nieuw = bereken(s, e.clientY - s.y0);
    if (nieuw.start === s.start && nieuw.eind === s.eind) { setVoorlopig(null); return; }
    setVoorlopig({ ...nieuw, modus: s.modus });
    setBezig(true);
    try {
      // De modus gaat mee: wie alleen verplaatst, verandert de duur niet — en
      // dus ook niet de eindtijd van iets dat er nog geen had.
      await onKlaar({ ...nieuw, modus: s.modus });
    } catch {
      // De melding komt van onKlaar; het blok springt terug.
    } finally {
      setBezig(false);
      setVoorlopig(null);
    }
  };

  const onPointerCancel = () => {
    if (!staat.current) return;
    stop();
    setVoorlopig(null);
  };

  // Na het slepen volgt nog een click-event; dat mag het blok niet openen.
  const onClickCapture = e => {
    if (!klikNegeren.current) return;
    klikNegeren.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  // Lang vasthouden opent op een tablet anders het contextmenu of selecteert tekst.
  const onContextMenu = e => { if (!uit) e.preventDefault(); };

  return {
    elRef,
    voorlopig,
    bezig,
    handlers: uit
      ? {}
      : { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, onContextMenu },
  };
}
