import { useEffect, useMemo, useRef, useState } from 'react';
import { I, ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getWerkbonnen, getWerkbonById, createWerkbon, updateWerkbon, completeWerkbon,
  getWerkbonTaken, createWerkbonTaak, toggleWerkbonTaak, deleteWerkbonTaak,
  getWerkbonMaterialen, createWerkbonMateriaal, deleteWerkbonMateriaal,
} from '../services/werkbonService.js';
import { listCustomers } from '../services/customerService.js';
import { createUrenregel, getUrenregistratie, calculateHours } from '../services/urenService.js';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const TODAY = () => new Date().toISOString().slice(0, 10);

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

const fmtEur = n => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

// Postgres `time` columns come back as "HH:MM:SS" — strip seconds for UI.
const fmtTime = t => (t ? String(t).slice(0, 5) : '');

const DAY_LABEL = ['zo','ma','di','wo','do','vr','za'];
const MONTH_LABEL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

const shortDate = d => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (Number.isNaN(dt.valueOf())) return d;
  return `${DAY_LABEL[dt.getDay()]} ${dt.getDate()} ${MONTH_LABEL[dt.getMonth()]}`;
};

const relativeDate = d => {
  if (!d) return '—';
  const t = TODAY();
  if (d === t) return 'Vandaag';
  const today = new Date(t + 'T00:00:00');
  const dt = new Date(d + 'T00:00:00');
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gisteren';
  if (diff < 0) return 'Te laat';
  if (diff < 7) return shortDate(d);
  return 'Volgende week';
};

