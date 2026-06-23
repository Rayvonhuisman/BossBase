import { useEffect, useState } from 'react';
import { I, fmt } from '../../bb-shared.jsx';
import { useProfile } from '../../lib/profileContext.jsx';
import { useToast } from '../../lib/toast.jsx';
import {
  listCalendarEvents, updateCalendarEvent, deleteCalendarEvent,
  updateCalendarEventComments, setCalendarEventWerkbon,
} from '../../services/calendarService.js';
import {
  getWerkbonById, getWerkbonTaken, getWerkbonMaterialen,
  createWerkbon, toggleWerkbonTaak,
} from '../../services/werkbonService.js';
import { listCustomers } from '../../services/customerService.js';
import { listDeals } from '../../services/dealService.js';
import { getTeamMembers, createMentionNotifications } from '../../services/notificatieService.js';
import { MentionEditor, renderMentions } from '../../components/MentionEditor.jsx';

const TYPE_LABEL = { job: 'Klus', visit: 'Opname', activity: 'Activiteit', event: 'Afspraak' };
const TYPE_TONE = { job: 'b-orange', visit: 'b-new', activity: 'b-blue', event: 'b-green' };
const TYPE_OPTIONS = ['event', 'job', 'visit', 'activity'];

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e5e9',
  fontSize: 13, color: '#0a0a0a', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
};
const labelStyle = { fontSize: 11.5, fontWeight: 700, color: '#6b7280', marginBottom: 5, display: 'block' };

