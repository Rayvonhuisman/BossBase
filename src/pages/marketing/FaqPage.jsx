import { useState, useMemo, useEffect } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"

const FAQ_DATA = [
  {
    cat: "Algemeen",
    icon: I.sparkle,
    items: [
      { q: "Wat is BossBase?", a: "BossBase is een alles-in-één administratietool voor ZZP'ers en kleine bedrijven. Je beheert klanten, offertes, facturen, agenda en omzet op één plek." },
      { q: "Voor wie is BossBase geschikt?", a: "BossBase is speciaal gebouwd voor vakmannen en dienstverleners: loodgieters, schilders, elektriciens, aannemers, transporteurs en meer. Ook andere ZZP'ers en kleine bedrijven gebruiken BossBase." },
      { q: "Is BossBase gratis te proberen?", a: "Ja! Je kunt BossBase 14 dagen gratis uitproberen. Je hebt geen creditcard nodig en er zijn geen verborgen kosten." },
      { q: "Hoe snel kan ik aan de slag?", a: "De meeste gebruikers zijn in minder dan 10 minuten up-and-running. Je maakt een account aan, voegt je eerste klant toe en stuurt je eerste offerte. Geen technische kennis nodig." },
      { q: "Is er een mobiele app?", a: "BossBase werkt volledig in je browser, ook op mobiel. De interface is geoptimaliseerd voor telefoon en tablet, zodat je ook onderweg alles bij de hand hebt." },
    ],
  },
  {
    cat: "Abonnement & betaling",
    icon: I.chart,
    items: [
      { q: "Welke abonnementen zijn er?", a: "We hebben drie plannen: Starter (€ 19/maand, 1 gebruiker), Groei (€ 39/maand, tot 5 gebruikers) en Team (€ 79/maand, tot 15 gebruikers). Jaarlijks betalen geeft 25% korting." },
      { q: "Kan ik op elk moment opzeggen?", a: "Ja. Er is geen minimale looptijd bij maandabonnement. Je kunt op elk moment opzeggen en je data meenemen." },
      { q: "Wat zijn de betaalmogelijkheden?", a: "We accepteren iDEAL, creditcard en SEPA-incasso. Jaarabonnementen kunnen ook per factuur worden betaald." },
      { q: "Is BTW inbegrepen in de prijs?", a: "Nee, de getoonde prijzen zijn exclusief BTW. Als ondernemer kun je de BTW aftrekken als zakelijke kosten." },
      { q: "Kan ik van plan wisselen?", a: "Ja, upgraden kan direct. Downgraden gaat in aan het begin van je volgende factuurperiode. Er zijn geen extra kosten voor het wisselen van plan." },
      { q: "Wat gebeurt er na de proefperiode?", a: "Na 14 dagen word je gevraagd een abonnement te kiezen. Je data blijft altijd bewaard. Je kiest pas dan welk plan het beste bij je past." },
    ],
  },
  {
    cat: "Functies",
    icon: I.bolt,
    items: [
      { q: "Kan ik offertes digitaal laten ondertekenen?", a: "Ja! Klanten ontvangen een link en kunnen de offerte direct digitaal ondertekenen. Jij ontvangt direct een bevestiging per e-mail." },
      { q: "Werkt BossBase samen met Google Calendar?", a: "Ja, je kunt je agenda synchroniseren met Google Calendar. Afspraken die je in BossBase aanmaakt verschijnen automatisch in je Google Agenda en andersom." },
      { q: "Kan ik btw-aangifte exporteren?", a: "Ja. BossBase genereert een btw-overzicht dat je direct kunt gebruiken voor je belastingaangifte bij de Belastingdienst." },
      { q: "Kan ik meerdere gebruikers toevoegen?", a: "Ja, op het Groei-plan tot 5 gebruikers en op het Team-plan tot 15 gebruikers. Extra gebruikers zijn beschikbaar als add-on." },
      { q: "Kan ik klanten importeren vanuit Excel?", a: "Ja, je kunt klanten en contacten importeren via een CSV-bestand. Onze importwizard begeleidt je stap voor stap." },
      { q: "Zijn er sjablonen voor offertes en facturen?", a: "Ja, BossBase bevat standaard sjablonen die je kunt aanpassen met jouw logo, huisstijl en standaardteksten. In het Groei- en Team-plan kun je meerdere sjablonen aanmaken." },
    ],
  },
  {
    cat: "Technisch",
    icon: I.shield,
    items: [
      { q: "Welke browsers worden ondersteund?", a: "BossBase werkt op alle moderne browsers: Chrome, Firefox, Safari en Edge. We raden aan om de laatste versie te gebruiken." },
      { q: "Werkt BossBase offline?", a: "BossBase is een cloud-applicatie en heeft internet nodig. Je kunt wel eerder geladen pagina's bekijken bij een korte verbindingsonderbreking." },
      { q: "Kan ik mijn data exporteren?", a: "Ja. Je kunt al je klanten, offertes, facturen en rapporten exporteren als CSV of PDF. Jouw data is altijd van jou." },
      { q: "Is er een API beschikbaar?", a: "Ja, op het Team-plan heb je toegang tot onze REST API. Neem contact op voor documentatie en toegang." },
      { q: "Met welke systemen integreert BossBase?", a: "BossBase integreert momenteel met Google Calendar, Outlook, Exact Online en Mollie. Slack, Zapier, Moneybird en WhatsApp komen binnenkort." },
    ],
  },
  {
    cat: "Privacy & veiligheid",
    icon: I.shield,
    items: [
      { q: "Is BossBase AVG-compliant?", a: "Ja. BossBase is volledig AVG-compliant. We verwerken je data als verwerker en leggen dit vast in een verwerkersovereenkomst. Op verzoek beschikbaar." },
      { q: "Waar staan de servers?", a: "Alle data wordt opgeslagen op servers in Nederland (EU). We gebruiken geen Amerikaanse clouddiensten voor opslag van klantdata." },
      { q: "Hoe is mijn data beveiligd?", a: "We gebruiken AES-256 versleuteling voor data in rust en TLS 1.3 voor data in transit. Dagelijkse back-ups. Twee-factor authenticatie beschikbaar." },
      { q: "Wordt mijn data verkocht aan derden?", a: "Nooit. Jouw data is van jou. We verkopen of delen geen klantdata met derden voor commerciële doeleinden." },
      { q: "Kan ik mijn account verwijderen?", a: "Ja. Je kunt op elk moment je account verwijderen via Instellingen → Account → Verwijderen. Alle data wordt binnen 30 dagen permanent verwijderd." },
    ],
  },
]

