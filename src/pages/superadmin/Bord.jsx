import { useEffect, useRef, useState } from 'react';

// Het bord voor Aanvragen en Websites, met dezelfde werking als de pipeline in
// het dashboard (BbDashboard.jsx): kolommen over de volle hoogte, kaarten slepen
// naar een andere fase (native HTML5 drag & drop) en de dunne "ghost"-scrollbalk
// boven het bord. Een gewone klik op een kaart opent hem; de browser slikt de
// klik na een echte sleepbeweging zelf in.
//
//   kolommen      [{ id, kop (node), sub, vergrendeld: 'reden' }]; op een
//                 vergrendelde kolom kun je niet neerzetten (onGeweigerd)
//   items         alle kaarten; kolomVan(item) zegt in welke kolom
//   sleutel       item → unieke sleutel
//   kaart         item → inhoud van de kaart; kaartKlasse → extra klasse
//   onOpen        item → openen
//   onVerplaats   (item, naarKolom) → Promise; de kaart staat meteen in de
//                 nieuwe kolom en springt terug bij een fout of `false`
//   tijdensSlepen kolommen die verborgen zijn en pas verschijnen als je
//                 sleept (bijv. Afgewezen), zodat ze wel een dropdoel zijn
export function Bord({ kolommen, items, sleutel, kolomVan, kaart, kaartKlasse, onOpen, onVerplaats, onGeweigerd, tijdensSlepen = [] }) {
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const rafRef = useRef(0);
  const sleepRef = useRef(null);
  const [scrollbaar, setScrollbaar] = useState(false);
  const [pct, setPct] = useState(0);
  const [duim, setDuim] = useState(0.2);
  const [hover, setHover] = useState(false);
  const [sleept, setSleept] = useState(null);
  const [boven, setBoven] = useState(null);
  const [verplaatst, setVerplaatst] = useState({});

  // Na nieuwe gegevens gelden de echte kolommen weer.
  useEffect(() => { setVerplaatst({}); }, [items]);

  const sync = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = wrapRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      setScrollbaar(max > 4);
      setPct(max > 0 ? el.scrollLeft / max : 0);
      setDuim(el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1);
    });
  };
  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  });
  const naarPct = (p, glad) => {
    const el = wrapRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(1, p)) * (el.scrollWidth - el.clientWidth), behavior: glad ? 'smooth' : 'auto' });
  };
  const opTrack = e => {
    const r = trackRef.current.getBoundingClientRect();
    const tw = Math.max(duim, 0.08);
    const vanX = cx => ((cx - r.left) / r.width - tw / 2) / (1 - tw);
    naarPct(vanX(e.clientX), false);
    const beweeg = ev => naarPct(vanX(ev.clientX), false);
    const los = () => { window.removeEventListener('pointermove', beweeg); window.removeEventListener('pointerup', los); };
    window.addEventListener('pointermove', beweeg);
    window.addEventListener('pointerup', los);
  };

  const kolomVanItem = item => verplaatst[sleutel(item)] ?? kolomVan(item);
  const zichtbaar = kolommen.filter(k => !tijdensSlepen.includes(k.id) || sleept);

  const start = (e, item) => {
    if (e.target.closest('button, select, input, a')) { e.preventDefault(); return; }
    sleepRef.current = item;
    setSleept(sleutel(item));
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', sleutel(item)); } catch { /* Safari */ }
  };
  const einde = () => { sleepRef.current = null; setSleept(null); setBoven(null); };
  const over = (e, kolom) => {
    if (!sleepRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = kolom.vergrendeld ? 'none' : 'move';
    if (boven !== kolom.id) setBoven(kolom.id);
  };
  const weg = (e, kolom) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setBoven(b => (b === kolom.id ? null : b));
  };
  const los = async (e, kolom) => {
    e.preventDefault();
    const item = sleepRef.current;
    einde();
    if (!item) return;
    const van = kolomVanItem(item);
    if (van === kolom.id) return;
    if (kolom.vergrendeld) { onGeweigerd?.(kolom.vergrendeld); return; }
    const k = sleutel(item);
    setVerplaatst(v => ({ ...v, [k]: kolom.id }));
    try {
      const gelukt = await onVerplaats(item, kolom.id);
      if (gelukt === false) setVerplaatst(v => { const n = { ...v }; delete n[k]; return n; });
    } catch {
      setVerplaatst(v => { const n = { ...v }; delete n[k]; return n; });
    }
  };

  return (
    <div className={`pipe-ghost-zone${hover ? ' is-hover' : ''}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {scrollbaar && (
        <div className="pipe-ghost afu2">
          <div ref={trackRef} className="pipe-ghost-track" onPointerDown={opTrack} role="scrollbar" aria-orientation="horizontal"
            aria-label="Bord horizontaal scrollen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'ArrowRight') { e.preventDefault(); wrapRef.current?.scrollBy({ left: 300, behavior: 'smooth' }); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); wrapRef.current?.scrollBy({ left: -300, behavior: 'smooth' }); }
            }}>
            <div className="pipe-ghost-thumb" style={{ width: `${Math.max(duim * 100, 8)}%`, left: `${pct * (100 - Math.max(duim * 100, 8))}%` }} />
          </div>
        </div>
      )}
      <div className="pipe-wrap afu2" ref={wrapRef} onScroll={sync}>
        <div className="pipe-board sa-bord">
          {zichtbaar.map(kolom => {
            const lijst = items.filter(i => kolomVanItem(i) === kolom.id);
            const doel = boven === kolom.id;
            return (
              <div key={kolom.id}
                className={`pipe-col sa-col${doel && !kolom.vergrendeld ? ' pipe-col-drop' : ''}${doel && kolom.vergrendeld ? ' sa-col-dicht' : ''}`}
                onDragOver={e => over(e, kolom)} onDragLeave={e => weg(e, kolom)} onDrop={e => los(e, kolom)}>
                <div className="pipe-col-hd">
                  <div>
                    {kolom.kop}
                    {kolom.sub && <div style={{ fontSize: '.68rem', color: 'var(--dl)', marginTop: 4 }}>{kolom.sub}</div>}
                  </div>
                  <span className="pipe-col-cnt">{lijst.length}</span>
                </div>
                <div className="pipe-cards">
                  {lijst.map(item => (
                    <div key={sleutel(item)} role="button" tabIndex={0}
                      className={`pc sa-pc${kaartKlasse ? ` ${kaartKlasse(item)}` : ''}${sleept === sleutel(item) ? ' pc-dragging' : ''}`}
                      draggable onDragStart={e => start(e, item)} onDragEnd={einde}
                      onClick={() => onOpen(item)} onKeyDown={e => e.key === 'Enter' && onOpen(item)}>
                      {kaart(item)}
                    </div>
                  ))}
                  {lijst.length === 0 && <div className="sa-col-leeg">{sleept && !kolom.vergrendeld ? 'Hierheen slepen' : 'Leeg'}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
