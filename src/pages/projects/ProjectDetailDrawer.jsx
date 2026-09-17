import { useEffect, useMemo, useRef, useState } from 'react';
import { listLeveranciers } from '../../services/leverancierService.js';
import LeverancierSelect from '../../components/LeverancierSelect.jsx';
import { Maximize2, Minimize2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { I, ModalX, NotifyMailToggle, fmt, fmt0 } from '../../bb-shared.jsx';
import { useToast } from '../../lib/toast.jsx';
import { useProfile } from '../../lib/profileContext.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { usePlanGuard } from '../../components/PlanUpgradeModal.jsx';
import {
  getProjectById,
  updateProject,
  deleteProject,
  getTimeEntries,
  getProjectNotes,
  addProjectNote,
  deleteProjectNote,
  getProjectInvoices,
  enrichProject,
  PROJECT_STATUS,
} from '../../services/projectsService.js';
import { getWerkbonnenByProject } from '../../services/werkbonService.js';
import { planningLabel } from '../../utils/werkbonDagen.js';
import { getProjectCosts, inkoopwaardeVanKosten, isWerkbonMateriaal } from '../../services/jobCostService.js';
import {
  listProjectKosten, createProjectKost, updateProjectKost, deleteProjectKost,
} from '../../services/projectKostenService.js';
import { NewFactuurModal, SendFactuurMailModal } from '../FacturenPage.jsx';
import { NewOfferteModal, SendOfferteMailModal } from '../OffertesPage.jsx';
import { WerkbonModal } from '../WerkbonPageV2.jsx';
import NotitieLog, { toLogItem } from '../../components/NotitieLog.jsx';
import { getTeamMembers, notifyNewAssignees, createMentionNotifications } from '../../services/notificatieService.js';
import { statusInfo } from '../../utils/statusColors.js';

const TABS = [
  { id: 'overview',   label: 'Overzicht' },
  { id: 'offerte',    label: 'Offertes' },
  { id: 'facturen',   label: 'Facturen' },
  { id: 'uren',       label: 'Uren' },
  { id: 'kosten',     label: 'Kosten' },
  { id: 'werkbonnen', label: 'Werkbonnen' },
  { id: 'notes',      label: 'Notities' },
];

const fmtDate = d => {
  if (!d) return '';
  const [y, m, day] = String(d).split('-');
  if (!day) return d;
  return `${day}-${m}-${y}`;
};
const fmtHours = h => `${Number(h || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}u`;

const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 };

function StatusBadge({ status }) {
  const s = statusInfo(status, 'project');
  return <span className={s.className}>{s.label}</span>;
}


// ── HEADER ───────────────────────────────────────────────────────────────────

function DrawerHeader({ project, onClose, fullscreen, onToggleFullscreen }) {
  return (
    <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'flex-start', gap: 12, position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
      <button
        className="btn-icon"
        style={{ flexShrink: 0, marginTop: 2, color: 'var(--dl)' }}
        onClick={onToggleFullscreen}
        title={fullscreen ? 'Kleiner weergeven' : 'Volledig scherm'}
      >
        {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dk)', letterSpacing: '-.01em', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{project.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <StatusBadge status={project.status} />
          {project.customerName && (
            <span style={{ fontSize: 12, color: 'var(--dl)' }}>· {project.customerName}</span>
          )}
        </div>
      </div>
      <ModalX onClose={onClose} />
    </div>
  );
}

// Welke tabs mag deze gebruiker zien? Dezelfde rechten en pakket-eisen als de
// losse pagina's in de zijbalk. Zonder dit was de projectkaart een achterdeur:
// kosten, marge, facturen, offertes en werkbonnen waren er te zien én te
// bewerken zonder het recht en zonder het pakket dat ervoor bedoeld is.
function zichtbareTabs(can, plan) {
  const mag = {
    overview:   true,
    notes:      true,
    uren:       true,                                        // eigen uren zien mag iedereen
    offerte:    can('offertes'),
    facturen:   can('facturen'),
    kosten:     can('kosten') && plan.has('kosten_nacalculatie'),
    werkbonnen: plan.has('werkbonnen'),
  };
  return TABS.filter(t => mag[t.id] !== false);
}

