// Het voorbeeldscherm op de homepage: de ECHTE app in een kader.
//
// Waarom een kader en geen nabouw: een nagebouwd scherm loopt binnen een maand
// uit de pas met het product. Hier laadt de app zichzelf onder /demo, op
// nepdata. Wat je ziet ís dus het portaal — inclusief elke toekomstige
// wijziging, zonder dat iemand dit bestand hoeft bij te werken.
//
// Waarom een iframe en niet de componenten rechtstreeks: de marketingsite en
// het dashboard hebben elk hun eigen opmaak, met botsende regels voor body,
// knoppen en tabellen. Een eigen document houdt die twee uit elkaar.
//
// Het kader toont een vaste breedte van 1280px en schaalt dat naar de
// beschikbare ruimte. Zo ziet een bezoeker de volledige indeling met zijbalk,
// ook als het blok zelf smaller is.

import { useState, useEffect, useRef } from 'react';

const PAGINAS = [
  ['dashboard',  'Dashboard'],
  ['pipeline',   'Pipeline'],
  ['werkbonnen', 'Werkbonnen'],
  ['planning',   'Planning'],
  ['offertes',   'Offertes'],
  ['facturen',   'Facturen'],
];

// Het portaal is voor een groot scherm gebouwd. Kleiner tonen kan, maar dan
// wordt het onleesbaar; daarom schalen we een brede weergave terug in plaats
// van de app zelf smal te maken.
const ONTWERPBREEDTE = 1280;
const ONTWERPHOOGTE = 800;

export default function PortaalKader() {
  const [pagina, setPagina] = useState('dashboard');
  const [schaal, setSchaal] = useState(1);
  const wrapRef = useRef(null);

  useEffect(() => {
    const meet = () => {
      const breedte = wrapRef.current?.clientWidth || ONTWERPBREEDTE;
      setSchaal(Math.min(1, breedte / ONTWERPBREEDTE));
    };
    meet();
    window.addEventListener('resize', meet);
    return () => window.removeEventListener('resize', meet);
  }, []);

  const pad = pagina === 'dashboard' ? '/demo' : `/demo/${pagina}`;

  return (
    <div className="demo-wrap choreo-body" style={{ display: 'block', minHeight: 0, overflow: 'hidden' }}>
      <span className="demo-tag">Voorbeeld</span>

      <nav
        aria-label="Voorbeeldschermen"
        style={{
          display: 'flex', gap: 2, overflowX: 'auto', background: 'var(--dk)',
          padding: '0 10px', scrollbarWidth: 'none',
        }}
      >
        {PAGINAS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPagina(id)}
            aria-current={pagina === id ? 'page' : undefined}
            className={`demo-nav-item${pagina === id ? ' active' : ''}`}
            style={{ flex: 'none', borderLeft: 0, borderRadius: 0 }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div ref={wrapRef} style={{ height: ONTWERPHOOGTE * schaal, overflow: 'hidden', background: '#fff' }}>
        <iframe
          key={pad}
          src={pad}
          title={`Voorbeeld: ${PAGINAS.find(p => p[0] === pagina)?.[1]}`}
          loading="lazy"
          style={{
            width: ONTWERPBREEDTE,
            height: ONTWERPHOOGTE,
            border: 0,
            display: 'block',
            transform: `scale(${schaal})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
}
