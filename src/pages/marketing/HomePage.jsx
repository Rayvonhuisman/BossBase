import { useState, useEffect, useRef, useCallback } from "react"
import { Nav, Footer, ScrollLine, Reveal, Wordmark, I, initChoreo, useReducedMotion, useScrollY } from "./MktShared"
import { tierLabel, tierPrice, extraUserLabel, EXTRA_USER_PRICE } from "../../lib/tiers.js"
import PortaalKader from "../../demo/PortaalKader.jsx"

/* ── Float cards (Variant D) ── */
function CardOfferte() {
  return (
    <div>
      <div className="fc-label">Offerte #2026-118</div>
      <div className="fc-title">Badkamer renovatie — Fam. Bakker</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <span className="fc-amount">€ 4.850</span>
        <span className="badge badge-accepted">{I.check} Geaccepteerd</span>
      </div>
    </div>
  )
}

function CardPipeline() {
  return (
    <div style={{ width: 188 }}>
      <div className="fc-label" style={{ marginBottom: 8 }}>Pipeline · Offerte fase</div>
      {[["Dakkapel — Visser", "€ 7.200"], ["Kozijnen — De Wit", "€ 2.150"]].map(([t, m]) => (
        <div key={t} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", marginBottom: 7, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--dk)" }}>{t}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pd)", marginTop: 2 }}>{m}</div>
        </div>
      ))}
    </div>
  )
}

function CardAgenda() {
  return (
    <div style={{ width: 196 }}>
      <div className="fc-label" style={{ marginBottom: 8 }}>Vandaag · di 10 jun</div>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: "var(--p)" }} />
        <div>
          <div style={{ fontSize: 11.5, color: "var(--dmu)", fontWeight: 500 }}>09:00 – 12:30</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--dk)" }}>Buitenschilderwerk — De Lange</div>
        </div>
      </div>
    </div>
  )
}

function CardOmzet() {
  return (
    <div style={{ width: 204 }}>
      <div className="fc-label">Omzet deze maand</div>
      <div className="fc-amount" style={{ fontSize: 19 }}>€ 24.900</div>
      <svg width="168" height="44" viewBox="0 0 168 44" fill="none" aria-hidden="true" style={{ display: "block", marginTop: 6 }}>
        <path d="M2 38 32 30 62 33 92 20 122 23 152 8 166 10" stroke="#1DDB62" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 38 32 30 62 33 92 20 122 23 152 8 166 10 166 44 2 44Z" fill="rgba(29,219,98,0.12)" />
      </svg>
    </div>
  )
}

function CardLead() {
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--pl)", color: "var(--pd)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        {I.bell}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dk)" }}>Nieuwe lead</div>
        <div style={{ fontSize: 12.5, color: "var(--dmu)" }}>Dakkapel plaatsen · Utrecht</div>
      </div>
    </div>
  )
}

const FLOAT_CARDS = [
  [CardOfferte, { top: "8%",  left: "6%",   zIndex: 4 }, 0.16, -7,  3,  false],
  [CardOmzet,   { top: "44%", left: "0%",   zIndex: 3 }, 0.10,  6, -2,  false],
  [CardPipeline,{ top: "2%",  right: "2%",  zIndex: 2 }, 0.06,  9,  4,  true],
  [CardAgenda,  { top: "56%", right: "8%",  zIndex: 4 }, 0.20, -5, -3,  true],
  [CardLead,    { top: "33%", left: "36%",  zIndex: 5 }, 0.26,  4,  2,  false],
]

function HeroStageD({ reduced, scrollY }) {
  return (
    <div className="hero-stage" aria-hidden="true">
      {FLOAT_CARDS.map(([Comp, pos, depth, ry, rx, hideM], i) => {
        const t = reduced
          ? `rotateY(${ry * 0.5}deg) rotateX(${rx * 0.5}deg)`
          : `translateY(${-scrollY * depth}px) rotateY(${ry + scrollY * 0.012 * (i % 2 ? 1 : -1)}deg) rotateX(${rx + scrollY * 0.008}deg)`
        return (
          <div
            key={i}
            className={"float-card" + (hideM ? " fc-hide-m" : "")}
            style={{ ...pos, transform: t, transformStyle: "preserve-3d" }}
          >
            <Comp />
          </div>
        )
      })}
    </div>
  )
}


/* ── Logo bar ── */
const BRANCHES_MARQUEE = [
  "Schilders", "Stukadoors", "Loodgieters", "Installateurs",
  "Aannemers", "Dakdekkers", "Hoveniers", "Klusbedrijven",
  "Schoonmaak", "Glazenwassers", "Tegelzetters", "Cv-monteurs",
]

