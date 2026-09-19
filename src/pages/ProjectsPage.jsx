import { useEffect, useMemo, useState } from 'react';
import { I, ModalX, NotifyMailToggle, fmt, fmt0, BackToKlant } from '../bb-shared.jsx';
import { InfoTip } from '../components/Uitleg.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { useData } from '../lib/dataContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { usePlanGuard } from '../components/PlanUpgradeModal.jsx';
import {
  getEnrichedProjects,
  createProject,
} from '../services/projectsService.js';
import { ProjectDetailDrawer } from './projects/ProjectDetailDrawer.jsx';
import { NoteEditor } from '../components/NoteEditor.jsx';
import { getTeamMembers, notifyNewAssignees } from '../services/notificatieService.js';
import { statusInfo } from '../utils/statusColors.js';

// ── HELPERS ──────────────────────────────────────────────────────────────────

const THIS_MONTH = () => new Date().toISOString().slice(0, 7);

const fmtDate = d => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

const fmtHours = h => {
  const n = Number(h || 0);
  return `${n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}u`;
};

export function ProjectBadge({ status }) {
  const s = statusInfo(status, 'project');
  return <span className={s.className}>{s.label}</span>;
}

// ── NEW PROJECT MODAL ────────────────────────────────────────────────────────

