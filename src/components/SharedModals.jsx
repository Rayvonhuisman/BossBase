import { useEffect, useMemo, useState } from 'react';
import { I, ModalX, PIPELINE_STAGES } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { createCustomer } from '../services/customerService.js';
import { createDeal } from '../services/dealService.js';
import { createActivity, updateActivity, deleteActivity, buildDueAt } from '../services/activityService.js';
import { useProfile } from '../lib/profileContext.jsx';
import { createCalendarEvent } from '../services/calendarService.js';
import { createJobCost } from '../services/jobCostService.js';
import { updateProfile } from '../services/profileService.js';

const isEmail = v => !v || /^\S+@\S+\.\S+$/.test(v);

// Customer form keeps friendly UI fields. customerService.mapCustomerFormToPayload
// strips anything Supabase doesn't actually have (source, type, company_name).

// ── NEW CUSTOMER MODAL ───────────────────────────────────────
export function NewCustomerModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', company: '', email: '', phone: '', city: '', address: '',
    type: 'Zakelijk', source: 'Handmatig', notes: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
          <div className="f">
            <label>Adres</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="f">
            <label>Plaats</label>
            <input value={form.city} onChange={e => set('city', e.target.value)} />
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
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Extra informatie..." />
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
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
      toast.success('Nieuwe lead toegevoegd');
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
            <div className="modal-title">Nieuwe lead</div>
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
                  <option value="">— Kies klant —</option>
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
            <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Wat moet er gebeuren? Welke afspraken zijn al gemaakt?" />
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
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: '',
    type: 'task',
    date: today,
    time: '09:00',
    custId: defaultCustId,
    dealId: defaultDealId,
    status: 'open',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
      });
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
            <label>Tijd</label>
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
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
              <label>Deal</label>
              <select value={form.dealId || ''} onChange={e => set('dealId', e.target.value)}>
                <option value="">Geen deal</option>
                {dealsForCust.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          )}
          <div className="f s2">
            <label>Notities</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
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
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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
export function NewJobCostModal({ onClose, onSaved, customers, deals, defaultCustId = '', defaultDealId = '' }) {
  const toast = useToast();
  const [form, setForm] = useState({
    customer_id: defaultCustId,
    deal_id: defaultDealId,
    category: 'materiaal',
    description: '',
    amount: '',
    cost_date: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const dealsForCust = useMemo(() => {
    if (!deals) return [];
    if (!form.customer_id) return deals;
    return deals.filter(d => String(d.custId) === String(form.customer_id));
  }, [deals, form.customer_id]);

  const validate = () => {
    const next = {};
    if (!form.description.trim()) next.description = 'Omschrijving is verplicht';
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) next.amount = 'Voer een geldig bedrag in';
    if (!form.cost_date) next.cost_date = 'Kies een datum';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createJobCost({
        amount: Number(form.amount),
        description: form.description,
        category: form.category,
        cost_date: form.cost_date,
        customer_id: form.customer_id || null,
        deal_id: form.deal_id || null,
      });
      toast.success('Kosten toegevoegd');
      onSaved?.(created);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Kosten opslaan is mislukt');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="fg">
          <div className="f">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">Geen klant</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Deal / klus</label>
            <select value={form.deal_id} onChange={e => set('deal_id', e.target.value)}>
              <option value="">Geen deal</option>
              {dealsForCust.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Categorie</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="materiaal">Materiaal</option>
              <option value="arbeid">Arbeid</option>
              <option value="reiskosten">Reiskosten</option>
              <option value="onderaannemer">Onderaannemer</option>
              <option value="overig">Overig</option>
            </select>
          </div>
          <div className="f">
            <label>Bedrag (€) *</label>
            <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
            {errors.amount && <span className="bb-err">{errors.amount}</span>}
          </div>
          <div className="f">
            <label>Datum *</label>
            <input type="date" value={form.cost_date} onChange={e => set('cost_date', e.target.value)} />
            {errors.cost_date && <span className="bb-err">{errors.cost_date}</span>}
          </div>
          <div className="f s2">
            <label>Omschrijving *</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Bijv. Verf + primers" />
            {errors.description && <span className="bb-err">{errors.description}</span>}
          </div>
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

  const [form, setForm] = useState({
    title: activity?.title || '',
    type: activity?.type || 'task',
    date: activity?.date || '',
    time: activity?.time || '',
    custId: activity?.custId || '',
    dealId: activity?.dealId || '',
    status: activity?.completed ? 'completed' : (activity?.status === 'completed' || activity?.status === 'done' ? 'completed' : 'open'),
    priority: 'med',
    notes: activity?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
        status: form.status,
        notes: form.notes,
      });
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
            <label>Tijd</label>
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} disabled={!canEdit || busy} />
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
              <label>Deal</label>
              <select value={form.dealId || ''} onChange={e => set('dealId', e.target.value)} disabled={!canEdit || busy}>
                <option value="">Geen deal</option>
                {dealsForCust.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
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
          <div className="f s2">
            <label>Notities</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} disabled={!canEdit || busy} />
          </div>
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
export function ProfileModal({ onClose, profile, company, user, onSaved, onLogout }) {
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
            <input value={company?.name || '—'} disabled />
          </div>
          <div className="f">
            <label>Rol</label>
            <input value={profile?.role || 'user'} disabled />
          </div>
        </div>
        <div className="bb-profile-note">Bedrijfsinstellingen volgen in een latere release.</div>
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