function LogoBar() {
  const doubled = [...BRANCHES_MARQUEE, ...BRANCHES_MARQUEE]
  return (
    <div className="logobar" aria-label="Branches">
      <div className="container">
        <p className="logobar-label">GEBOUWD VOOR DE MENSEN DIE HET ECHTE WERK DOEN</p>
        <div className="marquee">
          <div className="marquee-track">
            {doubled.map((name, i) => (
              <span className="logo-item" key={i} aria-hidden={i >= BRANCHES_MARQUEE.length ? "true" : undefined}>
                <span className="logo-dot" aria-hidden="true" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Probleem → Oplossing ── */
const CHAOS_CHIPS = [
  ["message", "#15A34A", "Mail: \"Kun je morgen?\"",          { top: "4%",  left: "8%",   transform: "rotate(-4deg)" }],
  ["mail",    "#2563eb", "23 ongelezen mails",                 { top: "24%", right: "4%",  transform: "rotate(3deg)" }],
  ["notebook","#f59e0b", "Schriftje in de bus",               { top: "46%", left: "0%",   transform: "rotate(2deg)" }],
  ["table",   "#15A34A", "Offertes_DEFINITIEF_v3.xlsx",       { top: "64%", right: "10%", transform: "rotate(-3deg)" }],
  ["calendar","#dc2626", "Dubbele afspraak?!",                { top: "86%", left: "16%",  transform: "rotate(5deg)" }],
]

const ICON_COLOR_MAP = {
  message:  I.message,
  mail:     I.mail,
  notebook: I.notebook,
  table:    I.table,
  calendar: I.calendar,
  fileText: I.fileText,
  euro:     I.euro,
}

function ProblemSolution() {
  return (
    <div className="section">
      <div className="container">
        <Reveal><div className="section-head choreo-head">
          <span className="section-kicker">Herkenbaar?</span>
          <h2>Nu spring je de hele dag tussen WhatsApp, je mailbox, een schriftje en Excel.</h2>
          <p>Met BossBase staat alles op één plek.</p>
        </div></Reveal>
        <Reveal className="chaos-solution choreo-body">
          <div className="chaos-pane" aria-hidden="true">
            {CHAOS_CHIPS.map(([icon, color, label, pos]) => (
              <span className="chaos-chip" key={label} style={pos}>
                <span style={{ color, display: "flex" }}>{ICON_COLOR_MAP[icon]}</span>
                {label}
              </span>
            ))}
          </div>
          <div className="solution-arrow" aria-hidden="true">{I.arrowRight}</div>
          <div className="solution-screen" aria-hidden="true">
            <div className="solution-screen-bar">
              <i /><i /><i />
              <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 600, color: "var(--dmu)" }}>BossBase — alles op één plek</span>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 11 }}>
              {[
                ["message", "Nieuwe aanvraag staat in je pipeline", "badge-accepted", "Opgevolgd"],
                ["fileText","Offerte Fam. Bakker — € 4.850",    "badge-accepted", "Geaccepteerd"],
                ["calendar","Klus ingepland: ma 15 jun, 08:00", "badge-concept",  "Herinnering staat"],
                ["euro",    "Factuur VvE Lindenhof",            "badge-paid",     "Betaald"],
              ].map(([icon, label, bcls, btxt]) => (
                <div className="mini-card" key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "var(--pd)", display: "flex" }}>{ICON_COLOR_MAP[icon]}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--dk)" }}>{label}</span>
                  <span className={`badge ${bcls}`}>{btxt}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

/* ── Feature visuals ── */
function FeatureVisualPipeline() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} aria-hidden="true">
      {[
        ["Nieuwe lead", ["Dakkapel — Utrecht", "Schutting — A'foort"]],
        ["Offerte",     ["Visser — € 7.200",   "De Wit — € 2.150"]],
      ].map(([col, items]) => (
        <div key={col}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--dmu)", marginBottom: 8 }}>{col}</div>
          {items.map(t => (
            <div className="mini-card" key={t} style={{ marginBottom: 9, fontSize: 13, fontWeight: 600, color: "var(--dk)" }}>{t}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

function FeatureVisualOfferte() {
  return (
    <div className="mini-card" style={{ maxWidth: 330, margin: "0 auto", padding: 20 }} aria-hidden="true">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="wordmark"><span className="b1">Boss</span>Base</span>
        <span className="badge badge-accepted">{I.check} Ondertekend</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 13, color: "var(--dmu)" }}>Offerte #2026-121 · Familie Bakker</div>
      {[
        ["Badkamer slopen & afvoeren", "€ 980"],
        ["Leidingwerk & tegelen 14 m²", "€ 2.620"],
        ["Sanitair plaatsen", "€ 1.250"],
      ].map(([t, m]) => (
        <div key={t} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          <span>{t}</span><strong style={{ color: "var(--dk)" }}>{m}</strong>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 800, color: "var(--dk)" }}>
        <span>Totaal excl. btw</span><span>€ 4.850</span>
      </div>
      <div style={{ marginTop: 12, fontFamily: "cursive", fontSize: 19, color: "var(--dm)", borderTop: "1.5px solid var(--border)", paddingTop: 6 }}>J. Bakker</div>
    </div>
  )
}

function FeatureVisualAgenda() {
  return (
    <div style={{ display: "grid", gap: 10 }} aria-hidden="true">
      {[
        ["Ma 08:00", "Fam. Bakker — badkamer", "green"],
        ["Di 13:30", "Offerte opnemen — Utrecht", "blue"],
        ["Wo 08:00", "De Lange — schilderwerk", "amber"],
      ].map(([tm, t, c]) => (
        <div className="mini-card" key={t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: c === "green" ? "var(--p)" : c === "blue" ? "var(--blue, #3b82f6)" : "var(--warning, #f59e0b)" }} />
          <span style={{ fontSize: 12.5, color: "var(--dmu)", width: 64, flex: "none" }}>{tm}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--dk)" }}>{t}</span>
        </div>
      ))}
      <div className="mini-card" style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--pll, #f0fdf4)", borderColor: "var(--pl)" }}>
        {I.bell}
        <span style={{ fontSize: 12.5, color: "var(--dm)" }}>Klant kreeg automatisch een herinnering</span>
      </div>
    </div>
  )
}

function FeatureVisualOmzet() {
  return (
    <div style={{ display: "grid", gap: 10 }} aria-hidden="true">
      {[
        ["Binnen",     "€ 24.900", "var(--p)"],
        ["Openstaand", "€ 36.050", "var(--warning, #f59e0b)"],
        ["Verwacht",   "€ 41.250", "var(--dl)"],
      ].map(([lbl, val, c]) => (
        <div className="mini-card" key={lbl} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, flex: "none" }} />
          <span style={{ flex: 1, fontSize: 13.5, color: "var(--dmu)" }}>{lbl}</span>
          <strong style={{ color: "var(--dk)", fontSize: 15 }}>{val}</strong>
        </div>
      ))}
    </div>
  )
}

function FeatureVisualTeam() {
  return (
    <div style={{ display: "grid", gap: 10 }} aria-hidden="true">
      {[
        ["Bus 1 — Mark & Tim", "Fam. Bakker — badkamer",    "badge-accepted", "Onderweg"],
        ["Bus 2 — Sven",        "De Lange — schilderwerk",  "badge-sent",     "Gepland"],
        ["Bus 3 — Jeroen",      "Visser — kozijnen",         "badge-concept",  "Morgen"],
      ].map(([who, what, bcls, btxt]) => (
        <div className="mini-card" key={who} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--pd)", display: "flex", flex: "none" }}>{I.truck}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--dk)" }}>{who}</span>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--dmu)" }}>{what}</span>
          </span>
          <span className={`badge ${bcls}`}>{btxt}</span>
        </div>
      ))}
    </div>
  )
}

