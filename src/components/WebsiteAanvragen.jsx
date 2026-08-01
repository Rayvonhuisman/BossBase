import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../lib/toast.jsx';

// Overzicht van de gratis-website-aanvragen, voor het super-admin portaal.
// Toont wat er open staat en waar we op wachten, zodat een aanvraag niet
// blijft liggen omdat de mail in iemands inbox is ondergesneeuwd.

const STATUSSEN = [
  { key: 'open',              label: 'Nieuw',            kleur: '#b45309', bg: '#fffbeb' },
  { key: 'gegevens_gevraagd', label: 'Gegevens gevraagd', kleur: '#1d4ed8', bg: '#eff6ff' },
  { key: 'in_behandeling',    label: 'In aanbouw',       kleur: '#6d28d9', bg: '#f5f3ff' },
  { key: 'opgeleverd',        label: 'Opgeleverd',       kleur: '#15803d', bg: '#f0fdf4' },
  { key: 'geannuleerd',       label: 'Geannuleerd',      kleur: '#6b7280', bg: '#f3f4f6' },
];

const statusInfo = k => STATUSSEN.find(s => s.key === k) || { label: k, kleur: '#6b7280', bg: '#f3f4f6' };
const fmt = d => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function WebsiteAanvragen() {
  const toast = useToast();
  const [rijen, setRijen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState('open');

  const laad = () => {
    setLaden(true);
    supabase.rpc('get_website_aanvragen')
      .then(({ data, error }) => {
        if (error) throw error;
        setRijen(data || []);
      })
      .catch(e => toast.error(e.message || 'Website-aanvragen laden mislukt'))
      .finally(() => setLaden(false));
  };
  useEffect(laad, []);

  const zetStatus = async (id, status) => {
    const velden = { status };
    if (status === 'opgeleverd') velden.opgeleverd_op = new Date().toISOString();
    const { error } = await supabase.from('website_aanvragen').update(velden).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRijen(rs => rs.map(r => r.id === id ? { ...r, ...velden } : r));
    toast.success('Status bijgewerkt');
  };

  const zichtbaar = filter === 'alle' ? rijen : rijen.filter(r => r.status === filter);
  const openCount = rijen.filter(r => r.status === 'open').length;

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Website-aanvragen</div>
        {openCount > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#fffbeb', color: '#b45309' }}>
            {openCount} nieuw
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['open', 'gegevens_gevraagd', 'in_behandeling', 'opgeleverd', 'alle'].map(k => (
            <button key={k} onClick={() => setFilter(k)}
              style={{
                padding: '4px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: filter === k ? 'none' : '1px solid var(--br)',
                background: filter === k ? '#1DDB62' : 'transparent',
                color: filter === k ? '#0D0D0D' : '#6b7280',
                fontWeight: filter === k ? 700 : 500,
              }}>
              {k === 'alle' ? 'Alle' : statusInfo(k).label}
            </button>
          ))}
        </div>
      </div>

      {laden ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '10px 0' }}>
          {filter === 'open' ? 'Geen openstaande aanvragen.' : 'Niets in deze status.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <th style={{ padding: '6px 10px 6px 0' }}>Bedrijf</th>
                <th style={{ padding: '6px 10px' }}>Pakket</th>
                <th style={{ padding: '6px 10px' }}>Aangevraagd</th>
                <th style={{ padding: '6px 10px' }}>Hosting</th>
                <th style={{ padding: '6px 10px' }}>Status</th>
                <th style={{ padding: '6px 0 6px 10px' }}>Actie</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map(r => {
                const s = statusInfo(r.status);
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 10px 9px 0' }}>
                      <div style={{ fontWeight: 600 }}>{r.bedrijf}</div>
                      <div style={{ color: '#9ca3af', fontSize: 12 }}>{r.email || '—'}{r.telefoon ? ` · ${r.telefoon}` : ''}</div>
                    </td>
                    <td style={{ padding: '9px 10px' }}>{r.plan || '—'}</td>
                    <td style={{ padding: '9px 10px' }}>
                      {fmt(r.aangevraagd_op)}
                      {r.mail_verstuurd_op && (
                        <div style={{ color: '#9ca3af', fontSize: 12 }}>uitvraag {fmt(r.mail_verstuurd_op)}</div>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      {r.hosting_actief
                        ? <span style={{ color: '#15803d', fontWeight: 600 }}>actief</span>
                        : <span style={{ color: '#9ca3af' }}>nog niet</span>}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: s.bg, color: s.kleur }}>
                        {s.label}
                      </span>
                    </td>
                    <td style={{ padding: '9px 0 9px 10px' }}>
                      <select value={r.status} onChange={e => zetStatus(r.id, e.target.value)}
                        style={{ fontSize: 12, padding: '3px 6px' }}>
                        {STATUSSEN.map(s2 => <option key={s2.key} value={s2.key}>{s2.label}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
