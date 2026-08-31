import { useEffect, useMemo, useRef, useState } from 'react';
import { listMaterialen } from '../services/materiaalService.js';
import { listLeveranciers } from '../services/leverancierService.js';
import LeverancierSelect from '../components/LeverancierSelect.jsx';
import { I, ModalX, NotifyMailToggle } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { useUploads } from '../lib/uploadContext.jsx';
import { usePlanGuard } from '../components/PlanUpgradeModal.jsx';
import { NoteEditor, renderNote } from '../components/NoteEditor.jsx';
import NotitieLog, { toLogItem, fmtNotitieDatum } from '../components/NotitieLog.jsx';
import { AssigneeResponsibleSelect } from '../components/AssigneeResponsibleSelect.jsx';
import { getTeamMembers, notifyNewAssignees } from '../services/notificatieService.js';
import {
  getWerkbonnen, getWerkbonById, createWerkbon, updateWerkbon,
  getWerkbonTaken, createWerkbonTaak, toggleWerkbonTaak, deleteWerkbonTaak,
  getWerkbonMaterialen, createWerkbonMateriaal, updateWerkbonMateriaal, deleteWerkbonMateriaal,
  getWerkbonFotos, uploadWerkbonFoto, deleteWerkbonFoto,
  getWerkbonMeerwerk, createWerkbonMeerwerk, deleteWerkbonMeerwerk,
  getWerkbonNotities, addWerkbonNotitie, getAllWerkbonTakenCounts, plannedStartIso,
} from '../services/werkbonService.js';
import { listCustomers } from '../services/customerService.js';
import { getProjects } from '../services/projectsService.js';
import { createUrenregel, getUrenregistratie, berekenUren } from '../services/urenService.js';
import { listUursoorten } from '../services/uursoortService.js';
import {
  PauzeKnoppen, UursoortKeuze, standaardUursoortId, rondAfOpVijf, UrenTotaal, ExtraVelden,
} from '../components/UrenVelden.jsx';
import { createJobCost, updateJobCost } from '../services/jobCostService.js';
import { supabase } from '../lib/supabase';
import { statusInfo } from '../utils/statusColors.js';
import { calcBtw, BTW_PCT_OPTIONS } from '../utils/btw.js';

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

// ─── BADGES ─────────────────────────────────────────────────────────────────