// Alleen wat het product echt doet: zie docs/seo/productfeiten.md.
const FEATURES = [
  {
    icon: I.kanban,
    title: "Klanten & pipeline",
    desc: "Elke aanvraag wordt een kaart in je pipeline, van eerste contact tot betaalde factuur. Plan wanneer je terugbelt, en zie per klant alles wat je voor hem deed.",
    points: ["Pipeline van aanvraag tot betaling", "Opvolgen met activiteiten en datums", "Hele klantgeschiedenis op de klantkaart"],
    Visual: FeatureVisualPipeline,
    flip: false,
    title4bar: "BossBase — Pipeline",
    href: "/klantbeheer",
    linkTekst: "Meer over klantbeheer",
  },
  {
    icon: I.signature,
    title: "Offertes & online akkoord",
    desc: "Maak een offerte als PDF met je eigen logo en verstuur hem per mail. In Groei en Team tekent de klant online, en maak je daarna met één klik de factuur.",
    points: ["Je eigen logo en huisstijlkleur", "Online ondertekenen (Groei en Team)", "Factuur vanuit de geaccepteerde offerte"],
    Visual: FeatureVisualOfferte,
    flip: true,
    title4bar: "BossBase — Offertes",
    href: "/offertes",
    linkTekst: "Meer over offertes",
  },
  {
    icon: I.calendar,
    title: "Planning & werkbonnen",
    desc: "Plan klussen in de agenda of, met meerdere mensen, per medewerker en bus. Op de werkbon staan taken, meerwerk, materiaal en foto's, en de klant tekent ter plekke.",
    points: ["Werkbon met handtekening van de klant", "Automatische afspraakherinnering per mail", "Planning per medewerker en bus (Team)"],
    Visual: FeatureVisualAgenda,
    flip: false,
    title4bar: "BossBase — Agenda",
    href: "/werkbonnen",
    linkTekst: "Meer over werkbonnen",
  },
  {
    icon: I.chart,
    title: "Uren, facturen & omzet",
    desc: "Registreer werkdagen en uren per klus. Verstuur facturen met herinneringen, en zie wat binnen is, wat openstaat en wat een project opleverde.",
    points: ["Uren per werkdag en per klus", "Betalingsherinneringen (Groei en Team)", "Kosten en nacalculatie per project (Groei en Team)"],
    Visual: FeatureVisualOmzet,
    flip: true,
    title4bar: "BossBase — Omzet",
    href: "/facturen",
    linkTekst: "Meer over facturen",
  },
  {
    icon: I.users,
    title: "Team & rollen",
    desc: "Werk je met een team? Nodig collega's uit, verdeel werkbonnen en bepaal per medewerker wat hij mag zien en doen.",
    points: ["Collega's uitnodigen", "Rollen en rechten per medewerker (Team)", "Inkoopprijzen afschermen"],
    Visual: FeatureVisualTeam,
    flip: false,
    title4bar: "BossBase — Team",
    href: "/planning",
    linkTekst: "Meer over planning",
  },
]

