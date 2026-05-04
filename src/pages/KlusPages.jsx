import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  Check,
  Clock,
  FilePlus2,
  FileText,
  FolderOpen,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Printer,
  Route,
  Search,
  Send,
  Upload,
  Wrench
} from 'lucide-react';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Input from '../components/Input.jsx';
import Select from '../components/Select.jsx';
import StatCard from '../components/StatCard.jsx';
import {
  customers,
  documents,
  emailTemplates,
  hours,
  jobs,
  leads,
  materials,
  pipelineCards,
  pipelineStages,
  quoteTemplates,
  quotes,
  settings,
  tasks,
  team,
  workOrders
} from '../data/mockData.js';

const money = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const lostReasons = ['Te duur', 'Geen reactie', 'Andere partij gekozen', 'Datum niet mogelijk', 'Buiten werkgebied', 'Klus te klein', 'Klus te groot', 'Klant geannuleerd', 'Onvoldoende informatie', 'Anders'];

function Badge({ children, tone = 'neutral' }) {
  return <span className={`kd-badge ${tone}`}>{children}</span>;
}

function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

function Table({ columns, rows, renderRow }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

function SimpleModal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="modal card">
        <div className="section-heading section-heading-row">
          <h2>{title}</h2>
          <Button variant="secondary" onClick={onClose}>Sluiten</Button>
        </div>
        {children}
      </section>
    </div>
  );
}

function calculationFromTemplate(form, lines) {
  const rate     = Number(form.rate     || settings.hourlyRate);
  const margin   = Number(form.margin   || settings.margin);
  const vat      = Number(form.vat      || settings.vatRate);
  let labor      = Number(form.hours    || 0) * rate;
  let material   = Number(form.material || 0);
  let extra      = Number(form.travel   || settings.travelCost);

  if (form.template === 'Schilder') {
    labor    = Number(form.surface || 0) * Number(form.hoursPerM2 || 0.35) * rate;
    material = Number(form.surface || 0) * Number(form.materialPerM2 || 14);
    extra   += form.scaffold ? 180 : 0;
  }
  if (form.template === 'Hovenier') {
    labor    = Number(form.hours || 0) * Number(form.people || 1) * rate;
    material = Number(form.material || 0);
    extra   += form.machine  ? Number(form.machineCost  || 95) : 0;
    extra   += form.disposal ? Number(form.disposalCost || 75) : 0;
  }

  const manualLines   = lines.reduce((sum, l) => sum + Number(l.amount || 0) * Number(l.price || 0), 0);
  const subtotal      = labor + material + extra + manualLines;
  const marginAmount  = subtotal * (margin / 100);
  const totalExVat    = subtotal + marginAmount;
  const vatAmount     = totalExVat * (vat / 100);
  return { labor, material, extra, manualLines, marginAmount, totalExVat, vatAmount, totalIncVat: totalExVat + vatAmount };
}

/* ══════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════ */

