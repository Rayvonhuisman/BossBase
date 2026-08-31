import { useEffect, useMemo, useRef, useState } from 'react';
import { I, ModalX, NotifyMailToggle, PIPELINE_STAGES, fmt } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { supabase } from '../lib/supabase';
import { createCustomer } from '../services/customerService.js';
import { createDeal } from '../services/dealService.js';
import { createActivity, updateActivity, deleteActivity, buildDueAt, getActiviteitNotities, addActiviteitNotitie } from '../services/activityService.js';
import { syncActivity } from '../services/googleCalendarService.js';
import { useProfile } from '../lib/profileContext.jsx';
import { triggerAutoEmail } from '../services/emailService.js';
import { getCompanyId } from '../lib/currentCompany.js';
import { createCalendarEvent } from '../services/calendarService.js';
import { createJobCost, updateJobCost } from '../services/jobCostService.js'
import { listLeveranciers } from '../services/leverancierService.js'
import LeverancierSelect from './LeverancierSelect.jsx'
import { categorieOptiesUit, standaardCategorieUit, bonVerplichtUit, BON_VERPLICHT_MELDING } from '../lib/kostenCategorieen.js';
import { useKostenCategorieen } from '../hooks/useKostenCategorieen.js';
import { getWerkbonnen } from '../services/werkbonService.js';
import { getProjects } from '../services/projectsService.js';
import { calcBtw } from '../utils/btw.js';
import { updateProfile } from '../services/profileService.js';
import { NoteEditor, renderNote } from './NoteEditor.jsx';
import NotitieLog, { toLogItem, fmtNotitieDatum } from './NotitieLog.jsx';
import AdresZoeker from './AdresZoeker.jsx';
import { useUploads } from '../lib/uploadContext.jsx';
import { getTeamMembers, createMentionNotifications, notifyNewAssignees } from '../services/notificatieService.js';
import { MemberMultiSelect } from './MemberMultiSelect.jsx';

const isEmail = v => !v || /^\S+@\S+\.\S+$/.test(v);

function addMins(time, mins) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

// ── KOSTEN BTW HELPERS ───────────────────────────────────────
const calcBtwHelper = (bedrag, pct, mode) => calcBtw(bedrag, pct, mode);
const getRegelPct = r => r.btw_pct === 'anders' ? Number(r.btw_custom) || 0 : Number(r.btw_pct);
const newKostenRegel = () => ({ id: Date.now() + Math.random(), omschrijving: '', bedrag: '', btw_mode: 'excl', btw_pct: 21, btw_custom: '' });

// Comprimeert een afbeelding (bv. telefoonfoto van een bonnetje) client-side
// vóór upload: schaalt naar max 1600px en her-encodeert als JPEG q0.8. Niet-
// afbeeldingen (PDF) en gevallen zonder winst worden ongewijzigd teruggegeven.
async function compressImage(file) {
  if (!file?.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file; // geen winst → origineel
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file; // bij twijfel: origineel uploaden
  }
}

// Customer form keeps friendly UI fields. customerService.mapCustomerFormToPayload
// strips anything Supabase doesn't actually have (source, type, company_name).

// ── NEW CUSTOMER MODAL ───────────────────────────────────────
export function NewCustomerModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', company: '', email: '', phone: '', address: '', postcode: '', city: '',
    kvkNumber: '', btwNumber: '', iban: '',
    type: 'Zakelijk', source: 'Handmatig', notes: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [teamMembersNC, setTeamMembersNC] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { getTeamMembers().then(setTeamMembersNC).catch(() => {}); }, []);

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Naam is verplicht';
    if (!isEmail(form.email)) next.email = 'Ongeldig e-mailadres';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createCustomer(form);
      toast.success(`${created.name} is toegevoegd`);
      onSaved?.(created);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Klant opslaan is mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe klant</div>
            <div className="modal-sub">Voeg een klant toe aan je CRM.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f">
            <label>Naam *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Voor- en achternaam" />
            {errors.name && <span className="bb-err">{errors.name}</span>}
          </div>
          <div className="f">
            <label>Bedrijfsnaam</label>
            <input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Optioneel" />
          </div>
          <div className="f">
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="naam@bedrijf.nl" />
            {errors.email && <span className="bb-err">{errors.email}</span>}
          </div>
          <div className="f">
            <label>Telefoon</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="06-..." />
          </div>
          <AdresZoeker
            className="s2"
            disabled={saving}
            onSelect={({ address, postcode, city }) => setForm(f => ({ ...f, address, postcode, city }))}
          />
          <div className="f">
            <label>Adres</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="f">
            <label>Postcode</label>
            <input value={form.postcode} onChange={e => set('postcode', e.target.value)} placeholder="1234 AB" />
          </div>
          <div className="f">
            <label>Plaats</label>
            <input value={form.city} onChange={e => set('city', e.target.value)} />
          </div>
          <div className="f">
            <label>KvK-nummer</label>
            <input value={form.kvkNumber} onChange={e => set('kvkNumber', e.target.value)} placeholder="12345678" />
          </div>
          <div className="f">
            <label>BTW-nummer</label>
            <input value={form.btwNumber} onChange={e => set('btwNumber', e.target.value)} placeholder="NL123456789B01" />
          </div>
          <div className="f">
            <label>IBAN</label>
            <input value={form.iban} onChange={e => set('iban', e.target.value)} placeholder="NL00 BANK 0000 0000 00" />
          </div>
          <div className="f">
            <label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="Zakelijk">Zakelijk</option>
              <option value="Particulier">Particulier</option>
            </select>
          </div>
          <div className="f">
            <label>Bron</label>
            <input value={form.source} onChange={e => set('source', e.target.value)} placeholder="Website, aanbeveling, ..." />
          </div>
          <div className="f s2">
            <label>Notities</label>
            <NoteEditor mentions={true} value={form.notes} onChange={v => set('notes', v)} placeholder="Extra informatie… Typ @ om iemand te taggen" teamMembers={teamMembersNC} disabled={saving} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan...' : <>{I.check} Klant opslaan</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NEW LEAD / DEAL MODAL ────────────────────────────────────