function Section({ title, right, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0a0a0a', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
      <span style={{ color: '#6b7280' }}>{k}</span>
      <span style={{ fontWeight: 700, color: '#0a0a0a', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
    + ' · ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

export function CalendarEventDetailDrawer({ eventId, onClose, openCustomer, openDeal }) {
  const { profile, bumpRefresh } = useProfile();
  const toast = useToast();
  const canEdit = profile?.role === 'admin' || profile?.role === 'planner';
  const [deleting, setDeleting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [ev, setEv] = useState(null);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  const [werkbon, setWerkbon] = useState(null);
  const [taken, setTaken] = useState([]);
  const [materialen, setMaterialen] = useState([]);
  const [wbLoading, setWbLoading] = useState(false);
  const [creatingWb, setCreatingWb] = useState(false);

  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  // ── Laad het agenda-item ──────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoading(true); setErr('');
    listCalendarEvents()
      .then(list => {
        if (!alive) return;
        const found = (list || []).find(x => x.id === eventId) || null;
        setEv(found);
        if (found) {
          setForm({
            title: found.title || '',
            type: found.type || 'event',
            date: found.date || '',
            time: found.time || '',
            end: found.end || '',
            location: found.location || '',
            custId: found.custId || '',
            dealId: found.dealId || '',
          });
          setComments(Array.isArray(found.comments) ? found.comments : []);
        }
      })
      .catch(e => { if (alive) setErr(e.message || 'Laden mislukt'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventId]);

  // ── Laad dropdown-data + teamleden (voor @ tagging) ───────────
  useEffect(() => {
    let alive = true;
    listCustomers().then(d => { if (alive) setCustomers(d || []); }).catch(() => {});
    listDeals().then(d => { if (alive) setDeals(d || []); }).catch(() => {});
    getTeamMembers().then(d => { if (alive) setTeamMembers(d || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // ── Laad gekoppelde werkbon ───────────────────────────────────
  useEffect(() => {
    let alive = true;
    if (!ev?.werkbonId) { setWerkbon(null); setTaken([]); setMaterialen([]); return; }
    setWbLoading(true);
    Promise.all([
      getWerkbonById(ev.werkbonId).catch(() => null),
      getWerkbonTaken(ev.werkbonId).catch(() => []),
      getWerkbonMaterialen(ev.werkbonId).catch(() => []),
    ]).then(([w, t, m]) => {
      if (!alive) return;
      setWerkbon(w); setTaken(t || []); setMaterialen(m || []);
    }).finally(() => { if (alive) setWbLoading(false); });
    return () => { alive = false; };
  }, [ev?.werkbonId]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!ev || !form) return;
    setSaving(true);
    try {
      const updated = await updateCalendarEvent(ev.id, {
        title: form.title,
        type: form.type,
        date: form.date,
        time: form.time,
        end: form.end,
        location: form.location,
        custId: form.custId || null,
        dealId: form.dealId || null,
      });
      setEv(updated);
      toast.success('Agenda-item opgeslagen');
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ev || !window.confirm('Dit agenda-item verwijderen?')) return;
    setDeleting(true);
    try {
      await deleteCalendarEvent(ev.id);
      toast.success('Agenda-item verwijderd');
      bumpRefresh?.();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
      setDeleting(false);
    }
  };

  const handleCreateWerkbon = async () => {
    if (!ev) return;
    setCreatingWb(true);
    try {
      const wb = await createWerkbon({
        titel: form?.title || ev.title || 'Werkbon',
        customerId: form?.custId || ev.custId || null,
        dealId: form?.dealId || ev.dealId || null,
        geplandOp: form?.date || ev.date || null,
        starttijd: form?.time || ev.time || null,
        eindtijd: form?.end || ev.end || null,
        locatie: form?.location || ev.location || null,
      });
      const updated = await setCalendarEventWerkbon(ev.id, wb.id);
      setEv(updated);
      toast.success('Werkbon aangemaakt');
    } catch (e) {
      toast.error(e.message || 'Werkbon aanmaken mislukt');
    } finally {
      setCreatingWb(false);
    }
  };

  const handleToggleTaak = async (taak) => {
    const next = !taak.afgerond;
    setTaken(list => list.map(t => (t.id === taak.id ? { ...t, afgerond: next } : t)));
    try {
      await toggleWerkbonTaak(taak.id, next);
    } catch {
      setTaken(list => list.map(t => (t.id === taak.id ? { ...t, afgerond: !next } : t)));
      toast.error('Bijwerken mislukt');
    }
  };

  const handlePostComment = async () => {
    const text = draft.trim();
    if (!text || !ev) return;
    setPosting(true);
    try {
      const entry = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `c-${Date.now()}`,
        userId: profile?.id || null,
        name: profile?.fullName || 'Onbekend',
        text,
        at: new Date().toISOString(),
      };
      const next = [...comments, entry];
      await updateCalendarEventComments(ev.id, next);
      setComments(next);
      setDraft('');
      createMentionNotifications({
        text,
        relatedType: 'calendar_event',
        relatedId: ev.id,
        link: 'calendar',
        creatorId: profile?.id,
        creatorName: profile?.fullName,
        contextName: ev.title,
      }).catch(() => {});
    } catch (e) {
      toast.error(e.message || 'Plaatsen mislukt');
    } finally {
      setPosting(false);
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
          </div>
          {HeadClose}
        </div>
      </div>
    );
  }

  const tone = TYPE_TONE[ev.type] || 'b-gray';
  const typeLabel = TYPE_LABEL[ev.type] || ev.type || 'Afspraak';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottom: '1px solid #eef0f2' }}>
        <div style={{ minWidth: 0 }}>
          <span className={`badge ${tone}`}>{typeLabel}</span>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, color: '#0a0a0a', marginTop: 6 }}>{ev.title || 'Afspraak'}</div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
            {ev.date || '—'}{(ev.time || ev.end) ? ` · ${ev.time || ''}${ev.end ? `–${ev.end}` : ''}` : ''}
          </div>
        </div>
        {HeadClose}
      </div>

      {/* ── Gegevens: bewerkbaar voor admin/planner, anders alleen-lezen ── */}
      {canEdit && form ? (
        <Section
          title="Gegevens"
          right={<button className="btn btn-p btn-xs" onClick={handleSave} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>}
        >
          <Field label="Titel">
            <input style={inputStyle} value={form.title} onChange={e => setField('title', e.target.value)} placeholder="Titel" />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="Type">
                <select style={inputStyle} value={form.type} onChange={e => setField('type', e.target.value)}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Datum">
                <input type="date" style={inputStyle} value={form.date} onChange={e => setField('date', e.target.value)} />
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="Starttijd">
                <input type="time" style={inputStyle} value={form.time} onChange={e => setField('time', e.target.value)} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Eindtijd">
                <input type="time" style={inputStyle} value={form.end} onChange={e => setField('end', e.target.value)} />
              </Field>
            </div>
          </div>
          <Field label="Locatie">
            <input style={inputStyle} value={form.location} onChange={e => setField('location', e.target.value)} placeholder="Locatie" />
          </Field>
          <Field label="Klant">
            <select style={inputStyle} value={form.custId} onChange={e => setField('custId', e.target.value)}>
              <option value="">— Geen klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Deal">
            <select style={inputStyle} value={form.dealId} onChange={e => setField('dealId', e.target.value)}>
              <option value="">— Geen deal —</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
        </Section>
      ) : (
        <Section title="Overzicht">
          <Row k="Titel" v={ev.title || '—'} />
          <Row k="Type" v={typeLabel} />
          <Row k="Datum" v={ev.date || '—'} />
          <Row k="Starttijd" v={ev.time || '—'} />
          <Row k="Eindtijd" v={ev.end || '—'} />
          <Row k="Locatie" v={ev.location || '—'} />
          <Row k="Klant" v={customers.find(c => c.id === ev.custId)?.name || (ev.custId ? 'Gekoppeld' : '—')} />
        </Section>
      )}

      {/* Snelkoppelingen naar gekoppelde klant/deal */}
      {(ev.custId || ev.dealId) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {ev.custId && openCustomer && <button className="btn btn-s btn-sm" onClick={() => openCustomer(ev.custId)}>Open klant</button>}
          {ev.dealId && openDeal && <button className="btn btn-s btn-sm" onClick={() => openDeal(ev.dealId)}>Open deal</button>}
        </div>
      )}

      {/* ── Werkbon ─────────────────────────────────────────────── */}
      <Section title="Werkbon">
        {wbLoading && <div style={{ fontSize: 13, color: '#9ca3af' }}>Werkbon laden…</div>}

        {!wbLoading && !ev.werkbonId && (
          <div style={{ padding: '16px', background: '#f9fafb', border: '1px dashed #e2e5e9', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: canEdit ? 10 : 0 }}>Geen werkbon gekoppeld</div>
            {canEdit && (
              <button className="btn btn-p btn-sm" onClick={handleCreateWerkbon} disabled={creatingWb}>
                {creatingWb ? 'Aanmaken…' : 'Werkbon aanmaken'}
              </button>
            )}
          </div>
        )}

        {!wbLoading && ev.werkbonId && werkbon && (
          <div style={{ border: '1px solid #eef0f2', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', background: '#f9fafb', borderBottom: '1px solid #eef0f2' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0a0a0a' }}>{werkbon.titel || 'Werkbon'}</div>
              {werkbon.locatie && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>📍 {werkbon.locatie}</div>}
            </div>
            <div style={{ padding: '12px 14px' }}>
              {werkbon.omschrijving && (
                <div style={{ marginBottom: 12 }}>
                  <div style={labelStyle}>Omschrijving</div>
                  <div style={{ fontSize: 13, color: '#0a0a0a', whiteSpace: 'pre-wrap' }}>{werkbon.omschrijving}</div>
                </div>
              )}

              {taken.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={labelStyle}>Taken</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {taken.map(t => (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.afgerond ? '#9ca3af' : '#0a0a0a', cursor: 'pointer' }}>
                        <input type="checkbox" checked={t.afgerond} onChange={() => handleToggleTaak(t)} />
                        <span style={{ textDecoration: t.afgerond ? 'line-through' : 'none' }}>{t.omschrijving}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {materialen.length > 0 && (
                <div style={{ marginBottom: werkbon.werkbonNotities ? 12 : 0 }}>
                  <div style={labelStyle}>Materialen</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {materialen.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                        <span style={{ color: '#0a0a0a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.aantal}× {m.naam}</span>
                        {m.subtotaal > 0 && <span style={{ color: '#6b7280', flexShrink: 0 }}>{fmt(m.subtotaal)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {werkbon.werkbonNotities && (
                <div>
                  <div style={labelStyle}>Notities</div>
                  <div style={{ fontSize: 13, color: '#0a0a0a', whiteSpace: 'pre-wrap' }}>{werkbon.werkbonNotities}</div>
                </div>
              )}

              {taken.length === 0 && materialen.length === 0 && !werkbon.omschrijving && !werkbon.werkbonNotities && (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Deze werkbon heeft nog geen details.</div>
              )}
            </div>
          </div>
        )}

        {!wbLoading && ev.werkbonId && !werkbon && (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Gekoppelde werkbon kon niet worden geladen.</div>
        )}
      </Section>

      {/* ── Notities / communicatie ─────────────────────────────── */}
      <Section title="Notities">
        {comments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {comments.map(cm => (
              <div key={cm.id} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef0f2', color: '#374151', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {initialsOf(cm.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0, background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0a0a0a' }}>{cm.name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{fmtWhen(cm.at)}</span>
                  </div>
                  <div className="bb-notitie-content" style={{ fontSize: 13, color: '#0a0a0a', lineHeight: 1.5, wordBreak: 'break-word' }}>{renderMentions(cm.text)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <MentionEditor
          value={draft}
          onChange={setDraft}
          rows={3}
          placeholder="Schrijf een notitie… Typ @ om iemand te taggen"
          teamMembers={teamMembers}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn btn-p btn-xs" disabled={posting || !draft.trim()} onClick={handlePostComment}>
            {posting ? 'Plaatsen…' : 'Plaatsen'}
          </button>
        </div>
      </Section>

      <div style={{ flex: 1 }} />
      <div style={{ paddingTop: 16, marginTop: 16, borderTop: '1px solid #eef0f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {canEdit
          ? <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>{deleting ? 'Verwijderen…' : 'Verwijderen'}</button>
          : <span />}
        <button className="btn btn-s btn-sm" onClick={onClose}>Sluiten</button>
      </div>
    </div>
  );
}
