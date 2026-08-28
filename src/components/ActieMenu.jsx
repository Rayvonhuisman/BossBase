// Acties achter drie puntjes.
//
// Losse iconen naast elkaar werken tot een stuk of drie; daarna weet niemand
// meer wat welk icoontje doet en welke actie de belangrijkste is. Dit menu haalt
// alles wat niet de hoofdactie is uit het zicht, zonder het weg te nemen.
//
// De vorm komt uit de klantenlijst (DatabasePage, rowMenuOpen): zelfde witte
// paneel, zelfde schaduw, zelfde regelhoogte, en sluiten op een mousedown ergens
// anders. Bewust hier samengebracht in plaats van nog een keer overgeschreven —
// de facturenlijst en de factuurkaart gebruiken hem allebei.

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * @param items  [{ label, icon?, onClick, gevaarlijk?, scheiding? }]
 *               `scheiding` zet een lijn bóven het item — daarmee komen
 *               crediteren en verwijderen los van de gewone acties te staan.
 * @param knop   'icoon' (in een tabelrij) of 'knop' (op een kaart)
 */
export default function ActieMenu({ items = [], knop = 'icoon', titel = 'Meer acties', label = 'Acties' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Zelfde sluitgedrag als in de klantenlijst: één listener op het document,
    // en klikken ín het paneel telt niet mee (stopPropagation hieronder).
    const sluit = () => setOpen(false);
    document.addEventListener('mousedown', sluit);
    return () => document.removeEventListener('mousedown', sluit);
  }, [open]);

  const zichtbaar = items.filter(Boolean);
  if (!zichtbaar.length) return null;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} ref={ref}>
      {knop === 'icoon' ? (
        <button
          className="btn btn-xs btn-ghost btn-icon"
          title={titel}
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        ><MoreVertical size={14} /></button>
      ) : (
        <button
          className="btn btn-s"
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >{label} <MoreVertical size={14} /></button>
      )}

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: knop === 'knop' ? 'calc(100% + 6px)' : undefined,
            top: knop === 'knop' ? undefined : 'calc(100% + 4px)',
            right: 0, zIndex: 200, background: 'white',
            border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 200, overflow: 'hidden',
          }}
        >
          {zichtbaar.map((it, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); it.onClick?.(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '10px 14px', background: 'none', border: 'none',
                borderTop: it.scheiding ? '1px solid var(--border)' : 'none',
                textAlign: 'left', cursor: 'pointer', fontSize: 13,
                color: it.gevaarlijk ? '#dc2626' : 'var(--dk)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = it.gevaarlijk ? '#fff1f2' : 'var(--bgs)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
