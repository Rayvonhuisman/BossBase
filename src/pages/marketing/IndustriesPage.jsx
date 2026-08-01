import { useState, useEffect } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"

const BRANCHES = [
  {
    id: "loodgieter", naam: "Loodgieter", icon: I.wrench,
    tag: "Sanitair & installaties",
    intro: "Als loodgieter werk je op afroep, vaak urgent. Offertes moeten snel de deur uit en klanten wil je goed bijhouden.",
    pains: ["Offertes maken duurt te lang", "Klanten vergeten wie je bent", "Agenda-chaos bij spoedklussen", "Facturen blijven liggen"],
    solves: ["Offerte in 2 minuten via sjabloon", "CRM met volledige klanthistorie", "Agenda met herinneringen", "Automatische factuurherinneringen"],
    stats: [{ n: "42 min", lbl: "bespaard per dag" }, { n: "3×", lbl: "snellere offertes" }],
  },
  {
    id: "schilder", naam: "Schilder", icon: I.tool,
    tag: "Schilderwerk & afwerking",
    intro: "Schilders werken aan meerdere projecten tegelijk. Wie is wanneer waar? Welke offerte wacht nog op akkoord?",
    pains: ["Meerdere projecten tegelijk overzien", "Materiaalkosten bijhouden", "Klanten bellen op onhandige momenten", "Verloren offertes"],
    solves: ["Pipeline per project", "Kostprijs in offerte verwerken", "Klant belt jou dankzij herinneringen", "Digitaal archief van alle offertes"],
    stats: [{ n: "€ 1.200", lbl: "extra omzet/maand" }, { n: "18 min", lbl: "per offerte bespaard" }],
  },
  {
    id: "elektricien", naam: "Elektricien", icon: I.bolt,
    tag: "Elektra & beveiliging",
    intro: "Van kleine storingen tot complete installaties — als elektricien wil je je concentreren op het werk, niet op de administratie.",
    pains: ["Werkbonnen kwijtraken", "Onduidelijke afspraken met klanten", "Te laat factureren", "Geen inzicht in winstmarges"],
    solves: ["Digitale werkbonnen", "Afspraken met klantbevestiging", "Automatisch factureren na opdracht", "Omzet per klant inzichtelijk"],
    stats: [{ n: "15 uur", lbl: "minder admin per maand" }, { n: "92%", lbl: "betaalt op tijd" }],
  },
  {
    id: "aannemer", naam: "Aannemer", icon: I.package,
    tag: "Bouw & renovatie",
    intro: "Als aannemer manage je subcontractors, klanten en deadlines tegelijk. Overzicht is geen luxe, maar een must.",
    pains: ["Veel partijen, weinig overzicht", "Grote offertes met veel regels", "Betalingsrisico bij grote projecten", "Teamcommunicatie loopt vast"],
    solves: ["Projectpipeline met deadlines", "Gedetailleerde offertes met subregelitems", "Betalingsschema's in facturen", "Teamrollen en taakverdeling"],
    stats: [{ n: "€ 8.400", lbl: "gem. offertebedrag" }, { n: "4", lbl: "projecten tegelijk" }],
  },
  {
    id: "installateur", naam: "Installateur", icon: I.tool,
    tag: "Installatie & service",
    intro: "Service-abonnementen, onderhoudsbeurten en storingen: als installateur heb je terugkerende klanten die goed bijgehouden moeten worden.",
    pains: ["Onderhoudsmomenten vergeten", "Servicecontracten niet bijhouden", "Klanten zijn vergeten wie je bent", "Geen inzicht in uurtarief-omzet"],
    solves: ["Terugkerende afspraken instellen", "Contracten per klant opslaan", "Automatische herinneringen", "Omzet per uurtarief inzichtelijk"],
    stats: [{ n: "12×", lbl: "terugkerende klanten" }, { n: "0", lbl: "gemiste onderhoudsbeurten" }],
  },
  {
    id: "tuinman", naam: "Tuinman / Groenvoorziening", icon: I.sparkle,
    tag: "Tuin & groenonderhoud",
    intro: "Tuinaanleg, onderhoud en seizoenswerk: als tuinman heb je een gevarieerde klantenkring die je goed wil bijhouden.",
    pains: ["Seizoensdrukte vs. rustige periodes", "Klanten vergeten servicebeurt", "Materiaalkosten in offerte vergeten", "Geen terugkerende facturen"],
    solves: ["Pipeline voor drukte en rustige periodes", "Herinneringen voor terugkerende diensten", "Kostprijs-calculatie in offerte", "Abonnementsfacturatie"],
    stats: [{ n: "+34%", lbl: "meer terugkerende klanten" }, { n: "2×", lbl: "snellere offertes" }],
  },
  {
    id: "schoonmaker", naam: "Schoonmaakbedrijf", icon: I.sparkle,
    tag: "Schoonmaak & facilitair",
    intro: "Vaste klanten, terugkerende diensten en meerdere medewerkers: schoonmaakbedrijven hebben eenvoudige maar robuuste tools nodig.",
    pains: ["Roosters voor meerdere klanten bijhouden", "Facturen per klant afstemmen", "Medewerkers overzicht geven", "Klachten tracken"],
    solves: ["Agenda per locatie en medewerker", "Automatische maandfacturering", "Teamrollen en taakverdeling", "Notities per klant voor feedback"],
    stats: [{ n: "22", lbl: "gem. vaste klanten" }, { n: "100%", lbl: "facturen op tijd" }],
  },
]

