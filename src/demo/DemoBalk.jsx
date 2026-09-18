// De balk boven de demo.
//
// Twee dingen moeten altijd duidelijk zijn: dat dit voorbeelddata is (anders
// denkt een bezoeker dat hij naar een echt bedrijf kijkt), en hoe je een eigen
// account begint. Daarom staat hij vast bovenaan en schuift hij niet weg.
//
// Eigen opmaak in dit bestand in plaats van in bb-dashboard.css: de balk hoort
// bij de demo, niet bij het product. Zo blijft de dashboardopmaak schoon.

const balk = {
  position: 'sticky',
  top: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '8px 14px',
  background: '#0D0D0D',
  color: '#fff',
  fontSize: 13,
  lineHeight: 1.4,
};

const knop = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#1DDB62',
  color: '#0D0D0D',
  border: 0,
  borderRadius: 999,
  padding: '6px 14px',
  fontWeight: 700,
  fontSize: 12.5,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const terug = {
  background: 'none',
  border: '1px solid rgba(255,255,255,.25)',
  color: 'rgba(255,255,255,.85)',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 12.5,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export default function DemoBalk({ navigate }) {
  const ga = pad => () => (navigate ? navigate(pad) : (window.location.href = pad));

  return (
    <div style={balk} role="region" aria-label="Demo-omgeving">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <span style={{
          background: '#1DDB62', color: '#0D0D0D', borderRadius: 4,
          padding: '2px 7px', fontWeight: 800, fontSize: 11, letterSpacing: '.04em',
        }}>DEMO</span>
        <span style={{ minWidth: 0 }}>
          Je kijkt naar <strong>Van Dijk Schilderwerken</strong>, een verzonnen bedrijf.
          {' '}<span style={{ opacity: .75 }}>Klik gerust rond — er wordt niets opgeslagen en er gaat geen e-mail uit.</span>
        </span>
      </span>
      <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button type="button" style={terug} onClick={ga('/')}>Naar de site</button>
        <button type="button" style={knop} onClick={ga('/register')}>Start gratis proefaccount</button>
      </span>
    </div>
  );
}