export function NewLeadModal({ onClose, onSaved, customers, stages, defaultStage = '', defaultCustomerId = '' }) {
  const toast = useToast();
  const { company } = useProfile();
  // Always prefer real DB stages; only fall back to the hardcoded slug list if
  // the database has no stages at all (so the dropdown isn't empty).
  const stageOptions = (stages?.length ? stages : PIPELINE_STAGES);
  // Pick a sensible default: caller-provided → first DB stage → empty.
  // Important: never default to a slug like 'new_lead' when the DB column is a UUID.
  const initialStage = defaultStage
    || (stages?.length ? stages[0].id : '')
    || '';
  const [form, setForm] = useState({
    title: '',
    customer_id: defaultCustomerId,
    stage: initialStage,
    value: '',
    description: '',
    priority: 'med',
    newCustomerName: '',
  });
  const [createNewCust, setCreateNewCust] = useState(!defaultCustomerId && (customers?.length || 0) === 0);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [teamMembersNL, setTeamMembersNL] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { getTeamMembers().then(setTeamMembersNL).catch(() => {}); }, []);

  // A real DB stage has a UUID id. The hardcoded fallbacks (PIPELINE_STAGES)
  // use slug ids — those would fail the deals.stage_id UUID check, so we
  // recognise them and omit stage_id from the insert instead.
  const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const hasRealStages = stages?.length > 0;

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Titel is verplicht';
    if (createNewCust) {
      if (!form.newCustomerName.trim()) next.newCustomerName = 'Naam klant is verplicht';
    } else {
      if (!form.customer_id) next.customer_id = 'Kies een klant of maak een nieuwe aan';
    }
    if (hasRealStages && !form.stage) next.stage = 'Kies een fase';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let customerId = form.customer_id;
      if (createNewCust) {
        const created = await createCustomer({ name: form.newCustomerName });
        customerId = created.id;
      }
      const dealInput = {
        title: form.title,
        customer_id: customerId,
        value: form.value,
        notes: form.description,
        priority: form.priority,
      };
      // Only send stage_id when it actually looks like a DB UUID. Slug
      // fallbacks ('new_lead', etc.) are dropped so Postgres can use the
      // column default (or NULL) instead of erroring on invalid UUID.
      if (form.stage && isUuid(form.stage)) {
        dealInput.stage_id = form.stage;
      }
      const deal = await createDeal(dealInput);
      const cust = customers?.find(c => c.id === customerId);
      if (cust?.email) {
        getCompanyId().then(companyId =>
          triggerAutoEmail('aanvraag_ontvangen',
            { klant_naam: cust.name, bedrijfsnaam: company?.name || 'BossBase' },
            cust.email, companyId, 'deal', deal.id, customerId)
        );
      }
      toast.success('Nieuwe aanvraag toegevoegd');
      onSaved?.(deal);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Lead opslaan is mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe aanvraag</div>
            <div className="modal-sub">Voeg een nieuwe deal toe aan je pipeline.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Titel *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Bijv. Schilderwerk gevel" />
            {errors.title && <span className="bb-err">{errors.title}</span>}
          </div>
          <div className="f s2">
            <label>Klant *</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <button type="button" className={`tab${!createNewCust ? ' active' : ''}`} onClick={() => setCreateNewCust(false)}>Bestaande klant</button>
              <button type="button" className={`tab${createNewCust ? ' active' : ''}`} onClick={() => setCreateNewCust(true)}>Nieuwe klant</button>
            </div>
            {createNewCust ? (
              <>
                <input value={form.newCustomerName} onChange={e => set('newCustomerName', e.target.value)} placeholder="Naam nieuwe klant" />
                {errors.newCustomerName && <span className="bb-err">{errors.newCustomerName}</span>}
              </>
            ) : (
              <>
                <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
                  <option value="">Kies klant</option>
                  {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name} {c.company ? `· ${c.company}` : ''}</option>)}
                </select>
                {errors.customer_id && <span className="bb-err">{errors.customer_id}</span>}
              </>
            )}
          </div>
          <div className="f">
            <label>Pipeline fase *</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value)}>
              {stageOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {errors.stage && <span className="bb-err">{errors.stage}</span>}
          </div>
          <div className="f">
            <label>Verwachte omzet (€)</label>
            <input type="number" min="0" step="50" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" />
          </div>
          <div className="f">
            <label>Prioriteit</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="high">Hoog</option>
              <option value="med">Normaal</option>
              <option value="low">Laag</option>
            </select>
          </div>
          <div className="f s2">
            <label>Omschrijving</label>
            <NoteEditor mentions={true} value={form.description} onChange={v => set('description', v)} placeholder="Wat moet er gebeuren? Welke afspraken zijn al gemaakt? Typ @ om iemand te taggen" teamMembers={teamMembersNL} disabled={saving} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan...' : <>{I.check} Lead aanmaken</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NEW ACTIVITY MODAL ───────────────────────────────────────
export function NewActivityModal({ onClose, onSaved, customers, deals, defaultCustId = '', defaultDealId = '' }) {
  const toast = useToast();
  const { company, profile } = useProfile();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: '',
    type: 'task',
    date: today,
    time: '09:00',
    endTime: addMins('09:00', 15),
    custId: defaultCustId,
    dealId: defaultDealId,
    status: 'open',
    notes: '',
    assignedToIds: [],
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [endTimeManual, setEndTimeManual] = useState(false);
  const [notifyMail, setNotifyMail] = useState(true);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  const dealsForCust = useMemo(() => {
    if (!deals) return [];
    if (!form.custId) return deals;
    return deals.filter(d => String(d.custId) === String(form.custId));
  }, [deals, form.custId]);

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Titel is verplicht';
    if (!form.date) next.date = 'Kies een datum';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createActivity({
        title: form.title,
        type: form.type,
        status: form.status,
        notes: form.notes,
        customer_id: form.custId || null,
        deal_id: form.dealId || null,
        due_at: buildDueAt(form.date, form.time),
        end_time: form.endTime || null,
        assigned_to_ids: form.assignedToIds,
      });
      // Mention notifications in notes
      if (form.notes && profile?.id) {
        const custName = customers?.find(c => c.id === form.custId)?.name || '';
        createMentionNotifications({ text: form.notes, relatedType: 'activiteit', relatedId: created.id, link: 'activities', creatorId: profile.id, creatorName: profile.fullName, contextName: custName }).catch(() => {});
      }
      // Assignment notification naar elke toegewezen medewerker (behalve jezelf)
      notifyNewAssignees({ userIds: form.assignedToIds, members: teamMembers, sendMail: notifyMail, type: 'toewijzing_activiteit', title: `Je bent toegewezen aan ${form.title}`, body: form.date ? `Datum: ${form.date}` : undefined, link: 'activities', relatedType: 'activiteit', relatedId: created.id, creatorId: profile?.id, creatorName: profile?.fullName }).catch(() => {});
      if (form.type === 'visit' && form.custId) {
        const cust = customers?.find(c => c.id === form.custId);
        if (cust?.email) {
          const dateStr = form.date ? new Date(form.date + 'T00:00:00').toLocaleDateString('nl-NL') : '';
          getCompanyId().then(companyId =>
            triggerAutoEmail('afspraak_bevestiging',
              { klant_naam: cust.name, bedrijfsnaam: company?.name || 'BossBase', afspraak_datum: dateStr, afspraak_tijd: form.time || '' },
              cust.email, companyId, 'activity', created.id, form.custId)
          );
        }
      }
      toast.success('Activiteit toegevoegd');
      onSaved?.(created);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Activiteit opslaan is mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe activiteit</div>
            <div className="modal-sub">Plan een taak, telefoontje, e-mail of bezoek.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Titel *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Bijv. Bel klant terug" />
            {errors.title && <span className="bb-err">{errors.title}</span>}
          </div>
          <div className="f">
            <label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="call">Bellen</option>
              <option value="email">E-mail</option>
              <option value="visit">Bezoek</option>
              <option value="task">Taak</option>
              <option value="follow">Follow-up</option>
            </select>
          </div>
          <div className="f">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="open">Open</option>
              <option value="today">Vandaag</option>
              <option value="overdue">Te laat</option>
              <option value="completed">Afgerond</option>
            </select>
          </div>
          <div className="f">
            <label>Datum *</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            {errors.date && <span className="bb-err">{errors.date}</span>}
          </div>
          <div className="f">
            <label>Starttijd</label>
            <input type="time" value={form.time} onChange={e => {
              set('time', e.target.value);
              if (!endTimeManual) set('endTime', addMins(e.target.value, 15));
            }} />
          </div>
          <div className="f">
            <label>Eindtijd</label>
            <input type="time" value={form.endTime} onChange={e => {
              setEndTimeManual(true);
              set('endTime', e.target.value);
            }} />
          </div>
          <div className="f">
            <label>Klant</label>
            <select value={form.custId || ''} onChange={e => set('custId', e.target.value)}>
              <option value="">Geen klant</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {deals && (
            <div className="f">
              <label>Project</label>
              <select value={form.dealId || ''} onChange={e => set('dealId', e.target.value)}>
                <option value="">Geen project</option>
                {dealsForCust.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          )}
          {teamMembers.length > 0 && (
            <div className="f">
              <label>Toegewezen aan <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(meerdere mogelijk)</span></label>
              <MemberMultiSelect members={teamMembers} value={form.assignedToIds} onChange={ids => set('assignedToIds', ids)} />
              <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
            </div>
          )}
          <div className="f s2">
            <label>Notities</label>
            <NoteEditor mentions={true} value={form.notes} onChange={v => set('notes', v)} teamMembers={teamMembers} disabled={saving} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan...' : <>{I.check} Activiteit opslaan</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NEW CALENDAR EVENT MODAL ─────────────────────────────────
export function NewCalendarEventModal({ onClose, onSaved, customers, defaultDate = '', defaultCustId = '' }) {
  const toast = useToast();
  const today = defaultDate || new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: '',
    type: 'event',
    date: today,
    time: '09:00',
    end: '10:00',
    location: '',
    custId: defaultCustId,
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [teamMembersCE, setTeamMembersCE] = useState([]);

  useEffect(() => { getTeamMembers().then(setTeamMembersCE).catch(() => {}); }, []);
  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'time') {
        const [h, m] = v.split(':').map(Number);
        if (!Number.isNaN(h)) {
          const endH = String((h + 1) % 24).padStart(2, '0');
          next.end = `${endH}:${String(m || 0).padStart(2, '0')}`;
        }
      }
      return next;
    });
  };

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Titel is verplicht';
    if (!form.date) next.date = 'Kies een datum';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createCalendarEvent({
        title: form.title,
        type: form.type,
        date: form.date,
        time: form.time,
        end: form.end,
        custId: form.custId || null,
        notes: form.notes,
        location: form.location || null,
      });
      toast.success('Agenda-item toegevoegd');
      onSaved?.(created);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Agenda-item opslaan is mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuw agenda-item</div>
            <div className="modal-sub">Plan een afspraak, klus of opname.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Titel *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Bijv. Opname Van Dijk" />
            {errors.title && <span className="bb-err">{errors.title}</span>}
          </div>
          <div className="f">
            <label>Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="event">Afspraak</option>
              <option value="job">Klus</option>
              <option value="visit">Opname</option>
              <option value="activity">Activiteit</option>
            </select>
          </div>
          <div className="f">
            <label>Datum *</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            {errors.date && <span className="bb-err">{errors.date}</span>}
          </div>
          <div className="f">
            <label>Start</label>
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
          </div>
          <div className="f">
            <label>Einde</label>
            <input type="time" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
          </div>
          <div className="f">
            <label>Locatie</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Adres of plaats" />
          </div>
          <div className="f">
            <label>Klant</label>
            <select value={form.custId || ''} onChange={e => setForm(f => ({ ...f, custId: e.target.value }))}>
              <option value="">Geen klant</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f s2">
            <label>Notities</label>
            <NoteEditor mentions={true} value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Notities… Typ @ om iemand te taggen" teamMembers={teamMembersCE} disabled={saving} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan...' : <>{I.check} Opslaan</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NEW JOB COST MODAL ───────────────────────────────────────
