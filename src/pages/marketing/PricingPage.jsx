import { useState, useEffect } from "react"
import { Star } from "lucide-react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"

const TIERS = [
  {
    tier: "Starter", who: "Perfect voor ZZP'ers",
    monthly: 19, yearly: 15, extra: null,
    features: [
      "1 gebruiker",
      "Onbeperkt klanten",
      "Offertes & facturen",
      "Agenda",
      "Pipeline CRM",
      "BTW-aangifte export",
      "E-mailondersteuning",
    ],
    hot: false,
  },
  {
    tier: "Groei", who: "Voor groeiende bedrijven",
    monthly: 39, yearly: 29, extra: "+ € 9/extra gebruiker",
    features: [
      "Tot 5 gebruikers",
      "Alles van Starter",
      "Omzetrapportages",
      "SMS-herinneringen",
      "Google Calendar sync",
      "Prioriteitsondersteuning",
      "Teamrollen & rechten",
    ],
    hot: true,
  },
  {
    tier: "Team", who: "Grotere teams & bedrijven",
    monthly: 79, yearly: 59, extra: "+ € 7/extra gebruiker",
    features: [
      "Tot 15 gebruikers",
      "Alles van Groei",
      "Meerdere vestigingen",
      "API-toegang",
      "Maatwerk rapportages",
      "Persoonlijke onboarding",
      "Telefonische ondersteuning",
    ],
    hot: false,
  },
]

const CMP_CATS = [
  {
    cat: "Algemeen",
    rows: [
      { label: "Gebruikers",        starter: "1",          groei: "Tot 5",       team: "Tot 15" },
      { label: "Klanten",           starter: true,         groei: true,          team: true },
      { label: "Opslag",            starter: "5 GB",       groei: "20 GB",       team: "100 GB" },
      { label: "Mobiele app",       starter: true,         groei: true,          team: true },
    ],
  },
  {
    cat: "CRM & Pipeline",
    rows: [
      { label: "Klantenkaarten",    starter: true,         groei: true,          team: true },
      { label: "Pipeline",          starter: true,         groei: true,          team: true },
      { label: "Notities & bijlagen", starter: true,       groei: true,          team: true },
      { label: "Segmentatie",       starter: false,        groei: true,          team: true },
    ],
  },
  {
    cat: "Offertes & Facturen",
    rows: [
      { label: "Offertes",          starter: true,         groei: true,          team: true },
      { label: "Facturen",          starter: true,         groei: true,          team: true },
      { label: "Digitale handtekening", starter: true,     groei: true,          team: true },
      { label: "BTW-aangifte export", starter: true,       groei: true,          team: true },
      { label: "Maatwerk sjablonen", starter: false,       groei: true,          team: true },
    ],
  },
  {
    cat: "Agenda & Planning",
    rows: [
      { label: "Agenda",            starter: true,         groei: true,          team: true },
      { label: "SMS-herinneringen", starter: false,        groei: true,          team: true },
      { label: "Google Calendar",   starter: false,        groei: true,          team: true },
      { label: "Terugkerende afspraken", starter: true,    groei: true,          team: true },
    ],
  },
  {
    cat: "Rapportages",
    rows: [
      { label: "Omzetdashboard",    starter: "Basis",      groei: "Uitgebreid",  team: "Maatwerk" },
      { label: "Klantrapportage",   starter: false,        groei: true,          team: true },
      { label: "Export naar accountant", starter: true,    groei: true,          team: true },
      { label: "API-toegang",       starter: false,        groei: false,         team: true },
    ],
  },
  {
    cat: "Ondersteuning",
    rows: [
      { label: "E-mailondersteuning",       starter: true, groei: true,          team: true },
      { label: "Prioriteitsondersteuning",  starter: false, groei: true,         team: true },
      { label: "Telefonische ondersteuning",starter: false, groei: false,        team: true },
      { label: "Persoonlijke onboarding",   starter: false, groei: false,        team: true },
    ],
  },
]

const FAQ_P = [
  { q: "Kan ik op elk moment opzeggen?", a: "Ja. Er is geen minimale looptijd. Je kunt maandelijks of jaarlijks betalen. Bij jaarabonnement ontvang je een terugbetaling naar rato bij opzegging." },
  { q: "Wat gebeurt er na de proefperiode?", a: "Na 14 dagen word je gevraagd een abonnement te kiezen. Je data blijft behouden. Je kiest pas dan welk plan het beste bij je past." },
  { q: "Kan ik van plan wisselen?", a: "Ja, upgraden kan direct. Downgraden gaat in aan het begin van je volgende factuurperiode. Er zijn geen extra kosten voor het wisselen van plan." },
  { q: "Is BTW inbegrepen in de prijs?", a: "Nee, de getoonde prijzen zijn exclusief BTW. Als ondernemer kun je de BTW aftrekken als zakelijke kosten." },
  { q: "Wat zijn de betaalmogelijkheden?", a: "We accepteren iDEAL, creditcard en SEPA-incasso. Jaarabonnementen kunnen ook per factuur worden betaald." },
]