const PERSONAS = [
  {
    id: "zzp", label: "ZZP'er",
    desc: "Jij bent je eigen baas. Geen personeel, maar wel alle verantwoordelijkheid. BossBase helpt je gefocust te blijven op je werk.",
    features: [
      { icon: I.signature, title: "Offertes in 2 minuten", desc: "Professioneel en snel, ook op je telefoon." },
      { icon: I.calendar,  title: "Agenda met herinneringen", desc: "Nooit meer een afspraak vergeten of no-shows." },
      { icon: I.chart,     title: "Inzicht in je omzet", desc: "Weet direct hoeveel je deze maand verdient." },
      { icon: I.users,     title: "CRM zonder gedoe", desc: "Alle klantinfo op één plek, snel terug te vinden." },
    ],
    cta: "Ga als ZZP'er aan de slag",
  },
  {
    id: "bedrijf", label: "Bedrijf",
    desc: "Je hebt een team en meerdere projecten tegelijk. BossBase houdt iedereen op de hoogte en het overzicht compleet.",
    features: [
      { icon: I.users,     title: "Teamrollen & rechten", desc: "Iedereen heeft toegang tot wat hij nodig heeft." },
      { icon: I.kanban,    title: "Pipeline voor elk project", desc: "Van aanvraag tot betaling, alles in beeld." },
      { icon: I.chart,     title: "Rapportages per medewerker", desc: "Zie wie de meeste omzet genereert." },
      { icon: I.building,  title: "Meerdere vestigingen", desc: "Beheer meerdere locaties in één account (Team plan)." },
    ],
    cta: "Ga als bedrijf aan de slag",
  },
]