function FaqItem({ item, highlight }) {
  const [open, setOpen] = useState(false)

  const hl = (text) => {
    if (!highlight) return text
    const re = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
    const parts = text.split(re)
    return parts.map((p, i) =>
      re.test(p) ? <mark key={i} style={{ background: "var(--pl)", color: "var(--pd)", borderRadius: 3, padding: "0 2px" }}>{p}</mark> : p
    )
  }

  return (
    <div className="faq-item" data-open={open ? "true" : "false"}>
      <button className="faq-q" onClick={() => setOpen(o => !o)}>
        {hl(item.q)} {I.chevronDown}
      </button>
      <div className="faq-a"><div><p>{hl(item.a)}</p></div></div>
    </div>
  )
}

export default function FaqPage({ navigate }) {
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState(null)

  const go = (e, href) => {
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return FAQ_DATA.map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      ),
    })).filter(cat => {
      if (activeTab && cat.cat !== activeTab) return false
      return cat.items.length > 0
    })
  }, [search, activeTab])

  useEffect(() => {
    const cleanup = initChoreo()
    return cleanup
  }, [])

  const totalResults = filtered.reduce((acc, c) => acc + c.items.length, 0)

  return (
    <div className="bm">
      <ScrollLine />
      <Nav navigate={navigate} />
      <main>
        {/* Hero */}
        <section className="faq-hero">
          <div className="container">
            <Reveal>
              <span className="section-kicker">FAQ</span>
              <h1>Veelgestelde vragen</h1>
              <p>Alles wat je wilt weten over BossBase. Niet gevonden? We helpen je graag.</p>
              <div className="faq-search-wrap">
                <span className="faq-search-icon">{I.search}</span>
                <input
                  className="faq-search"
                  type="text"
                  placeholder="Zoek in FAQ..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="faq-search-clear visible" onClick={() => setSearch("")}>
                    {I.x}
                  </button>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Tab filters */}
        {!search && (
          <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bgs)", position: "sticky", top: 68, zIndex: 10 }}>
            <div className="container">
              <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "10px 0", scrollbarWidth: "none" }}>
                <button
                  onClick={() => setActiveTab(null)}
                  style={{
                    border: "none", background: !activeTab ? "var(--dk)" : "transparent",
                    color: !activeTab ? "#fff" : "var(--dmu)",
                    fontWeight: 600, fontSize: 14, padding: "8px 16px",
                    borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}>
                  Alles
                </button>
                {FAQ_DATA.map(cat => (
                  <button key={cat.cat}
                    onClick={() => setActiveTab(activeTab === cat.cat ? null : cat.cat)}
                    style={{
                      border: "none", background: activeTab === cat.cat ? "var(--dk)" : "transparent",
                      color: activeTab === cat.cat ? "#fff" : "var(--dmu)",
                      fontWeight: 600, fontSize: 14, padding: "8px 16px",
                      borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                    }}>
                    {cat.cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* FAQ Secties */}
        {filtered.length === 0 ? (
          <div className="faq-empty">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--dk)", margin: "0 0 8px" }}>Geen resultaten voor "{search}"</h3>
            <p style={{ color: "var(--dmu)", marginBottom: 20 }}>Probeer een ander zoekwoord, of neem contact met ons op.</p>
            <a href="/contact" className="btn btn-p" onClick={e => go(e, "/contact")}>
              Contact opnemen {I.arrowRight}
            </a>
          </div>
        ) : (
          filtered.map(cat => (
            <div key={cat.cat} className="faq-page-section">
              <div className="container">
                <div className="faq-cat-head">
                  <div className="faq-cat-icon">{cat.icon}</div>
                  <h2>{cat.cat}</h2>
                </div>
                <div className="faq-list choreo-body">
                  {cat.items.map((item, i) => (
                    <FaqItem key={i} item={item} highlight={search.trim()} />
                  ))}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Meer hulp nodig */}
        {filtered.length > 0 && (
          <div className="section" style={{ borderTop: "1px solid var(--border)", background: "var(--bgs)" }}>
            <div className="container">
              <Reveal><div className="section-head choreo-head">
                <span className="section-kicker">Nog vragen?</span>
                <h2>We helpen je graag persoonlijk</h2>
                <p>Staat jouw vraag er niet bij? Neem contact op en we reageren binnen één werkdag.</p>
              </div></Reveal>
              <Reveal stagger>
                <div className="contact-cards">
                  {[
                    { icon: I.mail,   title: "E-mail ons", desc: "hallo@bossbase.nl", sub: "Reactie binnen 1 werkdag", href: "mailto:hallo@bossbase.nl" },
                    { icon: I.phone,  title: "Bel ons",    desc: "085 - 060 70 80",   sub: "Ma–Vr 09:00–17:00",       href: "tel:+31850607080" },
                  ].map(c => (
                    <a key={c.title} href={c.href} className="contact-card">
                      <div className="cc-icon">{c.icon}</div>
                      <h3>{c.title}</h3>
                      <p style={{ color: "var(--pd)", fontWeight: 600 }}>{c.desc}</p>
                      <p>{c.sub}</p>
                      <span className="cc-arrow">{I.arrowRight}</span>
                    </a>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        )}
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
