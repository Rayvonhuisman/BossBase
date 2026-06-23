import { useEffect, useMemo, useRef, useState } from 'react';
import { I, ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { useUploads } from '../lib/uploadContext.jsx';
import { MentionEditor, renderMentions } from '../components/MentionEditor.jsx';
import { getTeamMembers, createAssignmentNotification } from '../services/notificatieService.js';
import {
  getWerkbonnen, getWerkbonById, createWerkbon, updateWerkbon,
  getWerkbonTaken, createWerkbonTaak, toggleWerkbonTaak, deleteWerkbonTaak,
  getWerkbonMaterialen, createWerkbonMateriaal, deleteWerkbonMateriaal,
  getWerkbonFotos, uploadWerkbonFoto, deleteWerkbonFoto,
  getWerkbonMeerwerk, createWerkbonMeerwerk, deleteWerkbonMeerwerk,
  updateWerkbonNotities, getAllWerkbonTakenCounts,
} from '../services/werkbonService.js';
import { listCustomers } from '../services/customerService.js';
import { getProjects } from '../services/projectsService.js';
import { createUrenregel, getUrenregistratie, calculateHours } from '../services/urenService.js';
import { createJobCost } from '../services/jobCostService.js';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const TODAY = () => new Date().toISOString().slice(0, 10);

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

const fmtEur = n => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

const fmtTime = t => (t ? String(t).slice(0, 5) : '');

const DAY_LABEL = ['zo','ma','di','wo','do','vr','za'];
const MONTH_LABEL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

const shortDate = d => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (Number.isNaN(dt.valueOf())) return d;
  return `${DAY_LABEL[dt.getDay()]} ${dt.getDate()} ${MONTH_LABEL[dt.getMonth()]}`;
};

const STATUS_LABEL = {
  gepland: 'Gepland',
  in_uitvoering: 'In uitvoering',
  afgerond: 'Afgerond',
};

const STATUS_TONE = {
  gepland: 'blue',
  in_uitvoering: 'amber',
  afgerond: 'green',
};

// ─── BADGES ─────────────────────────────────────────────────────────────────

function WB2Badge({ tone = 'gray', size, children, dot = true }) {
  return (
    <span className={`wb2-badge ${tone} ${size === 'sm' ? 'sm' : ''}`}>
      {dot && <span className="wb2-badge-dot" />}
      {children}
    </span>
  );
}
const StatusBadge = ({ status, size }) => (
  <WB2Badge tone={STATUS_TONE[status] || 'gray'} size={size}>
    {STATUS_LABEL[status] || status || 'Onbekend'}
  </WB2Badge>
);

// ─── NEW / EDIT WERKBON MODAL ───────────────────────────────────────────────

