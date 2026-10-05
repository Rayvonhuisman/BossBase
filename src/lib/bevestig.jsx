import { useEffect, useState } from 'react';
import { ModalX } from '../bb-shared.jsx';

// ── Bevestigen in het eigen venster van de app ──────────────────────────────
// In plaats van window.confirm(): die pop-up van de browser past niet bij de
// rest van de app, ziet er per browser anders uit en blokkeert de hele pagina.
//
//   if (!(await bevestig('Factuur BB-F001 verwijderen?'))) return;
//   if (!(await bevestig({ titel: 'Koppeling verbreken', tekst: '…', knop: 'Verbreken' }))) return;
//
// Eén venster voor de hele app (BevestigVenster, gemount in App). Escape, het
// kruisje en klikken naast het venster betekenen "nee"; Enter bevestigt.

let toon = null;

function opties(invoer) {
  const o = typeof invoer === 'string' ? { tekst: invoer } : { ...(invoer || {}) };
  const t = String(o.tekst || '');
  if (!o.knop) {
    if (/verwijder/i.test(t)) o.knop = 'Verwijderen';
    else if (/ontkoppel/i.test(t)) o.knop = 'Ontkoppelen';
    else if (/verbreken/i.test(t)) o.knop = 'Verbreken';
    else if (/blokkeren/i.test(t)) o.knop = 'Blokkeren';
    else if (/terugzetten/i.test(t)) o.knop = 'Terugzetten';
    else o.knop = 'Doorgaan';
  }
  if (o.gevaarlijk === undefined) o.gevaarlijk = /verwijder|ontkoppel|verbreken|blokkeren/i.test(t + ' ' + o.knop);
  return o;
}

export function bevestig(invoer) {
  const o = opties(invoer);
  // Vangnet als het venster (nog) niet gemount is: liever de browserpop-up dan
  // een actie die zonder bevestiging doorgaat.
  if (!toon) return Promise.resolve(window.confirm(o.tekst || o.titel || 'Doorgaan?'));
  return new Promise(resolve => toon({ ...o, resolve }));
}

export function BevestigVenster() {
  const [v, setV] = useState(null);
  useEffect(() => {
    toon = setV;
    return () => { if (toon === setV) toon = null; };
  }, []);
  if (!v) return null;
  const klaar = ok => { v.resolve(ok); setV(null); };
  return (
    <div className="overlay" style={{ zIndex: 10000 }} onClick={e => e.target === e.currentTarget && klaar(false)}>
      <div className="modal" style={{ maxWidth: 440 }} role="alertdialog" aria-modal="true" aria-labelledby="bb-bevestig-titel">
        <div className="modal-hd">
          <div className="modal-title" id="bb-bevestig-titel">{v.titel || 'Weet je het zeker?'}</div>
          <ModalX onClose={() => klaar(false)} />
        </div>
        {v.tekst && (
          <p style={{ margin: '0 0 6px', color: 'var(--dm)', fontSize: '.9rem', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{v.tekst}</p>
        )}
        <div className="fa">
          <button className="btn btn-ghost" onClick={() => klaar(false)}>Annuleren</button>
          <button className={`btn ${v.gevaarlijk ? 'btn-danger' : 'btn-p'}`} autoFocus onClick={() => klaar(true)}>{v.knop}</button>
        </div>
      </div>
    </div>
  );
}
