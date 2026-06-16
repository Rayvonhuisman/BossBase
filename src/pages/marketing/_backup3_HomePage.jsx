import { useState, useEffect, useRef } from "react"
import { Nav, Footer, ScrollLine, Reveal, Wordmark, I, initChoreo, useReducedMotion, useScrollY } from "./MktShared"

/* ── Float cards ── */
function CardOfferte() {
  return (
    <div className="float-card" style={{ top: "6%", right: "4%", minWidth: 190 }}>
      <div className="fc-label">Offerte verstuurd</div>
      <div className="fc-title">Terras & Bestrating BV</div>
      <div className="fc-amount">€ 4.850</div>
      <span className="badge badge-sent" style={{ marginTop: 8 }}>Wacht op akkoord</span>
    </div>
  )
}
function CardPipeline() {
  return (
    <div className="float-card" style={{ top: "30%", left: "2%", minWidth: 170 }}>
      <div className="fc-label">Pipeline</div>
      {[
        { name: "Jansen Schilderwerk", status: "Akkoord",          cls: "badge-accepted" },
        { name: "De Vries Tuinen",     status: "Offerte gestuurd",  cls: "badge-sent" },
        { name: "Bakker Loodgieters",  status: "Nieuw",             cls: "badge-concept" },
      ].map(r => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--dk)", fontWeight: 600 }}>{r.name}</span>
          <span className={`badge ${r.cls}`}>{r.status}</span>
        </div>
      ))}
    </div>
  )
}
function CardAgenda() {
  return (
    <div className="float-card" style={{ bottom: "14%", right: "6%", minWidth: 164 }}>
      <div className="fc-label">Vandaag</div>
      {[
        { time: "09:00", text: "Offerte opstellen",      color: "#ecfdf5", col: "#0c7a38" },
        { time: "13:30", text: "Afspraak Van der Berg",  color: "#dbeafe", col: "#1d4ed8" },
        { time: "16:00", text: "Factuur versturen",      color: "#fef3c7", col: "#b45309" },
      ].map(e => (
        <div key={e.time} style={{ background: e.color, color: e.col, borderRadius: 8, padding: "6px 9px", marginTop: 7, fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ fontWeight: 500, opacity: 0.75, fontSize: 11 }}>{e.time}</span>
          <div style={{ marginTop: 2 }}>{e.text}</div>
        </div>
      ))}
    </div>
  )
}
function CardOmzet() {
  return (
    <div className="float-card" style={{ bottom: "4%", left: "5%", minWidth: 160 }}>
      <div className="fc-label">Omzet deze maand</div>
      <div className="fc-amount">€ 12.340</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 12.5, color: "var(--pd)", fontWeight: 600 }}>
        {I.arrowRight} <span>+18% vs vorige maand</span>
      </div>
    </div>
  )
}
function CardLead() {
  return (
    <div className="float-card fc-hide-m" style={{ top: "54%", right: "1%", minWidth: 158 }}>
      <div className="fc-label">Nieuwe lead</div>
      <div className="fc-title">Peters Installatiewerk</div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--dmu)" }}>Klussenbedrijf · Hoorn</div>
      <div className="btn btn-p" style={{ marginTop: 10, padding: "6px 12px", fontSize: 13, width: "100%", justifyContent: "center" }}>
        Contact opnemen
      </div>
    </div>
  )
}

function HeroStage({ reduced, scrollY }) {
  return (
    <div className="hero-stage">
      {[CardOfferte, CardPipeline, CardAgenda, CardOmzet, CardLead].map((Card, i) => {
        const yShift = reduced ? 0 : Math.sin((scrollY + i * 70) * 0.001) * 8
        return (
          <div
            key={i}
            style={{
              transform: `translateY(${yShift}px)`,
              transition: reduced ? "none" : "transform 0.8s ease",
            }}
          >
            <Card />
          </div>
        )
      })}
    </div>
  )
}

/* ── Logo bar ── */
const LOGOS = [
  "Jansen Schilderwerk", "De Vries Tuinen", "Peters Installatiewerk",
  "Bakker Loodgieters", "Smit Groenvoorziening", "Hendriks Constructie",
  "Van Dam Elektra", "Boer & Zonen", "Kuiper Timmerwerk", "Bruin Dakdekkers",
]

