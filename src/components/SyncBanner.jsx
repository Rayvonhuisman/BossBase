// Vaste melding bovenin zolang een boekhoud-synchronisatie loopt.
//
// Een toast is hier ongeschikt: die verdwijnt na een paar seconden, terwijl een
// sync minuten kan duren (SnelStart wordt per boeking benaderd, met pauzes
// tussen de aanroepen). Zonder melding lijkt het alsof er niets gebeurt en
// klikt de gebruiker nog een keer.
//
// Vormgeving volgt .bb-toast (donkere kaart, accentrand links, .84rem/600) —
// zie .bb-syncbar in bb-dashboard.css — zodat het niet als een vreemd element
// in de app staat.

import { useEffect, useState } from 'react';

export default function SyncBanner({ actief, tekst }) {
  const [seconden, setSeconden] = useState(0);

  useEffect(() => {
    if (!actief) { setSeconden(0); return; }
    const t = setInterval(() => setSeconden(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [actief]);

  if (!actief) return null;

  const duur = seconden < 60
    ? `${seconden} sec`
    : `${Math.floor(seconden / 60)} min ${String(seconden % 60).padStart(2, '0')} sec`;

  return (
    <div className="bb-syncbar" role="status" aria-live="polite">
      <span className="bb-syncbar-spin" aria-hidden="true" />
      <span>
        {tekst} <span className="bb-syncbar-duur">· {duur} · laat dit scherm open</span>
      </span>
    </div>
  );
}