export function NewProjectModal({ onClose, onSaved, customers, deals, offertes, prefillCustomerId = null }) {
  const toast = useToast();
  const { profile } = useProfile();
  const [saving, setSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [notifyMail, setNotifyMail] = useState(true);
  const [form, setForm] = useState({
    name: '',
    customer_id: prefillCustomerId || '',
    deal_id: '',
    offerte_id: '',
    status: 'concept',
    project_value: '',
    quoted_hours: '',
    start_date: '',
    deadline: '',
    description: '',
    assigned_to: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);

  // Bij selectie van offerte: voorinvullen waarde + uren + klant + deal
  useEffect(() => {
    if (!form.offerte_id) return;
    const o = offertes.find(x => x.id === form.offerte_id);
    if (!o) return;
    setForm(f => ({
      ...f,
      customer_id: f.customer_id || o.customerId || '',
      deal_id: f.deal_id || o.dealId || '',
      project_value: f.project_value === '' || f.project_value === 0
        ? (o.totaalIncl || 0)
        : f.project_value,
      quoted_hours: f.quoted_hours === '' || f.quoted_hours === 0
        ? (o.arbeidsuren || 0)
        : f.quoted_hours,
      name: f.name || o.omschrijving || '',
    }));
  }, [form.offerte_id, offertes]);

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('Projectnaam is verplicht'); return; }
    setSaving(true);
    try {
      const saved = await createProject({
        name,
        description: form.description || null,
        status: form.status,
        customer_id: form.customer_id || null,
        deal_id: form.deal_id || null,
        offerte_id: form.offerte_id || null,
        project_value: Number(form.project_value || 0),
        quoted_hours: Number(form.quoted_hours || 0),
        start_date: form.start_date || null,
        deadline: form.deadline || null,
        assigned_to: form.assigned_to || null,
      });
      notifyNewAssignees({ userIds: form.assigned_to ? [form.assigned_to] : [], members: teamMembers, sendMail: notifyMail, type: 'toewijzing_project', title: `Je bent toegewezen aan ${name}`, link: 'projecten', relatedType: 'project', relatedId: saved?.id, creatorId: profile?.id, creatorName: profile?.fullName }).catch(() => {});
      toast.success('Project aangemaakt');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Aanmaken mislukt');
    } finally {
      setSaving(false);
    }
  };

  // Filter deals/offertes op gekozen klant (als die ingesteld is)
  const filteredDeals = form.customer_id
    ? deals.filter(d => d.custId === form.customer_id)
    : deals;
  const filteredOffertes = form.customer_id
    ? offertes.filter(o => o.customerId === form.customer_id)
    : offertes;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">
              Nieuw project <InfoTip tekst="Beheer uren, offerte, facturatie en deadline op één plek." />
            </div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="f s2" style={{ gridColumn: '1 / -1' }}>
            <label>Projectnaam</label>
            <input
              type="text"
              autoFocus
              placeholder="Bv. Renovatie badkamer Jansen"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>
          <div className="f">
            <label>Klant</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Geen klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {/* Geen statuskeuze meer: de status volgt de werkbonnen van het
              project (gepland → in uitvoering → afgerond). */}
          <div className="f">
            <label>Project</label>
            <select value={form.deal_id} onChange={e => set('deal_id', e.target.value)}>
              <option value="">— Geen project —</option>
              {filteredDeals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Offerte</label>
            <select value={form.offerte_id} onChange={e => set('offerte_id', e.target.value)}>
              <option value="">— Geen offerte —</option>
              {filteredOffertes.map(o => (
                <option key={o.id} value={o.id}>
                  {o.nummer || 'Offerte'} {o.omschrijving ? `· ${o.omschrijving.slice(0, 40)}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Projectwaarde (incl. BTW)</label>
            <input
              type="number" min="0" step="0.01"
              placeholder="0,00"
              value={form.project_value}
              onChange={e => set('project_value', e.target.value)}
            />
          </div>
          <div className="f">
            <label>Begrote uren</label>
            <input
              type="number" min="0" step="0.5"
              placeholder="0"
              value={form.quoted_hours}
              onChange={e => set('quoted_hours', e.target.value)}
            />
          </div>
          <div className="f">
            <label>Startdatum</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div className="f">
            <label>Deadline</label>
            <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
          </div>
          <div className="f">
            <label>Toegewezen aan</label>
            <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">— Geen medewerker —</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
            <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
          </div>
          <div className="f s2" style={{ gridColumn: '1 / -1' }}>
            <label>Omschrijving</label>
            <NoteEditor mentions={true} value={form.description} onChange={v => set('description', v)} rows={3} placeholder="Werkomschrijving, bijzonderheden, aandachtspunten… Typ @ om iemand te taggen" teamMembers={teamMembers} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Aanmaken…' : 'Project aanmaken'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PROJECT CARD (mobile) ────────────────────────────────────────────────────

function ProjectCard({ p, onOpen }) {
  // Bedragen achter 'projectbedragen'; uren, deadline en voortgang blijven.
  const { can } = usePermissions();
  const magBedragen = can('projectbedragen');
  return (
    <button
      className="card card-p"
      style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', border: '1px solid var(--br)', width: '100%' }}
      onClick={() => onOpen(p)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <div style={{ fontSize: 12, color: 'var(--dl)' }}>{p.customerName || 'Geen klant'}</div>
        </div>
        <ProjectBadge status={p.status} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
        {magBedragen && (
          <div>
            <div style={{ color: 'var(--dl)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Waarde</div>
            <div style={{ fontWeight: 600 }}>{fmt(p.projectValue)}</div>
          </div>
        )}
        <div>
          <div style={{ color: 'var(--dl)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Uren</div>
          <div style={{ fontWeight: 600 }}>{fmtHours(p.usedHours)} / {fmtHours(p.quotedHours)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--dl)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Deadline</div>
          <div style={{ fontWeight: 600 }}>{fmtDate(p.deadline)}</div>
        </div>
      </div>
      {magBedragen && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--dl)' }}>
            {p.invoicedAmount > 0 ? `${fmt(p.invoicedAmount)} gefactureerd` : 'Nog niet gefactureerd'}
          </div>
        </div>
      )}
    </button>
  );
}

// ── EMPTY STATE ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--dl)' }}>
      <div style={{ fontSize: 32, marginBottom: 10, color: 'var(--p)' }}>{icon || I.brief}</div>
      <div style={{ fontWeight: 700, color: 'var(--dk)', fontSize: 15, marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, marginBottom: 14 }}>{subtitle}</div>}
      {action}
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────

// preOpenProjectId komt uit de URL (/projecten/<id>): die is leidend, zodat
// terug en vooruit in de browser het juiste project openen en sluiten.
// onItemOpen/onItemClose zetten de geschiedenisstap; zonder die props valt de
// pagina terug op eigen state (bijvoorbeeld in een test of los gebruik).
export function ProjectsPage({ openCustomer, setPage, openInvoice, preOpenProjectId, onItemOpen, onItemClose, onNavConsumed, backKlant, onBackKlant } = {}) {
  const toast = useToast();
  const { profile } = useProfile();
  const { can } = usePermissions();
  const { guardSchrijven, planModal } = usePlanGuard();
  const magBedragen = can('projectbedragen');
  // Projecten bewerken/aanmaken: admin/planner-rol óf het 'projecten_bewerken'-recht.
  // Zien mag iedereen; RLS bepaalt welke projecten zichtbaar zijn.
  const canManage = ['admin', 'planner'].includes(profile?.role) || can('projecten_bewerken');

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [projects, setProjects] = useState([]);
  // Klanten, deals en offertes komen uit de gedeelde dataset die de app toch al
  // ophaalt; deze pagina haalde ze apart op. De projecten zelf blijven een eigen
  // fetch: die staan niet in de context en worden hier verrijkt met uren en
  // facturen (getEnrichedProjects).
  const { customers = [], deals = [], offertes = [] } = useData();

  const [statusFilter, setStatusFilter] = useState('all'); // all | gepland | in_uitvoering | afgerond
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // all | unbilled | billed
  const [search, setSearch] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [eigenProjectId, setEigenProjectId] = useState(null);
  // De URL wint; alleen zonder koppeling houdt de pagina het zelf bij.
  const openProjectId = onItemOpen ? (preOpenProjectId || null) : eigenProjectId;
  const setOpenProjectId = id => {
    if (id) { onItemOpen ? onItemOpen(id) : setEigenProjectId(id); }
    else { onItemClose ? onItemClose() : setEigenProjectId(null); }
  };

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const proj = await getEnrichedProjects();
      setProjects(proj);
    } catch (e) {
      setErr(e.message || 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-open intent (bv. vanuit dashboard widgets later)
  useEffect(() => {
    if (preOpenProjectId) {
      setOpenProjectId(preOpenProjectId);
      onNavConsumed?.();
    }
  }, [preOpenProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── FILTERS ───────────────────────────────────────────────────────────────

  const filterTabs = useMemo(() => ([
    { value: 'all',           label: 'Alle' },
    { value: 'gepland',       label: 'Gepland' },
    { value: 'in_uitvoering', label: 'In uitvoering' },
    { value: 'afgerond',      label: 'Afgerond' },
  ]), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (invoiceFilter === 'unbilled' && !(p.remainingToInvoice > 0)) return false;
      if (invoiceFilter === 'billed' && !(p.invoicedAmount > 0)) return false;
      if (!q) return true;
      const hay = [p.name, p.customerName, p.dealTitle, p.offerteNummer, p.description]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [projects, statusFilter, invoiceFilter, search]);

  // ── KPI's ─────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const month = THIS_MONTH();
    const active = projects.filter(p => p.status !== 'afgerond');
    const totalValue = active.reduce((s, p) => s + (p.projectValue || 0), 0);
    const totalRemainingToInvoice = projects.reduce((s, p) => s + (p.remainingToInvoice || 0), 0);
    // Voor "uren deze maand" gebruiken we de enriched usedHours; preciezer zou
    // direct uit time_entries gefilterd op maand zijn, maar dat vergt een
    // extra query. We tonen totale gewerkte uren tot nu toe.
    const hoursTotal = projects.reduce((s, p) => s + (p.usedHours || 0), 0);
    return {
      active: active.length,
      totalValue,
      remainingToInvoice: totalRemainingToInvoice,
      hours: hoursTotal,
    };
  }, [projects]);

  // ── RENDER ────────────────────────────────────────────────────────────────

  // Alleen bij de eerste keer laden (nog geen data) de volledige pagina vervangen
  // door een spinner. Bij een refresh (bv. na het aanmaken van een factuur vanuit
  // de project-drawer) blijft de bestaande UI — inclusief de geopende drawer en
  // diens modals — gemonteerd, zodat transient state zoals de "verstuur"-modal
  // niet verloren gaat door een remount.
  if (loading && projects.length === 0) {
    return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Projecten laden…</div>;
  }

  return (
    <div>
      {backKlant && <BackToKlant name={backKlant.klantNaam} onClick={() => onBackKlant?.(backKlant)} />}
      <div className="page-hd afu">
        <div>
          <h1>Projecten</h1>
          <p>Beheer projecten, uren, offertes en facturatie</p>
          {err && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{err}</div>}
        </div>
        <div className="page-hd-actions">
          {canManage && (
            <button className="btn btn-p" onClick={guardSchrijven('Een project aanmaken', () => setShowNew(true))}>
              {I.plus} Nieuw project
            </button>
          )}
        </div>
      </div>

      <div className="afu2">
        {/* KPI cards */}
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          <div className="sc">
            <div className="sc-top"><div className="sc-icon">{I.projects}</div></div>
            <div className="sc-val">{kpi.active}</div>
            <div className="sc-label">Actieve projecten</div>
          </div>
          {magBedragen && (
            <div className="sc">
              <div className="sc-top"><div className="sc-icon">{I.euro}</div></div>
              <div className="sc-val">{fmt0(kpi.totalValue)}</div>
              <div className="sc-label">Totale projectwaarde</div>
            </div>
          )}
          {magBedragen && (
            <div className="sc">
              <div className="sc-top"><div className="sc-icon">{I.clock}</div></div>
              <div className="sc-val">{fmt0(kpi.remainingToInvoice)}</div>
              <div className="sc-label">Te factureren</div>
            </div>
          )}
          <div className="sc">
            <div className="sc-top"><div className="sc-icon">{I.hours}</div></div>
            <div className="sc-val">{fmtHours(kpi.hours)}</div>
            <div className="sc-label">Gewerkte uren</div>
          </div>
        </div>

        <div className="card">
          <div className="tw-filter">
            <div className="bb-filter-tabs">
              {filterTabs.map(f => (
                <button
                  key={f.value}
                  className={`bb-filter-tab${statusFilter === f.value ? ' on' : ''}`}
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <select value={invoiceFilter} onChange={e => setInvoiceFilter(e.target.value)} className="filter-select" aria-label="Filter facturatie">
                <option value="all">Alle facturatie</option>
                <option value="unbilled">Nog te factureren</option>
                <option value="billed">Al gefactureerd</option>
              </select>
            </div>
            <div className="search">
              <span style={{ color: 'var(--dl)', display: 'flex', flexShrink: 0 }}>{I.search}</span>
              <input placeholder="Zoek project, klant…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <EmptyState
              icon={I.brief}
              title={projects.length === 0 ? 'Nog geen projecten' : 'Geen projecten gevonden'}
              subtitle={projects.length === 0
                ? 'Maak je eerste project aan zodra een deal of offerte is gewonnen.'
                : 'Pas de filters of zoekterm aan om meer projecten te zien.'}
              action={projects.length === 0 && canManage && (
                <button className="btn btn-p" onClick={guardSchrijven('Een project aanmaken', () => setShowNew(true))}>{I.plus} Eerste project</button>
              )}
            />
          )}

          {/* Desktop table */}
          {filtered.length > 0 && (
            <div className="bb-projects-table" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="dt" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th className="th">Project</th>
                    <th className="th">Klant</th>
                    <th className="th">Status</th>
                    {magBedragen && <th className="th">Waarde</th>}
                    {magBedragen && <th className="th">Gefactureerd</th>}
                    <th className="th">Uren</th>
                    <th className="th">Deadline</th>
                    <th className="th">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const isOverdue = p.deadline && p.deadline < new Date().toISOString().slice(0, 10) && p.status !== 'afgerond';
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setOpenProjectId(p.id)}>
                        <td className="td">
                          <div style={{ fontWeight: 600, color: 'var(--dk)' }}>{p.name}</div>
                          {p.offerteNummer && (
                            <div style={{ fontSize: 11, color: 'var(--dl)', fontFamily: 'monospace' }}>{p.offerteNummer}</div>
                          )}
                        </td>
                        <td className="td">
                          {p.customerId ? (
                            <button
                              onClick={e => { e.stopPropagation(); openCustomer?.(p.customerId); }}
                              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.textDecoration = 'underline'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'inherit'; e.currentTarget.style.textDecoration = 'none'; }}
                            >{p.customerName || ''}</button>
                          ) : null}
                        </td>
                        <td className="td"><ProjectBadge status={p.status} /></td>
                        {magBedragen && <td className="td" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.projectValue)}</td>}
                        {magBedragen && (
                          <td className="td" style={{ textAlign: 'right' }}>
                            <div>{fmt(p.invoicedAmount)}</div>
                            {p.remainingToInvoice > 0 && (
                              <div style={{ fontSize: 11, color: '#f59e0b' }}>nog {fmt(p.remainingToInvoice)}</div>
                            )}
                          </td>
                        )}
                        <td className="td" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {fmtHours(p.usedHours)} / {fmtHours(p.quotedHours)}
                        </td>
                        <td className="td" style={{ color: isOverdue ? '#dc2626' : 'inherit', whiteSpace: 'nowrap' }}>
                          {fmtDate(p.deadline)}
                        </td>
                        <td className="td" onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-xs btn-ghost btn-icon"
                              title="Bekijken"
                              onClick={() => setOpenProjectId(p.id)}
                            >{I.eye}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile cards */}
          {filtered.length > 0 && (
            <div className="bb-projects-mobile" style={{ display: 'none', flexDirection: 'column', gap: 10, padding: 12 }}>
              {filtered.map(p => (
                <ProjectCard key={p.id} p={p} onOpen={() => setOpenProjectId(p.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewProjectModal
          customers={customers}
          deals={deals}
          offertes={offertes}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}

      {openProjectId && (
        <ProjectDetailDrawer
          projectId={openProjectId}
          customers={customers}
          deals={deals}
          offertes={offertes}
          onClose={() => setOpenProjectId(null)}
          onChanged={load}
          openCustomer={openCustomer}
          openInvoice={openInvoice}
          setPage={setPage}
        />
      )}

      {planModal}
    </div>
  );
}

export default ProjectsPage;
