import { useState } from 'react';
import { I } from '../../bb-shared.jsx';
import { WIDGET_REGISTRY, WIDGET_CATEGORIES, widgetPermission } from '../../data/widgetRegistry.js';

const widgetIcon = w => I[w.iconKey] ?? I.dash;

const SIZE_LABELS = { small: 'Klein', medium: 'Middel', large: 'Groot', full: 'Breed' };

export function AddWidgetModal({ existingTypes, onAdd, onClose, can }) {
  const [activeCategory, setActiveCategory] = useState('popular');
  const [search, setSearch] = useState('');

  // Verberg widgets waar de gebruiker geen recht voor heeft (zelfde filter als
  // het dashboard), zodat een medewerker ze ook niet kan toevoegen.
  const maySee = w => { const p = widgetPermission(w.type); return !p || !can || can(p); };
  const available = WIDGET_REGISTRY.filter(w => !existingTypes.includes(w.type) && maySee(w));

  const filtered = search.trim()
    ? available.filter(w =>
        w.label.toLowerCase().includes(search.toLowerCase()) ||
        (w.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : available.filter(w => w.category === activeCategory);

  const selectCategory = key => {
    setSearch('');
    setActiveCategory(key);
  };

  return (
    <div className="overlay dw-add-wrapper" onClick={onClose}>
      <div
        className="modal modal-wide"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 640, display: 'flex', flexDirection: 'column' }}
      >
        {/* Grab handle (mobile bottom sheet) */}
        <div className="dw-sheet-handle">
          <div className="dw-sheet-handle-bar" />
        </div>

        <div className="modal-hd">
          <div>
            <div className="modal-title">Blok toevoegen</div>
            <div className="modal-sub">{available.length} widgets beschikbaar</div>
          </div>
          <button className="modal-x" onClick={onClose}>{I.x}</button>
        </div>

        {/* Body: category rail (desktop) + right content */}
        <div className="dw-add-body">
          {/* Desktop category sidebar */}
          <nav className="dw-cat-rail">
            {Object.entries(WIDGET_CATEGORIES).map(([key, cat]) => {
              const count = available.filter(w => w.category === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  className={`dw-cat-item${activeCategory === key && !search ? ' active' : ''}`}
                  onClick={() => selectCategory(key)}
                >
                  <span>{cat.label}</span>
                  <span className="dw-cat-count">{count}</span>
                </button>
              );
            })}
          </nav>

          {/* Right panel */}
          <div className="dw-add-right">
            {/* Search */}
            <div className="dw-sheet-search">
              {I.search}
              <input
                type="text"
                placeholder="Zoek een widget…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: 'inherit', color: '#0a0a0a' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                >
                  {I.x}
                </button>
              )}
            </div>

            {/* Mobile category tabs */}
            {!search && (
              <div className="tabs" style={{ marginBottom: 0 }}>
                {Object.entries(WIDGET_CATEGORIES).map(([key, cat]) => {
                  const count = available.filter(w => w.category === key).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      className={`tab${activeCategory === key ? ' active' : ''}`}
                      onClick={() => setActiveCategory(key)}
                    >
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Widget list */}
            <div className="dw-widget-picker">
              {filtered.length === 0 && (
                <div className="empty" style={{ padding: '32px 20px' }}>
                  <div className="empty-title">
                    {search ? 'Geen widgets gevonden' : 'Alle widgets al toegevoegd'}
                  </div>
                  <div className="empty-sub">
                    {search ? 'Probeer een andere zoekterm' : 'Kies een andere categorie'}
                  </div>
                </div>
              )}
              {filtered.map(w => (
                <button key={w.type} className="dw-picker-item" onClick={() => onAdd(w)}>
                  <div className="dw-picker-icon">
                    {widgetIcon(w)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dw-picker-label">{w.label}</div>
                    <div className="dw-picker-desc">{w.description}</div>
                  </div>
                  <div className="dw-picker-size">{SIZE_LABELS[w.defaultSize] || w.defaultSize}</div>
                  <div className="dw-picker-add">{I.plus}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