export function NewJobCostModal({ onClose, onSaved, onAttached, customers, defaultCustId = '', lockCustomer = false }) {
  const toast = useToast();
  const { startUpload } = useUploads();
  const categorieen = useKostenCategorieen();

  const [form, setForm] = useState({
    customer_id: defaultCustId,
    category: '',
    cost_date: new Date().toISOString().slice(0, 10),
    project_id: '',
    werkbon_id: '',
    leverancier_id: '',
  });

  // Categorie pas invullen zodra de lijst binnen is: de standaardcategorie kan
  // per bedrijf anders heten of op inactief staan.
  useEffect(() => {
    if (!form.category && categorieen.length) {
      setForm(f => (f.category ? f : { ...f, category: standaardCategorieUit(categorieen) }));
    }
  }, [categorieen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leveranciers om uit te kiezen. Verplicht: zie validate().
  const [leverancierOpties, setLeverancierOpties] = useState([]);
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [projecten, setProjecten] = useState([]);
  useEffect(() => {
    getWerkbonnen().then(setWerkbonnen).catch(() => {});
    getProjects().then(setProjecten).catch(() => {});
    listLeveranciers({ inclusiefInactief: false }).then(setLeverancierOpties).catch(() => {});
  }, []);
  const [regels, setRegels] = useState(() => [newKostenRegel()]);
  const [bijlageFiles, setBijlageFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setRegel = (id, k, v) => setRegels(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r));
  const addRegel = () => setRegels(rs => [...rs, newKostenRegel()]);
  const removeRegel = id => setRegels(rs => rs.filter(r => r.id !== id));

  // Klant filtert de werkbon-/projectkeuze; werkbon kiezen leidt project + klant
  // automatisch af (zelfde aanpak als bij uren).
  const filteredWerkbonnen = form.customer_id
    ? werkbonnen.filter(w => w.customerId === form.customer_id)
    : werkbonnen;
  const filteredProjecten = form.customer_id
    ? projecten.filter(p => p.customerId === form.customer_id)
    : projecten;
  const onWerkbonChange = wid => setForm(f => {
    const next = { ...f, werkbon_id: wid };
    const wb = werkbonnen.find(w => w.id === wid);
    if (wb) {
      if (wb.projectId) next.project_id = wb.projectId;
      if (wb.customerId) next.customer_id = wb.customerId;
    }
    return next;
  });
  // Project kiezen → klant automatisch afleiden.
  const onProjectChange = pid => setForm(f => {
    const next = { ...f, project_id: pid };
    const p = projecten.find(x => x.id === pid);
    if (p?.customerId) next.customer_id = p.customerId;
    return next;
  });
  // Klant wisselen → project/werkbon loskoppelen als ze niet bij die klant horen.
  const onCustomerChange = cid => setForm(f => {
    const next = { ...f, customer_id: cid };
    if (cid) {
      if (f.project_id && !projecten.some(p => p.id === f.project_id && p.customerId === cid)) next.project_id = '';
      if (f.werkbon_id && !werkbonnen.some(w => w.id === f.werkbon_id && w.customerId === cid)) next.werkbon_id = '';
    }
    return next;
  });

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const addFiles = files => {
    const next = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) { toast.error(`${f.name}: bestand is te groot. Maximum is 10MB.`); continue; }
      next.push(f);
    }
    if (next.length) setBijlageFiles(prev => [...prev, ...next]);
  };
  const removeFile = idx => setBijlageFiles(prev => prev.filter((_, i) => i !== idx));

  const totalen = useMemo(() => regels.reduce((acc, r) => {
    const { excl, btw, incl } = calcBtwHelper(r.bedrag, getRegelPct(r), r.btw_mode);
    const pct = getRegelPct(r);
    acc.excl += excl;
    acc.incl += incl;
    if (pct === 21) acc.btw21 += btw;
    else if (pct === 9) acc.btw9 += btw;
    else acc.btwOverig += btw;
    return acc;
  }, { excl: 0, incl: 0, btw21: 0, btw9: 0, btwOverig: 0 }), [regels]);

  const validate = () => {
    const next = {};
    if (!form.cost_date) next.cost_date = 'Kies een datum';
    // Verplicht: zonder leverancier kan de kost niet naar de boekhouding.
    if (!form.leverancier_id) next.leverancier_id = 'Kies een leverancier';
    // Idem voor het bewijsstuk. Reiskosten zijn uitgezonderd: een
    // kilometervergoeding heeft geen factuur.
    if (bonVerplichtUit(categorieen, form.category) && bijlageFiles.length === 0) next.bijlage = BON_VERPLICHT_MELDING;
    regels.forEach((r, i) => {
      if (!r.omschrijving.trim()) next[`r${i}o`] = true;
      if (!r.bedrag || Number(r.bedrag) <= 0) next[`r${i}b`] = true;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);

    // 1. Sla de kostenregels DIRECT op (zonder bijlage) zodat het item meteen
    //    in de lijst verschijnt en de modal kan sluiten.
    const companyId = await getCompanyId();
    const header = {
      category: form.category,
      cost_date: form.cost_date,
      leverancier_id: form.leverancier_id || null,
      bijlage_url: null,
      klant_type: form.customer_id ? 'klant' : 'algemeen',
      customer_id: form.customer_id || null,
      project_id: form.project_id || null,
      werkbon_id: form.werkbon_id || null,
    };
    let created;
    try {
      created = await Promise.all(
        regels.map(r => {
          const pct = getRegelPct(r);
          const { excl } = calcBtwHelper(r.bedrag, pct, r.btw_mode);
          // amount = exclusief BTW; btw_percentage apart opgeslagen (incl./btw afgeleid).
          return createJobCost({ ...header, amount: excl, btw_percentage: pct, btw_inclusief: false, description: r.omschrijving });
        })
      );
    } catch (err) {
      toast.error(err.message || 'Kosten opslaan is mislukt');
      setSaving(false);
      return;
    }

    toast.success(regels.length > 1 ? `${regels.length} kostenregels toegevoegd` : 'Kosten toegevoegd');
    onSaved?.(created[0]);

    // 2. Bijlage(n) op de ACHTERGROND uploaden + koppelen via de globale
    //    upload-indicator. De gebruiker kan meteen doorwerken.
    const files = bijlageFiles;
    if (files.length) {
      const label = files.length === 1 ? files[0].name : `${files.length} bijlagen`;
      startUpload(label, async () => {
        const paths = await Promise.all(files.map(async (file) => {
          const prepared = await compressImage(file);
          const ext = (prepared.name || file.name).split('.').pop();
          const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error } = await supabase.storage.from('kosten-bijlagen').upload(path, prepared);
          if (error) throw error;
          return path;
        }));
        const bijlage_url = JSON.stringify(paths);
        const updated = await Promise.all(created.map(c => updateJobCost(c.id, { bijlage_url })));
        onAttached?.(updated[0]); // stil de lijst bijwerken met de gekoppelde bijlage
      }, files.length);
    }

    onClose();
  };

  const inputStyle = (hasErr) => ({
    background: 'white',
    border: `1px solid ${hasErr ? '#dc2626' : 'var(--border)'}`,
    borderRadius: 'var(--r8)',
    padding: '6px 10px',
    fontSize: '.84rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  });

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Kosten toevoegen</div>
            <div className="modal-sub">Houd materiaal, arbeid en reiskosten per klus bij.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        {/* Header velden */}
        <div className="fg">
          <div className="f">
            <label>Klant</label>
            <select
              value={form.customer_id}
              onChange={e => onCustomerChange(e.target.value)}
              disabled={lockCustomer || Boolean(defaultCustId)}
            >
              <option value="">Algemeen</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Project <span style={{ color: 'var(--dl)', fontWeight: 400 }}>(optioneel)</span></label>
            <select value={form.project_id} onChange={e => onProjectChange(e.target.value)}>
              <option value="">Geen project</option>
              {filteredProjecten.map(p => <option key={p.id} value={p.id}>{p.name || 'Project'}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Werkbon <span style={{ color: 'var(--dl)', fontWeight: 400 }}>(optioneel)</span></label>
            <select value={form.werkbon_id} onChange={e => onWerkbonChange(e.target.value)}>
              <option value="">Geen werkbon</option>
              {filteredWerkbonnen.map(w => <option key={w.id} value={w.id}>{w.titel || 'Werkbon'}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Categorie</label>
            <select value={form.category} onChange={e => setField('category', e.target.value)}>
              {categorieOptiesUit(categorieen, form.category).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Leverancier *</label>
            <LeverancierSelect
              value={form.leverancier_id}
              onChange={v => setField('leverancier_id', v)}
              leveranciers={leverancierOpties}
              onLijstGewijzigd={g => setLeverancierOpties(l => [...l, g].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))}
              verplicht
              fout={Boolean(errors.leverancier_id)}
            />
            {errors.leverancier_id && <span className="bb-err">{errors.leverancier_id}</span>}
          </div>
          <div className="f s2">
            <label>Datum *</label>
            <input type="date" value={form.cost_date} onChange={e => setField('cost_date', e.target.value)} />
            {errors.cost_date && <span className="bb-err">{errors.cost_date}</span>}
          </div>
        </div>

        {/* Kostenregels */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Kostenregels
          </div>

          {regels.map((r, idx) => {
            const pct = getRegelPct(r);
            const { excl, btw, incl } = calcBtwHelper(r.bedrag, pct, r.btw_mode);
            const hasVal = Number(r.bedrag) > 0;
            const errO = !!errors[`r${idx}o`];
            const errB = !!errors[`r${idx}b`];
            return (
              <div key={r.id} style={{ background: 'var(--bgs)', borderRadius: 'var(--r8)', padding: '10px 12px', marginBottom: 6 }}>
                {/* Rij 1: omschrijving + bedrag + delete */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 7, alignItems: 'center' }}>
                  <input
                    value={r.omschrijving}
                    onChange={e => setRegel(r.id, 'omschrijving', e.target.value)}
                    placeholder="Omschrijving"
                    style={{ ...inputStyle(errO), flex: 1 }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.bedrag}
                    onChange={e => setRegel(r.id, 'bedrag', e.target.value)}
                    placeholder="0.00"
                    style={{ ...inputStyle(errB), width: 100, flexShrink: 0 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeRegel(r.id)}
                    disabled={regels.length === 1}
                    style={{ padding: '5px 8px', flexShrink: 0 }}
                    title="Regel verwijderen"
                  >
                    {I.trash}
                  </button>
                </div>

                {/* Rij 2: toggle + BTW% + berekend */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="tabs" style={{ gap: 2, flexShrink: 0 }}>
                    {[['excl', 'Excl. BTW'], ['incl', 'Incl. BTW']].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        className={`tab${r.btw_mode === mode ? ' active' : ''}`}
                        style={{ fontSize: '.72rem', padding: '3px 8px' }}
                        onClick={() => setRegel(r.id, 'btw_mode', mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <select
                    value={r.btw_pct}
                    onChange={e => setRegel(r.id, 'btw_pct', e.target.value === 'anders' ? 'anders' : Number(e.target.value))}
                    style={{ fontSize: '.78rem', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, background: 'white', outline: 'none', flexShrink: 0 }}
                  >
                    <option value={21}>21%</option>
                    <option value={9}>9%</option>
                    <option value={0}>Geen btw (0%)</option>
                  </select>

                  {hasVal && (
                    <div style={{ marginLeft: 'auto', fontSize: '.74rem', color: 'var(--dmu)', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span>Excl: <strong style={{ color: 'var(--dm)' }}>{fmt(excl)}</strong></span>
                      {btw !== 0 && <span>BTW: <strong style={{ color: 'var(--dm)' }}>{fmt(btw)}</strong></span>}
                      <span>Incl: <strong style={{ color: 'var(--dk)', fontSize: '.78rem' }}>{fmt(incl)}</strong></span>
                    </div>
                  )}
                </div>

                {(errO || errB) && (
                  <div style={{ fontSize: '.72rem', color: '#dc2626', marginTop: 5 }}>
                    {errO ? 'Omschrijving is verplicht' : 'Voer een geldig bedrag in'}
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" className="btn btn-s btn-sm" style={{ marginTop: 4 }} onClick={addRegel}>
            {I.plus} Regel toevoegen
          </button>
        </div>

        {/* Totalen */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 10 }}>
          {[
            { label: 'Totaal excl. BTW', val: totalen.excl, main: false },
            ...(totalen.btw21 > 0.005   ? [{ label: 'BTW 21%',     val: totalen.btw21,     main: false }] : []),
            ...(totalen.btw9 > 0.005    ? [{ label: 'BTW 9%',      val: totalen.btw9,      main: false }] : []),
            ...(totalen.btwOverig > 0.005 ? [{ label: 'Overige BTW', val: totalen.btwOverig, main: false }] : []),
            { label: 'Totaal incl. BTW', val: totalen.incl, main: true },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: row.main ? '.9rem' : '.82rem' }}>
              <span style={{ color: row.main ? 'var(--dk)' : 'var(--dmu)', fontWeight: row.main ? 700 : 400 }}>{row.label}</span>
              <span style={{ fontWeight: row.main ? 800 : 600 }}>{fmt(row.val)}</span>
            </div>
          ))}
        </div>

        {/* Bijlagen */}
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--dk)', marginBottom: 6, display: 'block' }}>
            Factuur of bon{bonVerplichtUit(categorieen, form.category) ? ' *' : ''}
          </label>
          <div
            style={{
              border: `2px dashed ${errors.bijlage ? 'var(--rd)' : dragOver ? 'var(--p)' : 'var(--border)'}`,
              borderRadius: 'var(--r8)',
              padding: '18px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'var(--bgs)' : 'transparent',
              transition: 'border-color .15s, background .15s',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
          >
            <div style={{ color: 'var(--dl)', marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div style={{ fontSize: '.82rem', color: 'var(--dk)', fontWeight: 500 }}>Sleep bestand hierheen of klik om te uploaden</div>
            <div style={{ fontSize: '.74rem', color: 'var(--dl)', marginTop: 3 }}>JPG, PNG of PDF · Max 10MB per bestand</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = ''; }}
          />
          {errors.bijlage && (
            <div style={{ fontSize: '.76rem', lineHeight: 1.4, color: 'var(--rd)', marginTop: 6 }}>{errors.bijlage}</div>
          )}
          {bijlageFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {bijlageFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 8px 3px 10px', fontSize: '.76rem' }}>
                  <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--dl)', fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fa">
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan...' : <>{I.check} Kosten opslaan</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ACTIVITY EDIT MODAL ──────────────────────────────────────
export function ActivityEditModal({ activity, customers, deals, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const { profile } = useProfile();
  const role = profile?.role || 'medewerker';
  const canEdit = role === 'admin' || role === 'planner';
  const [teamMembers, setTeamMembers] = useState([]);
  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  // Notitielogboek van deze activiteit (losse rijen in activiteit_notities).
  const [activiteitNotities, setActiviteitNotities] = useState([]);
  useEffect(() => {
    if (!activity?.id) { setActiviteitNotities([]); return; }
    let alive = true;
    getActiviteitNotities(activity.id)
      .then(rows => { if (alive) setActiviteitNotities(rows); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activity?.id]);

  // NotitieLog beheert veld + opslaan-status en toont de foutmelding.
  const handleAddNotitie = async text => {
    const created = await addActiviteitNotitie(activity.id, text);
    setActiviteitNotities(list => [created, ...list]);
    toast.success('Notitie opgeslagen');
  };

  // Google Calendar per-activity sync state (read-only display + manual retry).
  const [gStatus, setGStatus] = useState(activity?.googleSyncStatus || 'not_synced');
  const [gErr, setGErr] = useState(activity?.googleSyncError || '');
  const [gBusy, setGBusy] = useState(false);
  const retryGoogleSync = async () => {
    setGBusy(true);
    try {
      const r = await syncActivity(activity.id); // manual: auto=false
      if (r?.ok || r?.skipped) { setGStatus(r.ok ? 'synced' : gStatus); setGErr(''); if (r.ok) toast.success('Gesynchroniseerd met Google Agenda'); }
      else { setGStatus('error'); setGErr(r?.error || 'Onbekende fout'); toast.error('Sync mislukt'); }
    } catch (e) {
      setGStatus('error'); setGErr(e.message || 'Sync mislukt'); toast.error('Sync mislukt');
    } finally { setGBusy(false); }
  };

  const [form, setForm] = useState({
    title: activity?.title || '',
    type: activity?.type || 'task',
    date: activity?.date || '',
    time: activity?.time || '',
    endTime: activity?.endTime || '',
    custId: activity?.custId || '',
    dealId: activity?.dealId || '',
    status: activity?.completed ? 'completed' : (activity?.status === 'completed' || activity?.status === 'done' ? 'completed' : 'open'),
    priority: 'med',
    notes: activity?.notes || '',
    assignedToIds: activity?.assignedToIds || (activity?.assignee ? [activity.assignee] : []),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [endTimeManual, setEndTimeManual] = useState(!!activity?.endTime);
  const [notifyMail, setNotifyMail] = useState(true);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isDone = form.status === 'completed' || form.status === 'done';

  const dealsForCust = useMemo(() => {
    if (!deals) return [];
    if (!form.custId) return deals;
    return deals.filter(d => String(d.custId) === String(form.custId));
  }, [deals, form.custId]);

  const isRlsError = err => err?.code === '42501' || String(err?.message).toLowerCase().includes('security policy');

  const handleSave = async () => {
    if (!canEdit) return;
    if (!form.title.trim()) { toast.error('Titel is verplicht'); return; }
    setSaving(true);
    try {
      const updated = await updateActivity(activity.id, {
        title: form.title,
        type: form.type,
        customer_id: form.custId || null,
        deal_id: form.dealId || null,
        due_at: buildDueAt(form.date, form.time),
        end_time: form.endTime || null,
        status: form.status,
        notes: form.notes,
        assigned_to_ids: form.assignedToIds,
      });
      if (form.notes && profile?.id) {
        const custName = customers?.find(c => c.id === form.custId)?.name || '';
        createMentionNotifications({ text: form.notes, relatedType: 'activiteit', relatedId: activity.id, link: 'activities', creatorId: profile.id, creatorName: profile.fullName, contextName: custName }).catch(() => {});
      }
      // Notificatie naar nieuw toegevoegde toegewezen medewerkers (behalve jezelf).
      const prevIds = activity?.assignedToIds || (activity?.assignee ? [activity.assignee] : []);
      notifyNewAssignees({ userIds: form.assignedToIds, prevUserIds: prevIds, members: teamMembers, sendMail: notifyMail, type: 'toewijzing_activiteit', title: `Je bent toegewezen aan ${form.title}`, body: form.date ? `Datum: ${form.date}` : undefined, link: 'activities', relatedType: 'activiteit', relatedId: activity.id, creatorId: profile?.id, creatorName: profile?.fullName }).catch(() => {});
      toast.success('Activiteit bijgewerkt');
      onSaved?.(updated);
      onClose();
    } catch (err) {
      toast.error(isRlsError(err) ? 'Je hebt geen rechten om deze activiteit te bewerken' : (err.message || 'Opslaan mislukt'));
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const updated = await updateActivity(activity.id, { status: 'completed' });
      toast.success('Activiteit afgerond');
      onSaved?.(updated);
      onClose();
    } catch (err) {
      toast.error(isRlsError(err) ? 'Je hebt geen rechten om deze activiteit bij te werken' : (err.message || 'Bijwerken mislukt'));
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    setSaving(true);
    try {
      const updated = await updateActivity(activity.id, { status: 'open' });
      toast.success('Activiteit heropend');
      onSaved?.(updated);
      onClose();
    } catch (err) {
      toast.error(isRlsError(err) ? 'Je hebt geen rechten om deze activiteit te heropenen' : (err.message || 'Bijwerken mislukt'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit) return;
    if (!window.confirm('Activiteit verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    setDeleting(true);
    try {
      await deleteActivity(activity.id);
      toast.success('Activiteit verwijderd');
      onDeleted?.(activity.id);
      onClose();
    } catch (err) {
      toast.error(isRlsError(err) ? 'Je hebt geen rechten om deze activiteit te verwijderen' : (err.message || 'Verwijderen mislukt'));
    } finally {
      setDeleting(false);
    }
  };

  const busy = saving || deleting;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Activiteit bewerken</div>
            <div className="modal-sub">{activity?.customerName ? `Klant: ${activity.customerName}` : 'Wijzigingen worden opgeslagen in Supabase.'}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Titel</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} disabled={!canEdit || busy} />
          </div>
          <div className="f">
            <label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} disabled={!canEdit || busy}>
              <option value="call">Bellen</option>
              <option value="email">E-mail</option>
              <option value="visit">Bezoek</option>
              <option value="task">Taak</option>
              <option value="follow">Follow-up</option>
            </select>
          </div>
          <div className="f">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} disabled={!canEdit || busy}>
              <option value="open">Open</option>
              <option value="completed">Afgerond</option>
            </select>
          </div>
          <div className="f">
            <label>Datum</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} disabled={!canEdit || busy} />
          </div>
          <div className="f">
            <label>Starttijd</label>
            <input type="time" value={form.time} onChange={e => {
              set('time', e.target.value);
              if (!endTimeManual) set('endTime', addMins(e.target.value, 15));
            }} disabled={!canEdit || busy} />
          </div>
          <div className="f">
            <label>Eindtijd</label>
            <input type="time" value={form.endTime} onChange={e => {
              setEndTimeManual(true);
              set('endTime', e.target.value);
            }} disabled={!canEdit || busy} />
          </div>
          <div className="f">
            <label>Klant</label>
            <select value={form.custId || ''} onChange={e => set('custId', e.target.value)} disabled={!canEdit || busy}>
              <option value="">Geen klant</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {deals && (
            <div className="f">
              <label>Project</label>
              <select value={form.dealId || ''} onChange={e => set('dealId', e.target.value)} disabled={!canEdit || busy}>
                <option value="">Geen project</option>
                {dealsForCust.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          )}
          {teamMembers.length > 0 && (
            <div className="f">
              <label>Toegewezen aan <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(meerdere mogelijk)</span></label>
              <MemberMultiSelect members={teamMembers} value={form.assignedToIds} onChange={ids => set('assignedToIds', ids)} disabled={!canEdit || busy} />
              <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
            </div>
          )}
          <div className="f">
            <label>Prioriteit <span style={{ fontSize: '.7rem', color: 'var(--dl)', fontWeight: 400 }}>(alleen weergave)</span></label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)} disabled={busy}>
              <option value="high">Hoog</option>
              <option value="med">Normaal</option>
              <option value="low">Laag</option>
            </select>
          </div>
          {/* Google Agenda-sync tijdelijk verborgen voor klanten (OAuth nog niet geconfigureerd). Zet {false} op {true} om terug te zetten. Logica hieronder blijft intact. */}
          {false && activity?.dueAt && (
            <div className="f s2" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.78rem', color: 'var(--dmu)' }}>Google Agenda:</span>
              {gBusy
                ? <span className="badge b-gray">Wachten op sync…</span>
                : gStatus === 'synced'
                  ? <span className="badge b-green">Gesynchroniseerd</span>
                  : gStatus === 'error'
                    ? <span className="badge b-red">Sync-fout</span>
                    : <span className="badge b-gray">Niet gesynchroniseerd</span>}
              {gStatus === 'error' && !gBusy && (
                <>
                  <button className="btn btn-s btn-xs" onClick={retryGoogleSync}>Opnieuw synchroniseren</button>
                  {gErr && <span style={{ fontSize: '.72rem', color: '#dc2626' }}>{gErr}</span>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Notities als eigen logboek — zelfde gedrag als de klantkaart, niet
            langer één veld in het formulier dat overschreven wordt. */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 10 }}>Notities</div>
          {canEdit ? (
            <NotitieLog
              items={activiteitNotities.map(n => toLogItem({
                id: n.id, body: n.note, authorName: n.authorName || 'Onbekend', createdAt: n.createdAt,
              }))}
              onAdd={handleAddNotitie}
              teamMembers={teamMembers}
              disabled={busy}
            />
          ) : activiteitNotities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: '.84rem' }}>Nog geen notities</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activiteitNotities.map(n => (
                <div key={n.id} className="card card-p" style={{ padding: '12px 16px' }}>
                  <div className="bb-notitie-content" style={{ fontSize: '.85rem', color: 'var(--dk)', lineHeight: 1.6, wordBreak: 'break-word' }}>{renderNote(n.note)}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 6, fontWeight: 600 }}>
                    {(n.authorName || 'Onbekend')} · {fmtNotitieDatum(n.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fa">
          {canEdit && <button className="btn btn-ghost" onClick={handleDelete} disabled={busy}>{I.trash} Verwijderen</button>}
          <button className="btn btn-s" onClick={onClose} disabled={busy}>Annuleren</button>
          {isDone
            ? <button className="btn btn-s" onClick={handleReopen} disabled={busy}>{I.check} Heropenen</button>
            : <button className="btn btn-s" onClick={handleComplete} disabled={busy}>{I.check} Markeer afgerond</button>
          }
          {canEdit && (
            <button className="btn btn-p" onClick={handleSave} disabled={busy}>
              {saving ? 'Opslaan...' : <>{I.check} Opslaan</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PROFILE MODAL ────────────────────────────────────────────
export function ProfileModal({ onClose, profile, company, user, onSaved, onLogout, onOpenInstellingen }) {
  const toast = useToast();
  const [name, setName] = useState(profile?.fullName || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(profile?.fullName || ''); }, [profile?.fullName]);

  const submit = async () => {
    if (!profile?.id) {
      toast.error('Profiel kon niet worden geladen');
      return;
    }
    if (!name.trim()) {
      toast.error('Naam mag niet leeg zijn');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile(profile.id, { full_name: name.trim() });
      toast.success('Profiel bijgewerkt');
      onSaved?.(updated);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Profiel opslaan is mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Mijn profiel</div>
            <div className="modal-sub">Beheer je persoonlijke gegevens.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg" style={{ gridTemplateColumns: '1fr' }}>
          <div className="f">
            <label>Naam</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Voor- en achternaam" />
          </div>
          <div className="f">
            <label>E-mail</label>
            <input value={profile?.email || user?.email || ''} disabled />
          </div>
          <div className="f">
            <label>Bedrijf</label>
            <input value={company?.name || ''} disabled />
          </div>
          <div className="f">
            <label>Rol</label>
            <input value={profile?.role || 'user'} disabled />
          </div>
        </div>
        {onOpenInstellingen && (
          <button type="button" className="bb-profile-link" onClick={onOpenInstellingen}>
            {I.settings} Naar bedrijfsinstellingen
          </button>
        )}
        <div className="fa">
          {onLogout && <button className="btn btn-ghost" onClick={onLogout} disabled={saving}>{I.logout} Uitloggen</button>}
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Sluiten</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan...' : <>{I.check} Opslaan</>}
          </button>
        </div>
      </div>
    </div>
  );
}
