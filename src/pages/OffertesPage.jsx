import { useState, useEffect } from 'react';
import { I, ModalX, fmt } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getOffertes, createOfferte, updateOfferte, deleteOfferte, calculateOfferteTotals,
} from '../services/offerteService.js';
import { listCustomers } from '../services/customerService.js';

const offerteBadge = status => {
  const map = { concept: 'b-concept', verzonden: 'b-sent', geaccepteerd: 'b-accepted', afgewezen: 'b-declined' };
  const labels = { concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd', afgewezen: 'Afgewezen' };
  return <span className={`badge ${map[status] || 'b-gray'}`}>{labels[status] || status}</span>;
};

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

// ── NEW OFFERTE MODAL ────────────────────────────────────────────────────────

function NewOfferteModal({ customers, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    customer_id: '', omschrijving: '', arbeidsuren: 0, uurtarief: 55,
    materiaalkosten: 0, reiskosten: 0, marge_pct: 25, btw_pct: 21,
    geldig_tot: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const totals = calculateOfferteTotals(form);

  const submit = async () => {
    if (!form.customer_id) { toast.error('Selecteer een klant'); return; }
    setSaving(true);
    try {
      const r = await createOfferte(form);
      toast.success('Offerte aangemaakt');
      onSaved?.(r);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe offerte</div>
            <div className="modal-sub">Vul de offerte gegevens in</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Klant *</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Selecteer klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Omschrijving</label>
            <textarea rows={2} value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} placeholder="Korte omschrijving van de werkzaamheden" />
          </div>
          <div className="f">
            <label>Arbeidsuren</label>
            <input type="number" min="0" step="0.5" value={form.arbeidsuren} onChange={e => set('arbeidsuren', e.target.value)} />
          </div>
          <div className="f">
            <label>Uurtarief (€)</label>
            <input type="number" min="0" step="1" value={form.uurtarief} onChange={e => set('uurtarief', e.target.value)} />
          </div>
          <div className="f">
            <label>Materiaalkosten (€)</label>
            <input type="number" min="0" step="0.01" value={form.materiaalkosten} onChange={e => set('materiaalkosten', e.target.value)} />
          </div>
          <div className="f">
            <label>Reiskosten (€)</label>
            <input type="number" min="0" step="0.01" value={form.reiskosten} onChange={e => set('reiskosten', e.target.value)} />
          </div>
          <div className="f">
            <label>Marge %</label>
            <input type="number" min="0" max="100" step="1" value={form.marge_pct} onChange={e => set('marge_pct', e.target.value)} />
          </div>
          <div className="f">
            <label>BTW %</label>
            <input type="number" min="0" max="100" step="1" value={form.btw_pct} onChange={e => set('btw_pct', e.target.value)} />
          </div>
          <div className="f">
            <label>Geldig tot</label>
            <input type="date" value={form.geldig_tot} onChange={e => set('geldig_tot', e.target.value)} />
          </div>
          <div className="f s2" style={{ alignSelf: 'end', padding: '8px 12px', background: 'var(--pll)', borderRadius: 8, fontSize: 13, color: 'var(--dl)' }}>
            <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Excl. BTW:</span> {fmt(totals.totaal_excl)} &nbsp;·&nbsp; <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Incl. BTW:</span> {fmt(totals.totaal_incl)}
          </div>
          <div className="f s2">
            <label>Notities</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Interne notities..." />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── EDIT OFFERTE MODAL ───────────────────────────────────────────────────────

function EditOfferteModal({ offerte, customers, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    customer_id: offerte.customerId || '',
    omschrijving: offerte.omschrijving || '',
    arbeidsuren: offerte.arbeidsuren ?? 0,
    uurtarief: offerte.uurtarief ?? 55,
    materiaalkosten: offerte.materiaalkosten ?? 0,
    reiskosten: offerte.reiskosten ?? 0,
    marge_pct: offerte.margePct ?? 25,
    btw_pct: offerte.btwPct ?? 21,
    geldig_tot: offerte.geldigTot || '',
    notes: offerte.notes || '',
    status: offerte.status || 'concept',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const totals = calculateOfferteTotals(form);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await updateOfferte(offerte.id, form);
      toast.success('Offerte opgeslagen');
      onSaved?.(r);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Offerte bewerken</div>
            <div className="modal-sub">{offerte.nummer}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Selecteer klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Omschrijving</label>
            <textarea rows={2} value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} />
          </div>
          <div className="f">
            <label>Arbeidsuren</label>
            <input type="number" min="0" step="0.5" value={form.arbeidsuren} onChange={e => set('arbeidsuren', e.target.value)} />
          </div>
          <div className="f">
            <label>Uurtarief (€)</label>
            <input type="number" min="0" step="1" value={form.uurtarief} onChange={e => set('uurtarief', e.target.value)} />
          </div>
          <div className="f">
            <label>Materiaalkosten (€)</label>
            <input type="number" min="0" step="0.01" value={form.materiaalkosten} onChange={e => set('materiaalkosten', e.target.value)} />
          </div>
          <div className="f">
            <label>Reiskosten (€)</label>
            <input type="number" min="0" step="0.01" value={form.reiskosten} onChange={e => set('reiskosten', e.target.value)} />
          </div>
          <div className="f">
            <label>Marge %</label>
            <input type="number" min="0" max="100" step="1" value={form.marge_pct} onChange={e => set('marge_pct', e.target.value)} />
          </div>
          <div className="f">
            <label>BTW %</label>
            <input type="number" min="0" max="100" step="1" value={form.btw_pct} onChange={e => set('btw_pct', e.target.value)} />
          </div>
          <div className="f">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="concept">Concept</option>
              <option value="verzonden">Verzonden</option>
              <option value="geaccepteerd">Geaccepteerd</option>
              <option value="afgewezen">Afgewezen</option>
            </select>
          </div>
          <div className="f">
            <label>Geldig tot</label>
            <input type="date" value={form.geldig_tot} onChange={e => set('geldig_tot', e.target.value)} />
          </div>
          <div className="f s2" style={{ alignSelf: 'end', padding: '8px 12px', background: 'var(--pll)', borderRadius: 8, fontSize: 13, color: 'var(--dl)' }}>
            <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Excl. BTW:</span> {fmt(totals.totaal_excl)} &nbsp;·&nbsp; <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Incl. BTW:</span> {fmt(totals.totaal_incl)}
          </div>
          <div className="f s2">
            <label>Notities</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── VIEW OFFERTE MODAL ───────────────────────────────────────────────────────

function ViewOfferteModal({ offerte, customers, onClose }) {
  const customerName = offerte.customerName || customers.find(c => c.id == offerte.customerId)?.name || '—';
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">{offerte.nummer}</div>
            <div className="modal-sub">{offerte.omschrijving || 'Offerte details'}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Klant</div>
              <div style={{ fontWeight: 500 }}>{customerName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Status</div>
              <div>{offerteBadge(offerte.status)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Geldig tot</div>
              <div>{fmtDate(offerte.geldigTot)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Aangemaakt</div>
              <div>{fmtDate(offerte.createdAt?.slice(0, 10))}</div>
            </div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--br)', margin: 0 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Arbeidsuren</div>
              <div>{offerte.arbeidsuren} uur × {fmt(offerte.uurtarief)}/u</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Materiaalkosten</div>
              <div>{fmt(offerte.materiaalkosten)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Reiskosten</div>
              <div>{fmt(offerte.reiskosten)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Marge / BTW</div>
              <div>{offerte.margePct}% / {offerte.btwPct}%</div>
            </div>
          </div>
          <div style={{ background: 'var(--pll)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dl)', marginBottom: 2 }}>Totaal excl. BTW</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(offerte.totaalExcl)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dl)', marginBottom: 2 }}>Totaal incl. BTW</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--p)' }}>{fmt(offerte.totaalIncl)}</div>
            </div>
          </div>
          {offerte.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Notities</div>
              <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{offerte.notes}</div>
            </div>
          )}
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}

// ── OFFERTES PAGE ────────────────────────────────────────────────────────────

export function OffertesPage({ preOpenOfferteId, onNavConsumed }) {
  const toast = useToast();
  const { profile } = useProfile();
  const canManageOffertes = profile?.role === 'admin' || profile?.role === 'planner';
  const [offertes, setOffertes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editOfferte, setEditOfferte] = useState(null);
  const [viewOfferte, setViewOfferte] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([getOffertes(), listCustomers()])
      .then(([o, c]) => { setOffertes(o); setCustomers(c); setError(''); })
      .catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Deep-open a specific offerte requested from the dashboard
  useEffect(() => {
    if (!preOpenOfferteId || loading) return;
    const o = offertes.find(x => x.id === preOpenOfferteId);
    if (o) {
      setViewOfferte(o);
      onNavConsumed && onNavConsumed();
    } else if (import.meta.env.DEV) {
      console.warn('[bb:dashboard] offerte niet gevonden voor deep-open:', preOpenOfferteId);
    }
  }, [preOpenOfferteId, loading, offertes]);

  const filters = [
    { label: 'Alle', value: '' },
    { label: 'Concept', value: 'concept' },
    { label: 'Verzonden', value: 'verzonden' },
    { label: 'Geaccepteerd', value: 'geaccepteerd' },
    { label: 'Afgewezen', value: 'afgewezen' },
  ];

  const filtered = offertes.filter(o => {
    if (activeFilter && o.status !== activeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const customerName = o.customerName || customers.find(c => c.id == o.customerId)?.name || '';
      return o.nummer.toLowerCase().includes(q) || o.omschrijving.toLowerCase().includes(q) || customerName.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAccepted = offertes.filter(o => o.status === 'geaccepteerd').reduce((s, o) => s + o.totaalIncl, 0);

  const handleDelete = async (o) => {
    if (!window.confirm(`Offerte ${o.nummer} verwijderen?`)) return;
    try {
      await deleteOfferte(o.id);
      setOffertes(prev => prev.filter(x => x.id !== o.id));
      toast.success('Offerte verwijderd');
    } catch (err) { toast.error(err.message || 'Verwijderen mislukt'); }
  };

  const handleSaved = (saved) => {
    setOffertes(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  if (loading) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Offertes</h1>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</div>}
        </div>
        <div className="page-hd-actions">
          {canManageOffertes && (
            <button className="btn btn-p" onClick={() => setShowNew(true)}>
              {I.plus} Nieuwe offerte
            </button>
          )}
        </div>
      </div>

      <div className="afu2">
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.quotes}</div>
            </div>
            <div className="sc-val">{offertes.length}</div>
            <div className="sc-label">Totaal offertes</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.quotes}</div>
            </div>
            <div className="sc-val">{offertes.filter(o => o.status === 'concept').length}</div>
            <div className="sc-label">Concept</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.mail}</div>
            </div>
            <div className="sc-val">{offertes.filter(o => o.status === 'verzonden').length}</div>
            <div className="sc-label">Verzonden</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.euro}</div>
            </div>
            <div className="sc-val">{offertes.filter(o => o.status === 'geaccepteerd').length} · {fmt(totalAccepted)}</div>
            <div className="sc-label">Geaccepteerd</div>
          </div>
        </div>

        <div className="card">
          <div className="offertes-filter-bar" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--br)' }}>
            <div className="tabs" style={{ flex: 1 }}>
              {filters.map(f => (
                <button
                  key={f.value}
                  className={`tab${activeFilter === f.value ? ' active' : ''}`}
                  onClick={() => setActiveFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 10, color: 'var(--dl)', pointerEvents: 'none' }}>{I.search}</span>
              <input
                style={{ paddingLeft: 30, width: 220 }}
                placeholder="Zoek offerte..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="tw tw-hd dt">
              <thead>
                <tr>
                  <th className="th">Nummer</th>
                  <th className="th">Klant</th>
                  <th className="th">Omschrijving</th>
                  <th className="th" style={{ textAlign: 'right' }}>Excl. BTW</th>
                  <th className="th" style={{ textAlign: 'right' }}>Incl. BTW</th>
                  <th className="th">Status</th>
                  <th className="th">Geldig tot</th>
                  <th className="th">Acties</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td className="td" colSpan={8} style={{ textAlign: 'center', color: 'var(--dl)', padding: '32px 0' }}>
                      Geen offertes gevonden
                    </td>
                  </tr>
                )}
                {filtered.map(o => {
                  const customerName = o.customerName || customers.find(c => c.id == o.customerId)?.name || '—';
                  return (
                    <tr key={o.id}>
                      <td className="td">
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{o.nummer}</span>
                      </td>
                      <td className="td">{customerName}</td>
                      <td className="td" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.omschrijving || '—'}</td>
                      <td className="td" style={{ textAlign: 'right' }}>{fmt(o.totaalExcl)}</td>
                      <td className="td" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(o.totaalIncl)}</td>
                      <td className="td">{offerteBadge(o.status)}</td>
                      <td className="td">{fmtDate(o.geldigTot)}</td>
                      <td className="td">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-ghost btn-icon" title="Bekijken" onClick={() => setViewOfferte(o)}>{I.eye}</button>
                          {canManageOffertes && <button className="btn btn-xs btn-ghost btn-icon" title="Bewerken" onClick={() => setEditOfferte(o)}>{I.edit}</button>}
                          {canManageOffertes && <button className="btn btn-xs btn-danger btn-icon" title="Verwijderen" onClick={() => handleDelete(o)}>{I.trash}</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNew && (
        <NewOfferteModal
          customers={customers}
          onClose={() => setShowNew(false)}
          onSaved={saved => { handleSaved(saved); }}
        />
      )}
      {editOfferte && (
        <EditOfferteModal
          offerte={editOfferte}
          customers={customers}
          onClose={() => setEditOfferte(null)}
          onSaved={saved => { handleSaved(saved); setEditOfferte(null); }}
        />
      )}
      {viewOfferte && (
        <ViewOfferteModal
          offerte={viewOfferte}
          customers={customers}
          onClose={() => setViewOfferte(null)}
        />
      )}
    </div>
  );
}