export function DashboardPage({ appState, navigate }) {
  const quoteValue = appState.quotes.filter((q) => ['Verstuurd', 'Concept'].includes(q.status)).reduce((sum, q) => sum + q.totalIncVat, 0);
  const accepted   = appState.quotes.filter((q) => q.status === 'Geaccepteerd').reduce((sum, q) => sum + q.totalIncVat, 0);
  const planned    = jobs.filter((job) => new Date(job.date) <= new Date('2026-05-10'));
  const warnings   = ['Meijer: materialen nog niet volledig ingevuld', 'Bakker VvE: werkelijke uren 18% boven begroting'];
  const activePipeline = pipelineStages.slice(0, 6).map((stage) => ({
    ...stage,
    cards: appState.pipelineCards.filter((card) => card.stage === stage.id)
  }));

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div>
          <span className="hero-badge">Nieuw - slimmer sturen op je werkdag</span>
          <h2>Wat moet je vandaag doen?</h2>
          <p>BossBase bundelt aanvragen, offertes, planning, werkbonnen, uren en omzet in een dashboard dat laat zien welke actie nu telt.</p>
        </div>
        <div className="hero-actions">
          <Button onClick={() => navigate('/aanvragen')}><Plus size={17} /> Nieuwe aanvraag</Button>
          <Button variant="secondary" onClick={() => navigate('/offertes')}><FilePlus2 size={17} /> Nieuwe offerte</Button>
          <Button variant="secondary" onClick={() => navigate('/planning')}><CalendarPlus size={17} /> Klus plannen</Button>
          <Button variant="secondary" onClick={() => navigate('/werkbonnen')}><Wrench size={17} /> Werkbon openen</Button>
        </div>
      </section>

      <div className="stats-grid wide kpi-grid">
        <StatCard label="Nieuwe aanvragen"         value={appState.leads.filter((l) => l.stage === 'nieuw').length} note="Nog opvolgen" />
        <StatCard label="Open offertes"            value={appState.quotes.filter((q) => q.status !== 'Geaccepteerd').length} note={money.format(quoteValue)} />
        <StatCard label="Geaccepteerde omzet"      value={money.format(accepted)} note="Akkoord ontvangen" />
        <StatCard label="Klussen deze week"        value={planned.length} note="Komende 7 dagen" />
      </div>

      <section className="card pipeline-snapshot">
        <div className="section-heading section-heading-row">
          <div>
            <span className="eyebrow">Sales pipeline</span>
            <h2>Van aanvraag naar gepland werk</h2>
            <p>De compacte pipeline uit het ontwerp vertaald naar de echte demo-data.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/pipeline')}>Open pipeline <ArrowRight size={16} /></Button>
        </div>
        <div className="snapshot-board">
          {activePipeline.map((stage) => (
            <div className="snapshot-column" key={stage.id}>
              <div className="snapshot-head">
                <strong>{stage.name}</strong>
                <span>{stage.cards.length}</span>
              </div>
              {stage.cards.slice(0, 2).map((card) => (
                <button className="snapshot-card" key={card.id} onClick={() => navigate('/pipeline')}>
                  <strong>{card.customer}</strong>
                  <small>{card.jobType}</small>
                  <span>{money.format(card.value)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="card">
          <div className="section-heading">
            <h2>Acties vandaag</h2>
            <p>Openstaande taken met prioriteit en volgende stap.</p>
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <article className="task-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.customer} | {task.deadline}</span>
                </div>
                <Badge tone={task.status === 'te laat' ? 'danger' : task.priority === 'urgent' ? 'urgent' : 'today'}>{task.status}</Badge>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <h2>Planning komende 7 dagen</h2>
            <p>Klik door naar de werkbon voordat de klus start.</p>
          </div>
          <div className="compact-list">
            {planned.map((job) => (
              <button key={job.id} className="compact-row" onClick={() => navigate(`/werkbonnen/${job.workOrderId}`)}>
                <span><strong>{job.customer}</strong>{job.city} | {job.start}–{job.end}</span>
                <Badge tone="planned">{job.status}</Badge>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="card quote-focus">
          <div className="section-heading">
            <span className="eyebrow">Offertes</span>
            <h2>Slimme quote-flow</h2>
            <p>Maak een draft met uren, materialen, reiskosten, marge en btw. De klant kan online akkoord geven.</p>
          </div>
          <div className="quote-focus-grid">
            {appState.quotes.slice(0, 3).map((quote) => (
              <button className="quote-mini" key={quote.id} onClick={() => navigate('/offertes')}>
                <span>{quote.number}</span>
                <strong>{quote.customer}</strong>
                <small>{quote.description}</small>
                <b>{money.format(quote.totalIncVat)}</b>
              </button>
            ))}
          </div>
        </section>

        <section className="workorder-preview-card">
          <div className="mobile-workorder-head">
            <Badge tone="planned">mobile-first</Badge>
            <h2>Werkbon op locatie</h2>
            <p>Klantgegevens, route, checklist, uren, materialen, foto's en notities in een telefoonvriendelijke flow.</p>
            <div className="mobile-actions">
              <Button variant="secondary" onClick={() => navigate('/werkbonnen')}><Wrench size={17} /> Open werkbon</Button>
            </div>
          </div>
          <div className="preview-checks">
            <label><input type="checkbox" defaultChecked /> Klantdetails zichtbaar</label>
            <label><input type="checkbox" defaultChecked /> Foto's vooraf gekoppeld</label>
            <label><input type="checkbox" /> Uren en materialen invullen</label>
          </div>
        </section>
      </div>

      <div className="stats-grid wide kpi-grid">
        <StatCard label="Verwachte omzet"             value={money.format(quoteValue + accepted)} note="Open + akkoord" />
        <StatCard label="Betaald"                     value={money.format(5060)} note="Mock betaalstatus" />
        <StatCard label="Openstaand"                  value={money.format(3860)} note="Nog controleren" />
        <StatCard label="Nacalculatie waarschuwingen" value={warnings.length} note={warnings[0]} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   AANVRAGEN
══════════════════════════════════════════════════ */

function stageName(id) {
  return pipelineStages.find((s) => s.id === id)?.name || id;
}

export function LeadsPage({ appState, setAppState, navigate, showToast }) {
  const [query,    setQuery]    = useState('');
  const [filter,   setFilter]   = useState('alles');
  const [showNew,  setShowNew]  = useState(false);
  const [selected, setSelected] = useState(null);

  const filtered = appState.leads.filter((lead) => {
    const q = `${lead.customer} ${lead.jobType} ${lead.city}`.toLowerCase().includes(query.toLowerCase());
    const f = filter === 'alles' || lead.stage === filter || lead.source === filter;
    return q && f;
  });

  const addLead = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const lead = {
      id: `l${Date.now()}`,
      customer: form.get('customer'), phone: form.get('phone'), email: form.get('email'),
      address: form.get('address'), city: form.get('city'), jobType: form.get('jobType'),
      description: form.get('description'), desiredDate: form.get('desiredDate'),
      source: 'Handmatig', priority: 'normaal', stage: 'nieuw',
      notes: 'Simulatie: bevestigingsmail naar klant, melding voor ondernemer, taak aangemaakt.',
      createdAt: '2026-05-03', lastActivity: 'Nu'
    };
    setAppState((s) => ({ ...s, leads: [lead, ...s.leads] }));
    setShowNew(false);
    showToast('Aanvraag opgeslagen');
  };

  return (
    <div className="page-stack">
      <Toolbar>
        <label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op klant, klus of plaats" /></label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="alles">Alle aanvragen</option>
          <option value="nieuw">Nieuwe aanvraag</option>
          <option value="Websiteformulier">Websiteformulier</option>
          <option value="E-mail">E-mail</option>
          <option value="Referral">Referral</option>
        </select>
        <Button onClick={() => setShowNew(true)}><Plus size={17} /> Nieuwe aanvraag</Button>
      </Toolbar>

      <section className="card">
        <Table
          columns={['Klant', 'Klus', 'Bron', 'Prioriteit', 'Status', 'Acties']}
          rows={filtered}
          renderRow={(lead) => (
            <tr key={lead.id}>
              <td><strong>{lead.customer}</strong><br /><span>{lead.city}</span></td>
              <td>{lead.jobType}<br /><span>{lead.description}</span></td>
              <td>{lead.source}</td>
              <td><Badge tone={lead.priority === 'hoog' ? 'urgent' : 'neutral'}>{lead.priority}</Badge></td>
              <td><Badge tone="planned">{stageName(lead.stage)}</Badge></td>
              <td className="table-actions">
                <Button variant="secondary" onClick={() => setSelected(lead)}>Open</Button>
                <Button variant="secondary" onClick={() => navigate('/offertes')}>Maak offerte</Button>
              </td>
            </tr>
          )}
        />
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>Websiteformulier preview</h2>
          <p>Simulatie: na verzenden krijgt de klant bevestiging, jij een melding, de lead komt in Nieuwe aanvraag.</p>
        </div>
        <div className="form-grid">
          <Input label="Naam" placeholder="Klantnaam" />
          <Input label="Telefoon" placeholder="06-..." />
          <Input label="E-mail" placeholder="klant@example.nl" />
          <Input label="Plaats/adres" placeholder="Zwolle" />
          <Input label="Type klus" placeholder="Schilderwerk" />
          <Input label="Gewenste periode" placeholder="Binnen 4 weken" />
          <Input className="span-2" type="textarea" rows="3" label="Omschrijving" placeholder="Beschrijf de klus" />
          <button className="upload-placeholder span-2"><Upload size={18} /> Foto upload placeholder</button>
        </div>
      </section>

      {showNew && (
        <SimpleModal title="Nieuwe aanvraag toevoegen" onClose={() => setShowNew(false)}>
          <form className="form-grid" onSubmit={addLead}>
            <Input label="Klantnaam" name="customer" required />
            <Input label="Telefoon" name="phone" required />
            <Input label="E-mail" name="email" type="email" />
            <Input label="Klusadres" name="address" />
            <Input label="Plaats" name="city" required />
            <Input label="Type klus" name="jobType" required />
            <Input label="Gewenste periode" name="desiredDate" />
            <Input className="span-2" type="textarea" rows="4" label="Omschrijving" name="description" required />
            <div className="form-actions span-2"><Button type="submit">Aanvraag opslaan</Button></div>
          </form>
        </SimpleModal>
      )}

      {selected && (
        <SimpleModal title={selected.customer} onClose={() => setSelected(null)}>
          <div className="detail-list">
            <p><strong>Telefoon:</strong> {selected.phone}</p>
            <p><strong>E-mail:</strong> {selected.email}</p>
            <p><strong>Adres:</strong> {selected.address}, {selected.city}</p>
            <p><strong>Omschrijving:</strong> {selected.description}</p>
            <p><strong>Notities:</strong> {selected.notes}</p>
          </div>
          <div className="form-actions">
            <Button variant="secondary">Plan contactmoment</Button>
            <Button variant="secondary" onClick={() => navigate('/pipeline')}>Zet in pipeline</Button>
            <Button onClick={() => navigate('/offertes')}>Maak offerte</Button>
          </div>
        </SimpleModal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PIPELINE
══════════════════════════════════════════════════ */

export function PipelinePage({ appState, setAppState, showToast }) {
  const [lostCard, setLostCard] = useState(null);
  const pipelineValue = appState.pipelineCards.reduce((sum, card) => sum + card.value, 0);

  const moveCard = (card, direction) => {
    const current = pipelineStages.findIndex((s) => s.id === card.stage);
    const next    = pipelineStages[Math.max(0, Math.min(pipelineStages.length - 1, current + direction))];
    if (next.id === 'verloren') { setLostCard(card); return; }
    setAppState((s) => ({
      ...s,
      pipelineCards: s.pipelineCards.map((item) => item.id === card.id ? { ...item, stage: next.id } : item)
    }));
    showToast(`${card.customer} verplaatst naar ${next.name}`);
  };

  return (
    <div className="page-stack">
      <section className="card pipeline-topline">
        <div>
          <span className="eyebrow">Sales pipeline</span>
          <h2>Elke aanvraag heeft een volgende stap.</h2>
          <p>Sleepgedrag is in deze demo vertaald naar snelle knoppen, zodat bestaande functionaliteit behouden blijft.</p>
        </div>
        <div className="pipeline-topline-stats">
          <span><strong>{appState.pipelineCards.length}</strong> actieve trajecten</span>
          <span><strong>{money.format(pipelineValue)}</strong> pipelinewaarde</span>
          <span><strong>{pipelineStages.length}</strong> fases</span>
        </div>
      </section>
      <section className="pipeline-board">
        {pipelineStages.map((stage) => (
          <div className="pipeline-column" key={stage.id}>
            <div className="pipeline-head">
              <h3>{stage.name}</h3>
              <p>{stage.helper}</p>
            </div>
            {appState.pipelineCards.filter((c) => c.stage === stage.id).map((card) => (
              <article className="pipeline-card" key={card.id}>
                <div className="quote-card-top">
                  <strong>{card.customer}</strong>
                  <Badge tone={card.priority === 'hoog' ? 'urgent' : 'neutral'}>{card.priority}</Badge>
                </div>
                <p>{card.jobType}</p>
                <small>{card.description}</small>
                <div className="pipeline-card-foot">
                  <span>{money.format(card.value)}</span>
                  <span>{card.deadline}</span>
                </div>
                <div className="pipeline-actions">
                  <Button variant="secondary" onClick={() => moveCard(card, -1)}>Terug</Button>
                  <Button variant="secondary" onClick={() => moveCard(card, 1)}>Volgende</Button>
                  <Button variant="danger" onClick={() => setLostCard(card)}>Verloren</Button>
                </div>
              </article>
            ))}
          </div>
        ))}
      </section>

      {lostCard && (
        <SimpleModal title="Waarom is deze klus verloren?" onClose={() => setLostCard(null)}>
          <div className="reason-grid">
            {lostReasons.map((reason) => (
              <Button key={reason} variant="secondary" onClick={() => {
                setAppState((s) => ({
                  ...s,
                  pipelineCards: s.pipelineCards.map((item) => item.id === lostCard.id ? { ...item, stage: 'verloren', lostReason: reason } : item)
                }));
                showToast(`Reden vastgelegd: ${reason}`);
                setLostCard(null);
              }}>{reason}</Button>
            ))}
          </div>
        </SimpleModal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   KLANTEN
══════════════════════════════════════════════════ */

export function CustomersPage() {
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState(customers[0]);
  const filtered = customers.filter((c) => `${c.name} ${c.city} ${c.type}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="split-layout">
      <section className="card">
        <Toolbar>
          <label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek klanten" /></label>
          <Button><Plus size={17} /> Klant toevoegen</Button>
        </Toolbar>
        <div className="compact-list">
          {filtered.map((customer) => (
            <button key={customer.id} className={`compact-row ${selected.id === customer.id ? 'selected' : ''}`} onClick={() => setSelected(customer)}>
              <span><strong>{customer.name}</strong>{customer.city} | {customer.type}</span>
              <Badge>{customer.payment}</Badge>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>{selected.name}</h2>
          <p>{selected.address}, {selected.city}</p>
        </div>
        <div className="summary-grid">
          <span><strong>Telefoon</strong>{selected.phone}</span>
          <span><strong>E-mail</strong>{selected.email}</span>
          <span><strong>Klanttype</strong>{selected.type}</span>
          <span><strong>Betaalstatus</strong>{selected.payment}</span>
        </div>
        <div className="two-col">
          <InfoBlock title="Gekoppelde offertes"       items={quotes.filter((q) => q.customerId === selected.id).map((q) => `${q.number} — ${q.status} — ${money.format(q.totalIncVat)}`)} />
          <InfoBlock title="Communicatiegeschiedenis"  items={['Aanvraag ontvangen', 'Telefonisch contact gepland', 'Offerte reminder klaargezet']} />
          <InfoBlock title="Documenten/foto's"         items={documents.slice(0, 3).map((d) => `${d.name} (${d.category})`)} />
          <InfoBlock title="Notities"                  items={[selected.notes]} />
        </div>
      </section>
    </div>
  );
}

function InfoBlock({ title, items }) {
  return (
    <div className="info-block">
      <h3>{title}</h3>
      {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>Geen gegevens.</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   OFFERTES
══════════════════════════════════════════════════ */

export function QuotesPage({ appState, setAppState, showToast }) {
  const [mode,   setMode]   = useState('list');
  const [selected, setSelected] = useState(appState.quotes[0]);
  const [form,   setForm]   = useState({ template: 'Algemeen klusbedrijf', hours: 16, people: 1, rate: settings.hourlyRate, material: 450, travel: settings.travelCost, margin: settings.margin, vat: settings.vatRate, surface: 45, materialPerM2: 14, hoursPerM2: 0.35, scaffold: false, machine: false, disposal: false });
  const [lines,  setLines]  = useState([{ description: 'Extra werkzaamheden', amount: 1, price: 125 }]);
  const totals = useMemo(() => calculationFromTemplate(form, lines), [form, lines]);

  const accept = () => {
    setAppState((s) => ({
      ...s,
      quotes: s.quotes.map((q) => q.id === selected.id ? { ...q, status: 'Geaccepteerd' } : q)
    }));
    setSelected((q) => ({ ...q, status: 'Geaccepteerd' }));
    showToast('Offerte geaccepteerd!');
  };

  return (
    <div className="page-stack">
      <section className="card quote-topline">
        <div>
          <span className="eyebrow">Smart quote builder</span>
          <h2>Draft, controleer en laat online akkoord geven.</h2>
          <p>De editor gebruikt templates voor algemene klussen, schilderwerk en hovenierswerk met arbeid, materialen, marge en btw.</p>
        </div>
        <div className="quote-topline-actions">
          <Button variant="secondary" onClick={() => setMode('editor')}><FilePlus2 size={17} /> Draft maken</Button>
          <Button onClick={() => setMode('preview')}><Check size={17} /> Akkoord preview</Button>
        </div>
      </section>
      <Toolbar>
        <Button variant={mode === 'list'    ? 'primary' : 'secondary'} onClick={() => setMode('list')}>Offertelijst</Button>
        <Button variant={mode === 'editor'  ? 'primary' : 'secondary'} onClick={() => setMode('editor')}>Offerte editor</Button>
        <Button variant={mode === 'preview' ? 'primary' : 'secondary'} onClick={() => setMode('preview')}>Preview</Button>
      </Toolbar>

      {mode === 'list' && (
        <section className="card">
          <Table
            columns={['Offerte', 'Klant', 'Template', 'Status', 'Totaal', 'Acties']}
            rows={appState.quotes}
            renderRow={(quote) => (
              <tr key={quote.id}>
                <td><strong>{quote.number}</strong><br /><span>{quote.description}</span></td>
                <td>{quote.customer}</td>
                <td>{quote.template}</td>
                <td><Badge tone={quote.status === 'Geaccepteerd' ? 'success' : 'today'}>{quote.status}</Badge></td>
                <td>{money.format(quote.totalIncVat)}</td>
                <td className="table-actions">
                  <Button variant="secondary" onClick={() => { setSelected(quote); setMode('preview'); }}>Open</Button>
                </td>
              </tr>
            )}
          />
        </section>
      )}

      {mode === 'editor' && (
        <div className="quote-form-grid">
          <section className="card">
            <div className="section-heading">
              <h2>Calculatie en offerte-draft</h2>
              <p>Controleer de offerte altijd voordat je deze verstuurt.</p>
            </div>
            <div className="form-grid">
              <Select label="Template" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
                {quoteTemplates.map((t) => <option key={t}>{t}</option>)}
              </Select>
              <Input label="Uurtarief" type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              {form.template === 'Schilder' ? (
                <>
                  <Input label="Oppervlakte m2" type="number" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} />
                  <Input label="Uren per m2" type="number" step="0.05" value={form.hoursPerM2} onChange={(e) => setForm({ ...form, hoursPerM2: e.target.value })} />
                  <Input label="Materiaalprijs per m2" type="number" value={form.materialPerM2} onChange={(e) => setForm({ ...form, materialPerM2: e.target.value })} />
                  <label className="check-field"><input type="checkbox" checked={form.scaffold} onChange={(e) => setForm({ ...form, scaffold: e.target.checked })} /> Steiger/ladder nodig</label>
                </>
              ) : (
                <>
                  <Input label="Geschatte uren" type="number" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
                  <Input label="Aantal personen" type="number" value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} />
                  <Input label="Materiaal geschat" type="number" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} />
                </>
              )}
              {form.template === 'Hovenier' && (
                <>
                  <label className="check-field"><input type="checkbox" checked={form.machine} onChange={(e) => setForm({ ...form, machine: e.target.checked })} /> Machine nodig</label>
                  <label className="check-field"><input type="checkbox" checked={form.disposal} onChange={(e) => setForm({ ...form, disposal: e.target.checked })} /> Groenafval afvoeren</label>
                </>
              )}
              <Input label="Reiskosten" type="number" value={form.travel} onChange={(e) => setForm({ ...form, travel: e.target.value })} />
              <Input label="Marge/opslag %" type="number" value={form.margin} onChange={(e) => setForm({ ...form, margin: e.target.value })} />
              <Input label="Btw %" type="number" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} />
            </div>
            <div className="line-editor">
              <h3>Extra regels</h3>
              {lines.map((line, i) => (
                <div className="line-row" key={i}>
                  <input value={line.description} onChange={(e) => setLines(lines.map((l, j) => j === i ? { ...l, description: e.target.value } : l))} />
                  <input type="number" value={line.amount} onChange={(e) => setLines(lines.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))} />
                  <input type="number" value={line.price} onChange={(e) => setLines(lines.map((l, j) => j === i ? { ...l, price: e.target.value } : l))} />
                  <Button variant="secondary" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Verwijder</Button>
                </div>
              ))}
              <Button variant="secondary" onClick={() => setLines([...lines, { description: 'Nieuwe regel', amount: 1, price: 0 }])}><Plus size={17} /> Regel toevoegen</Button>
            </div>
          </section>
          <QuotePreview totals={totals} form={form} lines={lines} onAccept={accept} />
        </div>
      )}

      {mode === 'preview' && <QuoteDocument quote={selected} onAccept={accept} />}
    </div>
  );
}

function QuotePreview({ totals, form, onAccept }) {
  return (
    <section className="card">
      <div className="section-heading">
        <h2>Automatische offerte-draft</h2>
        <p>Template: {form.template}</p>
      </div>
      <div className="price-list">
        <PriceRow label="Arbeid"              value={totals.labor} />
        <PriceRow label="Materiaal"           value={totals.material} />
        <PriceRow label="Materieel/reis"      value={totals.extra} />
        <PriceRow label="Handmatige regels"   value={totals.manualLines} />
        <PriceRow label="Marge/opslag"        value={totals.marginAmount} />
        <PriceRow label="Totaal excl. btw"    value={totals.totalExVat} />
        <PriceRow label="Btw"                 value={totals.vatAmount} />
        <PriceRow label="Totaal incl. btw"    value={totals.totalIncVat} strong />
      </div>
      <pre className="quote-text">Beste klant,{'\n\n'}Bedankt voor uw aanvraag. Op basis van de bekende informatie hebben wij een eerste offertevoorstel gemaakt. Deze draft bevat arbeid, materialen, reiskosten, marge en btw. Controleer aantallen, planning en voorwaarden voordat de offerte wordt verstuurd.{'\n\n'}Met vriendelijke groet,{'\n'}BossBase Demo</pre>
      <div className="form-actions">
        <Button variant="secondary"><Printer size={17} /> PDF-preview</Button>
        <Button variant="secondary"><Send size={17} /> Versturen via e-mailtemplate</Button>
        <Button onClick={onAccept}><Check size={17} /> Online akkoord simuleren</Button>
      </div>
    </section>
  );
}

function QuoteDocument({ quote, onAccept }) {
  return (
    <section className="card quote-document">
      <div className="quote-document-head">
        <div>
          <span className="eyebrow">Offerte preview</span>
          <h2>{quote.number}</h2>
          <p>{quote.customer} | Geldig tot {quote.validUntil}</p>
        </div>
        <div className="detail-total">
          <Badge tone={quote.status === 'Geaccepteerd' ? 'success' : 'today'}>{quote.status}</Badge>
          <strong>{money.format(quote.totalIncVat)}</strong>
        </div>
      </div>
      <p><strong>Omschrijving:</strong> {quote.description}</p>
      <ul>{quote.lines.map((line) => <li key={line}>{line}</li>)}</ul>
      <p><strong>Planning:</strong> {quote.planning}</p>
      <p><strong>Voorwaarden:</strong> Betaling volgens afspraak. Meerwerk wordt vooraf besproken.</p>
      <div className="form-actions">
        <Button variant="secondary"><Printer size={17} /> PDF-preview</Button>
        <Button variant="secondary"><Mail size={17} /> E-mailtemplate openen</Button>
        <Button onClick={onAccept}><Check size={17} /> Online akkoord simuleren</Button>
      </div>
    </section>
  );
}

function PriceRow({ label, value, strong }) {
  return (
    <div className={strong ? 'price-row price-total' : 'price-row'}>
      <span>{label}</span>
      <strong>{money.format(value)}</strong>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PLANNING
══════════════════════════════════════════════════ */

export function PlanningPage({ navigate, showToast }) {
  return (
    <div className="page-stack">
      <section className="card integration-card">
        <div>
          <h2>Weekplanning</h2>
          <p>Google Calendar koppelen is voorbereid als integratiepunt. Geplande klussen bewaren nu een mock event ID.</p>
        </div>
        <Button variant="secondary" onClick={() => showToast('Google Calendar koppeling gesimuleerd')}>Google Calendar koppelen</Button>
      </section>
      <section className="week-grid">
        {jobs.map((job) => (
          <article className="card job-card" key={job.id}>
            <div className="quote-card-top">
              <strong>{job.customer}</strong>
              <Badge tone="planned">{job.status}</Badge>
            </div>
            <p><Clock size={14} style={{ flexShrink: 0 }} /> {job.date} | {job.start}–{job.end}</p>
            <p><MapPin size={14} style={{ flexShrink: 0 }} /> {job.address}, {job.city}</p>
            <p>Team: {job.team}</p>
            <small style={{ color: 'var(--muted)' }}>Google event: {job.googleEventId || 'nog niet gesynchroniseerd'}</small>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => showToast('Gesynchroniseerd met Google Calendar')}>Synchroniseer</Button>
              <Button onClick={() => navigate(`/werkbonnen/${job.workOrderId}`)}>Werkbon</Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   WERKBONNEN — tabs fixed
══════════════════════════════════════════════════ */

export function WorkOrdersPage({ route, showToast }) {
  const id         = route.split('/')[2];
  const [activeId, setActiveId] = useState(id || workOrders[0].id);
  const active     = workOrders.find((o) => o.id === activeId) || workOrders[0];
  const [status,   setStatus]   = useState(active.status);
  const [activeTab, setTab]     = useState('Werkzaamheden');

  const tabs = ['Werkzaamheden', "Foto's", 'Uren', 'Materialen', 'Notities'];
  const checks = ['Werkzaamheden gecontroleerd', 'Benodigde materialen aanwezig', "Foto's vooraf toegevoegd", 'Werk uitgevoerd', "Foto's na afloop toegevoegd", 'Uren ingevuld', 'Materialen ingevuld'];

  const handleStatusChange = (e) => {
    setStatus(e.target.value);
    showToast(`Status bijgewerkt: ${e.target.value}`);
  };

  return (
    <div className="workorder-layout">
      <section className="card workorder-list">
        {workOrders.map((order) => (
          <button className={`compact-row ${activeId === order.id ? 'selected' : ''}`} key={order.id}
            onClick={() => { setActiveId(order.id); setStatus(order.status); setTab('Werkzaamheden'); }}>
            <span><strong>{order.customer}</strong>{order.date} | {order.status}</span>
            <ArrowRight size={16} />
          </button>
        ))}
      </section>

      <section className="workorder-phone">
        <div className="phone-topbar">
          <span />
          <strong>BossBase Werkbon</strong>
          <span />
        </div>
        <div className="mobile-workorder-head">
          <Badge tone="planned">{status}</Badge>
          <h2>{active.customer}</h2>
          <p>{active.description}</p>
          <div className="mobile-actions">
            <a className="btn btn-secondary" href={`tel:${active.phone}`}><Phone size={17} /> Bel</a>
            <button className="btn btn-secondary"><Route size={17} /> Route</button>
          </div>
        </div>

        <div className="mobile-meta">
          <span>{active.address}</span>
          <span>{active.date} | {active.time}</span>
        </div>

        <Select label="Status wijzigen" value={status} onChange={handleStatusChange}>
          <option>nog niet gestart</option>
          <option>bezig</option>
          <option>afgerond</option>
          <option>controle nodig</option>
        </Select>

        <div className="tabs">
          {tabs.map((t) => (
            <button key={t} className={activeTab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="mobile-panels">
          {activeTab === 'Werkzaamheden' && (
            <div className="checklist">
              {checks.map((check, i) => (
                <label key={check}><input type="checkbox" defaultChecked={active.checklist[i]} /> {check}</label>
              ))}
            </div>
          )}
          {activeTab === "Foto's" && (
            <button className="upload-placeholder" onClick={() => showToast("Foto's worden gesimuleerd geüpload")}>
              <Upload size={18} /> Foto's toevoegen (upload placeholder)
            </button>
          )}
          {activeTab === 'Uren' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <Input label="Medewerker" placeholder="Bijv. Jan Mulder" />
              <Input label="Aantal uren" type="number" placeholder="Bijv. 3.5" />
              <Input label="Type" placeholder="arbeid / voorbereiding" />
              <Button onClick={() => showToast('Uren opgeslagen')}><Check size={16} /> Uren opslaan</Button>
            </div>
          )}
          {activeTab === 'Materialen' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <Input label="Materiaal" placeholder="Bijv. 2 liter verf" />
              <Input label="Aantal" type="number" placeholder="2" />
              <Input label="Inkoopprijs" type="number" placeholder="28" />
              <Button onClick={() => showToast('Materiaal toegevoegd')}><Check size={16} /> Materiaal opslaan</Button>
            </div>
          )}
          {activeTab === 'Notities' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <Input type="textarea" rows="4" label="Notities" placeholder="Opmerking voor nacalculatie of overdracht" />
              <Button onClick={() => showToast('Notitie opgeslagen')}><Check size={16} /> Notitie opslaan</Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   UREN
══════════════════════════════════════════════════ */

export function HoursPage({ showToast }) {
  const [showForm, setShowForm] = useState(false);
  const total = hours.reduce((sum, h) => sum + h.total, 0);

  return (
    <div className="page-stack">
      <div className="stats-grid wide">
        <StatCard label="Totaal uren"        value={total}                                                        note="Mock registraties" />
        <StatCard label="Arbeid"             value={hours.filter((h) => h.type === 'arbeid').length}              note="Regels arbeid" />
        <StatCard label="Voorbereiding"      value={hours.filter((h) => h.type === 'voorbereiding').length}       note="Regels voorbereiding" />
        <StatCard label="Nacalculatie"       value="2 signalen"                                                   note="Uren boven begroting" />
      </div>

      <section className="card">
        <Toolbar>
          <label className="search-box"><Search size={18} /><input placeholder="Zoek op medewerker of klus" /></label>
          <Button onClick={() => setShowForm(true)}><Plus size={17} /> Uren toevoegen</Button>
        </Toolbar>
        <Table
          columns={['Medewerker', 'Klus', 'Datum', 'Tijd', 'Uren', 'Type', 'Notitie']}
          rows={hours}
          renderRow={(h) => (
            <tr key={h.id}>
              <td><strong>{h.employee}</strong></td>
              <td>{h.job}</td>
              <td>{h.date}</td>
              <td>{h.start}–{h.end}</td>
              <td><Badge tone="today">{h.total} uur</Badge></td>
              <td>{h.type}</td>
              <td><span>{h.note}</span></td>
            </tr>
          )}
        />
      </section>

      {showForm && (
        <SimpleModal title="Uren toevoegen" onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <Select label="Medewerker"><option>Rayvon Huisman</option><option>Jan Mulder</option><option>Sara de Vries</option><option>Omar El Amrani</option></Select>
            <Select label="Klus"><option>Van Dijk</option><option>Meijer Installatie</option><option>Bakker VvE Beheer</option></Select>
            <Input label="Datum" type="date" defaultValue="2026-05-03" />
            <Input label="Starttijd" type="time" defaultValue="08:00" />
            <Input label="Eindtijd" type="time" defaultValue="16:00" />
            <Select label="Type"><option>arbeid</option><option>voorbereiding</option><option>reistijd</option></Select>
            <Input className="span-2" label="Notitie" placeholder="Optionele toelichting" />
            <div className="form-actions span-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuleren</Button>
              <Button onClick={() => { setShowForm(false); showToast('Uren opgeslagen'); }}>Opslaan</Button>
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MATERIALEN
══════════════════════════════════════════════════ */

export function MaterialsPage({ showToast }) {
  const [showForm, setShowForm] = useState(false);
  const totalCost  = materials.reduce((sum, m) => sum + m.cost  * m.amount, 0);
  const totalSales = materials.reduce((sum, m) => sum + m.sales * m.amount, 0);

  return (
    <div className="page-stack">
      <div className="stats-grid">
        <StatCard label="Totaal inkoopwaarde"  value={money.format(totalCost)}  note="Alle materialen" />
        <StatCard label="Totaal verkoopwaarde" value={money.format(totalSales)} note="Doorberekend" />
        <StatCard label="Marge materialen"     value={money.format(totalSales - totalCost)} note="Bruto marge" />
      </div>

      <section className="card">
        <Toolbar>
          <label className="search-box"><Search size={18} /><input placeholder="Zoek op materiaal of klus" /></label>
          <Button onClick={() => setShowForm(true)}><Plus size={17} /> Materiaal toevoegen</Button>
        </Toolbar>
        <Table
          columns={['Materiaal', 'Klus', 'Aantal', 'Inkoop', 'Verkoop', 'Leverancier', 'Gebruikt']}
          rows={materials}
          renderRow={(m) => (
            <tr key={m.id}>
              <td><strong>{m.name}</strong><br /><span>{m.note}</span></td>
              <td>{m.job}</td>
              <td>{m.amount} {m.unit}</td>
              <td>{money.format(m.cost)}</td>
              <td>{money.format(m.sales)}</td>
              <td>{m.supplier}</td>
              <td><Badge tone={m.used ? 'success' : 'neutral'}>{m.used ? 'ja' : 'nee'}</Badge></td>
            </tr>
          )}
        />
      </section>

      {showForm && (
        <SimpleModal title="Materiaal toevoegen" onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <Input label="Materiaalnaam" placeholder="Bijv. Lak wit hoogglans" />
            <Select label="Klus"><option>Van Dijk</option><option>Meijer Installatie</option><option>Bakker VvE</option></Select>
            <Input label="Aantal" type="number" defaultValue="1" />
            <Input label="Eenheid" placeholder="stuks / liter / m2" />
            <Input label="Inkoopprijs" type="number" placeholder="28" />
            <Input label="Verkoopprijs" type="number" placeholder="39" />
            <Input label="Leverancier" placeholder="Bouwmarkt" />
            <Input className="span-2" label="Notitie" placeholder="Optionele opmerking" />
            <div className="form-actions span-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuleren</Button>
              <Button onClick={() => { setShowForm(false); showToast('Materiaal opgeslagen'); }}>Opslaan</Button>
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   OMZET
══════════════════════════════════════════════════ */

export function RevenuePage() {
  const open     = quotes.filter((q) => q.status === 'Verstuurd').reduce((sum, q) => sum + q.totalIncVat, 0);
  const accepted = quotes.filter((q) => q.status === 'Geaccepteerd').reduce((sum, q) => sum + q.totalIncVat, 0);
  const avg      = quotes.reduce((sum, q) => sum + q.totalIncVat, 0) / quotes.length;

  return (
    <div className="page-stack">
      <div className="stats-grid wide">
        <StatCard label="Open offertewaarde"  value={money.format(open)}     note="Verstuurd" />
        <StatCard label="Geaccepteerde omzet" value={money.format(accepted)} note="Akkoord" />
        <StatCard label="Betaald"             value={money.format(5060)}     note="Mock status" />
        <StatCard label="Conversie"           value="38%"                    note="Leads naar akkoord" />
      </div>
      <section className="card">
        <Table
          columns={['Klus/offerte', 'Totaal', 'Betaald', 'Openstaand', 'Betaalstatus', 'Notitie']}
          rows={quotes}
          renderRow={(q) => (
            <tr key={q.id}>
              <td>{q.number}<br /><span>{q.description}</span></td>
              <td>{money.format(q.totalIncVat)}</td>
              <td>{q.status === 'Geaccepteerd' ? money.format(1200) : money.format(0)}</td>
              <td>{money.format(q.status === 'Geaccepteerd' ? q.totalIncVat - 1200 : q.totalIncVat)}</td>
              <td><Badge tone={q.status === 'Geaccepteerd' ? 'today' : 'neutral'}>{q.status === 'Geaccepteerd' ? 'Aanbetaling ontvangen' : 'Niet betaald'}</Badge></td>
              <td><span>Basic omzetstatus</span></td>
            </tr>
          )}
        />
      </section>
      <section className="card">
        <div className="section-heading"><h2>Nacalculatie basic</h2><p>Begroot versus werkelijk voor afgeronde klussen.</p></div>
        <Table
          columns={['Klus', 'Begroot', 'Werkelijk', 'Verschil', 'Resultaat']}
          rows={[
            { job: 'Bakker VvE', budget: 628,  actual: 710,  result: 'Kleine afwijking' },
            { job: 'Meijer',     budget: 1980, actual: 2250, result: 'Uitgelopen' },
            { job: 'Van Dijk',   budget: 2562, actual: 2380, result: 'Goed gecalculeerd' }
          ]}
          renderRow={(r) => (
            <tr key={r.job}>
              <td>{r.job}</td>
              <td>{money.format(r.budget)}</td>
              <td>{money.format(r.actual)}</td>
              <td>{money.format(r.actual - r.budget)}</td>
              <td><Badge tone={r.result === 'Uitgelopen' ? 'danger' : r.result === 'Goed gecalculeerd' ? 'success' : 'today'}>{r.result}</Badge></td>
            </tr>
          )}
        />
        <p className="muted-copy" style={{ marginTop: 16 }}>Gemiddelde kluswaarde: {money.format(avg)}</p>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TEAM
══════════════════════════════════════════════════ */

export function TeamPage({ showToast }) {
  return (
    <div className="page-stack">
      <section className="card integration-card">
        <div>
          <h2>Team en rollen</h2>
          <p>Voor MVP: eigenaar/admin en medewerker. Planningconflict-detectie is een placeholder.</p>
        </div>
        <Button onClick={() => showToast('Medewerker uitnodiging verstuurd (simulatie)')}><Plus size={17} /> Medewerker toevoegen</Button>
      </section>
      <div className="cards-grid">
        {team.map((member) => (
          <article className="card" key={member.id}>
            <div className="quote-card-top">
              <h3 style={{ margin: 0 }}>{member.name}</h3>
              <Badge>{member.role}</Badge>
            </div>
            <p style={{ margin: '8px 0 4px', fontSize: 14, color: 'var(--muted)' }}>{member.email}</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--muted)' }}>{member.phone}</p>
            <p style={{ margin: '0 0 4px' }}>Tarief: <strong>{money.format(member.rate)}/uur</strong></p>
            <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 14 }}>Beschikbaar: {member.availability}</p>
            <div className="tag-row">{member.skills.map((skill) => <Badge key={skill}>{skill}</Badge>)}</div>
            <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>Gekoppelde klussen: {member.jobs.length || '—'}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   INSTELLINGEN
══════════════════════════════════════════════════ */

export function SettingsPage({ showToast }) {
  return (
    <div className="page-stack">
      <section className="card settings-card">
        <div className="section-heading"><h2>Bedrijfsinstellingen</h2><p>Templates gebruiken deze waarden als standaard.</p></div>
        <div className="form-grid">
          <Input label="Bedrijfsnaam"        defaultValue={settings.company} />
          <Input label="Logo upload"         placeholder="Upload later" />
          <Input label="Adres"               defaultValue={settings.address} />
          <Input label="KvK"                 defaultValue={settings.kvk} />
          <Input label="Btw-nummer"          defaultValue={settings.vat} />
          <Input label="E-mailadres"         defaultValue={settings.email} />
          <Input label="Telefoon"            defaultValue={settings.phone} />
          <Input label="Standaard uurtarief" type="number" defaultValue={settings.hourlyRate} />
          <Input label="Standaard btw"       type="number" defaultValue={settings.vatRate} />
          <Input label="Standaard reiskosten"type="number" defaultValue={settings.travelCost} />
          <Input label="Standaard marge"     type="number" defaultValue={settings.margin} />
          <Select label="Branchekeuze" defaultValue={settings.industry}>
            {quoteTemplates.concat('Anders').map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Input className="span-2" type="textarea" rows="4" label="Offertevoorwaarden" defaultValue="Deze offerte is vrijblijvend en geldig volgens de ingestelde geldigheid. Meerwerk wordt vooraf afgestemd." />
          <Input className="span-2" type="textarea" rows="3" label="E-mailhandtekening" defaultValue="Met vriendelijke groet, {{bedrijfsnaam}} | {{telefoonbedrijf}}" />
        </div>
        <div className="form-actions" style={{ marginTop: 20 }}>
          <Button onClick={() => showToast('Instellingen opgeslagen')}>Opslaan</Button>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>E-mailtemplates</h2>
          <p>Variabelen: {'{{klantnaam}}'}, {'{{bedrijfsnaam}}'}, {'{{offertelink}}'}, {'{{afspraakdatum}}'}.</p>
        </div>
        <div className="cards-grid compact">
          {emailTemplates.map((template) => (
            <article className="mini-card" key={template}>
              <strong>{template}</strong>
              <p>Template klaar om aan e-mail te koppelen.</p>
              <Button variant="secondary" onClick={() => showToast(`Template "${template}" geopend`)}>Bekijk template</Button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DOCUMENTEN
══════════════════════════════════════════════════ */

export function DocumentsPage({ showToast }) {
  const [filter, setFilter] = useState('alle');
  const categories = ['alle', 'Vooraf', 'Intake/opname', 'Schade/probleem', 'Materiaal'];
  const filtered = filter === 'alle' ? documents : documents.filter((d) => d.category === filter);

  return (
    <div className="page-stack">
      <div className="stats-grid">
        <StatCard label="Totaal documenten"   value={documents.length}                                     note="Alle bestanden" />
        <StatCard label="Foto's"              value={documents.filter((d) => d.name.match(/\.(jpg|png)/i)).length} note="Afbeeldingen" />
        <StatCard label="PDF bestanden"       value={documents.filter((d) => d.name.endsWith('.pdf')).length}      note="Documenten" />
      </div>

      <section className="card">
        <Toolbar>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <Button key={cat} variant={filter === cat ? 'primary' : 'secondary'} onClick={() => setFilter(cat)}
                style={{ minHeight: 36, padding: '7px 12px', fontSize: 13 }}>{cat}</Button>
            ))}
          </div>
          <Button onClick={() => showToast('Upload gesimuleerd — bestand toegevoegd')}><Upload size={17} /> Bestand uploaden</Button>
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState title="Geen documenten" message="Upload een foto of document om te starten." actionLabel="Bestand uploaden" onAction={() => showToast('Upload gesimuleerd')} />
        ) : (
          <Table
            columns={['Naam', 'Categorie', 'Gekoppeld aan', 'Datum', 'Uploader', 'Notitie']}
            rows={filtered}
            renderRow={(doc) => (
              <tr key={doc.id}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderOpen size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  {doc.name}
                </td>
                <td><Badge>{doc.category}</Badge></td>
                <td>{doc.linkedTo}</td>
                <td>{doc.date}</td>
                <td>{doc.uploader}</td>
                <td><span>{doc.note}</span></td>
              </tr>
            )}
          />
        )}
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAKEN
══════════════════════════════════════════════════ */

export function TasksPage({ showToast }) {
  const [filter,   setFilter]   = useState('alle');
  const [done,     setDone]     = useState(new Set());

  const filters = ['alle', 'vandaag', 'urgent', 'te laat', 'open'];
  const filtered = filter === 'alle' ? tasks : tasks.filter((t) => t.status === filter || t.priority === filter);

  const markDone = (id, title) => {
    setDone((prev) => new Set([...prev, id]));
    showToast(`Taak afgerond: ${title}`);
  };

  return (
    <div className="page-stack">
      <div className="stats-grid wide">
        <StatCard label="Totaal taken"  value={tasks.length}                                      note="Alle reminders" />
        <StatCard label="Vandaag"       value={tasks.filter((t) => t.status === 'vandaag').length} note="Urgentie vandaag" />
        <StatCard label="Te laat"       value={tasks.filter((t) => t.status === 'te laat').length} note="Overschreden" />
        <StatCard label="Afgerond"      value={done.size}                                          note="Deze sessie" />
      </div>

      <section className="card">
        <Toolbar>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filters.map((f) => (
              <Button key={f} variant={filter === f ? 'primary' : 'secondary'} onClick={() => setFilter(f)}
                style={{ minHeight: 36, padding: '7px 12px', fontSize: 13, textTransform: 'capitalize' }}>{f}</Button>
            ))}
          </div>
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState title="Geen taken" message="Alle taken zijn afgerond of er zijn geen taken in deze categorie." />
        ) : (
          <div className="task-list">
            {filtered.map((task) => (
              <article className="task-row" key={task.id} style={{ opacity: done.has(task.id) ? 0.45 : 1, transition: 'opacity 0.2s' }}>
                <div>
                  <strong style={{ textDecoration: done.has(task.id) ? 'line-through' : 'none' }}>{task.title}</strong>
                  <span>{task.customer} | {task.linked} | {task.deadline}</span>
                  <span>Eigenaar: {task.owner}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <Badge tone={task.status === 'te laat' ? 'danger' : task.priority === 'urgent' ? 'urgent' : 'today'}>{task.status}</Badge>
                  {!done.has(task.id) && (
                    <Button variant="secondary" onClick={() => markDone(task.id, task.title)}
                      style={{ minHeight: 32, padding: '6px 10px', fontSize: 12 }}>
                      <Check size={14} /> Klaar
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════ */

export function LoginPage({ navigate, showToast }) {
  const [form, setForm] = useState({ email: '', password: '' });

  const submit = (e) => {
    e.preventDefault();
    showToast('Welkom terug bij BossBase!');
    navigate('/dashboard');
  };

  return (
    <div className="login-page">
      <div className="login-panel card">
        <div className="login-brand">
          <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--color-primary)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontWeight: 900 }}>B</span>
          <strong>BossBase</strong>
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.6rem' }}>Inloggen</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--muted)' }}>Jij de baas, wij de basis.</p>
        <form className="login-form" onSubmit={submit}>
          <Input label="E-mailadres" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jij@bedrijf.nl" />
          <Input label="Wachtwoord" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          <Button type="submit" style={{ width: '100%', justifyContent: 'center' }}>Inloggen</Button>
        </form>
        <p style={{ marginTop: 20, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          Nog geen account?{' '}
          <button onClick={() => navigate('/registreer')} style={{ border: 0, background: 'none', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            Registreer gratis
          </button>
        </p>
        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          <button onClick={() => navigate('/dashboard')} style={{ border: 0, background: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 13 }}>
            Bekijk demo zonder account
          </button>
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   REGISTREER
══════════════════════════════════════════════════ */

export function RegisterPage({ navigate, showToast }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });

  const submit = (e) => {
    e.preventDefault();
    showToast(`Account aangemaakt voor ${form.company || form.name}!`);
    navigate('/dashboard');
  };

  return (
    <div className="login-page">
      <div className="login-panel card">
        <div className="login-brand">
          <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--color-primary)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontWeight: 900 }}>B</span>
          <strong>BossBase</strong>
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.6rem' }}>Gratis starten</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--muted)' }}>14 dagen gratis, geen creditcard nodig.</p>
        <form className="login-form" onSubmit={submit}>
          <Input label="Jouw naam" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jan de Vries" />
          <Input label="Bedrijfsnaam" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Schildersbedrijf De Vries" />
          <Input label="E-mailadres" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jan@bedrijf.nl" />
          <Input label="Wachtwoord" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimaal 8 tekens" />
          <Button type="submit" style={{ width: '100%', justifyContent: 'center' }}>Account aanmaken</Button>
        </form>
        <p style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
          Door te registreren ga je akkoord met onze voorwaarden.
        </p>
        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          Al een account?{' '}
          <button onClick={() => navigate('/login')} style={{ border: 0, background: 'none', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            Inloggen
          </button>
        </p>
      </div>
    </div>
  );
}