const urgencyFor = w => {
  const t = TODAY();
  if (w.status === 'afgerond') return 'thisWeek';
  if (!w.geplandOp) return 'later';
  if (w.geplandOp < t) return 'overdue';
  if (w.geplandOp === t) return 'today';
  const today = new Date(t + 'T00:00:00');
  const dt = new Date(w.geplandOp + 'T00:00:00');
  const diff = Math.round((dt - today) / 86400000);
  return diff <= 7 ? 'thisWeek' : 'later';
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

const URGENCY_LABEL = {
  overdue: 'Te laat',
  today: 'Vandaag',
  thisWeek: 'Deze week',
  later: 'Later',
};

const initials = name => {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(p => p[0].toUpperCase()).slice(0, 2).join('');
};

const colorFromString = str => {
  // Stable pastel color from a string (gives each monteur a consistent tint)
  if (!str) return '#9AA39E';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 64%)`;
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
const UrgencyBadge = ({ urgency, size }) => {
  const tone = urgency === 'overdue' ? 'red' : urgency === 'today' ? 'green' : 'gray';
  return <WB2Badge tone={tone} size={size}>{URGENCY_LABEL[urgency]}</WB2Badge>;
};

// ─── NEW / EDIT WERKBON MODAL ───────────────────────────────────────────────

function WerkbonModal({ mode, werkbon, customers, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(() => ({
    titel: werkbon?.titel || '',
    customer_id: werkbon?.customerId || '',
    omschrijving: werkbon?.omschrijving || '',
    gepland_op: werkbon?.geplandOp || '',
    // Strip seconds so <input type="time"> reliably pre-fills.
    starttijd: werkbon?.starttijd ? String(werkbon.starttijd).slice(0, 5) : '',
    eindtijd: werkbon?.eindtijd ? String(werkbon.eindtijd).slice(0, 5) : '',
    locatie: werkbon?.locatie || '',
    notes: werkbon?.notes || '',
    status: werkbon?.status || 'gepland',
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
        omschrijving: form.omschrijving || null,
        gepland_op: form.gepland_op || null,
        starttijd: form.starttijd || null,
        eindtijd: form.eindtijd || null,
        locatie: form.locatie || null,
        notes: form.notes || null,
      };
      let saved;
      if (isEdit) {
        saved = await updateWerkbon(werkbon.id, { ...payload, status: form.status });
        toast.success('Werkbon bijgewerkt');
      } else {
        saved = await createWerkbon(payload);
        toast.success('Werkbon aangemaakt');
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
            <textarea rows={3} value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} placeholder="Wat moet er gebeuren op locatie?" />
          </div>
          <div className="f full">
            <label>Interne notities</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Bv. klant heeft hond, deur dicht houden…" />
          </div>
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

// ─── LIST ROW ───────────────────────────────────────────────────────────────

function WerkbonRow({ w, selected, taken, materialenTotal, onClick }) {
  const u = urgencyFor(w);
  const total = taken?.length || 0;
  const done = (taken || []).filter(t => t.afgerond).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const monteurInitial = initials(w.assignedName);
  const monteurColor = colorFromString(w.assignedName);
  const shortId = `WB-${String(w.id || '').slice(0, 4).toUpperCase()}`;

  return (
    <button
      className={`wb2-row${selected ? ' selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className={`wb2-row-stripe ${u}`} />
      <div className="wb2-row-main">
        <div className="wb2-row-meta">
          <span className="wb2-row-id">{shortId}</span>
          <StatusBadge status={w.status} size="sm" />
          {u === 'overdue' && <UrgencyBadge urgency="overdue" size="sm" />}
          {u === 'today' && w.status !== 'in_uitvoering' && <UrgencyBadge urgency="today" size="sm" />}
        </div>
        <div className="wb2-row-title">{w.titel || '—'}</div>
        <div className="wb2-row-sub">
          {w.customerName && (
            <span>{I.cust}<span>{w.customerName}</span></span>
          )}
          {w.locatie && (
            <span>{I.map}<span>{w.locatie}</span></span>
          )}
        </div>
      </div>
      <div className="wb2-row-right">
        <div className="wb2-row-when">
          {I.cal}
          <span className={`wb2-date${u === 'overdue' ? ' overdue' : ''}`}>{relativeDate(w.geplandOp)}</span>
          {(w.starttijd || w.eindtijd) && (
            <span className="wb2-time">{fmtTime(w.starttijd)}{w.starttijd && w.eindtijd ? '–' : ''}{fmtTime(w.eindtijd)}</span>
          )}
        </div>
        <div className="wb2-row-progress">
          <div className="wb2-row-tasks" title={`${done}/${total} taken`}>
            {I.check}{done}/{total}
            <div className="wb2-bar"><span className={pct === 100 ? 'full' : ''} style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="wb2-row-material" title="Materiaal">
            {materialenTotal > 0 ? fmtEur(materialenTotal) : '—'}
          </div>
          {w.assignedName && (
            <div className="wb2-monteur" title={w.assignedName} style={{ background: monteurColor }}>
              {monteurInitial}
            </div>
          )}
        </div>
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

  // Reset when werkbon changes
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
            placeholder="—"
          />
        </div>
        <div className="wb2-hours-field">
          <div className="wb2-hours-field-lbl">Eind</div>
          <input
            type="time"
            className="wb2-hours-input"
            value={eind}
            onChange={e => setEind(e.target.value)}
            placeholder="—"
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
          <div style={{ color: 'var(--dl)', fontSize: 13, padding: '6px 0 10px' }}>
            Nog geen taken — voeg de eerste hieronder toe.
          </div>
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
            <div style={{ color: 'var(--dl)', fontSize: 13, padding: '14px 4px' }}>
              Nog geen materialen toegevoegd.
            </div>
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

// ─── HOURS LIST (registered for this werkbon) ───────────────────────────────

function UrenListSection({ uren }) {
  if (uren.length === 0) {
    return (
      <div className="wb2-card">
        <div className="wb2-card-hd"><div className="wb2-card-hd-title">Geregistreerde uren</div></div>
        <div className="wb2-card-body" style={{ color: 'var(--dl)', fontSize: 13 }}>
          Nog geen uren geboekt op deze werkbon.
        </div>
      </div>
    );
  }
  const totalArbeid = uren.filter(u => u.type === 'arbeid').reduce((s, u) => s + u.uren, 0);
  const totalReis = uren.filter(u => u.type === 'reiskosten').reduce((s, u) => s + u.uren, 0);

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd">
        <div className="wb2-card-hd-title">Geregistreerde uren</div>
        <div className="wb2-card-hd-spacer" />
        <span style={{ fontSize: 12, color: 'var(--dl)' }}>
          {totalArbeid.toFixed(2).replace('.', ',')}u arbeid
          {totalReis > 0 && <> · {totalReis.toFixed(2).replace('.', ',')}u reis</>}
        </span>
      </div>
      <div className="wb2-card-body">
        {uren.map(u => (
          <div key={u.id} className="wb2-uren-item">
            <div className={`wb2-uren-ic${u.type === 'reiskosten' ? ' travel' : ''}`}>
              {u.type === 'reiskosten' ? I.map : I.clock}
            </div>
            <div className="wb2-uren-main">
              <div className="wb2-uren-title">
                {u.type === 'reiskosten' ? 'Reiskosten' : 'Arbeid'} · {shortDate(u.datum)}
              </div>
              <div className="wb2-uren-sub">{u.notitie || u.medewerkerNaam || '—'}</div>
            </div>
            <div className="wb2-uren-time">
              {u.startTijd && u.eindTijd ? `${fmtTime(u.startTijd)}–${fmtTime(u.eindTijd)}` : `${u.uren.toFixed(2).replace('.', ',')}u`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export function WerkbonPageV2({ preOpenWerkbonId, onNavConsumed } = {}) {
  const toast = useToast();
  const { profile } = useProfile();
  const canManage = !profile || ['admin', 'planner'].includes(profile.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [counts, setCounts] = useState({ all: 0, gepland: 0, in_uitvoering: 0, afgerond: 0 });

  // Per-werkbon lightweight aggregates (taken count, materiaal total) so the
  // list rows can show progress + euro without fetching detail data for each.
  const [aggregates, setAggregates] = useState({}); // { [id]: { taken: [...], materialenTotal: n } }

  // Detail panel state — heavier data only loaded when a werkbon is selected
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [taken, setTaken] = useState([]);
  const [materialen, setMaterialen] = useState([]);
  const [uren, setUren] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Modals
  const [showNew, setShowNew] = useState(false);
  const [editWerkbon, setEditWerkbon] = useState(null);

  // Hidden file input for "Foto toevoegen" action — kept simple (no upload
  // pipeline yet); selecting a file just acknowledges the choice.
  const photoRef = useRef(null);

  // ── LOAD ────────────────────────────────────────────────────────────────

  const loadList = async () => {
    setLoading(true);
    setErr('');
    try {
      const [list, cs] = await Promise.all([
        getWerkbonnen(),
        listCustomers().catch(() => []),
      ]);
      setWerkbonnen(list);
      setCustomers(cs);
      setCounts({
        all: list.length,
        gepland: list.filter(w => w.status === 'gepland').length,
        in_uitvoering: list.filter(w => w.status === 'in_uitvoering').length,
        afgerond: list.filter(w => w.status === 'afgerond').length,
      });
      // Preselect first or first in-progress werkbon
      if (list.length && !selectedId) {
        const preferred = list.find(w => w.status === 'in_uitvoering') || list[0];
        setSelectedId(preferred.id);
      }
    } catch (e) {
      setErr(e.message || 'Werkbonnen laden mislukt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-open from navIntent
  useEffect(() => {
    if (!preOpenWerkbonId || loading) return;
    if (werkbonnen.some(w => w.id === preOpenWerkbonId)) {
      setSelectedId(preOpenWerkbonId);
      onNavConsumed?.();
    }
  }, [preOpenWerkbonId, loading, werkbonnen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let alive = true;
    setDetailLoading(true);
    Promise.all([
      getWerkbonById(selectedId).catch(() => null),
      getWerkbonTaken(selectedId).catch(() => []),
      getWerkbonMaterialen(selectedId).catch(() => []),
      getUrenregistratie({ werkbonId: selectedId }).catch(() => []),
    ]).then(([w, t, m, u]) => {
      if (!alive) return;
      setDetail(w);
      setTaken(t);
      setMaterialen(m);
      setUren(u);
      // Update aggregate cache for this id
      setAggregates(prev => ({
        ...prev,
        [selectedId]: {
          taken: t.map(x => ({ afgerond: x.afgerond })),
          materialenTotal: m.reduce((s, x) => s + (x.subtotaal || x.aantal * x.prijsPer || 0), 0),
        },
      }));
    }).finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedId]);

  // ── FILTER ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return werkbonnen.filter(w => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      const u = urgencyFor(w);
      if (dateFilter === 'today' && !(u === 'today' || u === 'overdue')) return false;
      if (dateFilter === 'overdue' && u !== 'overdue') return false;
      if (dateFilter === 'week' && u === 'later') return false;
      if (!q) return true;
      const hay = `${w.titel} ${w.customerName} ${w.locatie}`.toLowerCase();
      return hay.includes(q);
    });
  }, [werkbonnen, statusFilter, dateFilter, search]);

  // KPIs (use full list, not filtered)
  const kpi = useMemo(() => {
    const t = TODAY();
    const overdue = werkbonnen.filter(w => urgencyFor(w) === 'overdue' && w.status !== 'afgerond');
    const today = werkbonnen.filter(w => w.geplandOp === t && w.status !== 'afgerond');
    const inProgress = werkbonnen.filter(w => w.status === 'in_uitvoering');
    // "Afgerond deze week" — within last 7 days based on gepland_op
    const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().slice(0, 10);
    const doneThisWeek = werkbonnen.filter(w => w.status === 'afgerond' && w.geplandOp && w.geplandOp >= lastWeekStr);
    return { today: today.length, overdue: overdue.length, inProgress: inProgress.length, doneThisWeek: doneThisWeek.length };
  }, [werkbonnen]);

  // ── DETAIL ACTIONS ──────────────────────────────────────────────────────

  const refreshAggregateForId = async id => {
    try {
      const [t, m] = await Promise.all([
        getWerkbonTaken(id).catch(() => []),
        getWerkbonMaterialen(id).catch(() => []),
      ]);
      setAggregates(prev => ({
        ...prev,
        [id]: {
          taken: t.map(x => ({ afgerond: x.afgerond })),
          materialenTotal: m.reduce((s, x) => s + (x.subtotaal || x.aantal * x.prijsPer || 0), 0),
        },
      }));
    } catch { /* ignore */ }
  };

  const handleToggleTaak = async t => {
    try {
      const updated = await toggleWerkbonTaak(t.id, !t.afgerond);
      setTaken(prev => prev.map(x => x.id === t.id ? updated : x));
      refreshAggregateForId(selectedId);
    } catch (e) {
      toast.error(e.message || 'Bijwerken mislukt');
    }
  };
  const handleAddTaak = async omschrijving => {
    try {
      const created = await createWerkbonTaak({
        werkbon_id: selectedId,
        omschrijving,
        volgorde: taken.length,
      });
      setTaken(prev => [...prev, created]);
      refreshAggregateForId(selectedId);
    } catch (e) {
      toast.error(e.message || 'Taak toevoegen mislukt');
    }
  };
  const handleDeleteTaak = async t => {
    if (!confirm(`Taak "${t.omschrijving}" verwijderen?`)) return;
    try {
      await deleteWerkbonTaak(t.id);
      setTaken(prev => prev.filter(x => x.id !== t.id));
      refreshAggregateForId(selectedId);
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleAddMaterial = async input => {
    try {
      const created = await createWerkbonMateriaal({ werkbon_id: selectedId, ...input });
      setMaterialen(prev => [...prev, created]);
      refreshAggregateForId(selectedId);
    } catch (e) {
      toast.error(e.message || 'Materiaal toevoegen mislukt');
    }
  };
  const handleDeleteMaterial = async m => {
    if (!confirm(`Materiaal "${m.naam}" verwijderen?`)) return;
    try {
      await deleteWerkbonMateriaal(m.id);
      setMaterialen(prev => prev.filter(x => x.id !== m.id));
      refreshAggregateForId(selectedId);
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleComplete = async () => {
    if (!detail) return;
    if (!confirm(`Werkbon "${detail.titel}" afronden?`)) return;
    try {
      const updated = await completeWerkbon(detail.id);
      setDetail(updated);
      setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
      toast.success('Werkbon afgerond');
    } catch (e) {
      toast.error(e.message || 'Afronden mislukt');
    }
  };

  const handlePhonePick = () => {
    if (!detail) return;
    // Use known phone from customers list if available
    const cust = customers.find(c => c.id === detail.customerId);
    const phone = cust?.phone || '';
    if (!phone) { toast.info('Geen telefoonnummer bekend voor deze klant'); return; }
    window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
  };
  const handleRoute = () => {
    if (!detail?.locatie) { toast.info('Geen locatie bekend voor deze werkbon'); return; }
    const q = encodeURIComponent(detail.locatie);
    window.open(`https://maps.google.com/?q=${q}`, '_blank', 'noopener');
  };
  const handlePhotoPick = () => {
    photoRef.current?.click();
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
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next;
      }
      return [saved, ...prev];
    });
    setSelectedId(saved.id);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Werkbonnen laden…</div>;
  }

  return (
    <div className={`wb2-page${selectedId ? ' has-selection' : ''}`}>
      {/* Header */}
      <div className="wb2-head">
        <div>
          <h1>Werkbonnen</h1>
          <div className="wb2-head-sub">Plan, volg en rond werkzaamheden af</div>
          {err && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{err}</div>}
        </div>
        <div className="wb2-head-spacer" />
        <span className="wb2-sync">{I.clock} Live data</span>
        {canManage && (
          <button className="btn btn-p" onClick={() => setShowNew(true)}>
            {I.plus} Nieuwe werkbon
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="wb2-stats">
        <div className={`wb2-sc${kpi.today > 0 ? ' accent-green' : ''}`}>
          <div className="wb2-sc-top">{I.flag} Vandaag gepland</div>
          <div className="wb2-sc-val">{kpi.today}</div>
          <div className="wb2-sc-sub">{kpi.inProgress > 0 ? `${kpi.inProgress} in uitvoering` : 'Geen openstaande werkbonnen'}</div>
        </div>
        <div className={`wb2-sc${kpi.overdue > 0 ? ' accent-red' : ''}`}>
          <div className="wb2-sc-top">{I.bell} Te laat</div>
          <div className="wb2-sc-val">{kpi.overdue}</div>
          <div className="wb2-sc-sub">{kpi.overdue > 0 ? 'Direct oppakken' : 'Geen achterstand'}</div>
        </div>
        <div className={`wb2-sc${kpi.inProgress > 0 ? ' accent-amber' : ''}`}>
          <div className="wb2-sc-top">{I.trend} In uitvoering nu</div>
          <div className="wb2-sc-val">{kpi.inProgress}</div>
          <div className="wb2-sc-sub">{kpi.inProgress > 0 ? 'Monteurs aan het werk' : 'Geen actieve klussen'}</div>
        </div>
        <div className="wb2-sc">
          <div className="wb2-sc-top">{I.check} Afgerond deze week</div>
          <div className="wb2-sc-val">{kpi.doneThisWeek}</div>
          <div className="wb2-sc-sub">Laatste 7 dagen</div>
        </div>
        <div className="wb2-sc">
          <div className="wb2-sc-top">{I.hours} Totaal werkbonnen</div>
          <div className="wb2-sc-val">{counts.all}</div>
          <div className="wb2-sc-sub">{counts.gepland} gepland · {counts.afgerond} afgerond</div>
        </div>
      </div>

      {/* Filters */}
      <div className="wb2-filter">
        <div className="wb2-filter-row">
          <div className="wb2-search">
            <span>{I.search}</span>
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
              >
                {dot && <span className="wb2-chip-dot" style={{ background: dot }} />}
                {label}
                <span className="wb2-chip-count">{c}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="wb2-filter-row">
          <span className="wb2-period-label">Periode</span>
          {[
            ['today', 'Vandaag'],
            ['week', 'Deze week'],
            ['overdue', 'Te laat'],
            ['all', 'Alles'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`wb2-chip${dateFilter === id ? ' active' : ''}`}
              onClick={() => setDateFilter(id)}
            >{label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--dl)' }}>{filtered.length} resultaten</span>
        </div>
      </div>

      {/* List + Detail */}
      <div className="wb2-grid">
        {/* LIST */}
        <div className="wb2-list">
          <div className="wb2-list-meta">
            {filtered.length} werkbonnen
            <div style={{ flex: 1 }} />
            <span style={{ fontWeight: 500, color: 'var(--dl)' }}>
              {Array.from(new Set(werkbonnen.filter(w => w.assignedTo).map(w => w.assignedTo))).length} monteurs actief
            </span>
          </div>
          {filtered.length === 0 && (
            <div className="wb2-empty">
              <div className="wb2-empty-ic">{I.brief}</div>
              <div className="wb2-empty-title">Geen werkbonnen gevonden</div>
              <div className="wb2-empty-sub">
                Pas de filters aan of maak een nieuwe werkbon aan.
              </div>
              <div className="wb2-empty-actions">
                <button className="btn btn-s" onClick={() => { setSearch(''); setStatusFilter('all'); setDateFilter('all'); }}>
                  {I.x} Filters wissen
                </button>
                {canManage && (
                  <button className="btn btn-p" onClick={() => setShowNew(true)}>{I.plus} Nieuwe werkbon</button>
                )}
              </div>
            </div>
          )}
          {filtered.map(w => {
            const agg = aggregates[w.id];
            return (
              <WerkbonRow
                key={w.id}
                w={w}
                selected={w.id === selectedId}
                taken={agg?.taken}
                materialenTotal={agg?.materialenTotal || 0}
                onClick={() => setSelectedId(w.id)}
              />
            );
          })}
        </div>

        {/* DETAIL */}
        <div className="wb2-detail">
          {!detail && !detailLoading && (
            <div className="wb2-empty" style={{ padding: '40px 24px' }}>
              <div className="wb2-empty-ic">{I.brief}</div>
              <div className="wb2-empty-title">Geen werkbon geselecteerd</div>
              <div className="wb2-empty-sub">Kies links een werkbon om de details te bekijken.</div>
            </div>
          )}
          {detailLoading && !detail && (
            <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Detail laden…</div>
          )}
          {detail && (
            <>
              {/* Hero */}
              <div className="wb2-hero">
                <div className="wb2-hero-meta">
                  <span className="wb2-row-id">WB-{String(detail.id).slice(0, 4).toUpperCase()}</span>
                  <StatusBadge status={detail.status} />
                  {urgencyFor(detail) === 'overdue' && <UrgencyBadge urgency="overdue" />}
                  <div className="wb2-hero-meta-spacer" />
                  {canManage && (
                    <button className="btn btn-s btn-sm" onClick={() => setEditWerkbon(detail)}>{I.edit} Bewerken</button>
                  )}
                </div>
                <h2 className="wb2-hero-title">{detail.titel || '—'}</h2>
                <div className="wb2-hero-sub">
                  {detail.customerName || 'Geen klant'}{detail.locatie ? ` · ${detail.locatie}` : ''}
                </div>

                <div className="wb2-actions">
                  <button className="wb2-action" onClick={handlePhonePick} disabled={!detail.customerId}>
                    <div className="wb2-action-ic">{I.call}</div>
                    <div className="wb2-action-label">Bel klant</div>
                    <div className="wb2-action-sub">
                      {customers.find(c => c.id === detail.customerId)?.phone || 'Geen nummer'}
                    </div>
                  </button>
                  <button className="wb2-action" onClick={handleRoute} disabled={!detail.locatie}>
                    <div className="wb2-action-ic">{I.map}</div>
                    <div className="wb2-action-label">Route openen</div>
                    <div className="wb2-action-sub">{detail.locatie ? 'Maps in nieuw tabblad' : 'Geen locatie'}</div>
                  </button>
                  <button className="wb2-action" onClick={handlePhotoPick}>
                    <div className="wb2-action-ic">{I.camera}</div>
                    <div className="wb2-action-label">Foto toevoegen</div>
                    <div className="wb2-action-sub">Camera of upload</div>
                  </button>
                  <button
                    className="wb2-action accent"
                    onClick={() => {
                      const el = document.querySelector('.wb2-hours');
                      if (!el) return;
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      // Focus the first empty time input so the user can type immediately
                      setTimeout(() => {
                        const inputs = el.querySelectorAll('.wb2-hours-input');
                        const empty = Array.from(inputs).find(i => !i.value) || inputs[0];
                        empty?.focus();
                      }, 350);
                    }}
                  >
                    <div className="wb2-action-ic">{I.clock}</div>
                    <div className="wb2-action-label">Uren boeken</div>
                    <div className="wb2-action-sub">{uren.length} regel{uren.length === 1 ? '' : 's'} vandaag</div>
                  </button>
                  <button className="wb2-action" onClick={handleComplete} disabled={detail.status === 'afgerond' || !canManage}>
                    <div className="wb2-action-ic">{I.check}</div>
                    <div className="wb2-action-label">{detail.status === 'afgerond' ? 'Afgerond' : 'Afronden'}</div>
                    <div className="wb2-action-sub">
                      {taken.length ? `${taken.filter(t => t.afgerond).length}/${taken.length} taken` : 'Geen taken'}
                    </div>
                  </button>
                </div>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={() => toast.info('Foto-upload nog niet gekoppeld.')} />
              </div>

              {/* Two-column: details + hours */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="wb2-card">
                  <div className="wb2-card-hd"><div className="wb2-card-hd-title">Werkbon-details</div></div>
                  <div className="wb2-card-body" style={{ paddingTop: 4 }}>
                    <div className="wb2-info">
                      <span className="wb2-info-ic">{I.cal}</span>
                      <span className="wb2-info-lbl">Datum</span>
                      <span className="wb2-info-val">
                        {detail.geplandOp
                          ? `${shortDate(detail.geplandOp)}${detail.starttijd || detail.eindtijd ? ` · ${fmtTime(detail.starttijd) || '—'}${detail.eindtijd ? ` – ${fmtTime(detail.eindtijd)}` : ''}` : ''}`
                          : '—'}
                      </span>
                    </div>
                    <div className="wb2-info">
                      <span className="wb2-info-ic">{I.map}</span>
                      <span className="wb2-info-lbl">Locatie</span>
                      <span className="wb2-info-val">{detail.locatie || '—'}</span>
                    </div>
                    <div className="wb2-info">
                      <span className="wb2-info-ic">{I.cust}</span>
                      <span className="wb2-info-lbl">Monteur</span>
                      <span className="wb2-info-val">
                        {detail.assignedName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span className="wb2-monteur" style={{ background: colorFromString(detail.assignedName) }}>
                              {initials(detail.assignedName)}
                            </span>
                            {detail.assignedName}
                          </span>
                        ) : <span style={{ color: 'var(--dl)' }}>Niet toegewezen</span>}
                      </span>
                    </div>
                    <div className="wb2-info">
                      <span className="wb2-info-ic">{I.flag}</span>
                      <span className="wb2-info-lbl">Status</span>
                      <span className="wb2-info-val" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <StatusBadge status={detail.status} />
                        {urgencyFor(detail) === 'overdue' && <UrgencyBadge urgency="overdue" />}
                      </span>
                    </div>
                    {detail.omschrijving && (
                      <div className="wb2-omschrijving">
                        <div className="wb2-omschrijving-lbl">Omschrijving</div>
                        <div className="wb2-omschrijving-txt">{detail.omschrijving}</div>
                      </div>
                    )}
                    {detail.notes && (
                      <div className="wb2-note">
                        <span className="wb2-note-ic">{I.bell}</span>
                        <div className="wb2-note-txt"><b>Interne notitie:</b> {detail.notes}</div>
                      </div>
                    )}
                  </div>
                </div>

                <HoursQuickAdd werkbon={detail} customers={customers} onSaved={refreshUren} />
              </div>

              <TakenSection
                taken={taken}
                onToggle={handleToggleTaak}
                onAdd={handleAddTaak}
                onDelete={handleDeleteTaak}
              />
              <MaterialenSection
                materialen={materialen}
                onAdd={handleAddMaterial}
                onDelete={handleDeleteMaterial}
              />
              <UrenListSection uren={uren} />
            </>
          )}
        </div>
      </div>

      {/* Mobile sticky action bar — visible only on narrow viewports when a werkbon is selected */}
      {detail && (
        <>
          <div className="wb2-sticky-bar">
            <button className="wb2-sticky-tile" onClick={handlePhonePick} disabled={!detail.customerId}>
              <div className="wb2-sticky-tile-ic">{I.call}</div>
              Bel
            </button>
            <button className="wb2-sticky-tile" onClick={handleRoute} disabled={!detail.locatie}>
              <div className="wb2-sticky-tile-ic">{I.map}</div>
              Route
            </button>
            <button className="wb2-sticky-tile" onClick={handlePhotoPick}>
              <div className="wb2-sticky-tile-ic">{I.camera}</div>
              Foto
            </button>
            <button className="wb2-sticky-tile accent" onClick={() => {
              const el = document.querySelector('.wb2-hours');
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}>
              <div className="wb2-sticky-tile-ic">{I.clock}</div>
              Uren
            </button>
          </div>
          <div className="content-bottom-pad" />
        </>
      )}

      {showNew && (
        <WerkbonModal
          mode="new"
          customers={customers}
          onClose={() => setShowNew(false)}
          onSaved={saved => { onWerkbonSaved(saved); loadList(); }}
        />
      )}
      {editWerkbon && (
        <WerkbonModal
          mode="edit"
          werkbon={editWerkbon}
          customers={customers}
          onClose={() => setEditWerkbon(null)}
          onSaved={saved => { onWerkbonSaved(saved); setDetail(saved); }}
        />
      )}
    </div>
  );
}

export default WerkbonPageV2;
