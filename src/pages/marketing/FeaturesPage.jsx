import { useEffect } from "react"
import { Briefcase, CreditCard, Bird } from "lucide-react"
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
          { name: "Peters Installatiewerk", status: "Nieuw",   val: "",        cls: "badge-concept" },
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
          { subj: "Offerte OF-2026-048",            badge: "Verstuurd",   cls: "badge-accepted" },
          { subj: "Herinnering factuur BB-F-12",    badge: "Automatisch", cls: "badge-sent" },
          { subj: "Betaalbevestiging BB-F-11",      badge: "Betaald",     cls: "badge-paid" },
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

// Elk blok verwijst naar de eigen functiepagina. Alleen bevestigde functies:
// zie docs/seo/productfeiten.md.
const BLOCKS = [
  {
    kicker: "Klantbeheer", title: "Je klanten en aanvragen op één plek",
    desc: "Een klantkaart met gegevens, offertes, werkbonnen, facturen en een tijdlijn. Aanvragen volg je in een pipeline, van eerste contact tot betaalde factuur.",
    points: ["Klantkaart met historie", "Pipeline met automatisch doorschuivende fasen", "Activiteiten om op te volgen", "Export naar Excel of CSV"],
    Visual: CRMVisual, flip: false, href: "/klantbeheer", link: "Meer over klantbeheer",
  },
  {
    kicker: "Offertes", title: "Offertes maken en online laten ondertekenen",
    desc: "Offertes met je eigen logo en btw per regel. In Groei en Team tekent de klant online; daarna maak je met één klik de factuur.",
    points: ["Eigen logo en huisstijlkleur", "Online ondertekenen (Groei en Team)", "Versies zonder verwarring", "Factuur vanuit de geaccepteerde offerte"],
    beeld: { src: "/screens/offertes.webp", alt: "Het offerteoverzicht in BossBase" }, flip: true, href: "/offertes", link: "Meer over offertes",
  },
  {
    kicker: "Werkbonnen", title: "Werkbonnen die je klant ter plekke tekent",
    desc: "Taken, meerwerk, materiaal, foto's en uren op één werkbon. De klant tekent op je tablet of via een link, en krijgt de werkbon als PDF.",
    points: ["Meerwerk apart vastgelegd", "Materiaal met prijs en leverancier", "Foto's met de camera", "Handtekening van de klant, in elk pakket"],
    beeld: { src: "/screens/werkbon.webp", alt: "Een werkbon in BossBase" }, flip: false, href: "/werkbonnen", link: "Meer over werkbonnen",
  },
  {
    kicker: "Planning", title: "Plannen per medewerker en voertuig",
    desc: "Een dag- of weekoverzicht per medewerker of per bus. Sleep werkbonnen naar de juiste dag en krijg een waarschuwing bij dubbel inplannen.",
    points: ["Dag- en weekweergave", "Waarschuwing bij dubbele boekingen", "Meldingen voor je team", "In Team, of als module bij Groei"],
    beeld: { src: "/screens/planning.webp", alt: "De weekplanning in BossBase" }, flip: true, href: "/planning", link: "Meer over planning",
  },
  {
    kicker: "Urenregistratie", title: "Uren per werkdag en per klus",
    desc: "Werkdagen met begin, eind en pauze, en uren op de werkbon voor je nacalculatie. Twee soorten uren, bewust apart gehouden.",
    points: ["Werkdaguren per medewerker", "Uren per werkbon en project", "Waarschuwing bij 80% en 100% van de begroting", "Nacalculatie in Groei en Team"],
    Visual: TeamVisual, flip: false, href: "/urenregistratie", link: "Meer over urenregistratie",
  },
  {
    kicker: "Facturen", title: "Factureren en sneller betaald worden",
    desc: "Facturen vanuit je offerte of project, met btw per regel. Herinneringen per mail en een betaallink met iDEAL.",
    points: ["Btw per regel, ook verlegd", "Automatische herinneringen (Groei en Team)", "Betaallink met iDEAL (Team, of module)", "Koppeling met Moneybird of SnelStart"],
    Visual: MailVisual, flip: true, href: "/facturen", link: "Meer over facturen",
  },
]

