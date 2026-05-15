import { I } from '../../bb-shared.jsx';

export function DashboardCustomizeBar({ onAdd, onLayoutPicker, onReset, onSave, onCancel, saving, isDirty, saveError }) {
  return (
    <>
      {/* === Sticky dark bar (status + save/cancel) === */}
      <div className="dw-bar afu">
        <div className="dw-bar-left">
          <span
            className="dw-bar-dot"
            style={isDirty ? { background: '#d97706', boxShadow: '0 0 0 3px rgba(217,119,6,0.18)' } : {}}
          />
          <div>
            <div className="dw-bar-label">Aanpasmodus</div>
            <div className="dw-bar-hint">
              {isDirty ? 'Niet opgeslagen wijzigingen' : 'Geen wijzigingen'}
            </div>
          </div>
          {saveError && <span className="dw-bar-error">{saveError}</span>}
        </div>
        <div className="dw-bar-actions">
          {/* Desktop-only buttons inside the bar */}
          <button className="btn btn-s btn-sm dw-bar-desktop-only" onClick={onLayoutPicker}>
            {I.dash} Layout kiezen
          </button>
          <button className="btn btn-s btn-sm dw-bar-desktop-only" onClick={onAdd}>
            {I.plus} Blok toevoegen
          </button>
          <button className="btn btn-s btn-sm dw-bar-reset dw-bar-desktop-only" onClick={onReset}>
            Reset
          </button>
          {isDirty && <span className="dw-bar-dirty">Niet opgeslagen</span>}
          <button className="btn btn-xs dw-bar-cancel" onClick={onCancel}>
            Annuleren
          </button>
          <button
            className="btn btn-p btn-xs dw-bar-save"
            onClick={onSave}
            disabled={saving || !isDirty}
            title={!isDirty ? 'Geen wijzigingen om op te slaan' : undefined}
          >
            {saving ? 'Opslaan…' : <>{I.check} Opslaan</>}
          </button>
        </div>
      </div>

      {/* === Mobile-only action row below bar === */}
      <div className="dw-mobile-actions">
        <button className="dw-mobile-add" onClick={onAdd}>
          {I.plus}<span>Blok toevoegen</span>
        </button>
        <button className="dw-mobile-layout" onClick={onLayoutPicker}>
          {I.dash}
        </button>
        <button className="dw-mobile-reset" onClick={onReset}>
          {I.trash}
        </button>
      </div>
    </>
  );
}