function CmpCell({ val }) {
  if (val === true)  return <span className="cmp-check">{I.check}</span>
  if (val === false) return <span className="cmp-dash">{I.dash}</span>
  return <span className="cmp-note">{val}</span>
}

export default function PricingPage({ navigate }) {
  const [yearly, setYearly] = useState(false)
  const [faqOpen, setFaqOpen] = useState(null)

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
        <section className="price-hero">
          <div className="container">
            <Reveal>
              <span className="section-kicker">Prijzen</span>
              <h1>Duidelijke prijs.<br/>Geen verrassingen.</h1>
              <p>Altijd 14 dagen gratis proberen. Geen creditcard nodig.</p>
            </Reveal>
          </div>
        </section>

        {/* Prijskaarten */}
        <div className="section" style={{ background: "var(--bgs)", paddingTop: 0 }}>
          <div className="container">
            <div className="price-toggle-wrap" style={{ marginBottom: 32 }}>
              <div className="bill-toggle">
                <button className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Maandelijks</button>
                <button className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Jaarlijks</button>
              </div>
              {yearly && <div className="bill-hook pop">{I.bolt} Bespaar 25% bij jaarabonnement</div>}
            </div>
            <Reveal stagger>
              <div className="price-grid-full choreo-body">
                {TIERS.map(t => (
                  <div key={t.tier} className={`price-card${t.hot ? " hot" : ""}`}>
                    {t.hot && <div className="hot-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={12} fill="currentColor" /> Meest gekozen</div>}
                    <div className="tier">{t.tier}</div>
                    <div className="who">{t.who}</div>
                    <div className="amount">
                      <strong>€ {yearly ? t.yearly : t.monthly}</strong>
                      <span>/ maand{yearly ? " (jaarlijks)" : ""}</span>
                    </div>
                    <div className="extra-user">{t.extra || " "}</div>
                    <ul>{t.features.map(f => <li key={f}>{I.check} {f}</li>)}</ul>
                    <a href="/registreer" className={`btn ${t.hot ? "btn-p glow" : "btn-s"}`}
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={e => go(e, "/registreer")}>
                      Gratis 14 dagen proberen
                    </a>
                  </div>
                ))}
              </div>
            </Reveal>
            <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--dmu)" }}>
              Alle prijzen excl. BTW · Geen creditcard nodig · Altijd opzegbaar
            </p>
          </div>
        </div>

        {/* Vergelijkingstabel */}
        <div className="compare-section">
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Vergelijk</span>
              <h2>Alles naast elkaar</h2>
            </div></Reveal>
            <div className="compare-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Functie</th>
                    <th>Starter</th>
                    <th className="col-hot">Groei</th>
                    <th>Team</th>
                  </tr>
                </thead>
                <tbody>
                  {CMP_CATS.map(cat => (
                    <>
                      <tr key={`cat-${cat.cat}`} className="compare-cat">
                        <td colSpan={4}>{cat.cat}</td>
                      </tr>
                      {cat.rows.map(row => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td><CmpCell val={row.starter} /></td>
                          <td className="col-hot"><CmpCell val={row.groei} /></td>
                          <td><CmpCell val={row.team} /></td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="price-faq">
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">FAQ</span>
              <h2>Veelgestelde vragen over prijzen</h2>
            </div></Reveal>
            <div className="faq-list">
              {FAQ_P.map((item, i) => (
                <div key={i} className="faq-item" data-open={faqOpen === i ? "true" : "false"}>
                  <button className="faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                    {item.q} {I.chevronDown}
                  </button>
                  <div className="faq-a"><div><p>{item.a}</p></div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="price-cta">
          <div className="container">
            <Reveal>
              <div className="final-cta">
                <h2>Geen verborgen kosten. <span className="green">Gewoon eerlijk.</span></h2>
                <p>Start vandaag gratis. Je kiest pas na 14 dagen een plan — als je wilt.</p>
                <div className="hero-ctas" style={{ justifyContent: "center" }}>
                  <a href="/registreer" className="btn btn-p glow btn-lg" onClick={e => go(e, "/registreer")}>
                    Gratis proberen {I.arrowRight}
                  </a>
                  <a href="/contact" className="btn btn-s btn-lg" onClick={e => go(e, "/contact")}>
                    Vraag stellen
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
