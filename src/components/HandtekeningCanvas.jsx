// Handtekeningvak, gedeeld door de werkbon-afrondmodal (monteur geeft z'n
// telefoon aan de klant) en de publieke ondertekenpagina.
//
// De tekenlogica komt uit OfferteSigneren en is bewust letterlijk overgenomen:
// touch-events gaan direct op het DOM-element met passive:false, want anders
// scrollt de pagina mee terwijl iemand tekent. Er zit met opzet geen resize-
// listener op — die wist het canvas op het moment dat een telefoon draait of
// het toetsenbord opkomt.

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

const HandtekeningCanvas = forwardRef(function HandtekeningCanvas(
  { hoogte = 160, disabled = false, onChange }, ref,
) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [heeftHandtekening, setHeeftHandtekening] = useState(false);

  const markeer = () => {
    if (!heeftHandtekening) { setHeeftHandtekening(true); onChange?.(true); }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = hoogte;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pos = t => {
      const r = canvas.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const start = e => { if (disabled) return; e.preventDefault(); drawing.current = true; lastPos.current = pos(e.touches[0]); };
    const move = e => {
      if (!drawing.current || disabled) return;
      e.preventDefault();
      const p = pos(e.touches[0]);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPos.current = p;
      markeer();
    };
    const end = () => { drawing.current = false; };

    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return () => {
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, [hoogte, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const muisPos = e => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const wis = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHeeftHandtekening(false);
    onChange?.(false);
  };

  useImperativeHandle(ref, () => ({
    isLeeg: () => !heeftHandtekening,
    wis,
    dataUrl: () => (heeftHandtekening ? canvasRef.current?.toDataURL('image/png') : null),
  }), [heeftHandtekening]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: '.85rem' }}>Handtekening klant</div>
        {heeftHandtekening && !disabled && (
          <button
            type="button"
            onClick={wis}
            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '.8rem', textDecoration: 'underline' }}
          >
            Wissen
          </button>
        )}
      </div>
      <div style={{
        border: '2px dashed #d1d5db', borderRadius: 8, background: '#fafafa',
        cursor: disabled ? 'not-allowed' : 'crosshair', touchAction: 'none', position: 'relative',
        opacity: disabled ? .6 : 1,
      }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', borderRadius: 8 }}
          onMouseDown={e => { if (!disabled) { drawing.current = true; lastPos.current = muisPos(e); } }}
          onMouseMove={e => {
            if (!drawing.current || disabled) return;
            const ctx = canvasRef.current.getContext('2d');
            const p = muisPos(e);
            ctx.beginPath();
            ctx.moveTo(lastPos.current.x, lastPos.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            lastPos.current = p;
            markeer();
          }}
          onMouseUp={() => { drawing.current = false; }}
          onMouseLeave={() => { drawing.current = false; }}
        />
        {!heeftHandtekening && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#9ca3af', fontSize: '.85rem', pointerEvents: 'none',
          }}>
            Laat de klant hier tekenen
          </div>
        )}
      </div>
    </div>
  );
});

export default HandtekeningCanvas;
