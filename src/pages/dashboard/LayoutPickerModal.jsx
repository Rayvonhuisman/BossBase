import { I } from '../../bb-shared.jsx';
import { DEFAULT_LAYOUTS, layoutPermissions } from '../../data/widgetRegistry.js';

// Mini grid preview showing approximate widget row proportions
const LAYOUT_ROWS = {
  medewerker:[[6,6], [6,6]],
  standaard: [[3,3,3,3], [6,6], [6,6], [12]],
  sales:     [[3,3,3,3], [6,6], [4,4,4]],
  planning:  [[3,3,3,3], [6,6], [4,4,4]],
  financial: [[3,3,3,3], [6,6], [6,3,3]],
};

function LayoutPreview({ layoutKey }) {
  const rows = LAYOUT_ROWS[layoutKey] || [[3,3,3,3]];
  return (
    <div className="dw-layout-preview-desktop" style={{
      padding: 8, borderRadius: 8, background: 'var(--bgs)', border: '1px solid var(--border)',
      flexDirection: 'column', gap: 4, height: 100, marginBottom: 12, width: '100%',
    }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 3, flex: 1 }}>
          {r.map((s, k) => (
            <div key={k} style={{
              flex: s, borderRadius: 3,
              background: i === 0 ? '#1DDB62' : (k === 0 ? '#cbd5e1' : '#e2e8f0'),
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Mobile 2×2 thumbnail
function LayoutThumb({ widgetCount }) {
  const greenCount = widgetCount >= 4 ? 4 : widgetCount >= 3 ? 3 : widgetCount >= 2 ? 2 : 1;
  return (
    <div className="dw-layout-thumb">
      {[0,1,2,3].map(i => (
        <div key={i} className="dw-layout-thumb-cell" style={{ background: i < greenCount ? '#1DDB62' : '#e2e8f0' }} />
      ))}
    </div>
  );
}

export function LayoutPickerModal({ onApply, onClose, currentLayout, can }) {
  // Toon een layout alleen als de gebruiker alle rechten heeft voor de widgets erin.
  const visibleLayouts = Object.entries(DEFAULT_LAYOUTS)
    .filter(([key]) => layoutPermissions(key).every(p => !can || can(p)));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 660 }}>
        {/* Grab handle (mobile bottom sheet) */}
        <div className="dw-sheet-handle">
          <div className="dw-sheet-handle-bar" />
        </div>

        <div className="modal-hd">
          <div>
            <div className="modal-title">Layout kiezen</div>
            <div className="modal-sub">
              {currentLayout === 'custom'
                ? 'Aangepaste layout actief — kies een sjabloon om te resetten'
                : 'Start met een sjabloon — je kunt daarna alles aanpassen'}
            </div>
          </div>
          <button className="modal-x" onClick={onClose}>{I.x}</button>
        </div>

        {/* Desktop: 2-col grid with previews / Mobile: single column list */}
        <div className="dw-layout-modal-grid">
          {visibleLayouts.map(([key, layout]) => {
            const isActive = currentLayout === key;
            return (
              <button
                key={key}
                className="dw-layout-option"
                style={isActive ? { borderColor: '#1DDB62', background: '#f0fdf4' } : {}}
                onClick={() => { onApply(key); onClose(); }}
              >
                {/* Desktop: icon */}
                <div className="dw-layout-icon">{I[layout.iconKey] ?? I.dash}</div>
                {/* Desktop: layout preview grid */}
                <LayoutPreview layoutKey={key} />
                {/* Mobile: 2×2 thumbnail */}
                <LayoutThumb widgetCount={layout.widgets.length} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div className="dw-layout-label">{layout.label}</div>
                    {isActive && <span className="dw-layout-badge">HUIDIG</span>}
                  </div>
                  <div className="dw-layout-desc">{layout.description}</div>
                  <div className="dw-layout-count">{layout.widgets.length} blokken</div>
                </div>
                {/* Desktop: arrow */}
                <div className="dw-layout-arrow">{I.chev_r}</div>
                {/* Mobile: Kies/In gebruik button */}
                <button
                  className="dw-layout-kies"
                  style={isActive
                    ? { background: '#f0fdf4', color: '#15A34A', border: '1px solid #1DDB62' }
                    : { background: '#1DDB62', color: '#0D0D0D', border: 'none' }
                  }
                  onClick={e => { e.stopPropagation(); if (!isActive) { onApply(key); onClose(); } }}
                >
                  {isActive ? 'In gebruik' : 'Kies'}
                </button>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
