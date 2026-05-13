import { useState, useEffect } from 'react';
import { I, ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getUrenregistratie, createUrenregel, updateUrenregel, deleteUrenregel,
} from '../services/urenService.js';
import { listCustomers } from '../services/customerService.js';

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const getPeriodeDates = (filter) => {
  const now = new Date();
  if (filter === 'today') {
    const d = todayStr();
    return { vanDatum: d, totDatum: d };
  }
  if (filter === 'week') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      vanDatum: monday.toISOString().slice(0, 10),
      totDatum: sunday.toISOString().slice(0, 10),
    };
  }
  if (filter === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      vanDatum: first.toISOString().slice(0, 10),
      totDatum: last.toISOString().slice(0, 10),
    };
  }
  return {};
};

const typeLabel = t => ({ arbeid: 'Arbeid', reiskosten: 'Reiskosten', overig: 'Overig' }[t] || t);

const calcHint = (start, eind) => {
  if (!start || !eind) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = eind.split(':').map(Number);
  if ([sh, sm, eh, em].some(v => isNaN(v))) return null;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return null;
  return Math.round((diff / 60) * 100) / 100;
};

// ── REGISTER UREN MODAL ──────────────────────────────────────────────────────

function RegisterUrenModal({ customers, onClose, onSaved }) {
  const toast = useToast();
  const { profile } = useProfile();
  const [form, setForm] = useState({
    datum: todayStr(), start_tijd: '', eind_tijd: '',
    type: 'arbeid', customer_id: '', notitie: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const hint = calcHint(form.start_tijd, form.eind_tijd);

  const submit = async () => {
    if (!form.datum) { toast.error('Datum is verplicht'); return; }
    setSaving(true);
    try {
      const r = await createUrenregel({
        profile_id: profile?.id,
        datum: form.datum,
        start_tijd: form.start_tijd || null,
        eind_tijd: form.eind_tijd || null,
        type: form.type,
        customer_id: form.customer_id || null,
        notitie: form.notitie || null,
      });
      toast.success('Uren geregistreerd');
      onSaved?.(r);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Uren registreren</div>
            <div className="modal-sub">Nieuwe urenregistratie toevoegen</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f">
            <label>Datum *</label>
            <input type="date" value={form.datum} onChange={e => set('datum', e.target.value)} />
          </div>
          <div className="f">
            <label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="arbeid">Arbeid</option>
              <option value="reiskosten">Reiskosten</option>
              <option value="overig">Overig</option>
            </select>
          </div>
          <div className="f">
            <label>Starttijd</label>
            <input type="time" value={form.start_tijd} onChange={e => set('start_tijd', e.target.value)} />
          </div>
          <div className="f">
            <label>Eindtijd</label>
            <input type="time" value={form.eind_tijd} onChange={e => set('eind_tijd', e.target.value)} />
            {hint !== null && (
              <div style={{ fontSize: 12, color: 'var(--p)', marginTop: 4 }}>≈ {hint} uur</div>
            )}
          </div>
          <div className="f s2">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">Geen klant</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Notitie</label>
            <textarea rows={2} value={form.notitie} onChange={e => set('notitie', e.target.value)} placeholder="Optionele notitie..." />
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

// ── EDIT UREN MODAL ──────────────────────────────────────────────────────────

function EditUrenModal({ regel, customers, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    datum: regel.datum || todayStr(),
    start_tijd: regel.startTijd || '',
    eind_tijd: regel.eindTijd || '',
    type: regel.type || 'arbeid',
    customer_id: regel.customerId || '',
    notitie: regel.notitie || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const hint = calcHint(form.start_tijd, form.eind_tijd);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await updateUrenregel(regel.id, {
        datum: form.datum,
        start_tijd: form.start_tijd || null,
        eind_tijd: form.eind_tijd || null,
        type: form.type,
        customer_id: form.customer_id || null,
        notitie: form.notitie || null,
      });
      toast.success('Uren opgeslagen');
      onSaved?.(r);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Uren bewerken</div>
            <div className="modal-sub">Medewerker: {regel.medewerkerNaam || '—'}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f">
            <label>Datum</label>
            <input type="date" value={form.datum} onChange={e => set('datum', e.target.value)} />
          </div>
          <div className="f">
            <label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="arbeid">Arbeid</option>
              <option value="reiskosten">Reiskosten</option>
              <option value="overig">Overig</option>
            </select>
          </div>
          <div className="f">
            <label>Starttijd</label>
            <input type="time" value={form.start_tijd} onChange={e => set('start_tijd', e.target.value)} />
          </div>
          <div className="f">
            <label>Eindtijd</label>
            <input type="time" value={form.eind_tijd} onChange={e => set('eind_tijd', e.target.value)} />
            {hint !== null && (
              <div style={{ fontSize: 12, color: 'var(--p)', marginTop: 4 }}>≈ {hint} uur</div>
            )}
          </div>
          <div className="f s2">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">Geen klant</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Notitie</label>
            <textarea rows={2} value={form.notitie} onChange={e => set('notitie', e.target.value)} />
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

// ── UREN PAGE ────────────────────────────────────────────────────────────────

export function UrenPage() {
  const toast = useToast();
  const [regels, setRegels] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [periodeFilter, setPeriodeFilter] = useState('');
  const [medFilter, setMedFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editRegel, setEditRegel] = useState(null);

  const load = (periode) => {
    setLoading(true);
    const dates = getPeriodeDates(periode);
    Promise.all([getUrenregistratie(dates), listCustomers()])
      .then(([r, c]) => { setRegels(r); setCustomers(c); setError(''); })
      .catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(periodeFilter); }, [periodeFilter]);

  const uniqueMedewerkers = [...new Set(regels.map(r => r.medewerkerNaam).filter(Boolean))];

  const filtered = medFilter
    ? regels.filter(r => r.medewerkerNaam === medFilter)
    : regels;

  const totaalUren = Math.round(regels.reduce((s, r) => s + r.uren, 0) * 100) / 100;
  const aantalMedewerkers = new Set(regels.map(r => r.profileId).filter(Boolean)).size;
  const uniqueDays = new Set(regels.map(r => r.datum)).size;
  const gemPerDag = uniqueDays > 0 ? Math.round((totaalUren / uniqueDays) * 100) / 100 : 0;

  const handleDelete = async (r) => {
    if (!window.confirm('Deze urenregistratie verwijderen?')) return;
    try {
      await deleteUrenregel(r.id);
      setRegels(prev => prev.filter(x => x.id !== r.id));
      toast.success('Uren verwijderd');
    } catch (err) { toast.error(err.message || 'Verwijderen mislukt'); }
  };

  const handleSaved = (saved) => {
    setRegels(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  const periodeFilters = [
    { label: 'Alles', value: '' },
    { label: 'Vandaag', value: 'today' },
    { label: 'Deze week', value: 'week' },
    { label: 'Deze maand', value: 'month' },
  ];

  if (loading) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Urenregistratie</h1>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</div>}
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-p" onClick={() => setShowNew(true)}>
            {I.plus} Uren registreren
          </button>
        </div>
      </div>

      <div className="afu2">
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.hours}</div>
            </div>
            <div className="sc-val">{totaalUren.toFixed(2)} uur</div>
            <div className="sc-label">Totaal uren</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.cust}</div>
            </div>
            <div className="sc-val">{aantalMedewerkers}</div>
            <div className="sc-label">Medewerkers</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.clock}</div>
            </div>
            <div className="sc-val">{gemPerDag.toFixed(2)} uur</div>
            <div className="sc-label">Gem. per dag</div>
          </div>
        </div>

        <div className="card">
          <div className="uren-filter-bar" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--br)' }}>
            <div className="tabs" style={{ flex: 1 }}>
              {periodeFilters.map(f => (
                <button
                  key={f.value}
                  className={`tab${periodeFilter === f.value ? ' active' : ''}`}
                  onClick={() => setPeriodeFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select value={medFilter} onChange={e => setMedFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="">Alle medewerkers</option>
              {uniqueMedewerkers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--dl)' }}>
              <div style={{ marginBottom: 12, opacity: .4, transform: 'scale(2)', display: 'inline-block' }}>{I.hours}</div>
              <div style={{ marginTop: 16, fontWeight: 500 }}>Geen urenregistraties gevonden</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tw tw-hd dt">
                <thead>
                  <tr>
                    <th className="th">Datum</th>
                    <th className="th">Medewerker</th>
                    <th className="th">Type</th>
                    <th className="th">Start–Eind</th>
                    <th className="th" style={{ textAlign: 'right' }}>Uren</th>
                    <th className="th">Klant</th>
                    <th className="th">Notitie</th>
                    <th className="th">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="td">{fmtDate(r.datum)}</td>
                      <td className="td">{r.medewerkerNaam || '—'}</td>
                      <td className="td">
                        <span className={`badge ${r.type === 'arbeid' ? 'b-blue' : r.type === 'reiskosten' ? 'b-orange' : 'b-gray'}`}>
                          {typeLabel(r.type)}
                        </span>
                      </td>
                      <td className="td" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {r.startTijd && r.eindTijd ? `${r.startTijd} – ${r.eindTijd}` : '—'}
                      </td>
                      <td className="td" style={{ textAlign: 'right', fontWeight: 600 }}>{r.uren.toFixed(2)}</td>
                      <td className="td">{r.customerName || '—'}</td>
                      <td className="td" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dl)' }}>
                        {r.notitie || '—'}
                      </td>
                      <td className="td">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-ghost btn-icon" title="Bewerken" onClick={() => setEditRegel(r)}>{I.edit}</button>
                          <button className="btn btn-xs btn-danger btn-icon" title="Verwijderen" onClick={() => handleDelete(r)}>{I.trash}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <RegisterUrenModal
          customers={customers}
          onClose={() => setShowNew(false)}
          onSaved={saved => { handleSaved(saved); }}
        />
      )}
      {editRegel && (
        <EditUrenModal
          regel={editRegel}
          customers={customers}
          onClose={() => setEditRegel(null)}
          onSaved={saved => { handleSaved(saved); setEditRegel(null); }}
        />
      )}
    </div>
  );
}