function WB2Badge({ tone = 'gray', size, children, dot = true }) {
  return (
    <span className={`wb2-badge ${tone} ${size === 'sm' ? 'sm' : ''}`}>
      {dot && <span className="wb2-badge-dot" />}
      {children}
    </span>
  );
}
// Status-badge via de centrale helper: behoudt de wb2 pill+dot-stijl maar met
// exact dezelfde kleuren als overal elders (Gepland = blauw, In uitvoering =
// oranje, Afgerond = groen).
const StatusBadge = ({ status, size }) => {
  const s = statusInfo(status, 'werkbon');
  return (
    <span className={`wb2-badge ${size === 'sm' ? 'sm' : ''}`} style={{ background: s.bg, color: s.color }}>
      <span className="wb2-badge-dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
};

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
    assignedToIds: werkbon?.assignedToIds || (werkbon?.assignedTo ? [werkbon.assignedTo] : []),
    verantwoordelijkeIds: werkbon?.verantwoordelijkeIds || (werkbon?.assignedTo ? [werkbon.assignedTo] : []),
  }));
  const [saving, setSaving] = useState(false);
  const [notifyMail, setNotifyMail] = useState(true);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.titel.trim()) { toast.error('Titel is verplicht'); return; }
    // Minimaal één verantwoordelijke zodra er medewerkers gekoppeld zijn.
    if (form.assignedToIds.length && !form.verantwoordelijkeIds.length) {
      toast.error('Wijs minimaal één verantwoordelijke aan.');
      return;
    }
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
        assigned_to_ids: form.assignedToIds,
        verantwoordelijke_ids: form.verantwoordelijkeIds,
      };
      let saved;
      if (isEdit) {
        saved = await updateWerkbon(werkbon.id, { ...payload, status: form.status });
        toast.success('Werkbon bijgewerkt');
        // Diff t.o.v. de volledige vorige toewijzing (assigned_to_ids), zodat al
        // gekoppelde collega's niet opnieuw gemaild worden.
        const prevIds = werkbon?.assignedToIds || (werkbon?.assignedTo ? [werkbon.assignedTo] : []);
        notifyNewAssignees({ userIds: form.assignedToIds, prevUserIds: prevIds, members: teamMembers, sendMail: notifyMail, type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${form.titel.trim()}`, link: 'werkbonnen', relatedType: 'werkbon', relatedId: saved?.id, creatorId: profile?.id, creatorName: profile?.fullName }).catch(() => {});
      } else {
        saved = await createWerkbon(payload);
        toast.success('Werkbon aangemaakt');
        notifyNewAssignees({ userIds: form.assignedToIds, members: teamMembers, sendMail: notifyMail, type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${form.titel.trim()}`, link: 'werkbonnen', relatedType: 'werkbon', relatedId: saved?.id, creatorId: profile?.id, creatorName: profile?.fullName }).catch(() => {});
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
            <NoteEditor mentions={true} value={form.omschrijving} onChange={v => set('omschrijving', v)} placeholder="Wat moet er gebeuren op locatie? Typ @ om iemand te taggen" rows={3} disabled={saving} teamMembers={teamMembers} />
          </div>
          <div className="f full">
            <label>Interne notities</label>
            <NoteEditor mentions={true} value={form.notes} onChange={v => set('notes', v)} placeholder="Bv. klant heeft hond, deur dicht houden… Typ @ om iemand te taggen" rows={2} disabled={saving} teamMembers={teamMembers} />
          </div>
          {teamMembers.length > 0 && (
            <AssigneeResponsibleSelect
              members={teamMembers}
              assignedIds={form.assignedToIds}
              verantwoordelijkeIds={form.verantwoordelijkeIds}
              disabled={saving}
              fieldClassName="f full"
              onChange={({ assignedIds, verantwoordelijkeIds }) => setForm(f => ({ ...f, assignedToIds: assignedIds, verantwoordelijkeIds }))}
            >
              <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
            </AssigneeResponsibleSelect>
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
  const canBookForOthers = ['admin', 'planner'].includes(profile?.role);
  const [datum, setDatum] = useState(TODAY());
  const [start, setStart] = useState('');
  const [eind, setEind] = useState('');
  const [pauze, setPauze] = useState(0);
  const [km, setKm] = useState('');
  const [opmerking, setOpmerking] = useState('');
  const [uursoorten, setUursoorten] = useState([]);
  const [uursoortId, setUursoortId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Admin-vangnet: uren namens een collega boeken. Alleen zichtbaar voor admin;
  // de RLS op urenregistratie dwingt af dat enkel admin/planner dit mag.
  const [teamMembers, setTeamMembers] = useState([]);
  const [bookForId, setBookForId] = useState(profile?.id || '');

  useEffect(() => {
    if (!canBookForOthers) return;
    getTeamMembers().then(ms => setTeamMembers(ms.filter(m => m.profileId))).catch(() => {});
  }, [canBookForOthers]);

  // Bij één soort blijft de keuzelijst verborgen en gaat die ene soort
  // stilzwijgend mee. Faalt het ophalen (tabel bestaat nog niet), dan werkt het
  // formulier gewoon zonder soort.
  useEffect(() => {
    listUursoorten()
      .then(l => { setUursoorten(l); setUursoortId(standaardUursoortId(l)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setStart('');
    setEind('');
    setPauze(0);
    setKm('');
    setOpmerking('');
    setDatum(TODAY());
    setBookForId(profile?.id || '');
  }, [werkbon?.id, profile?.id]);

  const computed = berekenUren(start, eind, pauze);

  const submit = async () => {
    if (!profile?.id) { toast.error('Profiel niet geladen'); return; }
    if (!start || !eind) { toast.error('Start- en eindtijd zijn verplicht'); return; }
    if (!computed) {
      toast.error(pauze > 0
        ? 'Er blijft geen tijd over na aftrek van de pauze'
        : 'Eindtijd moet na starttijd liggen');
      return;
    }
    setSaving(true);
    try {
      await createUrenregel({
        profile_id: canBookForOthers ? (bookForId || profile.id) : profile.id,
        werkbon_id: werkbon.id,
        customer_id: werkbon.customerId || null,
        datum,
        start_tijd: start,
        eind_tijd: eind,
        pauze_minuten: pauze,
        uursoort_id: uursoortId,
        reis_km: km,
        notitie: opmerking || null,
      });
      toast.success('Uren opgeslagen');
      setStart(''); setEind(''); setPauze(0); setKm(''); setOpmerking('');
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

      {canBookForOthers && (
        <div className="wb2-hours-field" style={{ marginBottom: 10 }}>
          <div className="wb2-hours-field-lbl">Medewerker</div>
          <select
            className="wb2-hours-input"
            value={bookForId}
            onChange={e => setBookForId(e.target.value)}
          >
            {profile?.id && !teamMembers.some(m => m.profileId === profile.id) && (
              <option value={profile.id}>{profile.fullName || 'Ikzelf'}</option>
            )}
            {teamMembers.map(m => (
              <option key={m.profileId} value={m.profileId}>
                {m.fullName || m.email || 'Medewerker'}{m.profileId === profile?.id ? ' (ikzelf)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="wb2-hours-grid">
        <div className="wb2-hours-field">
          <div className="wb2-hours-field-lbl">Start</div>
          <input
            type="time"
            step="300"
            className="wb2-hours-input"
            value={start}
            onChange={e => setStart(e.target.value)}
            onBlur={e => setStart(rondAfOpVijf(e.target.value))}
          />
        </div>
        <div className="wb2-hours-field">
          <div className="wb2-hours-field-lbl">Eind</div>
          <input
            type="time"
            step="300"
            className="wb2-hours-input"
            value={eind}
            onChange={e => setEind(e.target.value)}
            onBlur={e => setEind(rondAfOpVijf(e.target.value))}
          />
        </div>
      </div>

      {/* Datum: stond hard op vandaag, wat misgaat zodra iemand 's avonds of de
          dag erna boekt. */}
      <div className="wb2-hours-field" style={{ marginBottom: 10 }}>
        <div className="wb2-hours-field-lbl">Datum</div>
        <input
          type="date"
          className="wb2-hours-input"
          value={datum}
          onChange={e => setDatum(e.target.value)}
        />
      </div>

      <div className="wb2-hours-field" style={{ marginBottom: 10 }}>
        <div className="wb2-hours-field-lbl">Pauze (minuten)</div>
        <PauzeKnoppen waarde={pauze} onChange={setPauze} disabled={saving} />
      </div>

      {uursoorten.length > 1 && (
        <div className="wb2-hours-field" style={{ marginBottom: 10 }}>
          <div className="wb2-hours-field-lbl">Soort uren</div>
          <UursoortKeuze
            soorten={uursoorten}
            waarde={uursoortId}
            onChange={setUursoortId}
            disabled={saving}
            className="wb2-hours-input"
          />
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <ExtraVelden
          km={km}
          onKm={setKm}
          opmerking={opmerking}
          onOpmerking={setOpmerking}
          disabled={saving}
          inputClassName="wb2-hours-input"
        />
      </div>

      {(start && eind) && (
        <div className="wb2-hours-live" style={{ marginBottom: 10 }}>
          <span className="wb2-hours-live-dot" />
          <UrenTotaal start={start} eind={eind} pauze={pauze} />
        </div>
      )}

      <div className="wb2-hours-actions">
        <button type="button" className="wb2-hours-primary" onClick={submit} disabled={saving}>
          {I.check} {saving ? 'Opslaan…' : 'Uren opslaan'}
        </button>
        <button
          type="button"
          className="wb2-hours-secondary"
          onClick={() => { setStart(''); setEind(''); setPauze(0); setKm(''); setOpmerking(''); }}
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

function TakenSection({ taken, onToggle, onAdd, onDelete, canEdit = true }) {
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
              onClick={() => canEdit && onToggle(t)}
              disabled={!canEdit}
              aria-label={t.afgerond ? 'Markeer als open' : 'Markeer als afgerond'}
            >
              {t.afgerond && I.check}
            </button>
            <div className={`wb2-taak-label${t.afgerond ? ' done' : ''}`}>{t.omschrijving}</div>
            {canEdit && <button className="wb2-taak-del" onClick={() => onDelete(t)} aria-label="Verwijderen">{I.trash}</button>}
          </div>
        ))}
        {canEdit && (
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
        )}
      </div>
    </div>
  );
}

// ─── MATERIALS ──────────────────────────────────────────────────────────────

function MaterialenSection({ materialen, onAdd, onUpdate, onDelete, canEdit = true }) {
  const { can } = usePermissions();
  const magInkoop = can('inkoopprijzen');
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const [biblio, setBiblio] = useState([]);
  const [leveranciers, setLeveranciers] = useState([]);
  useEffect(() => {
    listMaterialen({ inclusiefInactief: false }).then(setBiblio).catch(() => {});
    listLeveranciers({ inclusiefInactief: false }).then(setLeveranciers).catch(() => {});
  }, []);

  const VRIJ = '__vrij__';
  const LEEG = {
    keuze: '', naam: '', eenheid: 'stuk', aantal: 1, prijs_per: '', btw_pct: 21,
    materiaal_id: null, inkoopprijs_per: '', leverancier_id: '',
  };
  const [form, setForm] = useState(LEEG);
  const [adding, setAdding] = useState(false);

  const totalEx = materialen.reduce((s, m) => s + (m.subtotaal || m.aantal * m.prijsPer || 0), 0);
  const totalIncl = materialen.reduce((s, m) => {
    const sub = m.subtotaal || m.aantal * m.prijsPer || 0;
    return s + calcBtw(sub, m.btwPercentage ?? 21, 'excl').incl;
  }, 0);
  const addSub = (Number(form.aantal) || 0) * (Number(form.prijs_per) || 0);

  // Uit de bibliotheek kiezen vult alles in één keer. Leverancier en inkoop
  // horen bij het materiaal zelf, dus die liggen daarna vast op de regel.
  const kiesMateriaal = keuze => {
    if (keuze === VRIJ) { setForm({ ...LEEG, keuze: VRIJ }); return; }
    if (!keuze) { setForm(LEEG); return; }
    const m = biblio.find(x => x.id === keuze);
    if (!m) return;
    setForm(f => ({
      ...f,
      keuze,
      naam: m.naam,
      eenheid: m.eenheid || 'stuk',
      prijs_per: m.verkoopprijs ?? '',
      btw_pct: m.btwPct ?? 21,
      materiaal_id: m.id,
      inkoopprijs_per: m.inkoopprijs ?? '',
      leverancier_id: m.leverancierId || '',
    }));
  };

  const submit = async () => {
    const naam = form.naam.trim();
    if (!naam) return;
    setAdding(true);
    try {
      await onAdd({
        naam,
        eenheid: form.eenheid || null,
        aantal: Number(form.aantal) || 1,
        prijs_per: Number(form.prijs_per) || 0,
        btw_pct: Number(form.btw_pct) || 0,
        // Prijzen worden gekopieerd, niet gerefereerd: verandert de bibliotheek
        // later, dan blijft de nacalculatie van deze klus kloppen.
        materiaal_id: form.materiaal_id,
        inkoopprijs_per: form.inkoopprijs_per === '' ? null : Number(form.inkoopprijs_per),
        leverancier_id: form.leverancier_id || null,
      });
      setForm(LEEG);
    } finally {
      setAdding(false);
    }
  };

  const veld = (r, k, v) => onUpdate?.(r, { [k]: v });
  const uitBiblio = r => Boolean(r.materiaalId ?? r.materiaal_id);
  const levNaam = id => leveranciers.find(l => l.id === id)?.naam || '—';

  // Zelfde kolomopzet als de regelitems op offertes/facturen.
  const COLS = magInkoop
    ? 'minmax(0,2.2fr) 62px 74px 84px 84px minmax(0,1.3fr) 96px 30px'
    : 'minmax(0,2.4fr) 62px 74px 84px minmax(0,1.4fr) 96px 30px';

  const vastTitel = 'Ligt vast op het materiaal in de bibliotheek';

  // Inkoop wordt per stuk opgeslagen én per stuk getoond — geen totaalregel
  // eronder. Het aantal staat al in zijn eigen kolom.

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd">
        <div className="wb2-card-hd-title">Materialen</div>
      </div>
      <div className="wb2-card-body">
        <div className="wb2-mat-body">
          {materialen.length === 0 && (
            <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
              Nog geen materialen toegevoegd.
            </div>
          )}

          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {materialen.map(m => {
                const sub = m.subtotaal || m.aantal * m.prijsPer;
                const vast = uitBiblio(m);
                return (
                  <div key={m.id} className="wb2-mat-rij" style={{ border: '1px solid var(--bstrong)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="text" value={m.naam || ''} disabled={!canEdit} style={{ flex: 1 }}
                        onChange={e => veld(m, 'naam', e.target.value)} />
                      {canEdit && <button className="btn btn-xs btn-danger btn-icon" onClick={() => onDelete(m)}>{I.trash}</button>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <input type="number" min="0" step="0.01" value={m.aantal ?? 1} disabled={!canEdit}
                        onChange={e => veld(m, 'aantal', e.target.value)} />
                      <input type="text" value={m.eenheid || ''} placeholder="stuk" disabled={!canEdit}
                        onChange={e => veld(m, 'eenheid', e.target.value)} />
                      <input type="number" min="0" step="0.01" value={m.prijsPer ?? 0} disabled={!canEdit}
                        onChange={e => veld(m, 'prijs_per', e.target.value)} />
                    </div>
                    {magInkoop && (
                      vast
                        ? <input type="text" readOnly disabled title={vastTitel}
                            value={m.inkoopprijsPer != null ? `Inkoop ${fmtEur(m.inkoopprijsPer)} p/st` : 'Inkoop —'} />
                        : <input type="number" min="0" step="0.01" value={m.inkoopprijsPer ?? ''} disabled={!canEdit}
                            placeholder="Inkoopprijs per stuk (intern)" onChange={e => veld(m, 'inkoopprijs_per', e.target.value)} />
                    )}
                    {vast
                      ? <input type="text" value={levNaam(m.leverancierId)} readOnly disabled title={vastTitel} />
                      : <LeverancierSelect value={m.leverancierId || ''} disabled={!canEdit} leveranciers={leveranciers}
                          onLijstGewijzigd={g => setLeveranciers(l => [...l, g].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))}
                          onChange={v => veld(m, 'leverancier_id', v)} />}
                    <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtEur(sub)}</div>
                  </div>
                );
              })}
            </div>
          ) : materialen.length > 0 && (
            <div>
              <div className="wb2-mat-kop" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5 }}>
                <span>Materiaal</span><span>Aantal</span><span>Eenheid</span><span>Verkoop</span>
                {magInkoop && <span>Inkoop</span>}
                <span>Leverancier</span><span style={{ textAlign: 'right' }}>Subtotaal</span><span />
              </div>
              {materialen.map(m => {
                const sub = m.subtotaal || m.aantal * m.prijsPer;
                const pct = m.btwPercentage ?? 21;
                const vast = uitBiblio(m);
                return (
                  <div key={m.id} className="wb2-mat-rij" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5, alignItems: 'center', marginBottom: 5 }}>
                    <input type="text" value={m.naam || ''} disabled={!canEdit}
                      onChange={e => veld(m, 'naam', e.target.value)} style={{ minWidth: 0 }} />
                    <input type="number" min="0" step="0.01" value={m.aantal ?? 1} disabled={!canEdit}
                      onChange={e => veld(m, 'aantal', e.target.value)} style={{ minWidth: 0 }} />
                    <input type="text" value={m.eenheid || ''} placeholder="stuk" disabled={!canEdit}
                      onChange={e => veld(m, 'eenheid', e.target.value)} style={{ minWidth: 0 }} />
                    <input type="number" min="0" step="0.01" value={m.prijsPer ?? 0} disabled={!canEdit}
                      onChange={e => veld(m, 'prijs_per', e.target.value)} style={{ minWidth: 0 }} />
                    {magInkoop && (
                      vast
                        ? <input type="text" readOnly disabled title={vastTitel} style={{ minWidth: 0 }}
                            value={m.inkoopprijsPer != null ? fmtEur(m.inkoopprijsPer) : '—'} />
                        : <input type="number" min="0" step="0.01" value={m.inkoopprijsPer ?? ''} placeholder="p/st"
                            disabled={!canEdit} title="Inkoopprijs per stuk — intern" style={{ minWidth: 0 }}
                            onChange={e => veld(m, 'inkoopprijs_per', e.target.value)} />
                    )}
                    {vast
                      ? <input type="text" value={levNaam(m.leverancierId)} readOnly disabled title={vastTitel} style={{ minWidth: 0 }} />
                      : <LeverancierSelect value={m.leverancierId || ''} disabled={!canEdit} leveranciers={leveranciers}
                          onLijstGewijzigd={g => setLeveranciers(l => [...l, g].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))}
                          onChange={v => veld(m, 'leverancier_id', v)} style={{ minWidth: 0, width: '100%' }} />}
                    <div style={{ textAlign: 'right', overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(sub)}</div>
                      <div style={{ fontSize: 10, color: 'var(--dl)', whiteSpace: 'nowrap' }}>{fmtEur(calcBtw(sub, pct, 'excl').incl)} incl.</div>
                    </div>
                    {canEdit
                      ? <button className="btn btn-xs btn-danger btn-icon" onClick={() => onDelete(m)} title="Verwijderen">{I.trash}</button>
                      : <div />}
                  </div>
                );
              })}
            </div>
          )}

          {canEdit && (
            <div className="wb2-mat-rij" style={{ borderTop: materialen.length ? '1px solid var(--border)' : 'none', paddingTop: materialen.length ? 10 : 0, marginTop: materialen.length ? 6 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : COLS, gap: 5, alignItems: 'center' }}>
                {/* De keuzelijst blijft altijd staan, ook bij vrij materiaal —
                    anders kun je niet meer terug naar de bibliotheek. Het
                    naamveld verschijnt er dan onder. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <select value={form.keuze} onChange={e => kiesMateriaal(e.target.value)} style={{ minWidth: 0 }}>
                    <option value="">— Kies materiaal —</option>
                    {biblio.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
                    <option value={VRIJ}>Vrij materiaal (zelf invullen)…</option>
                  </select>
                  {form.keuze === VRIJ && (
                    <input type="text" autoFocus placeholder="Naam materiaal" value={form.naam}
                      onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') submit(); }} style={{ minWidth: 0 }} />
                  )}
                </div>
                <input type="number" min="0" step="0.01" value={form.aantal} placeholder="1"
                  onChange={e => setForm(f => ({ ...f, aantal: e.target.value }))} style={{ minWidth: 0 }} />
                <input type="text" value={form.eenheid} placeholder="stuk"
                  onChange={e => setForm(f => ({ ...f, eenheid: e.target.value }))} style={{ minWidth: 0 }} />
                <input type="number" min="0" step="0.01" value={form.prijs_per} placeholder="0,00"
                  onChange={e => setForm(f => ({ ...f, prijs_per: e.target.value }))} style={{ minWidth: 0 }} />
                {magInkoop && (
                  form.materiaal_id
                    ? <input type="text" readOnly disabled title={vastTitel} style={{ minWidth: 0 }}
                        value={form.inkoopprijs_per === '' ? '—' : fmtEur(Number(form.inkoopprijs_per))} />
                    : <input type="number" min="0" step="0.01" value={form.inkoopprijs_per} placeholder="p/st"
                        title="Inkoopprijs per stuk — intern" style={{ minWidth: 0 }}
                        onChange={e => setForm(f => ({ ...f, inkoopprijs_per: e.target.value }))} />
                )}
                {form.materiaal_id
                  ? <input type="text" value={levNaam(form.leverancier_id)} readOnly disabled title={vastTitel} style={{ minWidth: 0 }} />
                  : <LeverancierSelect value={form.leverancier_id} leveranciers={leveranciers}
                      onLijstGewijzigd={g => setLeveranciers(l => [...l, g].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))}
                      onChange={v => setForm(f => ({ ...f, leverancier_id: v }))}
                      style={{ minWidth: 0, width: '100%' }} />}
                <div style={{ textAlign: 'right', overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(addSub)}</div>
                  <div style={{ fontSize: 10, color: 'var(--dl)', whiteSpace: 'nowrap' }}>{fmtEur(calcBtw(addSub, form.btw_pct, 'excl').incl)} incl.</div>
                </div>
                <button onClick={submit} disabled={adding || !form.naam.trim()} className="wb2-mat-add-btn"
                  aria-label="Materiaal toevoegen" title="Toevoegen">{I.plus}</button>
              </div>
            </div>
          )}
        </div>

        <div className="wb2-mat-foot">
          <div className="wb2-mat-foot-add" style={{ visibility: 'hidden' }}>spacer</div>
          <div style={{ textAlign: 'right' }}>
            <div className="wb2-mat-foot-total-lbl">Totaal materiaal (excl. BTW)</div>
            <div className="wb2-mat-foot-total">{fmtEur(totalEx)}</div>
            <div style={{ fontSize: 12, color: 'var(--dl)', marginTop: 2 }}>{fmtEur(totalIncl)} incl. BTW</div>
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

function FotoSection({ fotos, onUpload, onDelete, canEdit = true }) {
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
                      {canEdit && <button className="wb2-foto-thumb-del" onClick={() => onDelete(f)} title="Verwijderen">×</button>}
                    </div>
                  ))}
                  {!canEdit && catFotos.length === 0 && (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>Geen foto's</span>
                  )}
                </div>
                {canEdit && (
                  <>
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
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── MEERWERK SECTION ────────────────────────────────────────────────────────

function MeerwerkSection({ meerwerk, onAdd, onDelete, canEdit = true }) {
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
            {canEdit && <button className="wb2-taak-del" onClick={() => onDelete(m)}>{I.trash}</button>}
          </div>
        ))}
        {meerwerk.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid #EFF2EF', marginTop: 2 }}>
            <span style={{ fontSize: 12, color: 'var(--dl)' }}>Totaal meerwerk</span>
            <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(total)}</span>
          </div>
        )}
        {canEdit && (
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
        )}
      </div>
    </div>
  );
}

// ─── NOTITIES SECTION ────────────────────────────────────────────────────────

// Notitielogboek op de werkbon — zelfde component en gedrag als de klantkaart.
// Alleen-inzage (geen bewerkrecht): wel de log, geen invoerveld.
function NotitiesSection({ notities = [], onAdd, teamMembers = [], canEdit = true }) {
  const items = notities.map(n => toLogItem({
    id: n.id, body: n.note, authorName: n.authorName || 'Onbekend', createdAt: n.createdAt,
  }));

  return (
    <div className="wb2-card">
      <div className="wb2-card-hd"><div className="wb2-card-hd-title">Notities uitvoerder</div></div>
      <div className="wb2-card-body">
        {canEdit ? (
          <NotitieLog
            items={items}
            onAdd={onAdd}
            teamMembers={teamMembers}
            placeholder="Bijzonderheden, bevindingen, aandachtspunten voor de baas… Typ @ om iemand te taggen"
            emptyText="Nog geen notities."
          />
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af' }}>Nog geen notities.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(n => (
              <div key={n.id} className="card card-p" style={{ padding: '12px 16px' }}>
                <div className="bb-notitie-content" style={{ fontSize: '.85rem', color: 'var(--dk)', lineHeight: 1.6, wordBreak: 'break-word' }}>{renderNote(n.body)}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 6, fontWeight: 600 }}>
                  {n.authorName ? `${n.authorName} · ` : ''}{fmtNotitieDatum(n.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export function WerkbonPageV2({ preOpenWerkbonId, onNavConsumed, setPage, openCustomer, backKlant, onBackKlant } = {}) {
  const toast = useToast();
  const { profile } = useProfile();
  const { can } = usePermissions();
  const { startUpload } = useUploads();
  const { guardSchrijven, planModal } = usePlanGuard();
  // Beheer/alle werkbonnen bewerken: admin/planner-rol óf het 'werkbonnen_bewerken'-
  // recht. (Een verantwoordelijke mag z'n eigen bon sowieso al — zie canEditDetail.)
  const canManage = !profile || ['admin', 'planner'].includes(profile.role) || can('werkbonnen_bewerken');

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
  const [werkbonNotities, setWerkbonNotities] = useState([]);
  const [taken, setTaken] = useState([]);
  const [materialen, setMaterialen] = useState([]);
  const [uren, setUren] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [meerwerk, setMeerwerk] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHoursAdd, setShowHoursAdd] = useState(false);
  // Afrond-flow: vraagt om een startmoment als de werkbon er geen heeft (geen
  // werkelijke start én geen geplande start om op terug te vallen).
  const [startPrompt, setStartPrompt] = useState(false);
  const [promptDatum, setPromptDatum] = useState(TODAY());
  const [promptTijd, setPromptTijd] = useState('');
  const [completing, setCompleting] = useState(false);
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
    if (!selectedId) { setDetail(null); setWerkbonNotities([]); return; }
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
      getWerkbonNotities(selectedId).catch(() => []),
    ]).then(([w, t, m, u, f, mw, nt]) => {
      if (!alive) return;
      setDetail(w);
      setWerkbonNotities(nt);
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

  // Werkbon-specifiek bewerk-recht op het geopende detail: beheer (admin/planner)
  // óf verantwoordelijke van juist deze werkbon. Alleen dan zijn bewerk-acties
  // actief in de UI; RLS dwingt hetzelfde server-side af.
  const canEditDetail = canManage || (!!profile && !!detail && (detail.verantwoordelijkeIds || []).includes(profile.id));

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
      const btwPct = Number(input.btw_pct ?? 21);
      const created = await createWerkbonMateriaal({ werkbon_id: selectedId, ...input });
      // BTW leeft op de gekoppelde kost; toon hem ook meteen optimistisch.
      setMaterialen(prev => [...prev, { ...created, btwPercentage: btwPct }]);
      // Spiegel-kost zodat het materiaal meetelt in het project/kosten. Het
      // werkbon_materiaal_id koppelt beide → één keer geteld; project en klant
      // worden in createJobCost afgeleid van de werkbon. BTW = dezelfde keuze.
      if (created.subtotaal > 0) {
        createJobCost({
          description: `Materiaal: ${created.naam}`,
          amount: created.subtotaal, // subtotaal is exclusief BTW
          btw_percentage: btwPct,
          btw_inclusief: false,
          category: 'Materiaal',
          cost_date: new Date().toISOString().slice(0, 10),
          werkbon_id: selectedId,
          werkbon_materiaal_id: created.id,
          // Komt uit de bibliotheek (waar leverancier verplicht is) of uit de
          // vrije invoer. Deze spiegelregels worden niet geëxporteerd, dus leeg
          // mag: de leveranciersplicht geldt hier niet.
          leverancier_id: input.leverancier_id ?? created.leverancierId ?? null,
        }).catch(() => {});
      }
    } catch (e) {
      toast.error(e.message || 'Materiaal toevoegen mislukt');
    }
  };

  // Regel bijwerken. Debounce is hier niet nodig: het zijn losse velden en de
  // schrijfactie is klein. De spiegel-kost wordt meegetrokken zodra het bedrag
  // verandert, anders lopen nacalculatie en werkbon uit elkaar.
  const handleUpdateMaterial = async (m, patch) => {
    const nieuwRij = { ...m };
    if ('naam' in patch) nieuwRij.naam = patch.naam;
    if ('eenheid' in patch) nieuwRij.eenheid = patch.eenheid;
    if ('aantal' in patch) nieuwRij.aantal = Number(patch.aantal) || 0;
    if ('prijs_per' in patch) nieuwRij.prijsPer = Number(patch.prijs_per) || 0;
    if ('inkoopprijs_per' in patch) {
      nieuwRij.inkoopprijsPer = patch.inkoopprijs_per === '' ? null : Number(patch.inkoopprijs_per);
    }
    if ('leverancier_id' in patch) nieuwRij.leverancierId = patch.leverancier_id || null;
    nieuwRij.subtotaal = Math.round((nieuwRij.aantal || 0) * (nieuwRij.prijsPer || 0) * 100) / 100;

    // Direct in beeld; de schrijfactie loopt erachteraan.
    setMaterialen(prev => prev.map(x => (x.id === m.id ? nieuwRij : x)));
    try {
      await updateWerkbonMateriaal(m.id, patch);
      // Spiegel-kost meetrekken zodra bedrag of naam wijzigt, anders lopen de
      // nacalculatie en de werkbon uit elkaar.
      if (nieuwRij.subtotaal !== m.subtotaal || nieuwRij.naam !== m.naam) {
        const { data: kost } = await supabase
          .from('job_costs').select('id').eq('werkbon_materiaal_id', m.id).maybeSingle();
        if (kost?.id) {
          await updateJobCost(kost.id, {
            amount: nieuwRij.subtotaal,
            description: `Materiaal: ${nieuwRij.naam}`,
          }).catch(() => {});
        }
      }
    } catch (e) {
      toast.error(e.message || 'Bijwerken mislukt');
      setMaterialen(prev => prev.map(x => (x.id === m.id ? m : x)));
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

  // Voert het daadwerkelijke afronden uit. Geef optioneel een handmatig
  // startmoment (ISO) mee — dat wordt dan als gestart_op vastgelegd.
  const finishComplete = async (gestartIso) => {
    if (!detail) return;
    setCompleting(true);
    try {
      const updated = await updateWerkbon(detail.id, {
        status: 'afgerond',
        afgerond_op: new Date().toISOString(),
        ...(gestartIso ? { gestart_op: gestartIso } : {}),
      });
      setDetail(updated);
      setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
      toast.success('Klus afgerond!');
      setStartPrompt(false);
    } catch (e) {
      toast.error(e.message || 'Afronden mislukt');
    } finally {
      setCompleting(false);
    }
  };

  // Startpunt van het afronden. Is er geen enkel startmoment bekend (geen
  // werkelijke start én geen geplande start), dan eerst het startmoment opvragen;
  // anders gewoon bevestigen en afronden.
  const requestComplete = () => {
    if (!detail || detail.status === 'afgerond') return;
    if (!detail.effectiveStartOp) {
      setPromptDatum(detail.geplandOp || TODAY());
      setPromptTijd(detail.starttijd || '');
      setStartPrompt(true);
      return;
    }
    if (!confirm('Weet je zeker dat je de klus wil afronden?')) return;
    finishComplete(null);
  };

  // Bevestigen vanuit de "Wanneer is de klus gestart?"-modal.
  const submitStartPrompt = () => {
    const iso = plannedStartIso(promptDatum, promptTijd);
    if (!iso) { toast.error('Vul een geldige startdatum en -tijd in'); return; }
    finishComplete(iso);
  };

  const handleCycleStatus = async () => {
    if (!detail || !canEditDetail || detail.status === 'afgerond') return;
    // in_uitvoering → afronden verloopt via dezelfde start-check als de afrondknop.
    if (detail.status !== 'gepland') { requestComplete(); return; }
    // Start klus → in_uitvoering. updateWerkbon legt gestart_op = now() de eerste
    // keer vast (en overschrijft een bestaand werkelijk startmoment niet).
    try {
      const updated = await updateWerkbon(detail.id, { status: 'in_uitvoering' });
      setDetail(updated);
      setWerkbonnen(prev => prev.map(w => w.id === updated.id ? updated : w));
      toast.success('Status: In uitvoering');
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

  // NotitieLog beheert veld + opslaan-status en toont de foutmelding; hier
  // alleen de insert, fouten gooien we door.
  const handleAddNotitie = async text => {
    const created = await addWerkbonNotitie(detail.id, text);
    setWerkbonNotities(list => [created, ...list]);
    toast.success('Notitie opgeslagen');
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
    const totalUren = uren.reduce((s, u) => s + u.uren, 0);
    // Bewerk-recht op dit detail (beheer óf verantwoordelijke van deze werkbon).
    const canEdit = canEditDetail;
    // Gekoppelde, maar niet-verantwoordelijke medewerker → alleen inzage.
    const viewOnly = !!detail && !canEdit;

    return (
      <div className="wb2-page">
        <div className="wb2-head">
          <button className="wb2-detail-back" onClick={backKlant ? () => onBackKlant?.(backKlant) : goBack} type="button">
            {backKlant ? `← Terug naar ${backKlant.klantNaam}` : '← Werkbonnen'}
          </button>
          <div className="wb2-head-spacer" />
          {canManage && (
            <button className="btn btn-p" onClick={guardSchrijven('Een werkbon aanmaken', () => setShowNew(true))} type="button">
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
                  {viewOnly && (
                    <span className="wb2-badge gray sm" title="Je bent gekoppeld aan deze werkbon maar niet verantwoordelijke; je kunt alleen inzien.">
                      <span className="wb2-badge-dot" />
                      Alleen inzage
                    </span>
                  )}
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
                disabled={!canEdit || detail.status === 'afgerond'}
                type="button"
              >
                <div className="wb2-action-btn-ic">{detail.status === 'gepland' ? I.flag : I.check}</div>
                {detail.status === 'gepland' ? 'Start klus' : detail.status === 'in_uitvoering' ? 'Afronden' : 'Afgerond'}
              </button>
            </div>

            {/* Omschrijving */}
            {(detail.omschrijving || detail.notes) && (
              <div className="wb2-card">
                <div className="wb2-card-hd"><div className="wb2-card-hd-title">Omschrijving</div></div>
                <div className="wb2-card-body">
                  {detail.omschrijving && (
                    <div style={{ fontSize: 13.5, color: 'var(--dmu)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: detail.notes ? 10 : 0 }}>
                      {renderNote(detail.omschrijving)}
                    </div>
                  )}
                  {detail.notes && (
                    <div className="wb2-note">
                      <span className="wb2-note-ic">{I.bell}</span>
                      <div className="wb2-note-txt"><b>Interne notitie:</b> {renderNote(detail.notes)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Taken */}
            <TakenSection taken={taken} onToggle={handleToggleTaak} onAdd={handleAddTaak} onDelete={handleDeleteTaak} canEdit={canEdit} />

            {/* Uren met toggle voor quick-add */}
            <div className="wb2-card">
              <div className="wb2-card-hd">
                <div className="wb2-card-hd-title">
                  Uren{totalUren > 0 ? ` · ${totalUren.toFixed(1).replace('.', ',')}u` : ''}
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
                  <div className="wb2-uren-ic">
                    {I.clock}
                  </div>
                  <div className="wb2-uren-main">
                    <div className="wb2-uren-title">
                      {shortDate(u.datum)}
                      {u.medewerkerNaam ? ` · ${u.medewerkerNaam}` : ''}
                    </div>
                    {/* Onderregel: eerst wat er gebeurd is (soort, pauze, km),
                        dan pas de opmerking — die verklaart een uitloop en is
                        het lezen waard, maar hij mag de feiten niet verdringen. */}
                    <div className="wb2-uren-sub">
                      {[
                        u.uursoortNaam,
                        u.pauzeMinuten ? `${u.pauzeMinuten} min pauze` : null,
                        u.reisKm != null ? `${String(u.reisKm).replace('.', ',')} km` : null,
                        u.notitie || null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="wb2-uren-time">
                    {u.startTijd && u.eindTijd
                      ? `${fmtTime(u.startTijd)}–${fmtTime(u.eindTijd)}`
                      : `${u.uren.toFixed(2).replace('.', ',')}u`}
                    {u.startTijd && u.eindTijd && (
                      <div style={{ fontSize: '.72rem', color: 'var(--dl)', fontWeight: 600 }}>
                        {u.uren.toFixed(2).replace('.', ',')}u
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Foto's */}
            <FotoSection fotos={fotos} onUpload={handleUploadFoto} onDelete={handleDeleteFoto} canEdit={canEdit} />

            {/* Materialen */}
            <MaterialenSection materialen={materialen} onAdd={handleAddMaterial} onUpdate={handleUpdateMaterial} onDelete={handleDeleteMaterial} canEdit={canEdit} />

            {/* Meerwerk */}
            <MeerwerkSection meerwerk={meerwerk} onAdd={handleAddMeerwerk} onDelete={handleDeleteMeerwerk} canEdit={canEdit} />

            {/* Notities */}
            <NotitiesSection notities={werkbonNotities} onAdd={handleAddNotitie} teamMembers={teamMembers} canEdit={canEdit} />

            {/* Afronden */}
            {detail.status !== 'afgerond' && canEdit && (
              <button className="wb2-complete-btn" onClick={requestComplete} type="button">
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
        {startPrompt && (
          <div className="overlay" onClick={e => e.target === e.currentTarget && !completing && setStartPrompt(false)}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <div className="modal-hd">
                <div>
                  <div className="modal-title">Wanneer is de klus gestart?</div>
                  <div className="modal-sub">Deze werkbon heeft geen startmoment en geen geplande start. Vul het startmoment in om te kunnen afronden.</div>
                </div>
                <ModalX onClose={() => !completing && setStartPrompt(false)} />
              </div>
              <div className="wb2-modal-fg">
                <div className="f">
                  <label>Startdatum</label>
                  <input type="date" value={promptDatum} max={TODAY()} onChange={e => setPromptDatum(e.target.value)} autoFocus />
                </div>
                <div className="f">
                  <label>Starttijd</label>
                  <input type="time" value={promptTijd} onChange={e => setPromptTijd(e.target.value)} />
                </div>
              </div>
              <div className="fa">
                <button className="btn btn-ghost" onClick={() => setStartPrompt(false)} disabled={completing}>Annuleren</button>
                <button className="btn btn-p" onClick={submitStartPrompt} disabled={completing || !promptDatum || !promptTijd}>
                  {completing ? 'Afronden…' : 'Opslaan & afronden'}
                </button>
              </div>
            </div>
          </div>
        )}

        {planModal}
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
          <button className="btn btn-p" onClick={guardSchrijven('Een werkbon aanmaken', () => setShowNew(true))} type="button">
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
          ['gepland', 'Gepland', counts.gepland, statusInfo('gepland', 'werkbon').dot],
          ['in_uitvoering', 'In uitvoering', counts.in_uitvoering, statusInfo('in_uitvoering', 'werkbon').dot],
          ['afgerond', 'Afgerond', counts.afgerond, statusInfo('afgerond', 'werkbon').dot],
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
              <button className="btn btn-p" onClick={guardSchrijven('Een werkbon aanmaken', () => setShowNew(true))} type="button">
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

      {planModal}
    </div>
  );
}

export default WerkbonPageV2;
