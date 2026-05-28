import { useState, useCallback, useRef } from 'react';
import { WidgetCard } from './WidgetCard.jsx';

// Coordinates HTML5 drag-and-drop across widgets in edit mode.
// - draggable={editMode} on each WidgetCard
// - On dragstart, we record the source index
// - On dragover, the hovered widget reports its index — we set it as the
//   tentative drop target, which shows a dashed-green placeholder slot
// - On drop, we call onReorder(from, to) so DashboardHome can splice the
//   widgets array (persisted later via the existing Opslaan button)
// - dragend always clears state so the UI never gets stuck if the user
//   drops outside the grid
export function DashboardWidgetGrid({
  widgets, editMode, data,
  setPage, openCustomer, openDeal, openInvoice, openCalendarEvent,
  onMoveUp, onMoveDown, onResize, onRemove, onReorder, onSettingsChange,
}) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  // We dedupe rapid dragover events to avoid jank.
  const lastOverRef = useRef(null);

  const handleDragStart = useCallback((idx) => {
    setDragIdx(idx);
    setOverIdx(idx);
    lastOverRef.current = idx;
  }, []);

  const handleDragOver = useCallback((idx) => {
    if (dragIdx == null) return;
    if (lastOverRef.current === idx) return;
    lastOverRef.current = idx;
    setOverIdx(idx);
  }, [dragIdx]);

  const handleDrop = useCallback(() => {
    if (dragIdx != null && overIdx != null && dragIdx !== overIdx) {
      onReorder && onReorder(dragIdx, overIdx);
    }
    setDragIdx(null);
    setOverIdx(null);
    lastOverRef.current = null;
  }, [dragIdx, overIdx, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
    lastOverRef.current = null;
  }, []);

  return (
    <div
      className={`dw-grid${editMode ? ' dw-edit-mode' : ''}${dragIdx != null ? ' dw-dragging' : ''}`}
      onDragOver={editMode ? (e => e.preventDefault()) : undefined}
      onDrop={editMode ? handleDrop : undefined}
    >
      {widgets.map((widget, idx) => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          editMode={editMode}
          isFirst={idx === 0}
          isLast={idx === widgets.length - 1}
          dragIdx={dragIdx}
          overIdx={overIdx}
          index={idx}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          onMoveUp={() => onMoveUp(idx)}
          onMoveDown={() => onMoveDown(idx)}
          onResize={size => onResize(idx, size)}
          onRemove={() => onRemove(idx)}
          onSettingsChange={settings => onSettingsChange(idx, settings)}
          data={data}
          setPage={setPage}
          openCustomer={openCustomer}
          openDeal={openDeal}
          openInvoice={openInvoice}
          openCalendarEvent={openCalendarEvent}
        />
      ))}
      {widgets.length === 0 && (
        <div className="dw-empty-state">
          <div className="empty-title">Geen widgets op je dashboard</div>
          <div className="empty-sub">Klik op "+ Blok toevoegen" om widgets toe te voegen</div>
        </div>
      )}
    </div>
  );
}
