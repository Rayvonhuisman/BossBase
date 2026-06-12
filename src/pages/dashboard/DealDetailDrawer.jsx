import { useEffect, useState } from 'react';
import { I, fmt } from '../../bb-shared.jsx';
import { useProfile } from '../../lib/profileContext.jsx';
import { useToast } from '../../lib/toast.jsx';
import { listDeals, listPipelineStages, updateDeal } from '../../services/dealService.js';
import { listActivities } from '../../services/activityService.js';
import { getOffertes } from '../../services/offerteService.js';
import { listNotes, createNote } from '../../services/noteService.js';
import { listJobCosts } from '../../services/jobCostService.js';
import { getWerkbonnen } from '../../services/werkbonService.js';
import { MentionEditor } from '../../components/MentionEditor.jsx';
import { getTeamMembers, createMentionNotifications, createAssignmentNotification } from '../../services/notificatieService.js';

const GREEN = '#1DDB62';

function Section({ title, action, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0a0a0a', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6b7280' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  border: '1px solid #e7e9ec', borderRadius: 9, padding: '9px 11px',
  fontSize: 13.5, color: '#0a0a0a', outline: 'none', fontFamily: 'inherit', background: '#fff', width: '100%', boxSizing: 'border-box',
};
// Read-only / not-writable variant
const roStyle = { ...inputStyle, background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' };

function Hint({ children }) {
  return <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{children}</span>;
}

export function DealDetailDrawer({ dealId, onClose, setPage, openCustomer }) {
  const toast = useToast();
  const { profile, bumpRefresh, requestNewActivity } = useProfile();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [deal, setDeal] = useState(null);
  const [stages, setStages] = useState([]);
  const [acts, setActs] = useState([]);
  const [offs, setOffs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [costs, setCosts] = useState([]);
  const [wbs, setWbs] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  const [form, setForm] = useState({ title: '', value: '', stageId: '', nextAct: '', assignedTo: '' });
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    Promise.all([
      listDeals(),
      listPipelineStages().catch(() => []),
      listActivities().catch(() => []),
      getOffertes().catch(() => []),
      listNotes().catch(() => []),
      listJobCosts().catch(() => []),
      getWerkbonnen().catch(() => []),
    ]).then(([deals, st, a, o, n, jc, w]) => {
      if (!alive) return;
      const d = deals.find(x => x.id === dealId) || null;
      setDeal(d);
      setStages(st);
      setActs(a.filter(x => x.dealId === dealId));
      setOffs(o.filter(x => x.dealId === dealId));
      setNotes(n.filter(x => x.dealId === dealId));
      setCosts(jc.filter(x => x.dealId === dealId));
      setWbs(w.filter(x => x.dealId === dealId));
      if (d) setForm({ title: d.title || '', value: d.value || 0, stageId: d.stage || '', nextAct: d.nextAct || '', assignedTo: d.assignedTo || '' });
    }).catch(e => { if (alive) setErr(e.message || 'Laden mislukt'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dealId]);

  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  const stageOf = id => stages.find(s => s.id === id) || null;
  const curStage = deal ? stageOf(deal.stage) : null;

  // Determine which fields are actually writable from the real DB row.
  // Only columns present on deal.raw are written — no schema changes, no
  // hardcoded assumptions. Fields without a column are disabled in the UI
  // so users never think an un-persisted value was saved.
  const raw = deal?.raw || {};
  const firstKey = (...keys) => keys.find(k => k in raw) || null;
  const titleCol = firstKey('title', 'name', 'description');
  const valueCol = firstKey('value', 'amount', 'revenue', 'deal_value', 'estimated_value', 'price');
  const stageCol = firstKey('stage_id', 'pipeline_stage_id');
  const nextCol = firstKey('next_activity', 'next_action', 'nextAct');

  const save = async () => {
    if (!deal) return;
    const payload = {};
    if (titleCol) payload[titleCol] = form.title;
    if (valueCol) payload[valueCol] = Number(form.value) || 0;
    if (stageCol && form.stageId && form.stageId !== deal.stage) payload[stageCol] = form.stageId;
    if (nextCol) payload[nextCol] = form.nextAct;
    payload.assigned_to = form.assignedTo || null;
    if (Object.keys(payload).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      const updated = await updateDeal(deal.id, payload);
      const prevAssigned = deal.assignedTo || '';
      if (form.assignedTo && form.assignedTo !== prevAssigned && profile?.id) {
        const assignedMember = teamMembers.find(m => m.id === form.assignedTo);
        createAssignmentNotification({ assignedToUserId: form.assignedTo, assignedToName: assignedMember?.fullName, type: 'toewijzing_deal', title: `Je bent toegewezen aan ${form.title}`, link: 'pipeline', relatedType: 'deal', relatedId: deal.id, creatorId: profile.id, creatorName: profile.fullName }).catch(() => {});
      }
      setDeal(updated);
      setForm(f => ({ ...f, title: updated.title || '', value: updated.value || 0, stageId: updated.stage || '', nextAct: updated.nextAct || '', assignedTo: updated.assignedTo || '' }));
      bumpRefresh && bumpRefresh();
      toast.success('Deal opgeslagen');
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    const body = noteText.trim();
    if (!body || !deal) return;
    setAddingNote(true);
    try {
      const created = await createNote({ customer_id: deal.custId || null, deal_id: deal.id, body });
      setNotes(ns => [created, ...ns]);
      if (profile?.id) {
        createMentionNotifications({ text: body, relatedType: 'deal', relatedId: deal.id, link: 'pipeline', creatorId: profile.id, creatorName: profile.fullName, contextName: deal.title }).catch(() => {});
      }
      setNoteText('');
    } catch (e) {
      toast.error(e.message || 'Notitie opslaan mislukt');
    } finally {
      setAddingNote(false);
    }
  };

  const HeadClose = (
    <button onClick={onClose} aria-label="Sluiten" style={{
      width: 32, height: 32, borderRadius: 9, border: '1px solid #e7e9ec', background: '#fff',
      color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
    }}>{I.x}</button>
  );

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 800 }}>Project laden…</div>{HeadClose}</div>
      </div>
    );
  }
  if (err || !deal) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Project niet gevonden</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{err || 'Dit project bestaat niet of is niet beschikbaar.'}</div>
            <button className="btn btn-s btn-sm" style={{ marginTop: 14 }} onClick={() => { onClose(); setPage('pipeline'); }}>Naar pipeline</button>
          </div>
          {HeadClose}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottom: '1px solid #eef0f2' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, color: '#0a0a0a' }}>{deal.title || 'Deal'}</div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {deal.custId
              ? <button onClick={() => { openCustomer && openCustomer(deal.custId); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#15A34A' }}>{deal.customerName || 'Klant'}</button>
              : <span style={{ fontSize: 13.5, color: '#6b7280' }}>{deal.customerName || 'Geen klant'}</span>}
            {curStage && <span className={`badge ${curStage.col || 'b-gray'}`}>{curStage.label}</span>}
            <span style={{ fontSize: 15, fontWeight: 800, color: '#15A34A', letterSpacing: -0.2 }}>{fmt(deal.value || 0)}</span>
          </div>
        </div>
        {HeadClose}
      </div>

      {/* Overzicht / edit */}
      <Section title="Overzicht">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Titel">
              <input style={titleCol ? inputStyle : roStyle} disabled={!titleCol} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              {!titleCol && <Hint>Titel kan voor deze deal nog niet worden aangepast.</Hint>}
            </Field>
          </div>
          <Field label="Waarde (€)">
            <input style={valueCol ? inputStyle : roStyle} disabled={!valueCol} type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
            {!valueCol && <Hint>Waarde kan voor deze deal nog niet worden aangepast.</Hint>}
          </Field>
          <Field label="Fase">
            <select style={stageCol ? inputStyle : roStyle} disabled={!stageCol} value={form.stageId} onChange={e => setForm(f => ({ ...f, stageId: e.target.value }))}>
              {!stages.some(s => s.id === form.stageId) && <option value={form.stageId}>{curStage?.label || 'Onbekend'}</option>}
              {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {!stageCol && <Hint>Fase kan voor deze deal nog niet worden aangepast.</Hint>}
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Volgende actie">
              <input style={nextCol ? inputStyle : roStyle} disabled={!nextCol} value={form.nextAct} placeholder={nextCol ? 'bv. Offerte nabellen' : ''} onChange={e => setForm(f => ({ ...f, nextAct: e.target.value }))} />
              {!nextCol && <Hint>Volgende actie kan voor deze deal nog niet worden aangepast.</Hint>}
            </Field>
          </div>
          {teamMembers.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Toegewezen aan">
                <select style={inputStyle} value={form.assignedTo || ''} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                  <option value="">Niemand</option>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
        {(deal.city || deal.raw?.source) && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
            {deal.city ? `Plaats: ${deal.city}` : ''}{deal.city && deal.raw?.source ? ' · ' : ''}{deal.raw?.source ? `Bron: ${deal.raw.source}` : ''}
          </div>
        )}
        {(titleCol || valueCol || stageCol || nextCol) ? (
          <button className="btn btn-p btn-sm" disabled={saving} onClick={save}
            style={{ marginTop: 14, background: GREEN, color: '#0a0a0a', border: 'none', fontWeight: 700 }}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        ) : (
          <div style={{ marginTop: 14, fontSize: 12, color: '#9ca3af' }}>Deze deal heeft geen aanpasbare velden in de huidige database.</div>
        )}
      </Section>

      {/* Activiteiten */}
      <Section title={`Activiteiten (${acts.length})`}
        action={<button className="btn btn-s btn-xs" onClick={() => requestNewActivity && requestNewActivity({ defaultCustId: deal.custId, defaultDealId: deal.id })}>+ Nieuwe activiteit</button>}>
        {acts.length === 0 && <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Geen gekoppelde activiteiten</div>}
        {acts.map(a => (
          <button key={a.id} onClick={() => setPage('activities', { id: a.id })} style={{
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', border: '1px solid #eef0f2', borderRadius: 9, background: '#fff', cursor: 'pointer', marginBottom: 6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
              <div style={{ fontSize: 11.5, color: '#6b7280' }}>{(a.dueAt || '').slice(0, 10)}{a.time ? ` · ${a.time}` : ''}{a.status ? ` · ${a.status}` : ''}</div>
            </div>
            <span style={{ color: '#9ca3af' }}>{I.arrow_r}</span>
          </button>
        ))}
      </Section>

      {/* Offertes */}
      <Section title={`Offertes (${offs.length})`}
        action={deal.custId && (
          <button className="btn btn-s btn-xs" onClick={() => { onClose(); setPage('offertes', { dealId: deal.id }); }}>
            + Nieuwe offerte
          </button>
        )}>
        {offs.length === 0 && <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Geen gekoppelde offertes</div>}
        {offs.map(o => (
          <button key={o.id} onClick={() => setPage('offertes', { id: o.id })} style={{
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', border: '1px solid #eef0f2', borderRadius: 9, background: '#fff', cursor: 'pointer', marginBottom: 6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a' }}>{o.nummer || 'Offerte'} <span style={{ fontWeight: 500, color: '#6b7280' }}>· {o.status}</span></div>
              <div style={{ fontSize: 11.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.omschrijving || o.customerName || '—'}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#15A34A' }}>{fmt(o.totaalIncl || 0)}</span>
          </button>
        ))}
      </Section>

      {/* Notities */}
      <Section title={`Notities (${notes.length})`}>
        <div style={{ marginBottom: 10 }}>
          <MentionEditor value={noteText} onChange={setNoteText} placeholder="Nieuwe notitie… Typ @ om iemand te taggen" rows={3} disabled={addingNote} teamMembers={teamMembers} />
          <button className="btn btn-s btn-sm" disabled={addingNote || !noteText.trim()} onClick={addNote} style={{ marginTop: 8 }}>Toevoegen</button>
        </div>
        {notes.length === 0 && <div style={{ textAlign: 'center', width: '100%', padding: '24px 0', color: '#9ca3af', display: 'block' }}>Nog geen notities</div>}
        {notes.map(n => (
          <div key={n.id} style={{ padding: '10px 12px', border: '1px solid #eef0f2', borderRadius: 9, background: '#f7f8f7', marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: '#0a0a0a', whiteSpace: 'pre-wrap' }}>{n.body}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{(n.createdAt || '').slice(0, 10)}{n.author ? ` · ${n.author}` : ''}</div>
          </div>
        ))}
      </Section>

      {/* Kosten / werkbonnen */}
      {(costs.length > 0 || wbs.length > 0) && (
        <Section title="Kosten & werkbonnen">
          {costs.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', border: '1px solid #eef0f2', borderRadius: 9, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>{c.desc || c.cat}{c.date ? ` · ${c.date}` : ''}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(c.amt || 0)}</span>
            </div>
          ))}
          {wbs.map(w => (
            <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', border: '1px solid #eef0f2', borderRadius: 9, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>{w.titel || w.title || 'Werkbon'}{w.geplandOp ? ` · ${String(w.geplandOp).slice(0, 10)}` : ''}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{w.status || ''}</span>
            </div>
          ))}
        </Section>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ paddingTop: 16, marginTop: 16, borderTop: '1px solid #eef0f2', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-s btn-sm" onClick={() => { onClose(); setPage('pipeline'); }}>Open in pipeline</button>
        <button className="btn btn-s btn-sm" onClick={onClose}>Sluiten</button>
      </div>
    </div>
  );
}
