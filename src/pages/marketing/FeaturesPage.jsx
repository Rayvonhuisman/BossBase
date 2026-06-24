import { useEffect } from "react"
import { Calendar, Mail, Briefcase, CreditCard, MessageSquare, MessageCircle, Zap, Bird } from "lucide-react"
import { Nav, Footer, Reveal, I, initChoreo, ScrollLine } from "./MktShared"

/* ── Feature visuals ── */
function CRMVisual() {
  return (
    <div className="feature-frame">
      <div className="feature-frame-bar"><span className="dot-r"/><span className="dot-y"/><span className="dot-g"/>
        <div className="feature-frame-urlbar">{I.shield} bossbase.nl/klanten</div>
      </div>
      <div className="feature-frame-body" style={{ display: "grid", gap: 9 }}>
        {[
          { name: "Bakker Loodgieters",     status: "Actief",  val: "€ 12.400", cls: "badge-accepted" },
          { name: "Jansen Schilderwerk",    status: "Offerte", val: "€ 3.800",  cls: "badge-sent" },
          { name: "Peters Installatiewerk", status: "Nieuw",   val: "—",        cls: "badge-concept" },
        ].map(r => (
          <div key={r.name} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.name}</div>
              <span className={`badge ${r.cls}`} style={{ marginTop: 4 }}>{r.status}</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--dk)" }}>{r.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OffertesVisual() {
  return (
    <div className="feature-frame flip">
      <div className="feature-frame-bar"><span className="dot-r"/><span className="dot-y"/><span className="dot-g"/>
        <div className="feature-frame-urlbar">{I.shield} bossbase.nl/offertes</div>
      </div>
      <div className="feature-frame-body">
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Offerte #2024-048</div>
        {[
          { desc: "Schilderwerk gevel",  price: "€ 2.400" },
          { desc: "Materialen",          price: "€ 650" },
          { desc: "Reiskosten",          price: "€ 90" },
        ].map(r => (
          <div key={r.desc} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{r.desc}</span><span style={{ fontWeight: 700, fontSize: 13 }}>{r.price}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13.5 }}>
          <span>Totaal incl. BTW</span><span style={{ color: "var(--pd)" }}>€ 3.803</span>
        </div>
        <div className="btn btn-p" style={{ width: "100%", justifyContent: "center", marginTop: 10, fontSize: 13 }}>
          Digitale handtekening aanvragen
        </div>
      </div>
    </div>
  )
}

function AgendaVisual() {
  return (
    <div className="feature-frame">
      <div className="feature-frame-bar"><span className="dot-r"/><span className="dot-y"/><span className="dot-g"/>
        <div className="feature-frame-urlbar">{I.shield} bossbase.nl/agenda</div>
      </div>
      <div className="feature-frame-body" style={{ display: "grid", gap: 7 }}>
        {[
          { time: "09:00", title: "Offerte opstellen — Jansen",       color: "#ecfdf5", col: "#0c7a38" },
          { time: "11:30", title: "Afspraak: Peters Installatiewerk", color: "#dbeafe", col: "#1d4ed8" },
          { time: "14:00", title: "Factuur versturen: Bakker",        color: "#fef3c7", col: "#b45309" },
        ].map(e => (
          <div key={e.time} style={{ background: e.color, color: e.col, borderRadius: 9, padding: "8px 11px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.7 }}>{e.time}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{e.title}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OmzetVisual() {
  const bars = [55, 68, 42, 78, 85, 61, 90, 72, 95, 64, 88, 100]
  const months = ["J","F","M","A","M","J","J","A","S","O","N","D"]
  return (
    <div className="feature-frame flip">
      <div className="feature-frame-bar"><span className="dot-r"/><span className="dot-y"/><span className="dot-g"/>
        <div className="feature-frame-urlbar">{I.shield} bossbase.nl/omzet</div>
      </div>
      <div className="feature-frame-body">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Omzet 2024</span>
          <span style={{ color: "var(--pd)", fontWeight: 800, fontSize: 13.5 }}>€ 148.320</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 84 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%" }}>
              <div style={{ width: "100%", borderRadius: "3px 3px 2px 2px", background: i === 11 ? "var(--p)" : "var(--pl)", height: `${h}%` }} />
              <span style={{ fontSize: 9, color: "var(--dl)" }}>{months[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TeamVisual() {
  return (
    <div className="feature-frame">
      <div className="feature-frame-bar"><span className="dot-r"/><span className="dot-y"/><span className="dot-g"/>
        <div className="feature-frame-urlbar">{I.shield} bossbase.nl/team</div>
      </div>
      <div className="feature-frame-body" style={{ display: "grid", gap: 9 }}>
        {[
          { name: "Mark (Eigenaar)", role: "Admin",      bg: "var(--pl)" },
          { name: "Lisa (Planner)", role: "Medewerker",  bg: "#dbeafe" },
          { name: "Thomas (Monteur)",role: "Medewerker", bg: "#fef3c7" },
        ].map(u => (
          <div key={u.name} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 13px", display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: u.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "var(--dk)", flex: "none" }}>{u.name[0]}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{u.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--dmu)" }}>{u.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MailVisual() {
  return (
    <div className="feature-frame flip">
      <div className="feature-frame-bar"><span className="dot-r"/><span className="dot-y"/><span className="dot-g"/>
        <div className="feature-frame-urlbar">{I.shield} bossbase.nl/automatisering</div>
      </div>
      <div className="feature-frame-body" style={{ display: "grid", gap: 8 }}>
        {[
          { subj: "Uw offerte is klaar",          badge: "Verstuurd",   cls: "badge-accepted" },
          { subj: "Herinnering: offerte vervalt",  badge: "Automatisch", cls: "badge-sent" },
          { subj: "Factuur betaald — dank u!",     badge: "Ontvangen",   cls: "badge-paid" },
        ].map(m => (
          <div key={m.subj} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{m.subj}</div>
            <span className={`badge ${m.cls}`}>{m.badge}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const BLOCKS = [
  {
    kicker: "CRM", title: "Klanten bijhouden die jou bijhouden",
    desc: "Nooit meer zoeken in je hoofd. BossBase onthoudt alles: contactgegevens, opdrachten, notities en volledige communicatiegeschiedenis.",
    points: ["Klantenkaarten met volledige historie", "Notities en bijlagen per klant", "Segmenteer op sector, regio of omzet", "Automatische opvolgherinneringen"],
    Visual: CRMVisual, flip: false,
  },
  {
    kicker: "Offertes & facturen", title: "Van offerte naar betaald in één klik",
    desc: "Maak professionele offertes in 2 minuten. Klant tekent digitaal, jij converteert naar factuur met één klik. BTW wordt automatisch berekend.",
    points: ["Huisstijl aanpassing", "Digitale handtekening", "Automatisch omzetten naar factuur", "BTW-aangifte export"],
    Visual: OffertesVisual, flip: true,
  },
  {
    kicker: "Agenda", title: "Plan slim, werk slimmer",
    desc: "Koppel afspraken direct aan klanten en opdrachten. Stuur automatisch herinneringen en voorkom no-shows.",
    points: ["Klantgekoppelde afspraken", "Automatische SMS/e-mail herinneringen", "Google Calendar synchronisatie", "Terugkerende afspraken"],
    Visual: AgendaVisual, flip: false,
  },
  {
    kicker: "Omzet & rapporten", title: "Weet precies hoe je er voor staat",
    desc: "Realtime inzicht in omzet, openstaande facturen en beste klanten. Exporteer naar je accountant met één klik.",
    points: ["Realtime omzetdashboard", "Openstaande en vervallen facturen", "Beste klanten en sectoren", "Export naar accountant (CSV/PDF)"],
    Visual: OmzetVisual, flip: true,
  },
  {
    kicker: "Team", title: "Werk samen zonder gedoe",
    desc: "Voeg medewerkers toe met de juiste rechten. Iedereen werkt in hetzelfde systeem, altijd up-to-date.",
    points: ["Gebruikersrollen (admin/medewerker)", "Activiteitenlog", "Taakverdeling per klant", "Mobiel voor onderweg"],
    Visual: TeamVisual, flip: false,
  },
  {
    kicker: "E-mail automatisering", title: "Nooit meer handmatig herinneringen sturen",
    desc: "BossBase stuurt automatisch offertebevestigingen, herinneringen en bedankjes. Jij hoeft er niets aan te doen.",
    points: ["Automatische offertebevestiging", "Betalingsherinnering na X dagen", "Bedankmail na betaling", "Eigen e-mailsjablonen"],
    Visual: MailVisual, flip: true,
  },
]

const INTEGRATIONS = [
  { name: "Google Calendar", icon: <Calendar size={20} />,      soon: false },
  { name: "Outlook",         icon: <Mail size={20} />,          soon: false },
  { name: "Exact Online",    icon: <Briefcase size={20} />,     soon: false },
  { name: "Mollie",          icon: <CreditCard size={20} />,    soon: false },
  { name: "Slack",           icon: <MessageSquare size={20} />, soon: true },
  { name: "Zapier",          icon: <Zap size={20} />,           soon: true },
  { name: "Moneybird",       icon: <Bird size={20} />,          soon: true },
  { name: "WhatsApp",        icon: <MessageCircle size={20} />, soon: true },
]

const VROEGER = [
  "Offertes in losse Word-bestanden",
  "Klanten bijhouden in Excel",
  "Agenda op papier of los in Google",
  "Omzet uitrekenen aan het einde van het kwartaal",
  "Herinneren via Post-it briefjes",
  "Facturen handmatig nummeren en versturen",
]
const NU = [
  "Offerte klaar in 2 minuten, digitaal ondertekend",
  "CRM met volledige klanthistorie op één plek",
  "Agenda gekoppeld aan klanten en opdrachten",
  "Realtime omzetdashboard, altijd inzicht",
  "Automatische herinneringen per e-mail en SMS",
  "Factuur met één klik vanuit geaccepteerde offerte",
]

export default function FeaturesPage({ navigate }) {
  useEffect(() => {
    const cleanup = initChoreo()
    return cleanup
  }, [])

  const go = (e, href) => {
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }

  return (
    <div className="bm">
      <ScrollLine />
      <Nav navigate={navigate} />
      <main>
        <section className="functies-hero">
          <div className="container">
            <Reveal>
              <span className="section-kicker">Functies</span>
              <h1>Alles wat je nodig hebt.<br/>Niets wat je niet nodig hebt.</h1>
              <p>BossBase combineert CRM, offertes, agenda en financieel in één eenvoudige tool — speciaal voor ZZP'ers en kleine bedrijven.</p>
              <div className="hero-ctas" style={{ marginTop: 28 }}>
                <a href="/registreer" className="btn btn-p glow btn-lg" onClick={e => go(e, "/registreer")}>Gratis proberen {I.arrowRight}</a>
                <a href="/prijzen" className="btn btn-s btn-lg" onClick={e => go(e, "/prijzen")}>Bekijk prijzen</a>
              </div>
            </Reveal>
          </div>
        </section>

        {BLOCKS.map((b, i) => (
          <div key={i} className="section">
            <div className="container">
              <Reveal>
                <div className={`feature-row choreo-body${b.flip ? " flip" : ""}`}>
                  <div className="feature-copy">
                    <span className="section-kicker">{b.kicker}</span>
                    <h2 style={{ fontSize: "clamp(24px,3vw,34px)", marginTop: 10 }}>{b.title}</h2>
                    <p style={{ marginTop: 12, fontSize: 16.5, color: "var(--dmu)", maxWidth: "30em" }}>{b.desc}</p>
                    <ul className="feature-points" style={{ marginTop: 18 }}>
                      {b.points.map(p => <li key={p}>{I.check} {p}</li>)}
                    </ul>
                  </div>
                  <div><b.Visual /></div>
                </div>
              </Reveal>
            </div>
          </div>
        ))}

        <div className="section" style={{ background: "var(--bgs)" }}>
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Vergelijk</span>
              <h2>Vroeger vs. nu</h2>
              <p>Zie hoe BossBase de dagelijkse rompslomp oplost.</p>
            </div></Reveal>
            <Reveal className="choreo-body">
              <div className="compare-cols">
                <div className="compare-col bad">
                  <h3>{I.warning} Zonder BossBase</h3>
                  <ul className="compare-list">
                    {VROEGER.map(t => <li key={t}><span className="ic" style={{ color: "var(--danger)" }}>{I.x}</span> {t}</li>)}
                  </ul>
                </div>
                <div className="compare-col good">
                  <h3>{I.checkCircle} Met BossBase</h3>
                  <ul className="compare-list">
                    {NU.map(t => <li key={t}><span className="ic" style={{ color: "var(--pd)" }}>{I.check}</span> {t}</li>)}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="section">
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Integraties</span>
              <h2>Werkt samen met wat je al gebruikt</h2>
              <p>BossBase integreert met jouw bestaande tools. Geen dubbel werk meer.</p>
            </div></Reveal>
            <Reveal stagger className="choreo-body">
              <div className="integ-grid">
                {INTEGRATIONS.map(integ => (
                  <div key={integ.name} className={`integ-card${integ.soon ? " soon" : ""}`}>
                    <div className="integ-dot">{integ.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{integ.name}</div>
                      {integ.soon && <div style={{ fontSize: 12.5, color: "var(--dl)", marginTop: 2 }}>Binnenkort beschikbaar</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>

        <div className="section">
          <div className="container">
            <Reveal>
              <div className="final-cta">
                <h2>Klaar om chaos achter je te laten? <span className="green">Probeer BossBase.</span></h2>
                <p>14 dagen gratis. Geen creditcard. Geen gedoe.</p>
                <div className="hero-ctas" style={{ justifyContent: "center" }}>
                  <a href="/registreer" className="btn btn-p glow btn-lg" onClick={e => go(e, "/registreer")}>Gratis starten {I.arrowRight}</a>
                  <a href="/prijzen" className="btn btn-s btn-lg" onClick={e => go(e, "/prijzen")}>Bekijk prijzen</a>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