function LogoBar() {
  const doubled = [...LOGOS, ...LOGOS]
  return (
    <div className="logobar">
      <div className="container">
        <div className="logobar-label">Vertrouwd door vakmannen door heel Nederland</div>
        <div className="marquee">
          <div className="marquee-track">
            {doubled.map((name, i) => (
              <div key={i} className="logo-item">
                <span className="logo-dot" />
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Probleem / oplossing ── */
function ProblemSolution() {
  const chips = [
    { icon: I.mail,      text: "Offerte in e-mail map",     top: "8%",  left: "4%"  },
    { icon: I.signature, text: "Excel: klanten.xlsx",       top: "28%", right: "5%" },
    { icon: I.calendar,  text: "Agenda: PostIt briefjes",   top: "52%", left: "8%"  },
    { icon: I.chart,     text: "Omzet? Goed gevoel...",     top: "68%", right: "2%" },
    { icon: I.kanban,    text: "Wie belt er terug?",        top: "84%", left: "18%" },
  ]
  return (
    <div className="section">
      <div className="container">
        <Reveal><div className="section-head">
          <span className="section-kicker">Het probleem</span>
          <h2>Klanten door je vingers laten glippen. Stop daarmee.</h2>
          <p>Chaos met offertes, klanten en agenda kost elke maand duizenden euro's aan gemiste opdrachten.</p>
        </div></Reveal>
        <div className="chaos-solution">
          <div className="chaos-pane">
            {chips.map((c, i) => (
              <div key={i} className="chaos-chip" style={{ top: c.top, left: c.left, right: c.right }}>
                {c.icon} {c.text}
              </div>
            ))}
          </div>
          <div className="solution-arrow">{I.arrowRight}</div>
          <div className="solution-screen">
            <div className="solution-screen-bar"><i/><i/><i/></div>
            <div style={{ padding: "24px 20px", display: "grid", gap: 12 }}>
              {[
                { label: "Pipeline",        val: "7 actieve leads",         color: "#ecfdf5" },
                { label: "Offerte",         val: "3 wachten op akkoord",    color: "#fef3c7" },
                { label: "Agenda vandaag",  val: "2 afspraken gepland",     color: "#dbeafe" },
                { label: "Omzet okt",       val: "€ 12.340 · +18%",         color: "#f0fdf4" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: r.color, borderRadius: 10, padding: "12px 16px" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</span>
                  <span style={{ fontSize: 14, color: "var(--dmu)" }}>{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Feature visuals ── */
function FeatureVisualCRM() {
  return (
    <div className="feature-frame-wrap">
      <div className="feature-visual">
        <div className="frame-bar"><i/><i/><i/><span>BossBase — Klanten</span></div>
        <div className="frame-body" style={{ display: "grid", gap: 10 }}>
          {[
            { name: "Bakker Loodgieters",     status: "Actief",  val: "€ 3.200", cls: "badge-accepted" },
            { name: "Jansen Schilderwerk",    status: "Offerte", val: "€ 1.850", cls: "badge-sent" },
            { name: "Peters Installatiewerk", status: "Nieuw",   val: "—",       cls: "badge-concept" },
          ].map(r => (
            <div key={r.name} className="mini-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <span className={`badge ${r.cls}`} style={{ marginTop: 4 }}>{r.status}</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--dk)" }}>{r.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeatureVisualOfferte() {
  return (
    <div className="feature-frame-wrap">
      <div className="feature-visual" style={{ transform: "rotateY(0)" }}>
        <div className="frame-bar"><i/><i/><i/><span>BossBase — Offertes</span></div>
        <div className="frame-body">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Offerte #2024-048</div>
          {[
            { desc: "Schilderwerk gevel", price: "€ 2.400" },
            { desc: "Materialen",         price: "€ 650" },
            { desc: "Reiskosten",         price: "€ 90" },
          ].map(r => (
            <div key={r.desc} className="mini-card" style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>{r.desc}</span>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{r.price}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 15 }}>
            <span>Totaal incl. BTW</span><span style={{ color: "var(--pd)" }}>€ 3.803</span>
          </div>
          <div className="btn btn-p" style={{ marginTop: 12, width: "100%", justifyContent: "center", fontSize: 14 }}>
            Versturen per e-mail
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureVisualPipeline() {
  return (
    <div className="feature-frame-wrap">
      <div className="feature-visual">
        <div className="frame-bar"><i/><i/><i/><span>BossBase — Pipeline</span></div>
        <div className="frame-body" style={{ display: "flex", gap: 10, overflowX: "auto" }}>
          {[
            { col: "Nieuw",            cards: ["Peters Inst.", "Hendriks BV"] },
            { col: "Offerte gestuurd", cards: ["Jansen Schild."] },
            { col: "Akkoord",          cards: ["Bakker Loodg."] },
          ].map(col => (
            <div key={col.col} style={{ flex: "0 0 130px", background: "var(--bgx)", borderRadius: 10, padding: "8px 8px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--dmu)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{col.col}</div>
              {col.cards.map(c => (
                <div key={c} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", marginBottom: 7, fontSize: 12.5, fontWeight: 600, color: "var(--dk)" }}>{c}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AgendaVisual() {
  return (
    <div className="feature-frame-wrap">
      <div className="feature-visual">
        <div className="frame-bar"><i/><i/><i/><span>BossBase — Agenda</span></div>
        <div className="frame-body" style={{ display: "grid", gap: 9 }}>
          {[
            { time: "09:00", title: "Offerte opstellen — Jansen",   color: "#ecfdf5", col: "#0c7a38" },
            { time: "11:30", title: "Afspraak: Peters Installatiewerk", color: "#dbeafe", col: "#1d4ed8" },
            { time: "14:00", title: "Terugbellen — Bakker Loodg.", color: "#fef3c7", col: "#b45309" },
          ].map(e => (
            <div key={e.time} style={{ background: e.color, color: e.col, borderRadius: 10, padding: "10px 13px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.7 }}>{e.time}</div>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{e.title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OmzetVisual() {
  const bars = [55, 68, 42, 78, 85, 61, 90, 72, 95, 64, 88, 100]
  const months = ["Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"]
  return (
    <div className="feature-frame-wrap">
      <div className="feature-visual" style={{ transform: "rotateY(0)" }}>
        <div className="frame-bar"><i/><i/><i/><span>BossBase — Omzet</span></div>
        <div className="frame-body">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Omzet 2024</span>
            <span style={{ color: "var(--pd)", fontWeight: 700, fontSize: 14 }}>€ 148.320</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 100 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                <div style={{ width: "100%", borderRadius: "4px 4px 2px 2px", background: i === 11 ? "var(--p)" : "var(--pl)", height: `${h}%` }} />
                <span style={{ fontSize: 9.5, color: "var(--dl)" }}>{months[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  {
    icon: I.users,
    title: "CRM voor vakmensen",
    desc: "Alle klantinfo op één plek. Notities, opdrachten, communicatie en historie automatisch bijgehouden.",
    points: ["Klantenkaarten met volledige historie", "Automatische opvolgherinneringen", "Segmenteer op sector of regio"],
    Visual: FeatureVisualCRM,
    flip: false,
  },
  {
    icon: I.signature,
    title: "Offertes in 2 minuten",
    desc: "Professionele offertes met jouw huisstijl. Klant tekent digitaal, jij ontvangt direct een bevestiging.",
    points: ["Slimme regelitems met BTW", "Digitale handtekening", "Automatisch omzetten naar factuur"],
    Visual: FeatureVisualOfferte,
    flip: true,
  },
  {
    icon: I.kanban,
    title: "Pipeline: zie elke kans",
    desc: "Sleep leads van 'nieuw' naar 'akkoord'. Nooit meer een opdracht vergeten omdat je het bijhield in je hoofd.",
    points: ["Aanpasbare fasen", "Waarde per fase in één oogopslag", "Koppeling met agenda en offertes"],
    Visual: FeatureVisualPipeline,
    flip: false,
  },
  {
    icon: I.calendar,
    title: "Agenda die meedenkt",
    desc: "Plan afspraken, koppel ze aan klanten en stuur automatisch herinneringen. Nooit meer no-shows.",
    points: ["Klantgekoppelde afspraken", "Automatische SMS-herinneringen", "Synchroniseer met Google Calendar"],
    Visual: AgendaVisual,
    flip: true,
  },
  {
    icon: I.chart,
    title: "Omzet in één oogopslag",
    desc: "Zie direct hoeveel je verdient, welke klanten het meest opleveren en waar kansen liggen.",
    points: ["Realtime omzetdashboard", "Beste klanten en sectoren", "Exporteer naar accountant"],
    Visual: OmzetVisual,
    flip: false,
  },
]

function Features() {
  return (
    <div className="section">
      <div className="container">
        <Reveal><div className="section-head">
          <span className="section-kicker">Functies</span>
          <h2>Alles wat je nodig hebt. Niets wat je niet nodig hebt.</h2>
          <p>BossBase combineert CRM, offertes, agenda en financieel in één eenvoudige tool.</p>
        </div></Reveal>
        <div className="feature-rows">
          {FEATURES.map((f, i) => (
            <Reveal key={i}>
              <div className={`feature-row${f.flip ? " flip" : ""}`}>
                <div className="feature-copy">
                  <div className="feature-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                  <ul className="feature-points">
                    {f.points.map(p => <li key={p}>{I.check} {p}</li>)}
                  </ul>
                </div>
                <div>{f.Visual && <f.Visual />}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Demo sectie ── */
const DEMO_SCREENS = [
  { id: "dashboard", label: "Dashboard", icon: I.chart },
  { id: "pipeline",  label: "Pipeline",  icon: I.kanban },
  { id: "offertes",  label: "Offertes",  icon: I.signature },
  { id: "agenda",    label: "Agenda",    icon: I.calendar },
  { id: "klanten",   label: "Klanten",   icon: I.users },
  { id: "omzet",     label: "Omzet",     icon: I.chart },
]

function CountVal({ to, prefix = "", suffix = "" }) {
  const [val, setVal] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = null
        const dur = 1200
        const step = ts => {
          if (!start) start = ts
          const pct = Math.min((ts - start) / dur, 1)
          setVal(Math.round(pct * pct * to))
          if (pct < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
        io.disconnect()
      }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [to])
  return <span ref={ref}>{prefix}{val.toLocaleString("nl-NL")}{suffix}</span>
}

function DashboardScreen() {
  return (
    <>
      <div className="demo-h">
        <h3>Dashboard</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--dmu)" }}>Oktober 2024</span>
          <button className="btn btn-s" style={{ padding: "6px 12px", fontSize: 13 }}>Exporteer</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { lbl: "Omzet", val: "€ 12.340", sub: "+18% vs vorige maand" },
          { lbl: "Leads", val: "7 actief", sub: "2 wachten op offerte" },
          { lbl: "Offertes", val: "€ 28.500", sub: "3 wachten op akkoord" },
          { lbl: "Klanten", val: "34", sub: "5 nieuw deze maand" },
        ].map(s => (
          <div key={s.lbl} className="demo-card demo-stat">
            <div className="lbl">{s.lbl}</div>
            <div className="val">{s.val}</div>
            <div className="sub">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="demo-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="demo-table">
          <thead><tr><th>Klant</th><th>Status</th><th>Waarde</th><th>Datum</th></tr></thead>
          <tbody>
            {[
              { name: "Bakker Loodgieters",    status: "Akkoord", cls: "badge-accepted", val: "€ 3.200", date: "12 okt" },
              { name: "Jansen Schilderwerk",   status: "Offerte", cls: "badge-sent",     val: "€ 1.850", date: "10 okt" },
              { name: "Peters Installatiewerk",status: "Nieuw",   cls: "badge-concept",  val: "—",       date: "9 okt" },
              { name: "De Vries Tuinen",       status: "Betaald", cls: "badge-paid",     val: "€ 4.500", date: "7 okt" },
            ].map(r => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td><span className={`badge ${r.cls}`}>{r.status}</span></td>
                <td style={{ fontWeight: 700 }}>{r.val}</td>
                <td style={{ color: "var(--dmu)" }}>{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PipelineScreen() {
  return (
    <>
      <div className="demo-h"><h3>Pipeline</h3><button className="btn btn-p" style={{ padding: "8px 14px", fontSize: 13 }}>+ Lead toevoegen</button></div>
      <div className="pipeline-cols">
        {[
          { col: "Nieuwe aanvraag",  cards: [{ t: "Peters Installatiewerk", s: "Klussenbedrijf", m: "€ 2.400" }, { t: "Hendriks Constructie", s: "Aannemer", m: "€ 8.500" }] },
          { col: "Contact opgenomen", cards: [{ t: "Kuiper Timmerwerk", s: "Timmerman", m: "€ 1.200" }] },
          { col: "Offerte verstuurd", cards: [{ t: "Jansen Schilderwerk", s: "Schilder", m: "€ 1.850" }] },
          { col: "Akkoord",          cards: [{ t: "Bakker Loodgieters", s: "Loodgieter", m: "€ 3.200" }] },
        ].map(col => (
          <div key={col.col} className="pipeline-col">
            <h4>{col.col} <span style={{ background: "rgba(255,255,255,0.7)", borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>{col.cards.length}</span></h4>
            {col.cards.map(c => (
              <div key={c.t} className="pipeline-card">
                <div className="t">{c.t}</div>
                <div className="s">{c.s}</div>
                <div className="m">{c.m}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function OffertesScreen() {
  return (
    <>
      <div className="demo-h"><h3>Offertes</h3><button className="btn btn-p" style={{ padding: "8px 14px", fontSize: 13 }}>+ Nieuwe offerte</button></div>
      <div className="demo-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="demo-table">
          <thead><tr><th>Nummer</th><th>Klant</th><th>Bedrag</th><th>Status</th></tr></thead>
          <tbody>
            {[
              { num: "#2024-048", name: "Jansen Schilderwerk",    val: "€ 3.803", cls: "badge-sent",     status: "Verstuurd" },
              { num: "#2024-047", name: "Bakker Loodgieters",     val: "€ 2.175", cls: "badge-accepted", status: "Akkoord" },
              { num: "#2024-046", name: "Peters Installatiewerk", val: "€ 6.500", cls: "badge-concept",  status: "Concept" },
              { num: "#2024-045", name: "De Vries Tuinen",        val: "€ 1.540", cls: "badge-paid",     status: "Betaald" },
            ].map(r => (
              <tr key={r.num}>
                <td style={{ fontWeight: 700, color: "var(--pd)" }}>{r.num}</td>
                <td>{r.name}</td>
                <td style={{ fontWeight: 700 }}>{r.val}</td>
                <td><span className={`badge ${r.cls}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function AgendaScreen() {
  return (
    <>
      <div className="demo-h"><h3>Agenda</h3><button className="btn btn-p" style={{ padding: "8px 14px", fontSize: 13 }}>+ Afspraak</button></div>
      <div className="agenda-grid">
        {["Ma 14", "Di 15", "Wo 16", "Do 17", "Vr 18"].map((day, di) => (
          <div key={day} className="agenda-day">
            <h5>{day}</h5>
            {di === 0 && <>
              <div className="agenda-evt green"><span className="tm">09:00</span>Offerte opstellen</div>
              <div className="agenda-evt blue"><span className="tm">14:00</span>Afspraak: Peters</div>
            </>}
            {di === 1 && <div className="agenda-evt amber"><span className="tm">10:30</span>Terugbellen: Van der Berg</div>}
            {di === 2 && <>
              <div className="agenda-evt green"><span className="tm">08:00</span>Werkdag: Jansen</div>
              <div className="agenda-evt blue"><span className="tm">16:00</span>Evaluatie afspraak</div>
            </>}
            {di === 3 && <div className="agenda-evt amber"><span className="tm">13:00</span>Facturen versturen</div>}
            {di === 4 && <div className="agenda-evt green"><span className="tm">09:00</span>Wekelijks overzicht</div>}
          </div>
        ))}
      </div>
    </>
  )
}

function KlantenScreen() {
  return (
    <>
      <div className="demo-h"><h3>Klanten</h3><button className="btn btn-p" style={{ padding: "8px 14px", fontSize: 13 }}>+ Klant toevoegen</button></div>
      <div className="demo-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="demo-table">
          <thead><tr><th>Naam</th><th>Sector</th><th>Omzet</th><th>Laatste contact</th></tr></thead>
          <tbody>
            {[
              { name: "Bakker Loodgieters",     sector: "Loodgieterij",    val: "€ 12.400", date: "12 okt" },
              { name: "Jansen Schilderwerk",    sector: "Schilderwerk",    val: "€ 8.200",  date: "10 okt" },
              { name: "De Vries Tuinen",        sector: "Groenvoorziening",val: "€ 6.500",  date: "8 okt"  },
              { name: "Peters Installatiewerk", sector: "Installatie",     val: "€ 4.100",  date: "5 okt"  },
            ].map(r => (
              <tr key={r.name}>
                <td style={{ fontWeight: 700 }}>{r.name}</td>
                <td>{r.sector}</td>
                <td style={{ fontWeight: 700, color: "var(--pd)" }}>{r.val}</td>
                <td style={{ color: "var(--dmu)" }}>{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function OmzetScreen() {
  const data = [42, 58, 51, 73, 66, 81, 79, 88, 72, 95, 89, 100]
  const months = ["J","F","M","A","M","J","J","A","S","O","N","D"]
  return (
    <>
      <div className="demo-h">
        <h3>Omzet 2024</h3>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--pd)" }}>€ 148.320</div>
      </div>
      <div className="demo-card">
        <div className="omzet-chart">
          {data.map((h, i) => (
            <div key={i} className="omzet-bar">
              <i style={{ height: `${h}%` }} className={i === 11 ? "hot" : ""} />
              <span>{months[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
        {[
          { lbl: "Beste maand", val: "December" },
          { lbl: "Gem. per maand", val: "€ 12.360" },
          { lbl: "Groei YoY", val: "+24%" },
        ].map(s => (
          <div key={s.lbl} className="demo-card demo-stat" style={{ padding: "12px 14px" }}>
            <div className="lbl">{s.lbl}</div>
            <div className="val" style={{ fontSize: 18 }}>{s.val}</div>
          </div>
        ))}
      </div>
    </>
  )
}

const SCREEN_COMPONENTS = {
  dashboard: DashboardScreen,
  pipeline: PipelineScreen,
  offertes: OffertesScreen,
  agenda: AgendaScreen,
  klanten: KlantenScreen,
  omzet: OmzetScreen,
}

function DemoSection() {
  const [active, setActive] = useState("dashboard")
  const Screen = SCREEN_COMPONENTS[active]
  return (
    <div className="section" style={{ background: "var(--bgs)", borderTop: "1px solid var(--border)" }}>
      <div className="container">
        <Reveal><div className="section-head">
          <span className="section-kicker">Live demo</span>
          <h2>Klik rond. Overtuig jezelf.</h2>
          <p>Dit is echt BossBase. Geen mockup, geen verkooppraatje.</p>
        </div></Reveal>
        <Reveal>
          <div className="demo-wrap" style={{ position: "relative" }}>
            <div className="demo-tag">LIVE DEMO</div>
            <div className="demo-sidebar">
              <div className="wordmark" style={{ padding: "6px 12px 18px", fontSize: 18 }}><span className="b1">B</span>B</div>
              {DEMO_SCREENS.map(s => (
                <button key={s.id} className={`demo-nav-item${active === s.id ? " active" : ""}`} onClick={() => setActive(s.id)}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
            <div className="demo-main"><Screen /></div>
          </div>
        </Reveal>
        <div style={{ display: "flex", gap: 40, alignItems: "center", justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          {[
            { prefix: "", n: 2400, suffix: "+", lbl: "Vakmannen gebruiken BossBase" },
            { prefix: "€ ", n: 2100000, suffix: "+", lbl: "Aan offertes verstuurd" },
            { prefix: "", n: 98, suffix: "%", lbl: "Klanttevredenheid" },
          ].map(s => (
            <div key={s.lbl} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", color: "var(--dk)" }}>
                {s.prefix}<CountVal to={s.n} suffix={s.suffix} />
              </div>
              <div style={{ fontSize: 13.5, color: "var(--dmu)", marginTop: 3 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Voor wie (homepage sectie) ── */
const BRANCHES_HOME = [
  { icon: I.wrench,    name: "Loodgieter" },
  { icon: I.tool,      name: "Schilder" },
  { icon: I.bolt,      name: "Elektricien" },
  { icon: I.truck,     name: "Transporteur" },
  { icon: I.package,   name: "Aannemer" },
  { icon: I.users,     name: "Installateur" },
  { icon: I.calendar,  name: "Tuinman" },
  { icon: I.building,  name: "Schoonmaker" },
]

function VoorWie({ navigate }) {
  return (
    <div className="section voorwie-bg">
      <div className="container">
        <Reveal><div className="section-head">
          <span className="section-kicker">Voor wie</span>
          <h2>Gebouwd voor de handen die Nederland laten draaien</h2>
          <p>Of je nu schilder, loodgieter of aannemer bent — BossBase past zich aan jouw werkwijze aan.</p>
        </div></Reveal>
        <Reveal stagger>
          <div className="branche-grid">
            {BRANCHES_HOME.map(b => (
              <div key={b.name} className="branche-card">
                <div className="ic">{b.icon}</div>
                {b.name}
              </div>
            ))}
          </div>
        </Reveal>
        <p className="branche-note">
          Jouw branche er niet bij?{" "}
          <a href="/voor-wie" style={{ color: "var(--pd)", fontWeight: 600 }}
            onClick={e => { if (navigate) { e.preventDefault(); navigate("/voor-wie") } }}>
            Bekijk alle sectoren →
          </a>
        </p>
      </div>
    </div>
  )
}

/* ── Pricing (homepage) ── */
const TIERS_HOME = [
  {
    tier: "Starter", who: "Perfect voor ZZP'ers",
    monthly: 19, yearly: 15, extra: null,
    features: ["1 gebruiker", "Onbeperkt klanten", "Offertes & facturen", "Agenda", "E-mailondersteuning"],
    hot: false,
  },
  {
    tier: "Groei", who: "Voor groeiende bedrijven",
    monthly: 39, yearly: 29, extra: "+ € 9/extra gebruiker",
    features: ["Tot 5 gebruikers", "Alles van Starter", "Pipeline CRM", "Omzetrapportages", "SMS-herinneringen", "Prioriteitsondersteuning"],
    hot: true,
  },
  {
    tier: "Team", who: "Grotere teams & bedrijven",
    monthly: 79, yearly: 59, extra: "+ € 7/extra gebruiker",
    features: ["Tot 15 gebruikers", "Alles van Groei", "Meerdere vestigingen", "API-toegang", "Maatwerk rapportages", "Persoonlijke onboarding"],
    hot: false,
  },
]

function Pricing({ navigate }) {
  const [yearly, setYearly] = useState(false)
  return (
    <div className="section pricing">
      <div className="container">
        <Reveal><div className="section-head">
          <span className="section-kicker">Prijzen</span>
          <h2>Duidelijke prijs. Geen verrassingen.</h2>
          <p>Altijd 14 dagen gratis proberen. Geen creditcard nodig.</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 24 }}>
            <div className="bill-toggle">
              <button className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Maandelijks</button>
              <button className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Jaarlijks</button>
            </div>
            {yearly && <div className="bill-hook pop">{I.bolt} Bespaar 25% bij jaarabonnement</div>}
          </div>
        </div></Reveal>
        <Reveal stagger>
          <div className="price-grid">
            {TIERS_HOME.map(t => (
              <div key={t.tier} className={`price-card${t.hot ? " hot" : ""}`}>
                {t.hot && <div className="hot-badge">⚡ Meest gekozen</div>}
                <div className="tier">{t.tier}</div>
                <div className="who">{t.who}</div>
                <div className="amount">
                  <strong>€ {yearly ? t.yearly : t.monthly}</strong>
                  <span>/ maand</span>
                </div>
                <div className="extra-user">{t.extra || " "}</div>
                <ul>{t.features.map(f => <li key={f}>{I.check} {f}</li>)}</ul>
                <a href="/registreer" className={`btn ${t.hot ? "btn-p glow" : "btn-s"}`}
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={e => { if (navigate) { e.preventDefault(); navigate("/registreer") } }}>
                  Gratis 14 dagen proberen
                </a>
              </div>
            ))}
          </div>
        </Reveal>
        <div className="price-foot">
          Alle plannen inclusief BTW-aangifte export, SEPA-incasso ondersteuning en dataportabiliteit.{" "}
          <a href="/prijzen" style={{ color: "var(--pd)", fontWeight: 600 }}
            onClick={e => { if (navigate) { e.preventDefault(); navigate("/prijzen") } }}>
            Vergelijk alle functies →
          </a>
        </div>
      </div>
    </div>
  )
}

/* ── Testimonials ── */
const QUOTES = [
  { quote: "Eindelijk geen gedoe meer met losse Excel-sheets. Mijn offertes gaan nu 3x zo snel de deur uit.", name: "Mark Jansen", role: "Schilder", initials: "MJ" },
  { quote: "Ik vergat vroeger altijd leads op te volgen. Nu doet BossBase me dat herinneren. Vorige maand 2 extra opdrachten binnengehaald.", name: "Peter Bakker", role: "Loodgieter", initials: "PB" },
  { quote: "De pipeline-weergave is goud. Ik zie nu in één oogopslag welke klanten aandacht nodig hebben.", name: "Karin de Vries", role: "Aannemer", initials: "KV" },
]

function Testimonials() {
  return (
    <div className="section" style={{ background: "var(--bgs)", borderTop: "1px solid var(--border)" }}>
      <div className="container">
        <Reveal><div className="section-head">
          <span className="section-kicker">Ervaringen</span>
          <h2>Wat klanten zeggen</h2>
        </div></Reveal>
        <Reveal stagger>
          <div className="quote-grid">
            {QUOTES.map(q => (
              <div key={q.name} className="quote-card">
                <div style={{ display: "flex", color: "var(--p)", gap: 2 }}>
                  {[...Array(5)].map((_, i) => <span key={i}>{I.star}</span>)}
                </div>
                <blockquote>"{q.quote}"</blockquote>
                <div className="quote-who">
                  <div className="quote-avatar">{q.initials}</div>
                  <div><div className="nm">{q.name}</div><div className="co">{q.role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  )
}

/* ── FAQ ── */
const FAQ_HOME = [
  { q: "Is BossBase echt gratis te proberen?", a: "Ja, je start gratis met een 14-daagse proefperiode. Geen creditcard nodig, geen verborgen kosten." },
  { q: "Kan ik van abonnement wisselen?", a: "Ja, je kunt op elk moment upgraden of downgraden. Bij downgrade gaat de wijziging in aan het einde van je huidige periode." },
  { q: "Is mijn data veilig?", a: "Absoluut. We gebruiken AES-256 versleuteling, servers in Nederland en zijn AVG-compliant. Jouw data is altijd van jou." },
  { q: "Heb ik technische kennis nodig?", a: "Nee. BossBase is gebouwd voor vakmensen, niet voor IT'ers. De meeste gebruikers zijn in 10 minuten up-and-running." },
]

function FaqHome({ navigate }) {
  const [open, setOpen] = useState(null)
  return (
    <div className="section">
      <div className="container">
        <Reveal><div className="section-head">
          <span className="section-kicker">FAQ</span>
          <h2>Veelgestelde vragen</h2>
        </div></Reveal>
        <div className="faq-list">
          {FAQ_HOME.map((item, i) => (
            <div key={i} className="faq-item" data-open={open === i ? "true" : "false"}>
              <button className="faq-q" onClick={() => setOpen(open === i ? null : i)}>
                {item.q} {I.chevronDown}
              </button>
              <div className="faq-a"><div><p>{item.a}</p></div></div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", marginTop: 24 }}>
          <a href="/faq" style={{ color: "var(--pd)", fontWeight: 600, fontSize: 15 }}
            onClick={e => { if (navigate) { e.preventDefault(); navigate("/faq") } }}>
            Alle veelgestelde vragen →
          </a>
        </p>
      </div>
    </div>
  )
}

/* ── Slot CTA ── */
function FinalCta({ navigate }) {
  return (
    <div className="section">
      <div className="container">
        <Reveal>
          <div className="final-cta">
            <span className="section-kicker" style={{ background: "rgba(29,219,98,0.15)", color: "var(--p)" }}>Starten?</span>
            <h2>Stop met improviseren. <span className="green">Begin met BossBase.</span></h2>
            <p>14 dagen gratis. Geen creditcard. Geen gedoe.</p>
            <div className="hero-ctas" style={{ justifyContent: "center" }}>
              <a href="/registreer" className="btn btn-p glow btn-lg"
                onClick={e => { if (navigate) { e.preventDefault(); navigate("/registreer") } }}>
                Gratis proberen {I.arrowRight}
              </a>
              <a href="/functies" className="btn btn-s btn-lg"
                onClick={e => { if (navigate) { e.preventDefault(); navigate("/functies") } }}>
                Alle functies bekijken
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

/* ── HomePage ── */
export default function HomePage({ navigate }) {
  const reduced = useReducedMotion()
  const scrollY = useScrollY()

  useEffect(() => {
    const cleanup = initChoreo()
    return cleanup
  }, [])

  return (
    <div className="bm">
      <Nav navigate={navigate} />
      <main>
        <section className="hero">
          <div className="container">
            <div className="hero-grid">
              <div>
                <div className="hero-badge">{I.bolt} Nieuw: Automatische btw-aangifte export</div>
                <h1>
                  Stop klanten van <span className="accent">door je vingers</span> te laten glippen
                </h1>
                <p className="hero-sub">
                  BossBase geeft ZZP'ers en kleine bedrijven één plek voor klanten, offertes, agenda en omzet. Geen chaos meer, wel meer opdrachten.
                </p>
                <div className="hero-ctas">
                  <a href="/registreer" className="btn btn-p glow btn-lg"
                    onClick={e => { if (navigate) { e.preventDefault(); navigate("/registreer") } }}>
                    Gratis 14 dagen proberen {I.arrowRight}
                  </a>
                  <a href="/functies" className="btn btn-s btn-lg"
                    onClick={e => { if (navigate) { e.preventDefault(); navigate("/functies") } }}>
                    Alle functies bekijken
                  </a>
                </div>
                <div className="hero-trust">
                  {I.checkCircle} <span>Geen creditcard nodig</span>
                  {I.checkCircle} <span>In 5 minuten live</span>
                  {I.checkCircle} <span>AVG-compliant</span>
                </div>
                <div className="hero-stats">
                  {[
                    { to: 2400, suffix: "+", lbl: "Vakmannen\nactief" },
                    { prefix: "€ ", to: 2100000, suffix: "+", lbl: "Aan offertes\nverstuurd" },
                    { to: 98, suffix: "%", lbl: "Klant-\ntevredenheid" },
                  ].map((s, i) => (
                    <div key={i} className="hero-stat">
                      <div>
                        <div className="num"><CountVal prefix={s.prefix || ""} to={s.to} suffix={s.suffix} /></div>
                        <div className="lbl" style={{ whiteSpace: "pre-line" }}>{s.lbl}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <HeroStage reduced={reduced} scrollY={scrollY} />
            </div>
          </div>
        </section>

        <LogoBar />
        <ProblemSolution />
        <Features />
        <DemoSection />
        <VoorWie navigate={navigate} />
        <Pricing navigate={navigate} />
        <Testimonials />
        <FaqHome navigate={navigate} />
        <FinalCta navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
