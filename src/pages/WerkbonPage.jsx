import { useState, useEffect, useRef } from 'react';
import { I, ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getWerkbonnen, createWerkbon, updateWerkbon, completeWerkbon,
  getWerkbonTaken, createWerkbonTaak, toggleWerkbonTaak, deleteWerkbonTaak,
  getWerkbonMaterialen, createWerkbonMateriaal, deleteWerkbonMateriaal,
} from '../services/werkbonService.js';
import { listCustomers } from '../services/customerService.js';
import { createUrenregel } from '../services/urenService.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

const werkbonBadge = status => {
  const map = { gepland: 'b-blue', in_uitvoering: 'b-progress', afgerond: 'b-done' };
  const labels = { gepland: 'Gepland', in_uitvoering: 'In uitvoering', afgerond: 'Afgerond' };
  return <span className={`badge ${map[status] || 'b-gray'}`}>{labels[status] || status}</span>;
};

// ── NEW WERKBON MODAL ────────────────────────────────────────────────────────

function NewWerkbonModal({ customers, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: '', customer_id: '', omschrijving: '',
    gepland_op: '', starttijd: '', eindtijd: '', locatie: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    setSaving(true);
    try {
      const r = await createWerkbon({
        titel: form.titel,
        customer_id: form.customer_id || null,
        omschrijving: form.omschrijving || null,
        gepland_op: form.gepland_op || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        locatie: form.locatie || null,
        notes: form.notes || null,
      });
      toast.success('Werkbon aangemaakt');
      onSaved?.(r);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe werkbon</div>
            <div className="modal-sub">Werkbon aanmaken</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Titel *</label>
            <input type="text" value={form.titel} onChange={e => set('titel', e.target.value)} placeholder="Omschrijving van de klus" />
          </div>
          <div className="f s2">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Geen klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Omschrijving</label>
            <textarea rows={2} value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} placeholder="Gedetailleerde omschrijving..." />
          </div>
          <div className="f">
            <label>Geplande datum</label>
            <input type="date" value={form.gepland_op} onChange={e => set('gepland_op', e.target.value)} />
          </div>
          <div className="f">
            <label>Starttijd</label>
            <input type="time" value={form.starttijd} onChange={e => set('starttijd', e.target.value)} />
          </div>
          <div className="f">
            <label>Eindtijd</label>
            <input type="time" value={form.eindtijd} onChange={e => set('eindtijd', e.target.value)} />
          </div>
          <div className="f s2">
            <label>Locatie</label>
            <input type="text" value={form.locatie} onChange={e => set('locatie', e.target.value)} placeholder="Adres of locatieomschrijving" />
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

// ── EDIT WERKBON MODAL ───────────────────────────────────────────────────────

function EditWerkbonModal({ werkbon, customers, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titel: werkbon.titel || '',
    customer_id: werkbon.customerId || '',
    omschrijving: werkbon.omschrijving || '',
    gepland_op: werkbon.geplandOp || '',
    starttijd: werkbon.starttijd || '',
    eindtijd: werkbon.eindtijd || '',
    locatie: werkbon.locatie || '',
    notes: werkbon.notes || '',
    status: werkbon.status || 'gepland',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    setSaving(true);
    try {
      const r = await updateWerkbon(werkbon.id, {
        titel: form.titel,
        customer_id: form.customer_id || null,
        omschrijving: form.omschrijving || null,
        gepland_op: form.gepland_op || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        locatie: form.locatie || null,
        notes: form.notes || null,
        status: form.status,
      });
      toast.success('Werkbon opgeslagen');
      onSaved?.(r);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Werkbon bewerken</div>
            <div className="modal-sub">{werkbon.titel}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Titel *</label>
            <input type="text" value={form.titel} onChange={e => set('titel', e.target.value)} />
          </div>
          <div className="f s2">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Geen klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Omschrijving</label>
            <textarea rows={2} value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} />
          </div>
          <div className="f">
            <label>Geplande datum</label>
            <input type="date" value={form.gepland_op} onChange={e => set('gepland_op', e.target.value)} />
          </div>
          <div className="f">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="gepland">Gepland</option>
              <option value="in_uitvoering">In uitvoering</option>
              <option value="afgerond">Afgerond</option>
            </select>
          </div>
          <div className="f">
            <label>Starttijd</label>
            <input type="time" value={form.starttijd} onChange={e => set('starttijd', e.target.value)} />
          </div>
          <div className="f">
            <label>Eindtijd</label>
            <input type="time" value={form.eindtijd} onChange={e => set('eindtijd', e.target.value)} />
          </div>
          <div className="f s2">
            <label>Locatie</label>
            <input type="text" value={form.locatie} onChange={e => set('locatie', e.target.value)} />
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

// ── DETAIL TABS ──────────────────────────────────────────────────────────────

function TabInfo({ werkbon, customers, onUpdated }) {
  const toast = useToast();
  const customerName = werkbon.customerName || customers.find(c => c.id == werkbon.customerId)?.name || '—';
  const [notes, setNotes] = useState(werkbon.notes || '');
  const [saving, setSaving] = useState(false);

  const saveNotes = async () => {
    setSaving(true);
    try {
      const r = await updateWerkbon(werkbon.id, { notes });
      toast.success('Notities opgeslagen');
      onUpdated?.(r);
    } catch (err) { toast.error(err.message || 'Opslaan mislukt'); } finally { setSaving(false); }
  };

  const fields = [
    { label: 'Klant', value: customerName },
    { label: 'Locatie', value: werkbon.locatie || '—' },
    { label: 'Geplande datum', value: fmtDate(werkbon.geplandOp) },
    { label: 'Tijdvak', value: werkbon.starttijd && werkbon.eindtijd ? `${werkbon.starttijd} – ${werkbon.eindtijd}` : '—' },
    { label: 'Medewerker', value: werkbon.assignedName || '—' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {fields.map(f => (
          <div key={f.label}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: 14 }}>{f.value}</div>
          </div>
        ))}
        {werkbon.omschrijving && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Omschrijving</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{werkbon.omschrijving}</div>
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Notities</div>
        <textarea
          rows={4}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notities over deze werkbon..."
          style={{ width: '100%', resize: 'vertical' }}
        />
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-p" onClick={saveNotes} disabled={saving}>
            {saving ? 'Opslaan...' : 'Notities opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabTaken({ werkbonId, taken, setTaken }) {
  const toast = useToast();
  const [newOmschrijving, setNewOmschrijving] = useState('');
  const [adding, setAdding] = useState(false);

  const handleToggle = async (taak) => {
    try {
      const updated = await toggleWerkbonTaak(taak.id, !taak.afgerond);
      setTaken(prev => prev.map(t => t.id === taak.id ? updated : t));
    } catch (err) { toast.error(err.message || 'Mislukt'); }
  };

  const handleDelete = async (taak) => {
    if (!window.confirm('Taak verwijderen?')) return;
    try {
      await deleteWerkbonTaak(taak.id);
      setTaken(prev => prev.filter(t => t.id !== taak.id));
    } catch (err) { toast.error(err.message || 'Verwijderen mislukt'); }
  };

  const handleAdd = async () => {
    if (!newOmschrijving.trim()) return;
    setAdding(true);
    try {
      const r = await createWerkbonTaak({ werkbon_id: werkbonId, omschrijving: newOmschrijving.trim() });
      setTaken(prev => [...prev, r]);
      setNewOmschrijving('');
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setAdding(false); }
  };

  const done = taken.filter(t => t.afgerond).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {taken.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--dl)' }}>{done}/{taken.length} voltooid</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {taken.length === 0 && (
          <div style={{ color: 'var(--dl)', fontSize: 13, padding: '12px 0' }}>Geen taken — voeg er een toe hieronder.</div>
        )}
        {taken.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8 }}>
            <input
              type="checkbox"
              checked={t.afgerond}
              onChange={() => handleToggle(t)}
              style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ flex: 1, fontSize: 14, textDecoration: t.afgerond ? 'line-through' : 'none', color: t.afgerond ? 'var(--dl)' : 'var(--tx)' }}>
              {t.omschrijving}
            </span>
            <button className="btn btn-xs btn-danger btn-icon" onClick={() => handleDelete(t)}>{I.trash}</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          type="text"
          value={newOmschrijving}
          onChange={e => setNewOmschrijving(e.target.value)}
          placeholder="Nieuwe taak toevoegen..."
          style={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn-sm btn-p" onClick={handleAdd} disabled={adding || !newOmschrijving.trim()}>
          {adding ? '...' : 'Toevoegen'}
        </button>
      </div>
    </div>
  );
}

function TabMaterialen({ werkbonId, materialen, setMaterialen }) {
  const toast = useToast();
  const [form, setForm] = useState({ naam: '', eenheid: '', aantal: 1, prijs_per: 0 });
  const [adding, setAdding] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const subtotaal = Math.round(Number(form.aantal) * Number(form.prijs_per) * 100) / 100;

  const handleDelete = async (m) => {
    if (!window.confirm(`Materiaal "${m.naam}" verwijderen?`)) return;
    try {
      await deleteWerkbonMateriaal(m.id);
      setMaterialen(prev => prev.filter(x => x.id !== m.id));
    } catch (err) { toast.error(err.message || 'Verwijderen mislukt'); }
  };

  const handleAdd = async () => {
    if (!form.naam.trim()) { toast.error('Naam is verplicht'); return; }
    setAdding(true);
    try {
      const r = await createWerkbonMateriaal({
        werkbon_id: werkbonId,
        naam: form.naam.trim(),
        eenheid: form.eenheid || null,
        aantal: Number(form.aantal),
        prijs_per: Number(form.prijs_per),
      });
      setMaterialen(prev => [...prev, r]);
      setForm({ naam: '', eenheid: '', aantal: 1, prijs_per: 0 });
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setAdding(false); }
  };

  const totalSubtotaal = materialen.reduce((s, m) => s + m.subtotaal, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {materialen.length > 0 && (
        <table className="tw dt" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th className="th">Naam</th>
              <th className="th">Eenheid</th>
              <th className="th" style={{ textAlign: 'right' }}>Aantal</th>
              <th className="th" style={{ textAlign: 'right' }}>Prijs/stuk</th>
              <th className="th" style={{ textAlign: 'right' }}>Subtotaal</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {materialen.map(m => (
              <tr key={m.id}>
                <td className="td">{m.naam}</td>
                <td className="td">{m.eenheid || '—'}</td>
                <td className="td" style={{ textAlign: 'right' }}>{m.aantal}</td>
                <td className="td" style={{ textAlign: 'right' }}>€{m.prijsPer.toFixed(2)}</td>
                <td className="td" style={{ textAlign: 'right', fontWeight: 600 }}>€{m.subtotaal.toFixed(2)}</td>
                <td className="td">
                  <button className="btn btn-xs btn-danger btn-icon" onClick={() => handleDelete(m)}>{I.trash}</button>
                </td>
              </tr>
            ))}
            <tr>
              <td className="td" colSpan={4} style={{ fontWeight: 700, textAlign: 'right' }}>Totaal</td>
              <td className="td" style={{ textAlign: 'right', fontWeight: 700 }}>€{totalSubtotaal.toFixed(2)}</td>
              <td className="td"></td>
            </tr>
          </tbody>
        </table>
      )}

      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dl)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>Materiaal toevoegen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px', gap: 8, alignItems: 'end' }}>
          <div className="f" style={{ margin: 0 }}>
            <label>Naam</label>
            <input type="text" value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Materiaalnaam" />
          </div>
          <div className="f" style={{ margin: 0 }}>
            <label>Eenheid</label>
            <input type="text" value={form.eenheid} onChange={e => set('eenheid', e.target.value)} placeholder="stk" />
          </div>
          <div className="f" style={{ margin: 0 }}>
            <label>Aantal</label>
            <input type="number" min="0" step="1" value={form.aantal} onChange={e => set('aantal', e.target.value)} />
          </div>
          <div className="f" style={{ margin: 0 }}>
            <label>Prijs/stuk (€)</label>
            <input type="number" min="0" step="0.01" value={form.prijs_per} onChange={e => set('prijs_per', e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--dl)' }}>Subtotaal: <strong>€{subtotaal.toFixed(2)}</strong></div>
          <button className="btn btn-sm btn-p" onClick={handleAdd} disabled={adding || !form.naam.trim()}>
            {adding ? '...' : `${I.plus} Toevoegen`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabUren({ werkbonId }) {
  const toast = useToast();
  const { profile } = useProfile();
  const [form, setForm] = useState({ datum: todayStr(), start_tijd: '', eind_tijd: '', type: 'arbeid', notitie: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await createUrenregel({
        profile_id: profile?.id,
        werkbon_id: werkbonId,
        datum: form.datum,
        start_tijd: form.start_tijd || null,
        eind_tijd: form.eind_tijd || null,
        type: form.type,
        notitie: form.notitie || null,
      });
      toast.success('Uren geregistreerd');
      setForm({ datum: todayStr(), start_tijd: '', eind_tijd: '', type: 'arbeid', notitie: '' });
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dl)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>Uren registreren</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="f" style={{ margin: 0 }}>
            <label>Datum</label>
            <input type="date" value={form.datum} onChange={e => set('datum', e.target.value)} />
          </div>
          <div className="f" style={{ margin: 0 }}>
            <label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="arbeid">Arbeid</option>
              <option value="reiskosten">Reiskosten</option>
            </select>
          </div>
          <div className="f" style={{ margin: 0 }}>
            <label>Starttijd</label>
            <input type="time" value={form.start_tijd} onChange={e => set('start_tijd', e.target.value)} />
          </div>
          <div className="f" style={{ margin: 0 }}>
            <label>Eindtijd</label>
            <input type="time" value={form.eind_tijd} onChange={e => set('eind_tijd', e.target.value)} />
          </div>
          <div className="f" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label>Notitie</label>
            <textarea rows={2} value={form.notitie} onChange={e => set('notitie', e.target.value)} placeholder="Optionele notitie..." />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-p" onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Uren registreren'}</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--dl)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {I.hours}
        <span>Uren worden ook zichtbaar op de Uren-pagina.</span>
      </div>
    </div>
  );
}

// ── WERKBON PAGE ─────────────────────────────────────────────────────────────

export function WerkbonPage() {
  const toast = useToast();
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [selected, setSelected] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [taken, setTaken] = useState([]);
  const [materialen, setMaterialen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const photoInputRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getWerkbonnen(), listCustomers()])
      .then(([w, c]) => { setWerkbonnen(w); setCustomers(c); setError(''); })
      .catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected == null) { setTaken([]); setMaterialen([]); return; }
    Promise.all([getWerkbonTaken(selected), getWerkbonMaterialen(selected)])
      .then(([t, m]) => { setTaken(t); setMaterialen(m); })
      .catch(err => toast.error(err.message || 'Details laden mislukt'));
  }, [selected]);

  const selectedWerkbon = werkbonnen.find(w => w.id === selected) || null;

  const filteredWerkbonnen = werkbonnen.filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    const cName = w.customerName || customers.find(c => c.id == w.customerId)?.name || '';
    return (
      w.titel.toLowerCase().includes(q) ||
      cName.toLowerCase().includes(q) ||
      (w.locatie || '').toLowerCase().includes(q)
    );
  });

  const handleComplete = async () => {
    if (!selected) return;
    if (!window.confirm('Werkbon afronden?')) return;
    try {
      const r = await completeWerkbon(selected);
      setWerkbonnen(prev => prev.map(w => w.id === r.id ? r : w));
      toast.success('Werkbon afgerond');
    } catch (err) { toast.error(err.message || 'Mislukt'); }
  };

  const handleWerkbonUpdated = (updated) => {
    setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
  };

  const handleNewSaved = (wb) => {
    setWerkbonnen(prev => [wb, ...prev]);
    setSelected(wb.id);
    setActiveTab('info');
  };

  const tabs = [
    { key: 'info', label: 'Info' },
    { key: 'taken', label: `Taken${taken.length > 0 ? ` (${taken.length})` : ''}` },
    { key: 'materialen', label: `Materialen${materialen.length > 0 ? ` (${materialen.length})` : ''}` },
    { key: 'uren', label: 'Uren' },
  ];

  if (loading) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Werkbonnen</h1>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</div>}
        </div>
      </div>

      <div className="wo-layout afu2">
        {/* LEFT PANEL */}
        <div className="wo-panel-left">
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--br)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-p btn-sm" style={{ flex: 'none' }} onClick={() => setShowNew(true)}>
                {I.plus} Nieuw
              </button>
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 8, color: 'var(--dl)', pointerEvents: 'none' }}>{I.search}</span>
                <input
                  style={{ paddingLeft: 26, width: '100%' }}
                  placeholder="Zoeken..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
              {filteredWerkbonnen.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--dl)', fontSize: 13 }}>
                  Geen werkbonnen gevonden
                </div>
              )}
              {filteredWerkbonnen.map(w => {
                const isSelected = selected === w.id;
                const cName = w.customerName || customers.find(c => c.id == w.customerId)?.name || '—';
                return (
                  <div
                    key={w.id}
                    onClick={() => { setSelected(w.id); setActiveTab('info'); }}
                    style={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--br)',
                      borderLeft: isSelected ? '3px solid var(--p)' : '3px solid transparent',
                      background: isSelected ? 'var(--pll)' : 'transparent',
                      transition: 'background .12s',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{w.titel}</div>
                    <div style={{ fontSize: 12, color: 'var(--dl)', marginBottom: 4 }}>{cName}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {werkbonBadge(w.status)}
                      {w.geplandOp && (
                        <span style={{ fontSize: 11, color: 'var(--dl)' }}>{fmtDate(w.geplandOp)}</span>
                      )}
                      {w.locatie && (
                        <span style={{ fontSize: 11, color: 'var(--dl)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {I.map} {w.locatie}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedWerkbon ? (
            <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)', padding: '64px 24px' }}>
              <div style={{ opacity: .3, transform: 'scale(2.5)', display: 'inline-block', marginBottom: 20 }}>{I.wo}</div>
              <div style={{ marginTop: 24, fontWeight: 500 }}>Selecteer een werkbon</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Kies een werkbon uit de lijst om details te bekijken</div>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {/* Detail header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--br)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{selectedWerkbon.titel}</h2>
                    <div style={{ fontSize: 13, color: 'var(--dl)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>{selectedWerkbon.customerName || customers.find(c => c.id == selectedWerkbon.customerId)?.name || '—'}</span>
                      {selectedWerkbon.geplandOp && <span>· {fmtDate(selectedWerkbon.geplandOp)}</span>}
                      <span>·</span>
                      {werkbonBadge(selectedWerkbon.status)}
                    </div>
                  </div>
                  {/* TODO: upload work order photos to Supabase Storage */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedPhoto(file.name);
                        toast.info(`Foto geselecteerd: ${file.name}. Upload naar opslag wordt later gekoppeld.`);
                      }
                      e.target.value = '';
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-sm btn-ghost btn-icon"
                      title="Bel klant"
                      onClick={() => {
                        const customer = customers.find(c => c.id === selectedWerkbon.customerId);
                        const phone = customer?.phone;
                        if (phone) {
                          window.location.href = `tel:${phone.replace(/\s/g, '')}`;
                        } else {
                          toast.info('Geen telefoonnummer beschikbaar voor deze klant');
                        }
                      }}
                    >
                      {I.call}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost btn-icon"
                      title="Route openen"
                      onClick={() => {
                        const locatie = selectedWerkbon.locatie;
                        if (locatie) {
                          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locatie)}`, '_blank', 'noopener');
                        } else {
                          toast.info('Geen adres beschikbaar voor deze werkbon');
                        }
                      }}
                    >
                      {I.route}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost btn-icon"
                      title={selectedPhoto ? `Foto: ${selectedPhoto}` : 'Foto toevoegen'}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {I.camera}
                    </button>
                    <button className="btn btn-sm btn-s" onClick={() => setShowEdit(true)}>
                      {I.edit} Bewerken
                    </button>
                    {selectedWerkbon.status !== 'afgerond' && (
                      <button className="btn btn-sm btn-p" onClick={handleComplete}>
                        {I.check} Afronden
                      </button>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="tabs" style={{ marginTop: 16 }}>
                  {tabs.map(t => (
                    <button
                      key={t.key}
                      className={`tab${activeTab === t.key ? ' active' : ''}`}
                      onClick={() => setActiveTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div style={{ padding: 20 }}>
                {activeTab === 'info' && (
                  <TabInfo
                    werkbon={selectedWerkbon}
                    customers={customers}
                    onUpdated={handleWerkbonUpdated}
                  />
                )}
                {activeTab === 'taken' && (
                  <TabTaken
                    werkbonId={selected}
                    taken={taken}
                    setTaken={setTaken}
                  />
                )}
                {activeTab === 'materialen' && (
                  <TabMaterialen
                    werkbonId={selected}
                    materialen={materialen}
                    setMaterialen={setMaterialen}
                  />
                )}
                {activeTab === 'uren' && (
                  <TabUren werkbonId={selected} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewWerkbonModal
          customers={customers}
          onClose={() => setShowNew(false)}
          onSaved={handleNewSaved}
        />
      )}
      {showEdit && selectedWerkbon && (
        <EditWerkbonModal
          werkbon={selectedWerkbon}
          customers={customers}
          onClose={() => setShowEdit(false)}
          onSaved={updated => { handleWerkbonUpdated(updated); setShowEdit(false); }}
        />
      )}
    </div>
  );
}