function Tabs({ tab, setTab, tabs = TABS }) {
  return (
    <div className="tabs kk-tabs" style={{ padding: '8px 16px', borderBottom: '1px solid var(--br)' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          className={`tab${tab === t.id ? ' active' : ''}`}
          onClick={() => setTab(t.id)}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ── OVERVIEW TAB ─────────────────────────────────────────────────────────────

function OverviewTab({ project, customers, openCustomer, onSave, canManage }) {
  const toast = useToast();
  const { profile } = useProfile();
  // Bedragen op projecten horen achter 'projectbedragen'. Dat recht bestond al
  // en beloofde dit ook, maar werd op de projectschermen nergens toegepast.
  const { can } = usePermissions();
  const magBedragen = can('projectbedragen');
  const [teamMembers, setTeamMembers] = useState([]);
  const [form, setForm] = useState({
    name: project.name || '',
    status: project.status || 'concept',
    project_value: project.projectValue || 0,
    quoted_hours: project.quotedHours || 0,
    start_date: project.startDate || '',
    deadline: project.deadline || '',
    description: project.description || '',
    customer_id: project.customerId || '',
    assigned_to: project.assignedTo || '',
  });
  const [saving, setSaving] = useState(false);
  const [notifyMail, setNotifyMail] = useState(true);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  useEffect(() => {
    setForm({
      name: project.name || '',
      status: project.status || 'concept',
      project_value: project.projectValue || 0,
      quoted_hours: project.quotedHours || 0,
      start_date: project.startDate || '',
      deadline: project.deadline || '',
      description: project.description || '',
      customer_id: project.customerId || '',
      assigned_to: project.assignedTo || '',
    });
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const prevAssigned = project.assignedTo || '';
      await onSave({
        name: form.name.trim() || project.name,
        status: form.status,
        project_value: Number(form.project_value || 0),
        quoted_hours: Number(form.quoted_hours || 0),
        start_date: form.start_date || null,
        deadline: form.deadline || null,
        description: form.description,
        customer_id: form.customer_id || null,
        assigned_to: form.assigned_to || null,
      });
      notifyNewAssignees({ userIds: form.assigned_to ? [form.assigned_to] : [], prevUserIds: prevAssigned ? [prevAssigned] : [], members: teamMembers, sendMail: notifyMail, type: 'toewijzing_project', title: `Je bent toegewezen aan ${form.name.trim() || project.name}`, link: 'projecten', relatedType: 'project', relatedId: project.id, creatorId: profile?.id, creatorName: profile?.fullName }).catch(() => {});
      toast.success('Project opgeslagen');
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = project.deadline && project.deadline < new Date().toISOString().slice(0, 10) && project.status !== 'afgerond';

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18, overflow: 'hidden' }}>
      {/* Projectcontrole card */}
      <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', marginBottom: 10 }}>
          Projectcontrole
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div>
            <div style={labelStyle}>Urenstatus</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {fmtHours(project.usedHours)} van {fmtHours(project.quotedHours)}
              {project.quotedHours > 0 && (
                <span style={{ color: (project.hoursPercentage || 0) > 1 ? '#dc2626' : (project.hoursPercentage || 0) >= 0.8 ? '#f59e0b' : 'var(--dl)', marginLeft: 6, fontSize: 12 }}>
                  ({Math.round((project.hoursPercentage || 0) * 100)}%)
                </span>
              )}
            </div>
          </div>
          {/* Bedragen achter 'projectbedragen'. Urenstatus en deadline blijven
              staan: een monteur mag zien hoe ver de klus is, alleen niet wat
              hij opbrengt. */}
          {magBedragen && (
          <div>
            <div style={labelStyle}>Budget</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{fmt0(project.projectValue)}</div>
          </div>
          )}
          {magBedragen && (
          <div>
            <div style={labelStyle}>Gefactureerd</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {fmt0(project.invoicedAmount)}
              {project.remainingToInvoice > 0 && (
                <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 6 }}>nog {fmt0(project.remainingToInvoice)}</span>
              )}
            </div>
          </div>
          )}
          <div>
            <div style={labelStyle}>Deadline</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: isOverdue ? '#dc2626' : 'inherit' }}>
              {fmtDate(project.deadline)}
              {isOverdue && <span style={{ fontSize: 11, marginLeft: 6 }}>verlopen</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="f" style={{ gridColumn: '1 / -1' }}>
          <label>Projectnaam</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Status</label>
          {/* Afgeleid uit de werkbonnen, niet zelf te kiezen: in uitvoering
              zodra er één gestart is, afgerond als ze allemaal klaar zijn. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38 }}>
            <span className={`badge ${PROJECT_STATUS[form.status]?.col || 'b-gray'}`}>
              {PROJECT_STATUS[form.status]?.label || form.status}
            </span>
            <span style={{ fontSize: '.72rem', color: 'var(--dl)' }}>volgt de werkbonnen</span>
          </div>
        </div>
        <div className="f">
          <label>Klant</label>
          <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} disabled={!canManage}>
            <option value="">— Geen —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {magBedragen && (
          <div className="f">
            <label>Projectwaarde</label>
            <input type="number" min="0" step="0.01" value={form.project_value} onChange={e => set('project_value', e.target.value)} disabled={!canManage} />
          </div>
        )}
        <div className="f">
          <label>Begrote uren</label>
          <input type="number" min="0" step="0.5" value={form.quoted_hours} onChange={e => set('quoted_hours', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Startdatum</label>
          <input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Deadline</label>
          <input type="date" value={form.deadline || ''} onChange={e => set('deadline', e.target.value)} disabled={!canManage} />
        </div>
        <div className="f">
          <label>Toegewezen aan</label>
          <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} disabled={!canManage}>
            <option value="">— Geen medewerker —</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
          </select>
          {canManage && <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />}
        </div>
        <div className="f" style={{ gridColumn: '1 / -1' }}>
          <label>Omschrijving</label>
          <textarea rows={4} value={form.description} onChange={e => set('description', e.target.value)} disabled={!canManage} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        {project.customerId && (
          <button className="btn btn-ghost btn-sm" onClick={() => openCustomer?.(project.customerId)}>
            Open klant {I.arrow_r}
          </button>
        )}
        {canManage && (
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── OFFERTE TAB ──────────────────────────────────────────────────────────────

function OfferteTab({ project, offertes, customers, deals = [], company, setPage, onLink, onChanged, canManage }) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [pickId, setPickId] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [sendMail, setSendMail] = useState(null);
  const linkedOfferte = project.offerteId ? offertes.find(o => o.id === project.offerteId) : null;

  const submitLink = async () => {
    if (!pickId) return;
    try {
      await onLink(pickId);
      toast.success('Offerte gekoppeld');
      setPicking(false);
    } catch (e) {
      toast.error(e.message || 'Koppelen mislukt');
    }
  };

  // Nieuwe offerte gemaakt vanuit het project → direct aan dit project koppelen
  // (project.offerte_id) en de lijst verversen zodat hij in de tab verschijnt.
  const handleCreated = async saved => {
    setShowNew(false);
    try { await onLink(saved.id); } catch { /* koppelen best-effort */ }
    onChanged?.();
  };

  if (!linkedOfferte) {
    const eligible = project.customerId
      ? offertes.filter(o => o.customerId === project.customerId)
      : offertes;
    return (
      <div style={{ padding: '24px 20px' }}>
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dk)', marginBottom: 6 }}>Nog geen offerte gekoppeld</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Koppel een bestaande offerte zodat waarde, uren en facturatie automatisch worden gesynchroniseerd.</div>
          {!picking ? (
            canManage && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Nieuwe offerte</button>
                <button className="btn btn-s btn-sm" onClick={() => setPicking(true)}>Bestaande koppelen</button>
              </div>
            )
          ) : (
            <div style={{ maxWidth: 360, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={pickId} onChange={e => setPickId(e.target.value)}>
                <option value="">Kies een offerte</option>
                {eligible.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.nummer || 'Offerte'}{o.omschrijving ? ` · ${o.omschrijving.slice(0, 40)}` : ''} · {fmt(o.totaalIncl)}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPicking(false)}>Annuleren</button>
                <button className="btn btn-p btn-sm" onClick={submitLink} disabled={!pickId}>Koppel</button>
              </div>
            </div>
          )}
        </div>
        {showNew && (
          <NewOfferteModal
            customers={customers}
            deals={deals}
            prefillCustomerId={project.customerId || null}
            onClose={() => setShowNew(false)}
            onSaved={handleCreated}
            onSaveAndSend={async saved => { await handleCreated(saved); setSendMail(saved); }}
          />
        )}
        {sendMail && (
          <SendOfferteMailModal
            offerte={sendMail}
            customers={customers}
            company={company}
            onClose={() => setSendMail(null)}
            onSent={() => { setSendMail(null); onChanged?.(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-p" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--dl)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{linkedOfferte.nummer}</div>
            <div style={{ fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{linkedOfferte.omschrijving || project.name}</div>
          </div>
          {(() => { const s = statusInfo(linkedOfferte.status, 'offerte'); return <span className={s.className}>{s.label}</span>; })()}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div>
            <div style={labelStyle}>Offertebedrag (incl.)</div>
            <div style={{ fontWeight: 600 }}>{fmt(linkedOfferte.totaalIncl)}</div>
          </div>
          <div>
            <div style={labelStyle}>Begrote uren</div>
            <div style={{ fontWeight: 600 }}>{fmtHours(linkedOfferte.arbeidsuren)}</div>
          </div>
          <div>
            <div style={labelStyle}>Geldig tot</div>
            <div style={{ fontWeight: 600 }}>{fmtDate(linkedOfferte.geldigTot)}</div>
          </div>
          <div>
            <div style={labelStyle}>Geaccepteerd</div>
            <div style={{ fontWeight: 600 }}>{linkedOfferte.geaccepteerdOp ? fmtDate(linkedOfferte.geaccepteerdOp.slice(0, 10)) : ''}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-s btn-sm" onClick={() => setPage?.('offertes', { id: linkedOfferte.id, from: 'project', projectId: project.id, projectNaam: project.name })}>
          Open offerte {I.arrow_r}
        </button>
        <button className="btn btn-s btn-sm" onClick={() => setPage?.('facturen')}>
          Factuur maken {I.arrow_r}
        </button>
        {canManage && <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(true)}>{I.plus} Nieuwe offerte</button>}
      </div>

      {showNew && (
        <NewOfferteModal
          customers={customers}
          deals={deals}
          prefillCustomerId={project.customerId || null}
          onClose={() => setShowNew(false)}
          onSaved={handleCreated}
          onSaveAndSend={async saved => { await handleCreated(saved); setSendMail(saved); }}
        />
      )}
      {sendMail && (
        <SendOfferteMailModal
          offerte={sendMail}
          customers={customers}
          company={company}
          onClose={() => setSendMail(null)}
          onSent={() => { setSendMail(null); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ── UREN TAB ─────────────────────────────────────────────────────────────────

// Alleen-lezen sinds werkbonuren een eigen tabel hebben: uren horen bij een
// klus, en die boek je op de werkbon. Deze tab is de optelsom van de werkbonnen
// van dit project.
function UrenTab({ project, entries }) {
  const pct = project.hoursPercentage || 0;
  const warningTone = pct > 1 ? 'risk' : pct >= 0.8 ? 'warning' : null;

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div>
            <div style={labelStyle}>Begroot</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtHours(project.quotedHours)}</div>
          </div>
          <div>
            <div style={labelStyle}>Geregistreerd</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: warningTone === 'risk' ? '#dc2626' : warningTone === 'warning' ? '#f59e0b' : 'inherit' }}>
              {fmtHours(project.usedHours)}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Resterend</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtHours(project.remainingHours)}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ width: '100%', height: 8, background: '#e7e9ec', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(1, pct) * 100}%`,
              height: '100%',
              background: warningTone === 'risk' ? '#dc2626' : warningTone === 'warning' ? '#f59e0b' : '#1DDB62',
              borderRadius: 999,
            }} />
          </div>
          {warningTone === 'warning' && (
            <div style={{ color: '#b45309', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Boven 80% van het urenbudget. Houd uren goed in de gaten.</span>
            </div>
          )}
          {warningTone === 'risk' && (
            <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertOctagon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Urenbudget overschreden ({Math.round(pct * 100)}%).</span>
            </div>
          )}
        </div>
      </div>

      {/* Uren toevoegen kan hier niet meer: ze horen bij een werkbon, en die
          bepaalt wie mag boeken. Verwijzen is nuttiger dan een knop die het
          ergens anders toch weer anders doet. */}
      <div style={{
        fontSize: 12.5, color: 'var(--dm)', background: 'var(--bgs)',
        border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: '10px 12px',
      }}>
        Uren boek je op de werkbon van deze klus. Wat je hier ziet is de optelsom van
        de werkbonnen van dit project.
      </div>

      {/* Time entries list */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', marginBottom: 8 }}>
          Geregistreerde uren ({entries.length})
        </div>
        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>
            Nog geen uren geregistreerd op dit project.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--br)', borderRadius: 8, background: '#fff' }}>
                <div style={{ minWidth: 60, fontSize: 11, color: 'var(--dl)' }}>{fmtDate(e.entryDate)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || <span style={{ color: 'var(--dl)' }}>(geen omschrijving)</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--dl)' }}>
                    {e.userName || 'Onbekende medewerker'}
                    {e.startTijd && e.eindTijd ? ` · ${e.startTijd}–${e.eindTijd}` : ''}
                    {e.pauzeMinuten > 0 ? ` · ${e.pauzeMinuten} min pauze` : ''}
                    {e.reisKm > 0 ? ` · ${e.reisKm.toLocaleString('nl-NL')} km` : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtHours(e.hours)}</div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── KOSTEN TAB ───────────────────────────────────────────────────────────────
// Wat deze klus gekost heeft: het materiaal van de werkbonnen (op inkoopprijs)
// plus de projectkosten die hier worden ingevoerd — steigerhuur, een gehuurde
// hoogwerker, kosten die bij deze ene klus horen maar nooit op een werkbon
// staan.
//
// Boekingen van de Kosten-pagina tellen NIET mee, ook niet met dit project
// eraan. Dat is de boekhouding, en daar staat de inkoopfactuur van hetzelfde
// materiaal dat al via de werkbon meetelt. Hier telde dat eerder allebei mee:
// bij "Schilderwerk woonkamer" stond dezelfde verf er als factuur van € 420
// én als werkbonmateriaal. Zie migratie 20260915130000.
function KostenTab({ project, canManage }) {
  const toast = useToast();
  // De kosten zelf vallen onder het recht 'kosten' (dat gate't deze tab al).
  // Gefactureerd en brutowinst zijn de opbrengst van het project en horen
  // achter 'projectbedragen'.
  const { can } = usePermissions();
  const magBedragen = can('projectbedragen');
  // Werkbonmateriaal staat op inkoopprijs en is daarom afgeschermd: zonder dit
  // recht komen die regels niet eens binnen (RLS, migratie 20260915130500). Een
  // brutowinst zonder het materiaal zou te hoog uitvallen, dus die blijft dan
  // weg — net als de marge in de materialenbibliotheek.
  const magInkoop = can('inkoopprijzen');

  const [kosten, setKosten] = useState([]);           // job_costs rond dit project
  const [projectKosten, setProjectKosten] = useState([]);
  const [laadFout, setLaadFout] = useState('');
  const [loading, setLoading] = useState(true);
  const [toonWinstUitleg, setToonWinstUitleg] = useState(false);
  const [leveranciers, setLeveranciers] = useState([]);
  useEffect(() => { listLeveranciers({ inclusiefInactief: false }).then(setLeveranciers).catch(() => {}); }, []);

  const load = () => {
    setLoading(true);
    Promise.all([
      getProjectCosts(project.id).catch(() => []),
      listProjectKosten(project.id)
        .then(r => { setLaadFout(''); return r; })
        .catch(e => { setLaadFout(e.message || 'Laden mislukt'); return []; }),
    ])
      .then(([jc, pk]) => { setKosten(jc); setProjectKosten(pk); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (project.id) load(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Kostprijs en brutowinst ────────────────────────────────────────────────
  // Arbeid en reiskilometers zitten er BEWUST niet in: uren worden nergens in
  // geld omgerekend. Vandaar de uitleg achter het info-icoon.
  //
  // Excl. btw aan beide kanten: rekenen met een bedrag inclusief zou de winst
  // structureel te laag maken.
  const materiaal = kosten.filter(isWerkbonMateriaal);
  const geboekt = kosten.filter(k => !isWerkbonMateriaal(k));
  const geboektTotaal = geboekt.reduce((s, k) => s + (Number(k.amt) || 0), 0);
  const inkoop = inkoopwaardeVanKosten(materiaal);
  const projectKostenTotaal = Math.round(projectKosten.reduce((s, k) => s + k.bedrag, 0) * 100) / 100;
  const kostprijs = inkoop.materiaalInkoop + projectKostenTotaal;
  const omzet = Number(project.omzetExclBtw ?? project.invoicedAmount ?? 0);
  const brutowinst = omzet - kostprijs;
  const toonWinst = magBedragen && magInkoop;

  // ── Projectkosten bewerken ─────────────────────────────────────────────────
  // Zelfde werkwijze als materiaal op de werkbon: direct in beeld, de
  // schrijfactie loopt erachteraan, en bij een fout terug naar wat er stond.
  const voegKostToe = async form => {
    try {
      const nieuw = await createProjectKost(project.id, form);
      setProjectKosten(l => [...l, nieuw]);
    } catch (e) {
      toast.error(e.message || 'Toevoegen mislukt');
      throw e;
    }
  };

  const wijzigKost = async (rij, patch) => {
    const nieuw = { ...rij };
    if ('naam' in patch) nieuw.naam = patch.naam;
    if ('eenheid' in patch) nieuw.eenheid = patch.eenheid;
    if ('aantal' in patch) nieuw.aantal = Number(patch.aantal) || 0;
    if ('prijs_per' in patch) nieuw.prijsPer = Number(patch.prijs_per) || 0;
    if ('leverancier_id' in patch) nieuw.leverancierId = patch.leverancier_id || null;
    nieuw.bedrag = Math.round(nieuw.aantal * nieuw.prijsPer * 100) / 100;
    setProjectKosten(l => l.map(x => (x.id === rij.id ? nieuw : x)));
    try {
      await updateProjectKost(rij.id, patch);
    } catch (e) {
      toast.error(e.message || 'Bijwerken mislukt');
      setProjectKosten(l => l.map(x => (x.id === rij.id ? rij : x)));
    }
  };

  const verwijderKost = async rij => {
    if (!window.confirm(`"${rij.naam}" verwijderen?`)) return;
    try {
      await deleteProjectKost(rij.id);
      setProjectKosten(l => l.filter(x => x.id !== rij.id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const kopStijl = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', marginBottom: 8 };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${1 + (magBedragen ? 1 : 0) + (toonWinst ? 1 : 0)}, 1fr)`, gap: 10 }}>
          {magBedragen && (
            <div>
              <div style={labelStyle}>Gefactureerd (excl. btw)</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt0(omzet)}</div>
            </div>
          )}
          <div>
            <div style={labelStyle}>{magInkoop ? 'Kostprijs' : 'Projectkosten'}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt0(magInkoop ? kostprijs : projectKostenTotaal)}</div>
            {magInkoop && (inkoop.materiaalInkoop > 0 || projectKostenTotaal > 0) && (
              <div style={{ fontSize: 11, color: 'var(--dl)', marginTop: 2 }}>
                materiaal {fmt0(inkoop.materiaalInkoop)} · projectkosten {fmt0(projectKostenTotaal)}
              </div>
            )}
          </div>
          {toonWinst && (
            <div>
              <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                Brutowinst
                <button
                  type="button"
                  aria-label="Uitleg over brutowinst"
                  aria-expanded={toonWinstUitleg}
                  title="Wat zit er in de brutowinst?"
                  onClick={() => setToonWinstUitleg(v => !v)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex',
                    color: toonWinstUitleg ? 'var(--p)' : 'var(--dl)',
                  }}
                >
                  {I.info}
                </button>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: brutowinst < 0 ? '#dc2626' : '#15A34A' }}>
                {fmt0(brutowinst)}
              </div>
            </div>
          )}
        </div>

        {toonWinst && toonWinstUitleg && (
          <div style={{
            fontSize: 11.5, color: 'var(--dm)', marginTop: 10, lineHeight: 1.5,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px',
          }}>
            Brutowinst is gefactureerd min de kostprijs: het materiaal van de werkbonnen op inkoopprijs, plus
            de projectkosten hieronder. <b>Arbeid en reiskilometers zitten er niet in</b> — wat je aan uren
            kwijt bent is hier niet verrekend. Boekingen op de Kosten-pagina tellen ook niet mee: daar staat de
            inkoopfactuur van hetzelfde materiaal.
          </div>
        )}

        {!magInkoop && (
          <div style={{ fontSize: 11.5, color: 'var(--dm)', marginTop: 10, lineHeight: 1.5 }}>
            Het materiaal van de werkbonnen telt ook mee in de kostprijs, maar staat op inkoopprijs en die is
            voor jou afgeschermd. Daarom zie je hier geen brutowinst.
          </div>
        )}

        {/* Geen stil verkeerd getal: als de inkoopprijs ontbreekt is de
            verkoopprijs gebruikt, en dan is de brutowinst een ondergrens. Alleen
            zichtbaar voor wie de inkoop mag zien — anders zou elke regel als
            "zonder inkoopprijs" tellen terwijl hij er gewoon een heeft. */}
        {magInkoop && inkoop.zonderInkoopprijs > 0 && (
          <div style={{
            fontSize: 11.5, lineHeight: 1.5, marginTop: 8, borderRadius: 8, padding: '8px 11px',
            background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E',
          }}>
            {inkoop.zonderInkoopprijs === 1
              ? '1 materiaalregel heeft geen inkoopprijs'
              : `${inkoop.zonderInkoopprijs} materiaalregels hebben geen inkoopprijs`}
            {' '}({fmt0(inkoop.geschatBedrag)}). Daarvoor is de verkoopprijs gerekend, dus de
            werkelijke brutowinst ligt hoger. Vul de inkoopprijs in op de werkbon.
          </div>
        )}
      </div>

      <ProjectKostenSection
        kosten={projectKosten}
        leveranciers={leveranciers}
        onLeverancierBij={g => setLeveranciers(l => [...l, g].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))}
        canEdit={canManage}
        loading={loading}
        laadFout={laadFout}
        onAdd={voegKostToe}
        onUpdate={wijzigKost}
        onDelete={verwijderKost}
      />

      {magInkoop && (
        <div>
          <div style={kopStijl}>Werkbonmateriaal ({materiaal.length})</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--dl)', fontSize: 13 }}>Laden…</div>
          ) : materiaal.length === 0 ? (
            <div style={{ padding: '4px 0 8px', color: 'var(--dl)', fontSize: 13 }}>
              Nog geen materiaal op de werkbonnen van dit project.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {materiaal.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--br)', borderRadius: 8, background: '#fff' }}>
                  <div style={{ minWidth: 60, fontSize: 11, color: 'var(--dl)' }}>{fmtDate(c.date)}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(c.desc || '').replace(/^Materiaal:\s*/i, '') || <span style={{ color: 'var(--dl)' }}>(geen omschrijving)</span>}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700 }}>{fmt(c.amt)}</div>
                    <div style={{ fontSize: 10.5, color: c.inkoopprijsPer == null ? '#92400E' : 'var(--dl)' }}>
                      {c.inkoopprijsPer == null ? 'op verkoopprijs' : 'inkoop, excl. btw'}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--dl)' }}>Aantallen en prijzen wijzig je op de werkbon.</div>
            </div>
          )}
        </div>
      )}

      {/* Boekingen die aan dit project hangen worden niet stil weggelaten:
          wie ze hier eerder zag optellen, moet kunnen zien waar ze zijn. */}
      {!loading && geboekt.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--dm)', lineHeight: 1.5, background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px' }}>
          {geboekt.length === 1 ? '1 boeking' : `${geboekt.length} boekingen`} op de Kosten-pagina
          {geboekt.length === 1 ? ' hangt' : ' hangen'} aan dit project ({fmt(geboektTotaal)}). Dat is de boekhouding
          en telt niet mee in de marge: het materiaal zelf staat hierboven al via de werkbon.
          Hoort een kost echt bij deze klus en staat hij nergens op een werkbon, zet hem dan bij de projectkosten.
        </div>
      )}
    </div>
  );
}

