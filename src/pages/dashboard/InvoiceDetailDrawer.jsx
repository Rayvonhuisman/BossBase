import { useEffect, useState } from 'react';
import { I, fmt } from '../../bb-shared.jsx';
import { getOfferteById, getOfferteItems } from '../../services/offerteService.js';
import { statusInfo } from '../../utils/statusColors.js';

// "Facturen" in BossBase zijn geaccepteerde offertes — er is (nog) geen aparte
// facturentabel. Deze drawer toont de bron-offerte read-only, duidelijk
// gelabeld als factuur/omzetregel. Geen DB-wijziging, geen nepdata.

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

const dstr = v => (v ? String(v).slice(0, 10) : null);
const daysBetween = (a, b) => {
  if (!a || !b) return null;
  const d = Math.round((new Date(b) - new Date(a)) / 86400000);
  return isNaN(d) ? null : d;
};

export function InvoiceDetailDrawer({ invoiceId, onClose, setPage, openCustomer }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [inv, setInv] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    Promise.all([
      getOfferteById(invoiceId),
      getOfferteItems(invoiceId).catch(() => []),
    ]).then(([o, it]) => {
      if (!alive) return;
      setInv(o);
      setItems(it || []);
    }).catch(e => { if (alive) setErr(e.message || 'Laden mislukt'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [invoiceId]);

  const HeadClose = (
    <button onClick={onClose} aria-label="Sluiten" style={{
      width: 32, height: 32, borderRadius: 9, border: '1px solid #e7e9ec', background: '#fff',
      color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
    }}>{I.x}</button>
  );

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 800 }}>Factuur laden…</div>{HeadClose}</div>
      </div>
    );
  }
  if (err || !inv) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Factuurgegevens niet beschikbaar</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{err || 'Deze factuur kon niet worden geladen.'}</div>
            <button className="btn btn-s btn-sm" style={{ marginTop: 14 }} onClick={() => { onClose(); setPage('revenue'); }}>Naar omzet</button>
          </div>
          {HeadClose}
        </div>
      </div>
    );
  }

  const ref = inv.nummer || 'Factuur';
  const sInfo = statusInfo(inv.status, 'offerte');
  const tone = sInfo.badgeClass;
  const statusLabel = sInfo.label;
  const factuurDatum = dstr(inv.geaccepteerdOp) || dstr(inv.createdAt);
  const vervalDatum = dstr(inv.geldigTot);
  const daysOpen = daysBetween(factuurDatum, new Date().toISOString());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottom: '1px solid #eef0f2' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', fontFamily: 'ui-monospace,Menlo,monospace' }}>{ref}</span>
            <span className={`badge ${tone}`}>{statusLabel}</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, marginTop: 6 }}>
            {inv.customerId && openCustomer
              ? <button type="button" onClick={() => openCustomer(inv.customerId)} title="Open klantkaart" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 20, fontWeight: 800, letterSpacing: -0.3, color: 'var(--p)', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{inv.customerName || 'Klant'}</button>
              : <span style={{ color: '#0a0a0a' }}>{inv.customerName || 'Geen klant'}</span>}
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#15A34A', letterSpacing: -0.2 }}>{fmt(inv.totaalIncl || 0)}</span>
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>incl. btw</span>
          </div>
        </div>
        {HeadClose}
      </div>

      {/* Bron-disclosure */}
      <div style={{ marginTop: 14, padding: '9px 12px', background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: 9, fontSize: 12, color: '#15A34A' }}>
        Bron: geaccepteerde offerte — er is nog geen aparte facturenmodule. Bedragen en regels komen uit de offerte.
      </div>

      {/* Overzicht */}
      <Section title="Overzicht">
        <Row k="Status" v={statusLabel} />
        <Row k="Bedrag excl. btw" v={fmt(inv.totaalExcl || 0)} />
        <Row k="Bedrag incl. btw" v={fmt(inv.totaalIncl || 0)} />
        <Row k="Btw" v={`${inv.btwPct || 21}%`} />
        <Row k="Klant" v={inv.customerName || '—'} />
        {inv.omschrijving && <Row k="Omschrijving" v={inv.omschrijving} />}
        <Row k="Factuurdatum" v={factuurDatum || '—'} />
        <Row k="Vervaldatum" v={vervalDatum || '—'} />
        {dstr(inv.geaccepteerdOp) && <Row k="Geaccepteerd op" v={dstr(inv.geaccepteerdOp)} />}
        <Row k="Dagen open" v={daysOpen != null ? `${Math.max(0, daysOpen)} dagen` : '—'} />
        {inv.dealId && <Row k="Gekoppelde deal" v="Ja" />}
      </Section>

      {/* Regels */}
      <Section title={`Factuurregels (${items.length})`}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Geen factuurregels beschikbaar</div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px 90px', gap: 8, fontSize: 10.5, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '0 0 6px' }}>
              <div>Omschrijving</div><div style={{ textAlign: 'right' }}>Aantal</div><div style={{ textAlign: 'right' }}>Prijs</div><div style={{ textAlign: 'right' }}>Bedrag</div>
            </div>
            {items.map(it => (
              <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px 90px', gap: 8, fontSize: 12.5, padding: '8px 0', borderTop: '1px solid #f3f4f6', alignItems: 'center' }}>
                <div style={{ color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.omschrijving || '—'}</div>
                <div style={{ textAlign: 'right', color: '#6b7280' }}>{it.aantal}{it.eenheid ? ` ${it.eenheid}` : ''}</div>
                <div style={{ textAlign: 'right', color: '#6b7280' }}>{fmt(it.prijsPer || 0)}</div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: '#0a0a0a' }}>{fmt(it.subtotaal || 0)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Acties (read-only — geen factuur-update service aanwezig) */}
      <Section title="Acties">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {inv.customerId
            ? <button className="btn btn-s btn-sm" onClick={() => openCustomer && openCustomer(inv.customerId)}>Open klant</button>
            : <span style={{ fontSize: 12, color: '#9ca3af' }}>Geen gekoppelde klant gevonden</span>}
          <button className="btn btn-s btn-sm" onClick={() => setPage('offertes', { id: inv.id })}>Open offerte</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#9ca3af' }}>
          Betaalstatus en herinneringen zijn nog niet beschikbaar — daar bestaat nog geen facturenservice voor.
        </div>
      </Section>

      <div style={{ flex: 1 }} />
      <div style={{ paddingTop: 16, marginTop: 16, borderTop: '1px solid #eef0f2', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-s btn-sm" onClick={() => { onClose(); setPage('revenue'); }}>Naar omzet</button>
        <button className="btn btn-s btn-sm" onClick={onClose}>Sluiten</button>
      </div>
    </div>
  );
}
