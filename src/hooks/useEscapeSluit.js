import { useEffect, useRef } from 'react';

// ── Escape sluit het bovenste venster ────────────────────────────────────────
// Eén luisteraar voor de hele app, met een stapel erachter: het venster dat het
// laatst openging, sluit het eerst.
//
// Die stapel is de hele reden dat dit een hook is en geen los stukje code per
// venster. Met een luisteraar per venster sluit Escape boven een modal óók de
// drawer eronder — of juist alleen de drawer, terwijl de modal blijft staan.
//
// De sluitfunctie komt uit een ref: vensters geven een inline-arrow mee, en dan
// zou elke render de volgorde van de stapel omgooien.
//
// Wie Escape al zelf afhandelt (een zoeklijst in een adresveld, een inline
// bewerkveld) roept preventDefault aan; dat laten we met rust, anders sluit het
// venster mee terwijl je alleen het lijstje eronder wilde wegklikken.

const stapel = [];
let luistert = false;

function zorgVoorLuisteraar() {
  if (luistert || typeof window === 'undefined') return;
  luistert = true;
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || !stapel.length) return;
    const sluit = stapel[stapel.length - 1].ref.current;
    if (typeof sluit !== 'function') return;
    e.preventDefault();
    sluit();
  });
}

/**
 * Escape sluit dit venster, zolang het bovenop ligt.
 *
 * `actief` op false houdt het venster buiten de stapel — handig zolang er wordt
 * opgeslagen, zodat Escape niet halverwege een bewerking dichtklapt.
 */
export function useEscapeSluit(onClose, actief = true) {
  const ref = useRef(onClose);
  ref.current = onClose;

  const aan = actief && typeof onClose === 'function';
  useEffect(() => {
    if (!aan) return undefined;
    zorgVoorLuisteraar();
    const item = { ref };
    stapel.push(item);
    return () => {
      const i = stapel.indexOf(item);
      if (i >= 0) stapel.splice(i, 1);
    };
  }, [aan]);
}
