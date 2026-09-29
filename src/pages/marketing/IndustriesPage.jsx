import { useState, useEffect } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"

// Per vakgebied: herkenbare problemen en alleen bevestigde functies
// (docs/seo/productfeiten.md). Geen besparingscijfers: die hebben we niet.
const BRANCHES = [
  {
    id: "installateur", naam: "Installateurs, loodgieters en elektriciens", icon: I.wrench,
    tag: "Storingen, onderhoud en installaties", href: "/voor-wie/installateurs", kort: "installateurs",
    intro: "Veel korte klussen op een dag, materiaal dat pas op locatie duidelijk wordt, en een klant die wil zien wat er is gedaan.",
    pains: ["Gebruikt materiaal komt niet op de factuur", "Papieren bonnen komen pas aan het eind van de week binnen", "Klant niet thuis op de afspraak", "Facturen blijven liggen"],
    solves: ["Werkbon met materiaal, foto's en uren", "Klant tekent ter plekke of via een link", "Afspraakherinnering per mail aan de klant", "Betalingsherinneringen (Groei en Team)"],
  },
  {
    id: "schilder", naam: "Schilders en stukadoors", icon: I.paintRoller,
    tag: "Schilderwerk en afwerking", href: "/voor-wie/schilders", kort: "schilders",
    intro: "Bij schilderwerk staat of valt alles met de offerte, en met wat er gebeurt als je onderweg iets tegenkomt dat niet in de offerte stond.",
    pains: ["Discussie over meerwerk achteraf", "Offertes die blijven liggen", "Klussen van meerdere dagen overzien", "Verschillende versies van een offerte"],
    solves: ["Meerwerk op de werkbon, afgetekend door de klant", "Offerte online ondertekenen (Groei en Team)", "Meerdaagse werkbonnen met eigen ploeg per dag", "Nieuwe offerteversie vervangt de oude"],
  },
  {
    id: "hovenier", naam: "Hoveniers en groenvoorziening", icon: I.leaf,
    tag: "Tuinaanleg en onderhoud", href: "/voor-wie/hoveniers", kort: "hoveniers",
    intro: "In het seizoen wil iedereen tegelijk. Dan draait het om planning: welke ploeg, welke bus, welke tuin, en levert het op wat je dacht?",
    pains: ["Ploegen en bussen plannen in de piek", "Een aanleg die uitloopt", "Materiaalkosten per tuin uit het oog", "Na afloop niet weten wat een klus opleverde"],
    solves: ["Planning per medewerker en bus (Team of module)", "Waarschuwing bij 80% en 100% van de begrote uren", "Materiaal met inkoopprijs op de werkbon", "Nacalculatie per project (Groei en Team)"],
  },
  {
    id: "aannemer", naam: "Aannemers en klusbedrijven", icon: I.hammer,
    tag: "Bouw, verbouw en renovatie", href: "/voor-wie/aannemers-en-klusbedrijven", kort: "aannemers en klusbedrijven",
    intro: "Een verbouwing is een project: meerdere dagen, meerdere mensen, soms onderaannemers, en keuzes onderweg die de prijs veranderen.",
    pains: ["Veel werkbonnen onder één project", "Waarschuwingen aan de klant niet vastgelegd", "Btw verlegd bij onderaanneming", "Geen zicht op de marge per project"],
    solves: ["Project met offerte, werkbonnen en facturen", "Waarschuwing per mail vanuit de werkbon, vastgelegd", "Btw-regime per factuurregel, ook verlegd", "Uren en kosten per project"],
  },
  {
    id: "schoonmaker", naam: "Schoonmaakbedrijven", icon: I.sparkles,
    tag: "Schoonmaak en facilitair",
    intro: "Schoonmaakbedrijven gebruiken BossBase voor klanten, offertes, werkbonnen en facturen. Eerlijk is eerlijk: vaste schema's die zichzelf elke week herhalen en automatische maandfacturen zitten er niet in.",
    pains: ["Klantgegevens verspreid over lijstjes", "Offertes en facturen in losse bestanden", "Afspraken met klanten niet vastgelegd"],
    solves: ["Klantkaart met historie en notities", "Offertes en facturen met je eigen logo", "Werkbon met handtekening van de klant"],
  },
]

const PERSONAS = [
  {
    id: "zzp", label: "ZZP'er",
    desc: "Jij bent je eigen baas. Geen personeel, maar wel alle verantwoordelijkheid. BossBase houdt je administratie bij elkaar, zodat jij kunt werken.",
    features: [
      { icon: I.signature, title: "Offertes met je eigen logo", desc: "Versturen per mail, online laten ondertekenen in Groei." },
      { icon: I.calendar,  title: "Agenda met herinneringen", desc: "Je klant krijgt vooraf een afspraakherinnering per mail." },
      { icon: I.chart,     title: "Zien wat er openstaat", desc: "Welke facturen betaald zijn, en welke nog niet." },
      { icon: I.users,     title: "Klanten op één plek", desc: "Alle klantinfo en historie, snel terug te vinden." },
    ],
    cta: "Ga als zzp'er aan de slag",
  },
  {
    id: "bedrijf", label: "Bedrijf",
    desc: "Je hebt een team en meerdere klussen tegelijk. BossBase houdt iedereen op de hoogte en het overzicht compleet.",
    features: [
      { icon: I.users,     title: "Rollen en rechten", desc: "Per medewerker bepalen wat hij ziet en doet (Team)." },
      { icon: I.kanban,    title: "Pipeline van aanvraag tot betaling", desc: "Elke klus in beeld, van aanvraag tot betaalde factuur." },
      { icon: I.truck,     title: "Planning per medewerker en bus", desc: "Weekoverzicht met waarschuwing bij dubbel inplannen." },
      { icon: I.clock,     title: "Uren per werkdag en per klus", desc: "Voor je loonadministratie en je nacalculatie." },
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
        {/* Hero */}
        <section className="voorwie-page-hero">
          <div className="container">
            <div>
              <span className="section-kicker">Voor wie</span>
              <h1>Gebouwd voor de handen<br/>die Nederland laten draaien</h1>
              <p>Of je nu zzp&apos;er bent of een bedrijf met een team: kijk per vak hoe je met BossBase werkt.</p>
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
            </div>
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
                <a href="/register" className="btn btn-p glow btn-lg" onClick={e => go(e, "/register")}>
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
                <p>Herkenbare problemen per vak, en wat BossBase eraan doet.</p>
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
                      <h2>{branch.href ? <a href={branch.href} style={{ color: "inherit" }}>{branch.naam}</a> : branch.naam}</h2>
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
                      {branch.href && (
                        <a href={branch.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 20, fontWeight: 600 }}>
                          Zo werkt BossBase voor {branch.kort} {I.arrowRight}
                        </a>
                      )}
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
                <p>14 dagen gratis met de functies van Groei. Geen betaalgegevens nodig.</p>
                <div className="hero-ctas" style={{ justifyContent: "center" }}>
                  <a href="/register" className="btn btn-p glow btn-lg" onClick={e => go(e, "/register")}>
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
