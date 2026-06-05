import { useEffect, useState } from 'react';
import { I } from '../../bb-shared.jsx';
import { listCalendarEvents } from '../../services/calendarService.js';

// Losse agenda-events (calendar_events zonder gekoppelde activiteit) krijgen
// een eigen read-only detail. updateCalendarEvent bestaat wel, maar bewerken
// gebeurt veilig op de Agenda-pagina — hier alleen tonen + veilige acties.

const TYPE_LABEL = { job: 'Klus', visit: 'Opname', activity: 'Activiteit', event: 'Afspraak' };
const TYPE_TONE = { job: 'b-orange', visit: 'b-new', activity: 'b-blue', event: 'b-green' };

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#0a0a0a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
      <span style={{ color: '#6b7280' }}>{k}</span>
      <span style={{ fontWeight: 700, color: '#0a0a0a', textAlign: 'right' }}>{v}</span>
    </div>
  );
}

export function CalendarEventDetailDrawer({ eventId, onClose, setPage, openCustomer, openDeal }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [ev, setEv] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    listCalendarEvents()
      .then(list => { if (alive) setEv((list || []).find(x => x.id === eventId) || null); })
      .catch(e => { if (alive) setErr(e.message || 'Laden mislukt'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventId]);

  const HeadClose = (
    <button onClick={onClose} aria-label="Sluiten" style={{
      width: 32, height: 32, borderRadius: 9, border: '1px solid #e7e9ec', background: '#fff',
      color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
    }}>{I.x}</button>
  );

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 800 }}>Agenda-item laden…</div>{HeadClose}</div>
      </div>
    );
  }
  if (err || !ev) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Agenda-item niet gevonden</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{err || 'Dit agenda-item kon niet worden geladen.'}</div>
            <button className="btn btn-s btn-sm" style={{ marginTop: 14 }} onClick={() => { onClose(); setPage('calendar'); }}>Naar agenda</button>
          </div>
          {HeadClose}
        </div>
      </div>
    );
  }

  const tone = TYPE_TONE[ev.type] || 'b-gray';
  const typeLabel = TYPE_LABEL[ev.type] || ev.type || 'Afspraak';
  const isLoose = !ev.activityId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottom: '1px solid #eef0f2' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${tone}`}>{typeLabel}</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, color: '#0a0a0a', marginTop: 6 }}>{ev.title || 'Afspraak'}</div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
            {ev.date || '—'}{(ev.time || ev.end) ? ` · ${ev.time || ''}${ev.end ? `–${ev.end}` : ''}` : ''}
          </div>
        </div>
        {HeadClose}
      </div>

      {isLoose && (
        <div style={{ marginTop: 14, padding: '9px 12px', background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: 9, fontSize: 12, color: '#15A34A' }}>
          Bron: los agenda-item — niet gekoppeld aan een activiteit.
        </div>
      )}

      <Section title="Overzicht">
        <Row k="Titel" v={ev.title || '—'} />
        <Row k="Type" v={typeLabel} />
        <Row k="Datum" v={ev.date || '—'} />
        <Row k="Starttijd" v={ev.time || '—'} />
        <Row k="Eindtijd" v={ev.end || '—'} />
        <Row k="Locatie" v={ev.location || '—'} />
        {ev.description && <Row k="Beschrijving" v={ev.description} />}
        <Row k="Klant" v={ev.custId ? 'Gekoppeld' : '—'} />
        <Row k="Deal" v={ev.dealId ? 'Gekoppeld' : '—'} />
      </Section>

      <Section title="Acties">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ev.custId
            ? <button className="btn btn-s btn-sm" onClick={() => openCustomer && openCustomer(ev.custId)}>Open klant</button>
            : <span style={{ fontSize: 12, color: '#9ca3af' }}>Geen gekoppelde klant</span>}
          {ev.dealId && openDeal && <button className="btn btn-s btn-sm" onClick={() => openDeal(ev.dealId)}>Open deal</button>}
          <button className="btn btn-s btn-sm" onClick={() => { onClose(); setPage('calendar'); }}>Open in agenda</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#9ca3af' }}>
          Dit agenda-item is alleen-lezen. Bewerken kan via de Agenda-pagina.
        </div>
      </Section>

      <div style={{ flex: 1 }} />
      <div style={{ paddingTop: 16, marginTop: 16, borderTop: '1px solid #eef0f2', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-s btn-sm" onClick={() => { onClose(); setPage('calendar'); }}>Naar agenda</button>
        <button className="btn btn-s btn-sm" onClick={onClose}>Sluiten</button>
      </div>
    </div>
  );
}