// Invoer van projectkosten. Zelfde opzet als materiaal op de werkbon: een
// tabel met direct bewerkbare regels en onderaan één invoerregel met een
// plusknop. Geen keuze uit de materialenbibliotheek: die draagt een
// inkoopprijs, en een projectkost is voor iedereen met het recht 'kosten'
// zichtbaar — daarmee zou de afgeschermde inkoopprijs via deze weg alsnog te
// lezen zijn. Projectkosten zijn bovendien huur en diensten, geen artikelen.
function ProjectKostenSection({ kosten, leveranciers, onLeverancierBij, canEdit, loading, laadFout, onAdd, onUpdate, onDelete }) {
  // De drawer is smaller dan de werkbonpagina. Onder 640px gaan leverancier,
  // subtotaal en de knop naar een tweede regel; anders werd elk veld te smal
  // om te lezen ("Geen le…"). Gemeten op de kaart zelf, niet op het venster:
  // de drawer kan ook gemaximaliseerd staan.
  const kaartRef = useRef(null);
  const [smal, setSmal] = useState(true);
  useEffect(() => {
    const el = kaartRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setSmal(e.contentRect.width < 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const LEEG = { naam: '', aantal: 1, eenheid: '', prijs_per: '', leverancier_id: '' };
  const [form, setForm] = useState(LEEG);
  const [adding, setAdding] = useState(false);
  const totaal = kosten.reduce((s, k) => s + k.bedrag, 0);
  const addSub = (Number(form.aantal) || 0) * (Number(form.prijs_per) || 0);
  const COLS = smal
    ? 'minmax(0,1fr) 56px 64px 84px'
    : 'minmax(0,2.2fr) 62px 74px 84px minmax(0,1.3fr) 84px 30px';
  const rijStijl = {
    display: 'grid', gridTemplateColumns: COLS, gap: 5, alignItems: 'center',
    ...(smal ? { paddingBottom: 8, marginBottom: 8, borderBottom: '1px dashed var(--border)' } : { marginBottom: 5 }),
  };
  const levStijl = { minWidth: 0, ...(smal ? { gridColumn: 'span 2' } : null) };
  const subStijl = { textAlign: 'right', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' };

  // Zonder de migratie bestaat de tabel nog niet. Dan geen technische
  // foutmelding in beeld, maar wat er aan de hand is.
  const foutTekst = !laadFout ? ''
    : /schema cache|does not exist|project_kosten/i.test(laadFout)
      ? 'Projectkosten zijn nog niet beschikbaar: de database-update hiervoor is nog niet uitgevoerd.'
      : `Projectkosten konden niet worden geladen (${laadFout}).`;

  const submit = async () => {
    if (!form.naam.trim()) return;
    setAdding(true);
    try {
      await onAdd(form);
      setForm(LEEG);
    } catch { /* melding komt van onAdd; invoer blijft staan */ } finally {
      setAdding(false);
    }
  };

  const veld = (r, k, v) => onUpdate(r, { [k]: v });
  // De omschrijving pas bij verlaten opslaan: leegmaken om opnieuw te typen
  // zou anders tussendoor een lege naam wegschrijven, en die weigert de database.
  const naamKlaar = (r, v) => {
    const naam = v.trim();
    if (naam && naam !== r.naam) veld(r, 'naam', naam);
  };

  const levSelect = (value, onChange, disabled) => (
    <LeverancierSelect value={value || ''} disabled={disabled} leveranciers={leveranciers}
      onLijstGewijzigd={onLeverancierBij} onChange={onChange} style={{ minWidth: 0, width: '100%' }} />
  );

  return (
    <div className="wb2-card" ref={kaartRef}>
      <div className="wb2-card-hd">
        <div className="wb2-card-hd-title">Projectkosten</div>
      </div>
      <div className="wb2-card-body">
        <div className="wb2-mat-body">
          {!kosten.length && (
            <div style={{ fontSize: 12, color: 'var(--dl)', lineHeight: 1.5, marginBottom: canEdit ? 10 : 0 }}>
              {foutTekst || 'Kosten die bij deze klus horen maar niet op een werkbon staan, zoals steigerhuur of een gehuurde hoogwerker. Bedragen exclusief btw.'}
            </div>
          )}

          {kosten.length > 0 && (
            <div>
              <div className="wb2-mat-kop" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5 }}>
                <span>Omschrijving</span><span>Aantal</span><span>Eenheid</span><span>Kostprijs</span>
                {!smal && <><span>Leverancier</span><span style={{ textAlign: 'right' }}>Subtotaal</span><span /></>}
              </div>
              {kosten.map(k => (
                <div key={k.id} className="wb2-mat-rij" style={rijStijl}>
                  <input type="text" defaultValue={k.naam} disabled={!canEdit} style={{ minWidth: 0 }}
                    onBlur={e => naamKlaar(k, e.target.value)} />
                  <input type="number" min="0" step="0.01" value={k.aantal} disabled={!canEdit} style={{ minWidth: 0 }}
                    onChange={e => veld(k, 'aantal', e.target.value)} />
                  <input type="text" value={k.eenheid} placeholder="stuk" disabled={!canEdit} style={{ minWidth: 0 }}
                    onChange={e => veld(k, 'eenheid', e.target.value)} />
                  <input type="number" min="0" step="0.01" value={k.prijsPer} disabled={!canEdit} style={{ minWidth: 0 }}
                    title="Kostprijs per eenheid, excl. btw" onChange={e => veld(k, 'prijs_per', e.target.value)} />
                  <div style={levStijl}>{levSelect(k.leverancierId, v => veld(k, 'leverancier_id', v), !canEdit)}</div>
                  <div style={subStijl}>{fmt(k.bedrag)}</div>
                  {canEdit
                    ? <button className="btn btn-xs btn-danger btn-icon" onClick={() => onDelete(k)} title="Verwijderen" style={{ justifySelf: 'end' }}>{I.trash}</button>
                    : <div />}
                </div>
              ))}
            </div>
          )}

          {canEdit && !loading && (
            <div className="wb2-mat-rij" style={{ borderTop: kosten.length && !smal ? '1px solid var(--border)' : 'none', paddingTop: kosten.length && !smal ? 10 : 0, marginTop: kosten.length && !smal ? 6 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5, alignItems: 'center' }}>
                <input type="text" placeholder="Bijv. steigerhuur" value={form.naam} style={{ minWidth: 0 }}
                  onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
                <input type="number" min="0" step="0.01" value={form.aantal} placeholder="1" style={{ minWidth: 0 }}
                  onChange={e => setForm(f => ({ ...f, aantal: e.target.value }))} />
                <input type="text" value={form.eenheid} placeholder="stuk" style={{ minWidth: 0 }}
                  onChange={e => setForm(f => ({ ...f, eenheid: e.target.value }))} />
                <input type="number" min="0" step="0.01" value={form.prijs_per} placeholder="0,00" style={{ minWidth: 0 }}
                  title="Kostprijs per eenheid, excl. btw"
                  onChange={e => setForm(f => ({ ...f, prijs_per: e.target.value }))} />
                <div style={levStijl}>{levSelect(form.leverancier_id, v => setForm(f => ({ ...f, leverancier_id: v })), false)}</div>
                <div style={subStijl}>{fmt(addSub)}</div>
                <button onClick={submit} disabled={adding || !form.naam.trim()} className="wb2-mat-add-btn"
                  aria-label="Projectkost toevoegen" title="Toevoegen" style={{ justifySelf: 'end' }}>{I.plus}</button>
              </div>
            </div>
          )}
        </div>

        {kosten.length > 0 && (
          <div className="wb2-mat-foot">
            <div className="wb2-mat-foot-add" style={{ visibility: 'hidden' }}>spacer</div>
            <div style={{ textAlign: 'right' }}>
              <div className="wb2-mat-foot-total-lbl">Totaal projectkosten (excl. BTW)</div>
              <div className="wb2-mat-foot-total">{fmt(totaal)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FACTUREN TAB ─────────────────────────────────────────────────────────────

function FacturenTab({ project, invoices, openInvoice, setPage, customers, company, onNew, onRefresh }) {
  const [showNewFactuur, setShowNewFactuur] = useState(false);
  const [sendMail, setSendMail] = useState(null);
  const { can } = usePermissions();
  const magBedragen = can('projectbedragen');

  const openFactuur = f => {
    if (setPage) setPage('facturen', { id: f.id, from: 'project', projectId: project.id, projectNaam: project.name });
    else openInvoice?.(f.id);
  };
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {magBedragen && (
      <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div>
            <div style={labelStyle}>Projectwaarde</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt0(project.projectValue)}</div>
          </div>
          <div>
            <div style={labelStyle}>Gefactureerd</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt0(project.invoicedAmount)}</div>
          </div>
          <div>
            <div style={labelStyle}>Te factureren</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: project.remainingToInvoice > 0 ? '#f59e0b' : 'inherit' }}>
              {fmt0(project.remainingToInvoice)}
            </div>
          </div>
        </div>
      </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)' }}>
            Facturen ({invoices.length})
          </div>
          <button className="btn btn-s btn-sm" onClick={() => setShowNewFactuur(true)}>
            {I.plus} Nieuwe factuur
          </button>
        </div>
        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>
            Nog geen facturen aangemaakt voor dit project.
          </div>
        ) : (
          <div className="lrows">
            {invoices.map(f => (
              <div key={f.id} role="button" tabIndex={0} title="Open factuur" className="lrow"
                onClick={() => openFactuur(f)}
                onKeyDown={e => { if (e.key === 'Enter') openFactuur(f); }}>
                <div className="lrow-num">{f.nummer || ''}</div>
                <div className="lrow-meta">
                  {fmtDate(f.factuurdatum)}
                  {f.vervaldatum && ` · vervalt ${fmtDate(f.vervaldatum)}`}
                </div>
                {(() => { const s = statusInfo(f.status, 'factuur'); return <span className={s.className}>{s.label}</span>; })()}
                <div className="lrow-amount">{fmt(f.totaalIncl)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewFactuur && (
        <NewFactuurModal
          customers={customers}
          projects={[{ id: project.id, name: project.name, customerId: project.customerId }]}
          prefill={{ customer_id: project.customerId || '', project_id: project.id }}
          onClose={() => setShowNewFactuur(false)}
          onSaved={saved => { setShowNewFactuur(false); onNew?.(saved); }}
          onSaveAndSend={saved => setSendMail(saved)}
        />
      )}
      {sendMail && (
        <SendFactuurMailModal
          factuur={sendMail}
          customers={customers}
          company={company}
          templateType="factuur"
          onClose={() => setSendMail(null)}
          onSent={() => { setSendMail(null); onRefresh?.(); }}
        />
      )}
    </div>
  );
}

// ── NOTES TAB ────────────────────────────────────────────────────────────────

function NotesTab({ notes, onAdd, onDelete }) {
  return (
    <div style={{ padding: '16px 20px', overflow: 'hidden' }}>
      <NotitieLog
        items={notes.map(n => toLogItem({ id: n.id, body: n.note, authorName: n.authorName || 'Onbekend', createdAt: n.createdAt }))}
        onAdd={onAdd}
        onDelete={onDelete}
        placeholder="Schrijf een notitie over dit project… Typ @ om iemand te taggen"
        saveLabel="Notitie toevoegen"
        emptyText="Nog geen notities. Voeg de eerste notitie toe."
      />
    </div>
  );
}

// ── WERKBONNEN TAB ───────────────────────────────────────────────────────────


// Werkbonnen vanuit een project gaan door dezelfde modal als op de
// werkbonpagina. Er stond hier een snelle variant met twee velden (titel +
// datum), die stil het klantadres overnam en géén tijden vroeg — terwijl de
// werkbonpagina die inmiddels verplicht stelt. Zo maakte het project werkbonnen
// die de planning op een verzonnen 07:00 zette.
function WerkbonnenTab({ project, werkbonnen, customers = [], onCreated, canManage, setPage }) {
  const openWerkbon = w => setPage?.('werkbonnen', { id: w.id, from: 'project', projectId: project.id, projectNaam: project.name });
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)' }}>
          Werkbonnen ({werkbonnen.length})
        </div>
        {canManage && !showForm && (
          <button className="btn btn-s btn-sm" onClick={() => setShowForm(true)}>
            {I.plus} Nieuwe werkbon
          </button>
        )}
      </div>

      {showForm && (
        <WerkbonModal
          mode="new"
          customers={customers}
          // Alleen dit project in de keuzelijst: je maakt hem hier voor déze
          // klus, en hem in de modal naar een ander project kunnen verzetten is
          // een val. Klant en project komen daarmee voorgevuld binnen.
          projects={[{ id: project.id, name: project.name }]}
          werkbon={{ projectId: project.id, customerId: project.customerId || '' }}
          onClose={() => setShowForm(false)}
          onSaved={w => { setShowForm(false); onCreated?.(w); }}
        />
      )}

      {werkbonnen.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>
          Nog geen werkbonnen gekoppeld aan dit project.
        </div>
      ) : (
        <div className="lrows">
          {werkbonnen.map(w => {
            const pct = w.taakTotal ? Math.round((w.taakDone / w.taakTotal) * 100) : 0;
            return (
              <div key={w.id} role="button" tabIndex={0} title="Open werkbon" className="lrow"
                onClick={() => openWerkbon(w)}
                onKeyDown={e => { if (e.key === 'Enter') openWerkbon(w); }}>
                <div className="lrow-main">
                  <div className="lrow-title">
                    {w.titel}
                  </div>
                  <div className="lrow-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {planningLabel(w)}
                    {w.taakTotal > 0 && (
                      <>
                        <span>·</span>
                        <span>{w.taakDone}/{w.taakTotal} taken</span>
                        <span style={{ display: 'inline-block', width: 36, height: 3, borderRadius: 3, background: 'var(--br)', overflow: 'hidden', verticalAlign: 'middle' }}>
                          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#1DDB62' }} />
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {(() => { const s = statusInfo(w.status, 'werkbon'); return (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                    background: s.bg, color: s.color,
                  }}>
                    {s.label}
                  </span>
                ); })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DRAWER WRAPPER ───────────────────────────────────────────────────────────

export function ProjectDetailDrawer({
  projectId,
  customers = [],
  deals = [],
  offertes = [],
  onClose,
  onChanged,
  openCustomer,
  openInvoice,
  setPage,
}) {
  const toast = useToast();
  const { company, profile } = useProfile();
  const { can } = usePermissions();
  const { plan } = usePlanGuard();
  const tabs = useMemo(() => zichtbareTabs(can, plan), [can, plan]);
  const [tab, setTab] = useState('overview');
  // Verdwijnt de openstaande tab (recht ingetrokken, pakket omlaag), val dan
  // terug op de eerste. Anders staar je naar een leeg paneel.
  useEffect(() => {
    if (!tabs.some(t => t.id === tab)) setTab(tabs[0].id);
  }, [tabs, tab]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [notes, setNotes] = useState([]);
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);

  // Full-screen toggle — exact dezelfde aanpak als de klantkaart: voeg de
  // klasse klant-fullscreen toe aan de .drawer zodat hij het hele scherm vult.
  useEffect(() => {
    const drawer = document.querySelector('.drawer');
    if (!drawer) return;
    if (fullscreen) {
      const sb = document.querySelector('.sb');
      drawer.style.setProperty('--fs-left', `${sb ? sb.offsetWidth : 232}px`);
      drawer.classList.add('klant-fullscreen');
    } else {
      drawer.classList.remove('klant-fullscreen');
      drawer.style.removeProperty('--fs-left');
    }
    return () => {
      const d = document.querySelector('.drawer');
      if (d) { d.classList.remove('klant-fullscreen'); d.style.removeProperty('--fs-left'); }
    };
  }, [fullscreen]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, te, inv, nts, wbs] = await Promise.all([
        getProjectById(projectId),
        getTimeEntries(projectId).catch(() => []),
        getProjectInvoices(projectId).catch(() => []),
        getProjectNotes(projectId).catch(() => []),
        getWerkbonnenByProject(projectId).catch(() => []),
      ]);
      setEntries(te);
      setInvoices(inv);
      setNotes(nts);
      setWerkbonnen(wbs);
      setProject(enrichProject(p, { timeEntries: te, invoices: inv }));
    } catch (e) {
      toast.error(e.message || 'Project laden mislukt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (projectId) loadAll(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bewerken: admin/planner-rol óf het 'projecten_bewerken'-recht. Zien mag
  // iedereen; de form-velden worden uitgeschakeld zonder bewerkrecht en RLS
  // dwingt hetzelfde server-side af.
  const canManage = ['admin', 'planner'].includes(profile?.role) || can('projecten_bewerken');

  const recompute = (nextEntries = entries, nextInvoices = invoices, nextProject = project) => {
    if (!nextProject) return;
    setProject(enrichProject(nextProject, { timeEntries: nextEntries, invoices: nextInvoices }));
  };

  // ── ACTIONS ───────────────────────────────────────────────────────────────

  const handleSave = async patch => {
    const updated = await updateProject(projectId, patch);
    const enriched = enrichProject(updated, { timeEntries: entries, invoices });
    setProject(enriched);
    onChanged?.();
  };

  const handleLinkOfferte = async offerteId => {
    const updated = await updateProject(projectId, { offerte_id: offerteId });
    setProject(enrichProject(updated, { timeEntries: entries, invoices }));
    onChanged?.();
  };


  const handleAddNote = async text => {
    const n = await addProjectNote(projectId, text);
    setNotes(prev => [n, ...prev]);
    // Het veld nodigt uit tot taggen; de getagde collega kreeg tot nu toe niets.
    createMentionNotifications({
      text,
      relatedType: 'project',
      relatedId: projectId,
      link: 'projecten',
      creatorId: profile?.id,
      creatorName: profile?.fullName,
      contextName: project?.name || project?.naam || 'een project',
    }).catch(e => console.warn('[project] mention-melding mislukt:', e?.message));
  };

  const handleDeleteNote = async id => {
    if (!confirm('Notitie verwijderen?')) return;
    try {
      await deleteProjectNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm(`Project "${project?.name}" definitief verwijderen?`)) return;
    try {
      await deleteProject(projectId);
      toast.success('Project verwijderd');
      onChanged?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body" style={{ padding: 0 }}>
          {loading || !project ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--dl)' }}>Project laden…</div>
          ) : (
            <>
              <DrawerHeader project={project} onClose={onClose} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)} />
              <Tabs tab={tab} setTab={setTab} tabs={tabs} />

              {tab === 'overview' && (
                <OverviewTab
                  project={project}
                  customers={customers}
                  openCustomer={openCustomer}
                  onSave={handleSave}
                  canManage={canManage}
                />
              )}
              {tab === 'offerte' && (
                <OfferteTab
                  project={project}
                  offertes={offertes}
                  customers={customers}
                  deals={deals}
                  company={company}
                  setPage={setPage}
                  onLink={handleLinkOfferte}
                  onChanged={onChanged}
                  canManage={canManage}
                />
              )}
              {tab === 'uren' && (
                <UrenTab project={project} entries={entries} />
              )}
              {tab === 'kosten' && (
                <KostenTab project={project} canManage={canManage} />
              )}
              {tab === 'facturen' && (
                <FacturenTab
                  project={project}
                  invoices={invoices}
                  openInvoice={openInvoice}
                  setPage={setPage}
                  customers={customers}
                  company={company}
                  onRefresh={loadAll}
                  onNew={saved => {
                    const next = [{ id: saved.id, nummer: saved.nummer, status: saved.status, factuurdatum: saved.factuurdatum, vervaldatum: saved.vervaldatum, totaalIncl: saved.totaalIncl, totaalExcl: saved.totaalExcl }, ...invoices];
                    setInvoices(next);
                    recompute(entries, next);
                    onChanged?.();
                  }}
                />
              )}
              {tab === 'werkbonnen' && (
                <WerkbonnenTab
                  customers={customers}
                  project={project}
                  werkbonnen={werkbonnen}
                  setPage={setPage}
                  onCreated={wb => setWerkbonnen(prev => [...prev, wb])}
                  canManage={canManage}
                />
              )}
              {tab === 'notes' && (
                <NotesTab notes={notes} onAdd={handleAddNote} onDelete={handleDeleteNote} />
              )}

              {/* Footer actions — alleen onderaan de Overzicht-tab */}
              {canManage && tab === 'overview' && (
                <div style={{ padding: '12px 20px 20px', borderTop: '1px solid var(--br)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={handleDeleteProject}>
                    {I.trash} Verwijder project
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ProjectDetailDrawer;