function WerkbonModal({ mode, werkbon, customers, projects = [], onClose, onSaved }) {
  const toast = useToast();
  const { profile } = useProfile();
  const isEdit = mode === 'edit';
  const [teamMembers, setTeamMembers] = useState([]);
  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);
  const [form, setForm] = useState(() => ({
    titel: werkbon?.titel || '',
    customer_id: werkbon?.customerId || '',
    project_id: werkbon?.projectId || '',
    omschrijving: werkbon?.omschrijving || '',
    gepland_op: werkbon?.geplandOp || '',
    starttijd: werkbon?.starttijd ? String(werkbon.starttijd).slice(0, 5) : '',
    eindtijd: werkbon?.eindtijd ? String(werkbon.eindtijd).slice(0, 5) : '',
    locatie: werkbon?.locatie || '',
    notes: werkbon?.notes || '',
    status: werkbon?.status || 'gepland',
    assignedTo: werkbon?.assignedTo || '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    setSaving(true);
    try {
      const payload = {
        titel: form.titel.trim(),
        customer_id: form.customer_id || null,
        project_id: form.project_id || null,
        omschrijving: form.omschrijving || null,
        gepland_op: form.gepland_op || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        locatie: form.locatie || null,
        notes: form.notes || null,
        assigned_to: form.assignedTo || null,
      };
      let saved;
      if (isEdit) {
        saved = await updateWerkbon(werkbon.id, { ...payload, status: form.status });
        toast.success('Werkbon bijgewerkt');
        const prevAssigned = werkbon?.assignedTo || '';
        if (form.assignedTo && form.assignedTo !== prevAssigned && profile?.id) {
          const m = teamMembers.find(x => x.id === form.assignedTo);
          createAssignmentNotification({ assignedToUserId: form.assignedTo, assignedToName: m?.fullName, type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${form.titel.trim()}`, link: 'werkbonnen', relatedType: 'werkbon', relatedId: saved?.id, creatorId: profile.id, creatorName: profile.fullName }).catch(() => {});
        }
      } else {
        saved = await createWerkbon(payload);
        toast.success('Werkbon aangemaakt');
        if (form.assignedTo && profile?.id) {
          const m = teamMembers.find(x => x.id === form.assignedTo);
          createAssignmentNotification({ assignedToUserId: form.assignedTo, assignedToName: m?.fullName, type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${form.titel.trim()}`, link: 'werkbonnen', relatedType: 'werkbon', relatedId: saved?.id, creatorId: profile.id, creatorName: profile.fullName }).catch(() => {});
        }
      }
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">{isEdit ? 'Werkbon bewerken' : 'Nieuwe werkbon'}</div>
            <div className="modal-sub">{isEdit ? `WB-${String(werkbon?.id || '').slice(0, 4).toUpperCase()}` : 'Plan een nieuwe klus in'}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="wb2-modal-fg">
          {isEdit && (
            <div className="f full">
              <label>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="gepland">Gepland</option>
                <option value="in_uitvoering">In uitvoering</option>
                <option value="afgerond">Afgerond</option>
              </select>
            </div>
          )}
          <div className="f full">
            <label>Titel</label>
            <input
              type="text" autoFocus
              placeholder="Bv. Lekkage badkamer leiding repareren"
              value={form.titel}
              onChange={e => set('titel', e.target.value)}
            />
          </div>
          <div className="f">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Geen klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Project (optioneel)</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">— Geen project —</option>
              {(form.customer_id
                ? projects.filter(p => !p.customerId || p.customerId === form.customer_id)
                : projects
              ).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Locatie</label>
            <input type="text" placeholder="Straat, huisnr, plaats" value={form.locatie} onChange={e => set('locatie', e.target.value)} />
          </div>
          <div className="f">
            <label>Datum</label>
            <input type="date" value={form.gepland_op} onChange={e => set('gepland_op', e.target.value)} />
          </div>
          <div className="f">
            <label>Tijd</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="time" value={form.starttijd || ''} onChange={e => set('starttijd', e.target.value)} style={{ flex: 1 }} />
              <span style={{ color: 'var(--dl)' }}>→</span>
              <input type="time" value={form.eindtijd || ''} onChange={e => set('eindtijd', e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>
          <div className="f full">
            <label>Omschrijving</label>
            <MentionEditor value={form.omschrijving} onChange={v => set('omschrijving', v)} placeholder="Wat moet er gebeuren op locatie? Typ @ om iemand te taggen" rows={3} disabled={saving} teamMembers={teamMembers} />
          </div>
          <div className="f full">
            <label>Interne notities</label>
            <MentionEditor value={form.notes} onChange={v => set('notes', v)} placeholder="Bv. klant heeft hond, deur dicht houden… Typ @ om iemand te taggen" rows={2} disabled={saving} teamMembers={teamMembers} />
          </div>
          {teamMembers.length > 0 && (
            <div className="f full">
              <label>Toegewezen aan</label>
              <select value={form.assignedTo || ''} onChange={e => set('assignedTo', e.target.value)} disabled={saving}>
                <option value="">Niemand</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan…' : (isEdit ? 'Wijzigingen opslaan' : 'Werkbon aanmaken')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LIST CARD ──────────────────────────────────────────────────────────────

function WerkbonListCard({ w, takenCount, onClick }) {
  const { total = 0, done = 0 } = takenCount || {};
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <button className="wb2-list-card" onClick={onClick} type="button">
      <div className="wb2-list-card-row1">
        <div className="wb2-list-card-titel">{w.titel || '—'}</div>
        <StatusBadge status={w.status} size="sm" />
      </div>
      {w.customerName && <div className="wb2-list-card-customer">{w.customerName}</div>}
      {w.locatie && (
        <div className="wb2-list-card-loc">{I.map} {w.locatie}</div>
      )}
      <div className="wb2-list-card-footer">
        {w.geplandOp && (
          <span className="wb2-list-card-date">
            {I.cal} {shortDate(w.geplandOp)}{w.starttijd ? ` · ${fmtTime(w.starttijd)}` : ''}
          </span>
        )}
        {total > 0 && (
          <span className="wb2-list-card-tasks">
            {I.check} {done}/{total}
            <span className="wb2-list-card-bar">
              <span className="wb2-list-card-bar-fill" style={{ width: `${pct}%` }} />
            </span>
          </span>
        )}
      </div>
    </button>
  );
}

// ─── HOURS QUICK-ADD CARD (dark) ────────────────────────────────────────────

function HoursQuickAdd({ werkbon, customers, onSaved }) {
  const toast = useToast();
  const { profile } = useProfile();
  const [type, setType] = useState('arbeid');
  const [datum, setDatum] = useState(TODAY());
  const [start, setStart] = useState('');
  const [eind, setEind] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStart('');
    setEind('');
    setType('arbeid');
    setDatum(TODAY());
  }, [werkbon?.id]);

  const computed = calculateHours(start, eind);

  const submit = async () => {
    if (!profile?.id) { toast.error('Profiel niet geladen'); return; }
    if (!start || !eind) { toast.error('Start- en eindtijd zijn verplicht'); return; }
    if (!computed) { toast.error('Eindtijd moet na starttijd liggen'); return; }
    setSaving(true);
    try {
      await createUrenregel({
        profile_id: profile.id,
        werkbon_id: werkbon.id,
        customer_id: werkbon.customerId || null,
        datum,
        start_tijd: start,
        eind_tijd: eind,
        type,
      });
      toast.success('Uren opgeslagen');
      setStart(''); setEind('');
      onSaved?.();
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wb2-hours">
      <div className="wb2-hours-hd">
        <div className="wb2-hours-ic">{I.clock}</div>
        <div>
          <div className="wb2-hours-title">Uren registreren</div>
          <div className="wb2-hours-meta">{shortDate(datum)} · {werkbon.titel?.slice(0, 32) || 'Werkbon'}</div>
        </div>
        <span className="wb2-hours-tag">Snel boeken</span>
      </div>

      <div className="wb2-hours-grid">
        <div className="wb2-hours-field">
          <div className="wb2-hours-field-lbl">Type</div>
          <button
            type="button"
            className="wb2-hours-pick"
            onClick={() => setType(t => t === 'arbeid' ? 'reiskosten' : 'arbeid')}
          >
            <span className="wb2-hours-pick-dot" />
            {type === 'arbeid' ? 'Arbeid' : 'Reiskosten'}
            <span style={{ marginLeft: 'auto', opacity: .6 }}>{I.chev_d}</span>
          </button>
        </div>
        <div className="wb2-hours-field">
          <div className="wb2-hours-field-lbl">Start</div>
          <input
            type="time"
            className="wb2-hours-input"
            value={start}
            onChange={e => setStart(e.target.value)}
          />
        </div>
        <div className="wb2-hours-field">
          <div className="wb2-hours-field-lbl">Eind</div>
          <input
            type="time"
            className="wb2-hours-input"
            value={eind}
            onChange={e => setEind(e.target.value)}
          />
        </div>
      </div>

      {computed != null && (
        <div className="wb2-hours-live" style={{ marginBottom: 10 }}>
          <span className="wb2-hours-live-dot" />
          {computed.toFixed(2).replace('.', ',')} uur berekend
        </div>
      )}

      <div className="wb2-hours-actions">
        <button type="button" className="wb2-hours-primary" onClick={submit} disabled={saving}>
          {I.check} {saving ? 'Opslaan…' : 'Uren opslaan'}
        </button>
        <button
          type="button"
          className="wb2-hours-secondary"
          onClick={() => { setStart(''); setEind(''); }}
          disabled={saving}
        >
          Wissen
        </button>
      </div>
      <div className="wb2-hours-tip">
        Datum <b>{fmtDate(datum)}</b> · medewerker <b>{profile?.fullName || profile?.email || 'jij'}</b>
      </div>
    </div>
  );
}

// ─── TASKS ──────────────────────────────────────────────────────────────────

function TakenSection({ taken, onToggle, onAdd, onDelete }) {
  const [text, setText] = useState('');
  const total = taken.length;
  const done = taken.filter(t => t.afgerond).length;
  const pct = total ? (done / total) * 100 : 0;

  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    await onAdd(v);
    setText('');
  };

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd">
        <div className="wb2-card-hd-title">Taken · {done} / {total}</div>
      </div>
      <div className="wb2-card-body">
        <div className="wb2-progress"><span style={{ width: `${pct}%` }} /></div>
        {taken.length === 0 && (
          <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Nog geen taken — voeg de eerste hieronder toe.</div>
        )}
        {taken.map(t => (
          <div key={t.id} className="wb2-taak">
            <button
              type="button"
              className={`wb2-taak-check${t.afgerond ? ' done' : ''}`}
              onClick={() => onToggle(t)}
              aria-label={t.afgerond ? 'Markeer als open' : 'Markeer als afgerond'}
            >
              {t.afgerond && I.check}
            </button>
            <div className={`wb2-taak-label${t.afgerond ? ' done' : ''}`}>{t.omschrijving}</div>
            <button className="wb2-taak-del" onClick={() => onDelete(t)} aria-label="Verwijderen">{I.trash}</button>
          </div>
        ))}
        <div className="wb2-taak-add">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Nieuwe taak…"
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          />
          <button className="btn btn-s btn-sm" onClick={submit} disabled={!text.trim()}>
            {I.plus} Taak
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MATERIALS ──────────────────────────────────────────────────────────────

function MaterialenSection({ materialen, onAdd, onDelete }) {
  const [form, setForm] = useState({ naam: '', eenheid: 'stuk', aantal: 1, prijs_per: 0 });
  const [adding, setAdding] = useState(false);

  const total = materialen.reduce((s, m) => s + (m.subtotaal || m.aantal * m.prijsPer || 0), 0);

  const submit = async () => {
    if (!form.naam.trim()) return;
    setAdding(true);
    try {
      await onAdd({
        naam: form.naam.trim(),
        eenheid: form.eenheid || null,
        aantal: Number(form.aantal) || 1,
        prijs_per: Number(form.prijs_per) || 0,
      });
      setForm({ naam: '', eenheid: 'stuk', aantal: 1, prijs_per: 0 });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd">
        <div className="wb2-card-hd-title">Materialen</div>
      </div>
      <div className="wb2-card-body">
        <div className="wb2-mat-body">
          <div className="wb2-mat-grid">
            <div>Materiaal</div>
            <div>Eenheid</div>
            <div className="right">Aantal</div>
            <div className="right">Per stuk</div>
            <div className="right">Subtotaal</div>
            <div />
          </div>
          {materialen.length === 0 && (
            <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Nog geen materialen toegevoegd.</div>
          )}
          {materialen.map(m => {
            const sub = m.subtotaal || m.aantal * m.prijsPer;
            return (
              <div key={m.id} className="wb2-mat-grid row">
                <div>{m.naam}</div>
                <div style={{ color: 'var(--dl)' }}>{m.eenheid || '—'}</div>
                <div className="right mono">{m.aantal}</div>
                <div className="right mono" style={{ color: 'var(--dmu)' }}>{fmtEur(m.prijsPer)}</div>
                <div className="right mono" style={{ fontWeight: 600 }}>{fmtEur(sub)}</div>
                <button onClick={() => onDelete(m)} aria-label="Verwijderen">{I.trash}</button>
              </div>
            );
          })}
          <div className="wb2-mat-add">
            <input
              type="text"
              placeholder="Naam materiaal"
              value={form.naam}
              onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            />
            <input
              type="text"
              placeholder="stuk"
              value={form.eenheid}
              onChange={e => setForm(f => ({ ...f, eenheid: e.target.value }))}
            />
            <input
              type="number" min="0" step="0.01" className="right"
              placeholder="1"
              value={form.aantal}
              onChange={e => setForm(f => ({ ...f, aantal: e.target.value }))}
              style={{ textAlign: 'right' }}
            />
            <input
              type="number" min="0" step="0.01"
              placeholder="€"
              value={form.prijs_per}
              onChange={e => setForm(f => ({ ...f, prijs_per: e.target.value }))}
              style={{ textAlign: 'right' }}
            />
            <div className="right mono" style={{ fontWeight: 600, color: 'var(--dmu)' }}>
              {fmtEur((Number(form.aantal) || 0) * (Number(form.prijs_per) || 0))}
            </div>
            <button onClick={submit} disabled={adding || !form.naam.trim()} className="wb2-mat-add-btn" aria-label="Materiaal toevoegen" title="Toevoegen">
              {I.plus}
            </button>
          </div>
        </div>
        <div className="wb2-mat-foot">
          <div className="wb2-mat-foot-add" style={{ visibility: 'hidden' }}>spacer</div>
          <div style={{ textAlign: 'right' }}>
            <div className="wb2-mat-foot-total-lbl">Totaal materiaal</div>
            <div className="wb2-mat-foot-total">{fmtEur(total)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FOTO SECTION ───────────────────────────────────────────────────────────

const FOTO_CATS = [
  { key: 'voor',    label: 'Voor',    color: '#2563EB', bg: '#EFF4FF' },
  { key: 'tijdens', label: 'Tijdens', color: '#D97706', bg: '#FFF7E6' },
  { key: 'na',      label: 'Na',      color: '#0F7A3F', bg: '#E8FBEF' },
];

function FotoSection({ fotos, onUpload, onDelete }) {
  const inputRefs = useRef({});
  const [uploading, setUploading] = useState({});

  const handleFileChange = async (cat, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(u => ({ ...u, [cat]: true }));
    try { await onUpload(file, cat); }
    finally { setUploading(u => ({ ...u, [cat]: false })); }
  };

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd"><div className="wb2-card-hd-title">Foto's · {fotos.length}</div></div>
      <div className="wb2-card-body">
        <div className="wb2-foto-cats">
          {FOTO_CATS.map(cat => {
            const catFotos = fotos.filter(f => f.categorie === cat.key);
            return (
              <div key={cat.key} className="wb2-foto-cat">
                <div className="wb2-foto-cat-hd">
                  <span className="wb2-foto-cat-label" style={{ color: cat.color }}>{cat.label}</span>
                  {catFotos.length > 0 && (
                    <span className="wb2-foto-cat-count" style={{ background: cat.bg, color: cat.color }}>{catFotos.length}</span>
                  )}
                </div>
                <div className="wb2-foto-thumb-row">
                  {catFotos.map(f => (
                    <div key={f.id} className="wb2-foto-thumb">
                      <a href={f.url} target="_blank" rel="noopener noreferrer">
                        <img src={f.url} alt={cat.label} loading="lazy" />
                      </a>
                      <button className="wb2-foto-thumb-del" onClick={() => onDelete(f)} title="Verwijderen">×</button>
                    </div>
                  ))}
                </div>
                <button
                  className="wb2-foto-upload-btn"
                  disabled={uploading[cat.key]}
                  onClick={() => inputRefs.current[cat.key]?.click()}
                >
                  {I.camera} {uploading[cat.key] ? 'Uploaden…' : 'Foto toevoegen'}
                </button>
                <input
                  ref={el => { inputRefs.current[cat.key] = el; }}
                  type="file" accept="image/*" capture="environment" hidden
                  onChange={e => handleFileChange(cat.key, e)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── MEERWERK SECTION ────────────────────────────────────────────────────────

function MeerwerkSection({ meerwerk, onAdd, onDelete }) {
  const [form, setForm] = useState({ omschrijving: '', prijs: '' });
  const [adding, setAdding] = useState(false);

  const total = meerwerk.reduce((s, m) => s + Number(m.prijs || 0), 0);

  const submit = async () => {
    if (!form.omschrijving.trim()) return;
    setAdding(true);
    try {
      await onAdd({ omschrijving: form.omschrijving.trim(), prijs: Number(form.prijs) || 0 });
      setForm({ omschrijving: '', prijs: '' });
    } finally { setAdding(false); }
  };

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd"><div className="wb2-card-hd-title">Meerwerk</div></div>
      <div className="wb2-card-body">
        {meerwerk.length === 0 && (
          <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Geen meerwerk geregistreerd.</div>
        )}
        {meerwerk.map(m => (
          <div key={m.id} className="wb2-meerwerk-item">
            <div className="wb2-meerwerk-omschr">{m.omschrijving}</div>
            <span className="wb2-meerwerk-akkoord">Klant akkoord gevraagd</span>
            <div className="wb2-meerwerk-prijs">{fmtEur(m.prijs)}</div>
            <button className="wb2-taak-del" onClick={() => onDelete(m)}>{I.trash}</button>
          </div>
        ))}
        {meerwerk.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid #EFF2EF', marginTop: 2 }}>
            <span style={{ fontSize: 12, color: 'var(--dl)' }}>Totaal meerwerk</span>
            <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(total)}</span>
          </div>
        )}
        <div className="wb2-meerwerk-add">
          <input
            type="text" placeholder="Omschrijving meerwerk…"
            value={form.omschrijving}
            onChange={e => setForm(f => ({ ...f, omschrijving: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <input
            type="number" min="0" step="0.01" placeholder="€ 0,00"
            value={form.prijs}
            onChange={e => setForm(f => ({ ...f, prijs: e.target.value }))}
            style={{ width: 110 }}
          />
          <button className="btn btn-s btn-sm" onClick={submit} disabled={adding || !form.omschrijving.trim()}>
            {I.plus} Toevoegen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NOTITIES SECTION ────────────────────────────────────────────────────────

function NotitiesSection({ notities, onSave, teamMembers = [] }) {
  const [value, setValue] = useState(notities || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(notities || ''); }, [notities]);

  const save = async () => {
    setSaving(true);
    try { await onSave(value); }
    finally { setSaving(false); }
  };

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd"><div className="wb2-card-hd-title">Notities uitvoerder</div></div>
      <div className="wb2-card-body">
        <MentionEditor
          value={value}
          onChange={setValue}
          placeholder="Bijzonderheden, bevindingen, aandachtspunten voor de baas… Typ @ om iemand te taggen"
          rows={4}
          disabled={saving}
          teamMembers={teamMembers}
        />
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-s btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Opslaan…' : 'Notities opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export function WerkbonPageV2({ preOpenWerkbonId, onNavConsumed, setPage, openCustomer } = {}) {
  const toast = useToast();
  const { profile } = useProfile();
  const { startUpload } = useUploads();
  const canManage = !profile || ['admin', 'planner'].includes(profile.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [takenCounts, setTakenCounts] = useState({});

  // 'list' | 'detail'
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [taken, setTaken] = useState([]);
  const [materialen, setMaterialen] = useState([]);
  const [uren, setUren] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [meerwerk, setMeerwerk] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHoursAdd, setShowHoursAdd] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [editWerkbon, setEditWerkbon] = useState(null);

  // ── LOAD ────────────────────────────────────────────────────────────────

  const loadList = async () => {
    setLoading(true);
    setErr('');
    try {
      const [list, cs, tc, prs] = await Promise.all([
        getWerkbonnen(),
        listCustomers().catch(() => []),
        getAllWerkbonTakenCounts().catch(() => ({})),
        getProjects().catch(() => []),
      ]);
      setWerkbonnen(list);
      setCustomers(cs);
      setTakenCounts(tc);
      setProjects(prs);
    } catch (e) {
      setErr(e.message || 'Werkbonnen laden mislukt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Teamleden voor @ tagging in de notities-sectie van het werkbon-detail.
  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  useEffect(() => {
    if (!preOpenWerkbonId || loading) return;
    if (werkbonnen.some(w => w.id === preOpenWerkbonId)) {
      openDetail(preOpenWerkbonId);
      onNavConsumed?.();
    }
  }, [preOpenWerkbonId, loading, werkbonnen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let alive = true;
    setDetailLoading(true);
    setShowHoursAdd(false);
    Promise.all([
      getWerkbonById(selectedId).catch(() => null),
      getWerkbonTaken(selectedId).catch(() => []),
      getWerkbonMaterialen(selectedId).catch(() => []),
      getUrenregistratie({ werkbonId: selectedId }).catch(() => []),
      getWerkbonFotos(selectedId).catch(() => []),
      getWerkbonMeerwerk(selectedId).catch(() => []),
    ]).then(([w, t, m, u, f, mw]) => {
      if (!alive) return;
      setDetail(w);
      setTaken(t);
      setMaterialen(m);
      setUren(u);
      setFotos(f);
      setMeerwerk(mw);
      setTakenCounts(prev => ({
        ...prev,
        [selectedId]: { total: t.length, done: t.filter(x => x.afgerond).length },
      }));
    }).finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedId]);

  const openDetail = id => { setSelectedId(id); setView('detail'); };
  const goBack = () => setView('list');

  // ── DERIVED ─────────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all: werkbonnen.length,
    gepland: werkbonnen.filter(w => w.status === 'gepland').length,
    in_uitvoering: werkbonnen.filter(w => w.status === 'in_uitvoering').length,
    afgerond: werkbonnen.filter(w => w.status === 'afgerond').length,
  }), [werkbonnen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return werkbonnen.filter(w => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (!q) return true;
      return `${w.titel} ${w.customerName} ${w.locatie}`.toLowerCase().includes(q);
    });
  }, [werkbonnen, statusFilter, search]);

  // ── DETAIL ACTIONS ──────────────────────────────────────────────────────

  const refreshTakenCountForCurrent = newTaken => {
    if (!selectedId) return;
    setTakenCounts(prev => ({
      ...prev,
      [selectedId]: { total: newTaken.length, done: newTaken.filter(x => x.afgerond).length },
    }));
  };

  const handleToggleTaak = async t => {
    try {
      const updated = await toggleWerkbonTaak(t.id, !t.afgerond);
      const newTaken = taken.map(x => x.id === t.id ? updated : x);
      setTaken(newTaken);
      refreshTakenCountForCurrent(newTaken);
    } catch (e) {
      toast.error(e.message || 'Bijwerken mislukt');
    }
  };

  const handleAddTaak = async omschrijving => {
    try {
      const created = await createWerkbonTaak({ werkbon_id: selectedId, omschrijving, volgorde: taken.length });
      const newTaken = [...taken, created];
      setTaken(newTaken);
      refreshTakenCountForCurrent(newTaken);
    } catch (e) {
      toast.error(e.message || 'Taak toevoegen mislukt');
    }
  };

  const handleDeleteTaak = async t => {
    if (!confirm(`Taak "${t.omschrijving}" verwijderen?`)) return;
    try {
      await deleteWerkbonTaak(t.id);
      const newTaken = taken.filter(x => x.id !== t.id);
      setTaken(newTaken);
      refreshTakenCountForCurrent(newTaken);
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleAddMaterial = async input => {
    try {
      const created = await createWerkbonMateriaal({ werkbon_id: selectedId, ...input });
      setMaterialen(prev => [...prev, created]);
      if (detail?.customerId && created.subtotaal > 0) {
        createJobCost({
          description: `Materiaal: ${created.naam}`,
          amount: created.subtotaal,
          category: 'Materiaal',
          cost_date: new Date().toISOString().slice(0, 10),
          customer_id: detail.customerId,
        }).catch(() => {});
      }
    } catch (e) {
      toast.error(e.message || 'Materiaal toevoegen mislukt');
    }
  };

  const handleDeleteMaterial = async m => {
    if (!confirm(`Materiaal "${m.naam}" verwijderen?`)) return;
    try {
      await deleteWerkbonMateriaal(m.id);
      setMaterialen(prev => prev.filter(x => x.id !== m.id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleComplete = async () => {
    if (!detail || detail.status === 'afgerond') return;
    if (!confirm('Weet je zeker dat je de klus wil afronden?')) return;
    try {
      const updated = await updateWerkbon(detail.id, {
        status: 'afgerond',
        afgerond_op: new Date().toISOString(),
      });
      setDetail(updated);
      setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
      toast.success('Klus afgerond!');
    } catch (e) {
      toast.error(e.message || 'Afronden mislukt');
    }
  };

  const handleCycleStatus = async () => {
    if (!detail || !canManage || detail.status === 'afgerond') return;
    const next = detail.status === 'gepland' ? 'in_uitvoering' : 'afgerond';
    if (next === 'afgerond' && !confirm('Weet je zeker dat je de klus wil afronden?')) return;
    try {
      const updated = await updateWerkbon(detail.id, {
        status: next,
        ...(next === 'afgerond' ? { afgerond_op: new Date().toISOString() } : {}),
      });
      setDetail(updated);
      setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
      toast.success(next === 'afgerond' ? 'Klus afgerond!' : 'Status: In uitvoering');
    } catch (e) {
      toast.error(e.message || 'Status bijwerken mislukt');
    }
  };

  const handleUploadFoto = (file, categorie) => {
    // Optimistisch: toon de foto meteen via een lokale preview en upload op de
    // achtergrond. De globale upload-indicator toont voortgang/fout + retry.
    const wbId = selectedId;
    const tempId = `pending-${Date.now()}-${Math.random()}`;
    const previewUrl = URL.createObjectURL(file);
    setFotos(prev => [...prev, { id: tempId, url: previewUrl, categorie, _pending: true }]);
    startUpload(file.name, async () => {
      const created = await uploadWerkbonFoto(wbId, file, categorie);
      setFotos(prev => prev.some(f => f.id === tempId)
        ? prev.map(f => (f.id === tempId ? created : f))
        : [...prev, created]);
    });
  };

  const handleDeleteFoto = async foto => {
    if (!confirm('Foto verwijderen?')) return;
    try {
      await deleteWerkbonFoto(foto.id, foto.url);
      setFotos(prev => prev.filter(f => f.id !== foto.id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleAddMeerwerk = async input => {
    try {
      const created = await createWerkbonMeerwerk({ werkbon_id: selectedId, ...input });
      setMeerwerk(prev => [...prev, created]);
    } catch (e) {
      toast.error(e.message || 'Meerwerk toevoegen mislukt');
    }
  };

  const handleDeleteMeerwerk = async m => {
    if (!confirm(`Meerwerk "${m.omschrijving}" verwijderen?`)) return;
    try {
      await deleteWerkbonMeerwerk(m.id);
      setMeerwerk(prev => prev.filter(x => x.id !== m.id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleSaveNotities = async notities => {
    try {
      const updated = await updateWerkbonNotities(detail.id, notities);
      setDetail(updated);
      toast.success('Notities opgeslagen');
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    }
  };

  const handlePhonePick = () => {
    if (!detail) return;
    const cust = customers.find(c => c.id === detail.customerId);
    const phone = cust?.phone || '';
    if (!phone) { toast.info('Geen telefoonnummer bekend voor deze klant'); return; }
    window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
  };

  const handleRoute = () => {
    if (!detail?.locatie) { toast.info('Geen locatie bekend voor deze werkbon'); return; }
    window.open(`https://maps.google.com/?q=${encodeURIComponent(detail.locatie)}`, '_blank', 'noopener');
  };

  const refreshUren = async () => {
    if (!selectedId) return;
    try {
      const u = await getUrenregistratie({ werkbonId: selectedId });
      setUren(u);
    } catch { /* ignore */ }
  };

  const onWerkbonSaved = saved => {
    setWerkbonnen(prev => {
      const idx = prev.findIndex(w => w.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    openDetail(saved.id);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Werkbonnen laden…</div>;
  }

  // ── DETAIL VIEW ─────────────────────────────────────────────────────────

  if (view === 'detail' && selectedId) {
    const totalArbeid = uren.filter(u => u.type === 'arbeid').reduce((s, u) => s + u.uren, 0);

    return (
      <div className="wb2-page">
        <div className="wb2-head">
          <button className="wb2-detail-back" onClick={goBack} type="button">
            ← Werkbonnen
          </button>
          <div className="wb2-head-spacer" />
          {canManage && (
            <button className="btn btn-p" onClick={() => setShowNew(true)} type="button">
              {I.plus} Nieuwe werkbon
            </button>
          )}
        </div>

        {detailLoading && !detail && (
          <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Detail laden…</div>
        )}

        {detail && (
          <div className="wb2-detail-page">
            {/* Header */}
            <div className="wb2-card">
              <div style={{ padding: '16px 18px' }}>
                {detail.projectId && detail.projectName && (
                  <button
                    type="button"
                    onClick={() => setPage?.('projecten', { id: detail.projectId })}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#0F7A3F', background: '#E8FBEF', border: 'none', borderRadius: 6, padding: '3px 10px', marginBottom: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {I.brief} {detail.projectName} →
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <StatusBadge status={detail.status} />
                  <div style={{ flex: 1 }} />
                  {canManage && (
                    <button className="btn btn-s btn-sm" onClick={() => setEditWerkbon(detail)} type="button">
                      {I.edit} Bewerken
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--dk)', marginBottom: 3 }}>
                  {detail.customerName && detail.customerId && openCustomer ? (
                    <button
                      type="button"
                      className="wb2-cust-link"
                      onClick={() => openCustomer(detail.customerId)}
                      title="Open klantkaart"
                    >
                      {detail.customerName}
                    </button>
                  ) : (
                    detail.customerName || detail.titel
                  )}
                </div>
                {detail.customerName && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dmu)', marginBottom: 6 }}>
                    {detail.titel}
                  </div>
                )}
                {detail.locatie && (
                  <div style={{ fontSize: 13, color: 'var(--dl)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    {I.map} {detail.locatie}
                  </div>
                )}
                {(detail.geplandOp || detail.starttijd) && (
                  <div style={{ fontSize: 13, color: 'var(--dl)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {I.cal}
                    {detail.geplandOp ? shortDate(detail.geplandOp) : '—'}
                    {(detail.starttijd || detail.eindtijd)
                      ? ` · ${fmtTime(detail.starttijd) || '—'}${detail.eindtijd ? ` – ${fmtTime(detail.eindtijd)}` : ''}`
                      : ''}
                  </div>
                )}
              </div>
            </div>

            {/* 3 action buttons */}
            <div className="wb2-action-row">
              <button className="wb2-action-btn" onClick={handlePhonePick} disabled={!detail.customerId} type="button">
                <div className="wb2-action-btn-ic">{I.call}</div>
                Bel klant
              </button>
              <button className="wb2-action-btn" onClick={handleRoute} disabled={!detail.locatie} type="button">
                <div className="wb2-action-btn-ic">{I.map}</div>
                Route
              </button>
              <button
                className="wb2-action-btn"
                onClick={handleCycleStatus}
                disabled={!canManage || detail.status === 'afgerond'}
                type="button"
              >
                <div className="wb2-action-btn-ic">{detail.status === 'gepland' ? I.flag : I.check}</div>
                {detail.status === 'gepland' ? 'Start klus' : detail.status === 'in_uitvoering' ? 'Afronden' : 'Afgerond ✓'}
              </button>
            </div>

            {/* Omschrijving */}
            {(detail.omschrijving || detail.notes) && (
              <div className="wb2-card">
                <div className="wb2-card-hd"><div className="wb2-card-hd-title">Omschrijving</div></div>
                <div className="wb2-card-body">
                  {detail.omschrijving && (
                    <div style={{ fontSize: 13.5, color: 'var(--dmu)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: detail.notes ? 10 : 0 }}>
                      {renderMentions(detail.omschrijving)}
                    </div>
                  )}
                  {detail.notes && (
                    <div className="wb2-note">
                      <span className="wb2-note-ic">{I.bell}</span>
                      <div className="wb2-note-txt"><b>Interne notitie:</b> {renderMentions(detail.notes)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Taken */}
            <TakenSection taken={taken} onToggle={handleToggleTaak} onAdd={handleAddTaak} onDelete={handleDeleteTaak} />

            {/* Uren met toggle voor quick-add */}
            <div className="wb2-card">
              <div className="wb2-card-hd">
                <div className="wb2-card-hd-title">
                  Uren{totalArbeid > 0 ? ` · ${totalArbeid.toFixed(1).replace('.', ',')}u` : ''}
                </div>
                <div className="wb2-card-hd-spacer" />
                <button className="wb2-card-action" type="button" onClick={() => setShowHoursAdd(v => !v)}>
                  {showHoursAdd ? 'Sluiten' : <>{I.plus} Boeken</>}
                </button>
              </div>
              {showHoursAdd && (
                <div style={{ padding: '14px 16px', borderBottom: uren.length ? '1px solid #EFF2EF' : 'none' }}>
                  <HoursQuickAdd werkbon={detail} customers={customers} onSaved={() => { refreshUren(); setShowHoursAdd(false); }} />
                </div>
              )}
              {uren.length === 0 && !showHoursAdd && (
                <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Nog geen uren geboekt op deze werkbon.</div>
              )}
              {uren.map(u => (
                <div key={u.id} className="wb2-uren-item" style={{ padding: '10px 16px' }}>
                  <div className={`wb2-uren-ic${u.type === 'reiskosten' ? ' travel' : ''}`}>
                    {u.type === 'reiskosten' ? I.map : I.clock}
                  </div>
                  <div className="wb2-uren-main">
                    <div className="wb2-uren-title">{u.type === 'reiskosten' ? 'Reiskosten' : 'Arbeid'} · {shortDate(u.datum)}</div>
                    <div className="wb2-uren-sub">{u.notitie || u.medewerkerNaam || '—'}</div>
                  </div>
                  <div className="wb2-uren-time">
                    {u.startTijd && u.eindTijd
                      ? `${fmtTime(u.startTijd)}–${fmtTime(u.eindTijd)}`
                      : `${u.uren.toFixed(2).replace('.', ',')}u`}
                  </div>
                </div>
              ))}
            </div>

            {/* Foto's */}
            <FotoSection fotos={fotos} onUpload={handleUploadFoto} onDelete={handleDeleteFoto} />

            {/* Materialen */}
            <MaterialenSection materialen={materialen} onAdd={handleAddMaterial} onDelete={handleDeleteMaterial} />

            {/* Meerwerk */}
            <MeerwerkSection meerwerk={meerwerk} onAdd={handleAddMeerwerk} onDelete={handleDeleteMeerwerk} />

            {/* Notities */}
            <NotitiesSection notities={detail.werkbonNotities} onSave={handleSaveNotities} teamMembers={teamMembers} />

            {/* Afronden */}
            {detail.status !== 'afgerond' && canManage && (
              <button className="wb2-complete-btn" onClick={handleComplete} type="button">
                {I.check} Klus afronden
              </button>
            )}
            {detail.status === 'afgerond' && (
              <button className="wb2-complete-btn done" disabled type="button">
                {I.check} Klus afgerond
                {detail.afgerondOp
                  ? ` · ${new Date(detail.afgerondOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </button>
            )}
          </div>
        )}

        {showNew && (
          <WerkbonModal mode="new" customers={customers} projects={projects} onClose={() => setShowNew(false)}
            onSaved={saved => { onWerkbonSaved(saved); loadList(); }} />
        )}
        {editWerkbon && (
          <WerkbonModal mode="edit" werkbon={editWerkbon} customers={customers} projects={projects}
            onClose={() => setEditWerkbon(null)}
            onSaved={saved => { onWerkbonSaved(saved); setDetail(saved); setEditWerkbon(null); }} />
        )}
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────

  return (
    <div className="wb2-page">
      <div className="wb2-head">
        <div>
          <h1>Werkbonnen</h1>
          {err && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{err}</div>}
        </div>
        <div className="wb2-head-spacer" />
        {canManage && (
          <button className="btn btn-p" onClick={() => setShowNew(true)} type="button">
            {I.plus} Nieuwe werkbon
          </button>
        )}
      </div>

      <div className="search" style={{ width: '100%', maxWidth: 400, marginBottom: 8 }}>
        <span style={{ color: 'var(--dl)', display: 'flex', flexShrink: 0 }}>{I.search}</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoek op titel, klant of locatie…"
        />
      </div>

      <div className="wb2-chips">
        {[
          ['all', 'Alle', counts.all, null],
          ['gepland', 'Gepland', counts.gepland, '#2563EB'],
          ['in_uitvoering', 'In uitvoering', counts.in_uitvoering, '#D97706'],
          ['afgerond', 'Afgerond', counts.afgerond, '#13a849'],
        ].map(([id, label, c, dot]) => (
          <button
            key={id}
            className={`wb2-chip${statusFilter === id ? ' active' : ''}`}
            onClick={() => setStatusFilter(id)}
            type="button"
          >
            {dot && <span className="wb2-chip-dot" style={{ background: dot }} />}
            {label}
            <span className="wb2-chip-count">{c}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="wb2-empty">
          <div className="wb2-empty-ic">{I.brief}</div>
          <div className="wb2-empty-title">Geen werkbonnen gevonden</div>
          <div className="wb2-empty-sub">Pas de filters aan of maak een nieuwe werkbon aan.</div>
          <div className="wb2-empty-actions">
            <button className="btn btn-s" onClick={() => { setSearch(''); setStatusFilter('all'); }} type="button">
              {I.x} Filters wissen
            </button>
            {canManage && (
              <button className="btn btn-p" onClick={() => setShowNew(true)} type="button">
                {I.plus} Nieuwe werkbon
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="wb2-cards">
          {filtered.map(w => (
            <WerkbonListCard
              key={w.id}
              w={w}
              takenCount={takenCounts[w.id]}
              onClick={() => openDetail(w.id)}
            />
          ))}
        </div>
      )}

      {showNew && (
        <WerkbonModal mode="new" customers={customers} projects={projects} onClose={() => setShowNew(false)}
          onSaved={saved => { onWerkbonSaved(saved); loadList(); }} />
      )}
    </div>
  );
}

export default WerkbonPageV2;