function BrancheVisual({ branch }) {
  return (
    <div className="branche-visual-box">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--pll)", color: "var(--pd)", display: "flex", alignItems: "center", justifyContent: "center" }}>{branch.icon}</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: "var(--dk)" }}>{branch.naam}</div>
          <div style={{ fontSize: 13, color: "var(--pd)", fontWeight: 600 }}>{branch.tag}</div>
        </div>
      </div>
      {branch.stats && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          {branch.stats.map(s => (
            <div key={s.lbl} style={{ background: "var(--pll)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "var(--pd)", letterSpacing: "-0.02em" }}>{s.n}</div>
              <div style={{ fontSize: 12.5, color: "var(--dmu)", marginTop: 3 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {branch.solves.map(s => (
          <div key={s} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 14, color: "var(--dm)" }}>
            <span style={{ color: "var(--pd)", flex: "none", marginTop: 2 }}>{I.check}</span> {s}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function IndustriesPage({ navigate }) {
  const [type, setType] = useState("zzp")
  const persona = PERSONAS.find(p => p.id === type)

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
        {/* Hero */}
        <section className="voorwie-page-hero">
          <div className="container">
            <Reveal>
              <span className="section-kicker">Voor wie</span>
              <h1>Gebouwd voor de handen<br/>die Nederland laten draaien</h1>
              <p>Of je nu zzp of bedrijf bent — BossBase past zich aan jouw branche en werkwijze aan.</p>
              <div style={{ display: "inline-flex", gap: 4, background: "#fff", border: "1px solid var(--bstrong)", borderRadius: 999, padding: 4, marginTop: 28 }}>
                {PERSONAS.map(p => (
                  <button key={p.id}
                    onClick={() => setType(p.id)}
                    style={{
                      border: "none", background: type === p.id ? "var(--dk)" : "none",
                      color: type === p.id ? "#fff" : "var(--dmu)",
                      fontWeight: 600, fontSize: 15, padding: "10px 22px", borderRadius: 999, cursor: "pointer",
                      transition: "all 0.18s ease",
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ZZP / Bedrijf persona */}
        <div className="section">
          <div className="container">
            <Reveal>
              <div className="section-head choreo-head">
                <h2>{type === "zzp" ? "BossBase voor ZZP'ers" : "BossBase voor bedrijven"}</h2>
                <p>{persona.desc}</p>
              </div>
              <div className="opdracht-grid choreo-body">
                {persona.features.map(f => (
                  <div key={f.title} className="opdracht-card">
                    <div className="ic">{f.icon}</div>
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: "center", marginTop: 32 }}>
                <a href="/registreer" className="btn btn-p glow btn-lg" onClick={e => go(e, "/registreer")}>
                  {persona.cta} {I.arrowRight}
                </a>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Per branche */}
        <div>
          <div className="section" style={{ paddingBottom: 0 }}>
            <div className="container">
              <Reveal><div className="section-head choreo-head">
                <span className="section-kicker">Per branche</span>
                <h2>Speciaal voor jouw vakgebied</h2>
                <p>BossBase kent de uitdagingen van jouw branche. Kijk hoe we die oplossen.</p>
              </div></Reveal>
            </div>
          </div>

          {BRANCHES.map((branch, i) => (
            <div key={branch.id} className="section" style={{ paddingTop: 56, paddingBottom: 56 }}>
              <div className="container">
                <Reveal>
                  <div className={`branche-layout choreo-body${i % 2 === 1 ? " flip" : ""}`}>
                    <div className="branche-copy">
                      <span className="branche-tag">{branch.icon} {branch.tag}</span>
                      <h2>{branch.naam}</h2>
                      <p className="intro">{branch.intro}</p>
                      <div className="two-cols-label">Jouw pijnpunten</div>
                      <ul className="pain-list">
                        {branch.pains.map(p => (
                          <li key={p}>
                            <span style={{ color: "var(--danger)", flex: "none" }}>{I.x}</span> {p}
                          </li>
                        ))}
                      </ul>
                      <div className="two-cols-label" style={{ marginTop: 16 }}>Hoe BossBase helpt</div>
                      <ul className="solve-list">
                        {branch.solves.map(s => (
                          <li key={s}>
                            <span style={{ color: "var(--pd)", flex: "none" }}>{I.check}</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="branche-visual">
                      <BrancheVisual branch={branch} />
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="section">
          <div className="container">
            <Reveal>
              <div className="final-cta">
                <h2>Klaar om te beginnen? <span className="green">Probeer het gratis.</span></h2>
                <p>14 dagen gratis. Geen creditcard nodig.</p>
                <div className="hero-ctas" style={{ justifyContent: "center" }}>
                  <a href="/registreer" className="btn btn-p glow btn-lg" onClick={e => go(e, "/registreer")}>
                    Gratis proberen {I.arrowRight}
                  </a>
                  <a href="/prijzen" className="btn btn-s btn-lg" onClick={e => go(e, "/prijzen")}>
                    Bekijk prijzen
                  </a>
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