function Features() {
  return (
    <div className="section" id="functies" style={{ paddingTop: 60 }}>
      <div className="container">
        <Reveal><div className="section-head choreo-head">
          <span className="section-kicker">Functies</span>
          <h2>Alles wat je nodig hebt. Niks wat je niet snapt.</h2>
          <p>Van eerste appje tot betaalde factuur — BossBase regelt de basis.</p>
        </div></Reveal>
        <div className="feature-rows">
          {FEATURES.map((f, i) => (
            <Reveal key={i} className={"feature-row choreo-body" + (f.flip ? " flip" : "")}>
              <div className="feature-copy">
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <ul className="feature-points">
                  {f.points.map(p => <li key={p}>{I.check} {p}</li>)}
                </ul>
                <a href={f.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18, fontWeight: 600 }}>
                  {f.linkTekst} {I.arrowRight}
                </a>
              </div>
              <div className="feature-frame-wrap">
                <div className="feature-visual">
                  <div className="frame-bar"><i /><i /><i /><span>{f.title4bar}</span></div>
                  <div className="frame-body"><f.Visual /></div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Demo section ── */
const DEMO_SCREENS = [
  ["dashboard", "Dashboard", I.dashboard],
  ["pipeline",  "Pipeline",  I.kanban],
  ["offertes",  "Offertes",  I.fileText],
  ["agenda",    "Agenda",    I.calendar],
  ["klanten",   "Klanten",   I.users],
  ["omzet",     "Omzet",     I.chart],
]

const STATUS_BADGE = {
  concept:       ["badge-concept",  "Concept"],
  verstuurd:     ["badge-sent",     "Verstuurd"],
  geaccepteerd:  ["badge-accepted", "Geaccepteerd"],
  betaald:       ["badge-paid",     "Betaald"],
  "te laat":     ["badge-late",     "Te laat"],
}

function StatusBadge({ s }) {
  const [cls, label] = STATUS_BADGE[s] || ["badge-concept", s]
  return <span className={`badge ${cls}`}>{label}</span>
}

function CountVal({ value }) {
  const ref = useRef(null)
  const [txt, setTxt] = useState(value)
  useEffect(() => {
    setTxt(value)
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const m = String(value).match(/^([^0-9]*)([\d.]+)(.*)$/)
    if (!m) return
    const target = parseInt(m[2].replace(/\./g, ""), 10)
    if (!isFinite(target) || target === 0) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now(), dur = 900
      const tick = now => {
        const p = Math.min(1, (now - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        const n = Math.round(target * eased)
        setTxt(m[1] + n.toLocaleString("nl-NL") + m[3])
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [value])
  return <span ref={ref}>{txt}</span>
}

function DemoStats({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 13, marginBottom: 18 }}>
      {items.map(([lbl, val, sub]) => (
        <div className="demo-card demo-stat" key={lbl}>
          <div className="lbl">{lbl}</div>
          <div className="val"><CountVal value={val} /></div>
          <div className="sub">{sub}</div>
        </div>
      ))}
    </div>
  )
}

// Eén vakbedrijf door alle schermen heen: een schildersbedrijf, met klussen en
// bedragen die bij dat vak horen. Zelfde klanten in de pipeline, de agenda en
// de klantenlijst, zodat het aanvoelt als één bedrijf in plaats van losse
// voorbeelden per tabblad.
const OFFERTES_DEMO = [
  ["#2026-041", "VvE Parkflat — 24 balkons",        "€ 28.400", "verstuurd"],
  ["#2026-038", "Bouwhof — binnenwerk 12 woningen", "€ 41.250", "geaccepteerd"],
  ["#2026-044", "Molenaar — houtrot en schilderwerk", "€ 7.650", "verstuurd"],
  ["#2026-036", "Zorggroep — trappenhuis",          "€ 12.900", "betaald"],
  ["#2026-031", "Fam. Visser — dakkapel schilderen", "€ 2.200", "te laat"],
]

const PIPELINE_DEMO = [
  ["Nieuwe aanvraag", [["Gemeente — 3 gymzalen", "Zwolle · via website", "€ 19.800"], ["Fam. Jansen — kozijnen", "Hattem · via mail", "€ —"]]],
  ["Offerte uit",     [["VvE Parkflat — 24 balkons", "Verstuurd 6 dgn geleden", "€ 28.400"], ["Molenaar — houtrot", "Verstuurd", "€ 7.650"]]],
  ["Akkoord",         [["Bouwhof — 12 woningen", "Start maandag", "€ 41.250"]]],
  ["In uitvoering",   [["Zorggroep — gangen", "Week 2 van 3", "€ 33.900"], ["Fam. Jansen — voorgevel", "Vandaag bezig", "€ 4.850"]]],
]

const AGENDA_DEMO = [
  ["Ma",  [["07:30", "Zorggroep — gangen 2e verdieping", "green"], ["13:30", "Inmeten balkons VvE Parkflat", "blue"]]],
  ["Di",  [["07:00", "Bouwhof — woning 3 t/m 6",         "green"], ["16:00", "Verf halen — groothandel",     "amber"]]],
  ["Wo",  [["07:00", "Bouwhof — woning 3 t/m 6",         "green"]]],
  ["Do",  [["08:00", "Fam. Jansen — kozijnen voorgevel", "blue"],  ["15:00", "Nacalculatie Zorggroep",       "amber"]]],
  ["Vr",  [["08:30", "Fam. Jansen — kozijnen voorgevel", "blue"]]],
]

const KLANTEN_DEMO = [
  ["VvE Parkflat Assendorp", "VvE · Zwolle",          "Offerte open",        "€ 28.400"],
  ["Bouwhof Projecten BV",   "Aannemer · Kampen",     "12 woningen",         "€ 41.250"],
  ["Zorggroep IJssel-Vecht", "Bedrijf · Zwolle",      "Vaste opdrachtgever", "€ 33.900"],
  ["Familie Jansen",         "Particulier · Hattem",  "1 klus",              "€ 4.850"],
  ["Stichting Sportzalen Zuid", "Sportzalen · Zwolle", "Aanvraag",         "€ 19.800"],
]

const OMZET_MAANDEN = [
  ["jan", 42], ["feb", 55], ["mrt", 48], ["apr", 70], ["mei", 86], ["jun", 64],
]

function OfferteTable({ rows, toast }) {
  return (
    <div className="demo-card" style={{ overflow: "hidden" }}>
      <table className="demo-table">
        <thead><tr><th>Nr.</th><th>Klus</th><th>Bedrag</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(([nr, klus, bedrag, status]) => (
            <tr key={nr} onClick={toast} style={{ cursor: "pointer" }}>
              <td style={{ color: "var(--dl)", fontWeight: 500 }}>{nr}</td>
              <td style={{ fontWeight: 600, color: "var(--dk)" }}>{klus}</td>
              <td style={{ fontWeight: 700 }}>{bedrag}</td>
              <td><StatusBadge s={status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Wat er vandaag op de planning staat. In het echte dashboard is dit de eerste
// blik van de ochtend, dus die hoort hier ook te staan — een tabel alleen geeft
// niet het gevoel van "mijn dag staat klaar".
const VANDAAG_DEMO = [
  ["07:30 – 16:00", "Zorggroep — gangen 2e verdieping", "Wouter, Tim", "Bus 1"],
  ["08:00 – 15:00", "Fam. Jansen — kozijnen voorgevel", "Iris",        "Bus 2"],
]

function ScreenDashboard({ toast }) {
  return (
    <div>
      <div className="demo-h">
        <h3>Goedemorgen, Sander</h3>
        <button className="btn btn-p" onClick={toast}>+ Nieuwe klus</button>
      </div>
      <DemoStats items={[
        ["Openstaand", "€ 36.050", "3 facturen"],
        ["Deze week gepland", "5 klussen", "2 bussen onderweg"],
        ["Omzet deze maand", "€ 24.900", "+18% t.o.v. vorige maand"],
      ]} />

      <div className="demo-card" style={{ overflow: "hidden", marginBottom: 18 }}>
        <div style={{
          padding: "11px 16px", borderBottom: "1px solid var(--border)",
          fontSize: 11.5, fontWeight: 600, letterSpacing: "0.05em",
          textTransform: "uppercase", color: "var(--dl)",
        }}>Vandaag op de planning</div>
        {VANDAAG_DEMO.map(([tijd, klus, wie, bus]) => (
          <div
            key={klus}
            onClick={toast}
            style={{
              display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
              padding: "12px 16px", borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: "var(--p)", flex: "none" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "var(--dk)" }}>{klus}</div>
              <div style={{ fontSize: 13, color: "var(--dmu)" }}>{tijd} · {wie}</div>
            </div>
            <span className="badge badge-concept" style={{ flex: "none" }}>{bus}</span>
          </div>
        ))}
      </div>

      <OfferteTable rows={OFFERTES_DEMO.slice(0, 4)} toast={toast} />
    </div>
  )
}

function ScreenPipeline({ toast }) {
  return (
    <div>
      <div className="demo-h">
        <h3>Pipeline</h3>
        <button className="btn btn-p" onClick={toast}>+ Nieuwe lead</button>
      </div>
      <div className="pipeline-cols">
        {PIPELINE_DEMO.map(([col, cards]) => (
          <div className="pipeline-col" key={col}>
            <h4><span>{col}</span><span>{cards.length}</span></h4>
            {cards.map(([t, s, m]) => (
              <div className="pipeline-card" key={t} onClick={toast}>
                <div className="t">{t}</div>
                <div className="s">{s}</div>
                <div className="m">{m}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScreenOffertes({ toast }) {
  return (
    <div>
      <div className="demo-h">
        <h3>Offertes</h3>
        <button className="btn btn-p" onClick={toast}>+ Nieuwe offerte</button>
      </div>
      <DemoStats items={[
        ["Geaccepteerd dit kwartaal", "€ 54.150", "7 offertes"],
        ["Acceptatiegraad",           "68%",       "Boven gemiddeld"],
      ]} />
      <OfferteTable rows={OFFERTES_DEMO} toast={toast} />
    </div>
  )
}

function ScreenAgenda({ toast }) {
  return (
    <div>
      <div className="demo-h">
        <h3>Agenda — week 24</h3>
        <button className="btn btn-p" onClick={toast}>+ Afspraak</button>
      </div>
      <div className="agenda-grid">
        {AGENDA_DEMO.map(([day, events]) => (
          <div className="agenda-day" key={day}>
            <h5>{day}</h5>
            {events.map(([tm, t, color]) => (
              <div className={`agenda-evt ${color}`} key={t + tm} onClick={toast}>
                <span className="tm">{tm}</span>{t}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: "var(--dl)", marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
        {I.smartphone} Je medewerkers zien hun werkbonnen automatisch op hun telefoon.
      </p>
    </div>
  )
}

function ScreenKlanten({ toast }) {
  return (
    <div>
      <div className="demo-h">
        <h3>Klanten</h3>
        <button className="btn btn-p" onClick={toast}>+ Nieuwe klant</button>
      </div>
      <div className="demo-card" style={{ overflow: "hidden" }}>
        <table className="demo-table">
          <thead><tr><th>Naam</th><th>Type</th><th>Activiteit</th><th>Totaal</th></tr></thead>
          <tbody>
            {KLANTEN_DEMO.map(([nm, type, act, tot]) => (
              <tr key={nm} onClick={toast} style={{ cursor: "pointer" }}>
                <td style={{ fontWeight: 600, color: "var(--dk)" }}>{nm}</td>
                <td style={{ color: "var(--dmu)" }}>{type}</td>
                <td style={{ color: "var(--dmu)" }}>{act}</td>
                <td style={{ fontWeight: 700 }}>{tot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScreenOmzet({ toast }) {
  const max = Math.max(...OMZET_MAANDEN.map(([, v]) => v))
  return (
    <div>
      <div className="demo-h">
        <h3>Omzet 2026</h3>
        <button className="btn btn-s" onClick={toast} style={{ padding: "9px 16px", fontSize: 14 }}>Exporteren</button>
      </div>
      <DemoStats items={[
        ["Binnen",     "€ 24.900", "Betaalde facturen"],
        ["Openstaand", "€ 36.050", "3 facturen"],
        ["Verwacht",   "€ 41.250", "Geaccepteerde offertes"],
      ]} />
      <div className="demo-card">
        <div className="omzet-chart">
          {OMZET_MAANDEN.map(([m, v]) => (
            <div className="omzet-bar" key={m}>
              <i style={{ height: `${(v / max) * 100}%` }} className={m === "mei" ? "hot" : ""} />
              <span>{m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const SCREEN_COMPONENTS = {
  dashboard: ScreenDashboard,
  pipeline:  ScreenPipeline,
  offertes:  ScreenOffertes,
  agenda:    ScreenAgenda,
  klanten:   ScreenKlanten,
  omzet:     ScreenOmzet,
}

function DemoSection() {
  const [active, setActive] = useState("dashboard")
  const [toastOn, setToastOn] = useState(false)
  const timerRef = useRef(null)
  const toast = useCallback(() => {
    setToastOn(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToastOn(false), 1800)
  }, [])
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Op desktop en tablet laadt de ECHTE app in een kader, zodat elk tabblad een
  // exacte kopie van die pagina toont in plaats van een nabouw. Op telefoon kan
  // dat niet: het portaal is voor een groot scherm gebouwd en zou daar tot
  // onleesbaar formaat teruggeschaald worden. Daar blijven de nagebouwde
  // schermen staan — die zijn juist voor dat formaat gemaakt.
  // Begint als "breed", net als de vooraf gerenderde HTML; het effect hieronder
  // stelt het na het laden bij. Zo kloppen server en browser bij het hydrateren.
  const [breed, setBreed] = useState(true)
  useEffect(() => {
    const meet = () => setBreed(window.innerWidth >= 768)
    meet()
    window.addEventListener("resize", meet)
    return () => window.removeEventListener("resize", meet)
  }, [])

  const Screen = SCREEN_COMPONENTS[active]
  return (
    <div className="section" id="demo" style={{ scrollMarginTop: 80 }}>
      <div className="container">
        <Reveal><div className="section-head choreo-head">
          <span className="section-kicker">Probeer het zelf</span>
          <h2>Klik er zelf doorheen</h2>
          <p>Zo werkt BossBase van binnen. Navigeer vrij rond — dit voorbeeld slaat niets op.</p>
        </div></Reveal>
        <Reveal>
          {breed ? <PortaalKader /> : (
            <div className="demo-wrap choreo-body" style={{ position: "relative" }}>
              <span className="demo-tag">Voorbeeld</span>
              <nav className="demo-sidebar" aria-label="Demo navigatie">
                <span className="wordmark on-dark" style={{ padding: "6px 12px 18px", display: "block", fontSize: 18 }}>
                  <span className="b1">Boss</span>Base
                </span>
                {DEMO_SCREENS.map(([key, label, icon]) => (
                  <button
                    key={key}
                    className={`demo-nav-item${active === key ? " active" : ""}`}
                    onClick={() => setActive(key)}
                    aria-current={active === key ? "page" : undefined}
                  >
                    {icon} {label}
                  </button>
                ))}
              </nav>
              <div className="demo-main"><Screen toast={toast} /></div>
              <div className={`demo-toast${toastOn ? " show" : ""}`} role="status">Dit is een demo</div>
            </div>
          )}
        </Reveal>
      </div>
    </div>
  )
}

/* ── Voor wie (homepage) ── */
const BRANCHES_HOME = [
  { icon: I.paintRoller, name: "Schilders",     href: "/voor-wie/schilders" },
  { icon: I.leaf,        name: "Hoveniers",     href: "/voor-wie/hoveniers" },
  { icon: I.hammer,      name: "Klusbedrijven", href: "/voor-wie/aannemers-en-klusbedrijven" },
  { icon: I.wrench,      name: "Installateurs", href: "/voor-wie/installateurs" },
  { icon: I.roof,        name: "Dakdekkers" },
  { icon: I.sparkles,    name: "Schoonmaak" },
  { icon: I.trowel,      name: "Stukadoors",    href: "/voor-wie/schilders" },
  { icon: I.droplet,     name: "Loodgieters",   href: "/voor-wie/installateurs" },
]

function VoorWie({ navigate }) {
  return (
    <div className="section voorwie-bg" id="voor-wie">
      <div className="container">
        <Reveal><div className="section-head choreo-head">
          <span className="section-kicker">Voor wie</span>
          <h2>Gemaakt voor mensen die met hun handen werken</h2>
        </div></Reveal>
        <Reveal className="branche-grid stagger choreo-body">
          {BRANCHES_HOME.map(b => b.href ? (
            <a key={b.name} href={b.href} className="branche-card" style={{ color: "inherit" }}>
              <span className="ic">{b.icon}</span>
              {b.name}
            </a>
          ) : (
            <div key={b.name} className="branche-card">
              <span className="ic">{b.icon}</span>
              {b.name}
            </div>
          ))}
        </Reveal>
        <Reveal>
          <p className="branche-note">
            Werk je voor particulieren, bedrijven, VvE&apos;s of aannemers? <a href="/voor-wie">Bekijk per vak hoe je met BossBase werkt</a>.
          </p>
        </Reveal>
      </div>
    </div>
  )
}

/* ── Pricing ── */
// Prijzen/tiernamen komen uit ../../lib/tiers.js (enige bron). Hier staat alleen
// de presentatie per plan.
// De functies per pakket volgen src/lib/features.js (TIER_FEATURES en
// TIER_LIMITS). Pas dit aan als die matrix verandert.
const TIERS_HOME = [
  {
    id: "starter", who: "Voor de zzp'er die net begint",
    extra: "1 gebruiker",
    inherit: null,
    items: ["Klanten (tot 100) en pipeline", "Offertes en facturen (20 per periode)", "Werkbonnen met handtekening van de klant", "Agenda, uren en afspraakherinneringen"],
    hot: false, btn: "btn-s",
  },
  {
    id: "groei", who: "Voor de zzp'er of een bedrijf van twee",
    extra: extraUserLabel("groei"),
    inherit: "Alles van Starter, zonder limieten, plus:",
    items: ["Offertes online laten ondertekenen", "Automatische betalingsherinneringen", "Koppeling met Moneybird of SnelStart", "Kosten en nacalculatie per project", "Btw-overzicht", "Los bij te nemen: planning, voertuigen, betaallink"],
    hot: true, btn: "btn-p glow",
  },
  {
    id: "team", who: "Voor bedrijven met meer mensen en bussen",
    extra: extraUserLabel("team"),
    inherit: "Alles van Groei, plus:",
    items: ["Onbeperkt gebruikers", "Planning per medewerker en voertuig", "Rollen en rechten per medewerker", "Betaallink met iDEAL (via Stripe)"],
    hot: false, btn: "btn-s",
  },
]

function Pricing({ navigate }) {
  const [yearly, setYearly] = useState(false)
  const [showAll, setShowAll] = useState({})
  const go = useCallback((e, href) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }, [navigate])
  return (
    <div className="section pricing" id="prijzen">
      <div className="container">
        <Reveal><div className="section-head choreo-head">
          <span className="section-kicker">Prijzen</span>
          <h2>Eerlijke prijs, geen verrassingen</h2>
          <p>Begin gratis. Groei wanneer jij groeit.</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 24 }}>
            <div className="bill-toggle" role="group" aria-label="Betaalperiode">
              <button className={!yearly ? "on" : ""} onClick={() => setYearly(false)} aria-pressed={!yearly}>Maandelijks</button>
              <button className={yearly ? "on" : ""} onClick={() => setYearly(true)} aria-pressed={yearly}>Jaarlijks</button>
            </div>
            <span className={`bill-hook${yearly ? " pop" : ""}`} style={{ visibility: yearly ? "visible" : "hidden" }}>
              {I.sparkles} Bij jaarlijks: 2 maanden gratis óf een gratis website (vanaf Groei)
            </span>
          </div>
        </div></Reveal>
        <Reveal className="price-grid stagger">
          {TIERS_HOME.map(t => {
              const total = t.items.length + (t.inherit ? 1 : 0)
              const expanded = !!showAll[t.id]
              return (
                <div key={t.id} className={`price-card${t.hot ? " hot" : ""}${expanded ? " expanded" : ""}`}>
                  {t.hot && <span className="hot-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Hierop draait je proefperiode</span>}
                  <div className="tier">{tierLabel(t.id)}</div>
                  <div className="who">{t.who}</div>
                  {/* Jaarabonnement is geen andere prijs: dezelfde maandprijs,
                      met de eerste twee maanden gratis. */}
                  <div className="amount">
                    <strong>€ {tierPrice(t.id)}</strong>
                    <span>/mnd{yearly ? " · 12 mnd, mét welkomstactie" : ""}</span>
                  </div>
                  <div className="extra-user">{t.extra}</div>
                  <ul>
                    {t.inherit && <li className="inherit">{t.inherit}</li>}
                    {t.items.map(it => <li key={it}>{I.check} {it}</li>)}
                  </ul>
                  {total > 4 && (
                    <button
                      className="price-more"
                      onClick={() => setShowAll({ ...showAll, [t.id]: !expanded })}
                      aria-expanded={expanded}
                    >
                      {expanded ? "Minder functies" : "Bekijk alle functies"}
                      {I.chevronDown}
                    </button>
                  )}
                  <a
                    href="/register"
                    className={`btn ${t.btn}`}
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={e => go(e, "/register")}
                  >
                    Start 14 dagen gratis
                  </a>
                </div>
              )
            })}
        </Reveal>
        <Reveal>
          <p className="price-foot">
            Prijzen per maand, exclusief btw. Probeer BossBase 14 dagen gratis met de functies van Groei, zonder betaalgegevens. Een maandabonnement is per maand opzegbaar. Een jaarabonnement betaal je in 12 maandtermijnen; het is niet tussentijds opzegbaar en loopt daarna per maand door. Bij een overstap naar een groter pakket begint de looptijd opnieuw. <a href="/prijzen">Bekijk alle prijzen en modules</a>.
          </p>
        </Reveal>
      </div>
    </div>
  )
}

/* ── FAQ ── */
const FAQ_HOME = [
  ["Heb ik technische kennis nodig?",       "Nee. BossBase is gemaakt voor vakmensen, niet voor IT'ers. Na het aanmelden voer je je eerste klant in en maak je je eerste offerte; installeren hoeft niet."],
  ["Kan ik mijn eigen logo op offertes zetten?", "Ja. Je uploadt één keer je logo en bedrijfsgegevens, en je offertes en facturen krijgen je eigen logo en huisstijlkleur."],
  ["Werkt het op mijn telefoon?",           "Deels. Het dashboard werkt in de browser op een tablet, laptop of computer (vanaf 768 pixels breed); op een smalle telefoon niet, en er is geen app. Je klant kan offertes en werkbonnen wel op elke telefoon ondertekenen."],
  ["Hoe zit het met opzeggen?",             "Een maandabonnement is per maand opzegbaar. Een jaarabonnement loopt 12 maanden en daarna per maand. Je klanten exporteer je als Excel of CSV, en je offertes en facturen als PDF."],
  ["Wat als ik overstap naar een groter pakket?", "Bij een jaarabonnement begint de looptijd van 12 maanden opnieuw vanaf de overstap; je ziet de nieuwe einddatum voordat je bevestigt. Modules of teamleden bijkopen raakt je looptijd niet, en een maandabonnement blijft gewoon per maand opzegbaar."],
  ["Wat krijg ik bij een jaarabonnement?",  "Je kiest één welkomstactie: 2 maanden gratis, of (vanaf Groei) een gratis website met een formulier waarvan de aanvragen in je BossBase-pipeline binnenkomen. Voor de hosting van die website betaal je € 5 per maand."],
]

function FaqHome({ navigate }) {
  const [open, setOpen] = useState(-1)
  const go = useCallback((e, href) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }, [navigate])
  return (
    <div className="section" id="faq" style={{ background: "var(--bgs)" }}>
      <div className="container">
        <Reveal><div className="section-head choreo-head">
          <span className="section-kicker">FAQ</span>
          <h2>Veelgestelde vragen</h2>
        </div></Reveal>
        <div className="faq-list choreo-body">
          {FAQ_HOME.map(([q, a], i) => (
            <div key={q} className="faq-item" data-open={open === i ? "true" : "false"}>
              <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                {q}{I.chevronDown}
              </button>
              <div className="faq-a"><div><p>{a}</p></div></div>
            </div>
          ))}
        </div>
        <div className="faq-more">
          <a className="btn btn-s" href="/faq" onClick={e => go(e, "/faq")}>
            Bekijk alle veelgestelde vragen
          </a>
        </div>
      </div>
    </div>
  )
}

/* ── Slot CTA ── */
function FinalCta({ navigate }) {
  const go = useCallback((e, href) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }, [navigate])
  return (
    <div className="section" style={{ paddingBottom: 0 }}>
      <div className="container">
        <Reveal>
          <div className="final-cta choreo-body">
            <h2>Klaar om de <span className="green">baas</span> te zijn over je bedrijf?</h2>
            <p>14 dagen gratis met de functies van Groei. Je hoeft geen betaalgegevens in te vullen.</p>
            <div className="hero-ctas" style={{ marginTop: 30, justifyContent: "center" }}>
              <a href="/register" className="btn btn-p btn-lg glow" onClick={e => go(e, "/register")}>
                Start gratis proefperiode
              </a>
              <a href="#demo" className="btn btn-s btn-lg" onClick={e => { e.preventDefault(); document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" }) }}>
                Bekijk de demo
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
      <ScrollLine />
      <Nav navigate={navigate} />
      <main>
        <header className="hero" id="home">
          <div className="container hero-grid">
            <div>
              <span className="hero-badge">{I.bolt} Jij de baas, wij de basis.</span>
              <h1>
                Eén rustige plek voor je hele bedrijf —{" "}
                <span className="accent2">van lead tot <span className="accent">factuur.</span></span>
              </h1>
              <p className="hero-sub">
                BossBase brengt klanten, leads, planning, offertes, werkbonnen en omzet samen in één scherp dashboard. Gebouwd voor vakbedrijven die overzicht willen, zonder gedoe.
              </p>
              <div className="hero-ctas">
                <a href="/register" className="btn btn-p glow btn-lg"
                  onClick={e => { if (navigate) { e.preventDefault(); navigate("/register") } }}>
                  Start 14 dagen gratis
                </a>
                <a href="#demo" className="btn btn-s btn-lg"
                  onClick={e => { e.preventDefault(); document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" }) }}>
                  Bekijk demo {I.arrowRight}
                </a>
              </div>
              <div className="hero-trust">
                {I.checkCircle}
                <span>Geen betaalgegevens nodig · 14 dagen de functies van Groei · maandabonnement per maand opzegbaar</span>
              </div>
            </div>
            <HeroStageD reduced={reduced} scrollY={scrollY} />
          </div>
        </header>

        <LogoBar />
        <ProblemSolution />
        <Features />
        <DemoSection />
        <VoorWie navigate={navigate} />
        <Pricing navigate={navigate} />
        <FaqHome navigate={navigate} />
        <FinalCta navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
