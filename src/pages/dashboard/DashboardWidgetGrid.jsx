import { WidgetCard } from './WidgetCard.jsx';

export function DashboardWidgetGrid({ widgets, editMode, data, setPage, openCustomer, openDeal, openInvoice, openCalendarEvent, onMoveUp, onMoveDown, onResize, onRemove, onSettingsChange }) {
  return (
    <div className={`dw-grid${editMode ? ' dw-edit-mode' : ''}`}>
      {widgets.map((widget, idx) => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          editMode={editMode}
          isFirst={idx === 0}
          isLast={idx === widgets.length - 1}
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
          <div className="empty-emoji">📊</div>
          <div className="empty-title">Geen widgets op je dashboard</div>
          <div className="empty-sub">Klik op "+ Blok toevoegen" om widgets toe te voegen</div>
        </div>
      )}
    </div>
  );
}