const INTEGRATIONS = [
  { name: "Moneybird", icon: <Bird size={20} />,       href: "/integraties/moneybird" },
  { name: "SnelStart", icon: <Briefcase size={20} />,  href: "/integraties/snelstart" },
  { name: "Stripe (betaallink)", icon: <CreditCard size={20} />, href: "/integraties/stripe-betaallink" },
]

const VROEGER = [
  "Offertes in losse Word-bestanden",
  "Klanten bijhouden in Excel",
  "Werkbonnen op papier in de bus",
  "Agenda op papier of los in je telefoon",
  "Herinneren via Post-it briefjes",
  "Facturen handmatig nummeren en versturen",
]
const NU = [
  "Offertes met je logo, online te ondertekenen",
  "Klantkaart met historie op één plek",
  "Werkbon met handtekening van de klant",
  "Agenda gekoppeld aan klanten en werkbonnen",
  "Herinneringen per mail, automatisch in Groei en Team",
  "Factuur vanuit de geaccepteerde offerte",
]

export default function FeaturesPage({ navigate }) {
  useEffect(() => {
    const cleanup = initChoreo()
    return cleanup
  }, [])

  const go = (e, href) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
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
            <span className="section-kicker">Functies</span>
            <h1>Alle functies van BossBase</h1>
            <p>Van eerste aanvraag tot betaalde factuur: klantbeheer, offertes, werkbonnen, planning, uren en facturen, aan elkaar gekoppeld. Kies een onderdeel voor de details.</p>
            <div className="hero-ctas" style={{ marginTop: 28 }}>
              <a href="/register" className="btn btn-p glow btn-lg" onClick={e => go(e, "/register")}>Start 14 dagen gratis {I.arrowRight}</a>
              <a href="/prijzen" className="btn btn-s btn-lg" onClick={e => go(e, "/prijzen")}>Bekijk prijzen</a>
            </div>
          </div>
        </section>

        {BLOCKS.map((b, i) => (
          <div key={i} className="section">
            <div className="container">
              <Reveal>
                <div className={`feature-row choreo-body${b.flip ? " flip" : ""}`}>
                  <div className="feature-copy">
                    <span className="section-kicker">{b.kicker}</span>
                    <h2 style={{ fontSize: "clamp(24px,3vw,34px)", marginTop: 10 }}><a href={b.href} style={{ color: "inherit" }}>{b.title}</a></h2>
                    <p style={{ marginTop: 12, fontSize: 16.5, color: "var(--dmu)", maxWidth: "30em" }}>{b.desc}</p>
                    <ul className="feature-points" style={{ marginTop: 18 }}>
                      {b.points.map(p => <li key={p}>{I.check} {p}</li>)}
                    </ul>
                    <a href={b.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18, fontWeight: 600 }}>
                      {b.link} {I.arrowRight}
                    </a>
                  </div>
                  <div>
                    {b.beeld
                      ? <img src={b.beeld.src} alt={b.beeld.alt} width="1600" height="1000" loading="lazy" decoding="async" style={{ width: "100%", height: "auto", borderRadius: 14, border: "1px solid var(--bstrong)", boxShadow: "var(--shadow-md)" }} />
                      : <b.Visual />}
                  </div>
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
              <p>Koppel je boekhouding en laat klanten online betalen. <a href="/integraties">Alle koppelingen</a>.</p>
            </div></Reveal>
            <Reveal stagger className="choreo-body">
              <div className="integ-grid">
                {INTEGRATIONS.map(integ => (
                  <a key={integ.name} href={integ.href} className="integ-card" style={{ color: "inherit" }}>
                    <div className="integ-dot">{integ.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{integ.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--dmu)", marginTop: 2 }}>Bekijk de koppeling</div>
                    </div>
                  </a>
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
                <p>14 dagen gratis met de functies van Groei. Geen betaalgegevens nodig.</p>
                <div className="hero-ctas" style={{ justifyContent: "center" }}>
                  <a href="/register" className="btn btn-p glow btn-lg" onClick={e => go(e, "/register")}>Gratis starten {I.arrowRight}</a>
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
