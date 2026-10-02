import { useState, useMemo, useEffect } from "react"
import { Search } from "lucide-react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"
import { tierLabel, tierPrice, YEARLY_FREE_MONTHS } from "../../lib/tiers.js"
import { TIER_LIMITS } from "../../lib/features.js"

// "1 gebruiker" / "tot 2 gebruikers" / "onbeperkt gebruikers" uit de matrix.
const gebruikersTekst = tier => {
  const max = TIER_LIMITS[tier]?.gebruikers
  if (max == null) return 'onbeperkt gebruikers'
  return max === 1 ? '1 gebruiker' : `tot ${max} gebruikers`
}

const FAQ_DATA = [
  {
    cat: "Algemeen",
    icon: I.sparkle,
    items: [
      { q: "Wat is BossBase?", a: "BossBase is software voor zzp'ers en vakbedrijven. Je beheert klanten en aanvragen, offertes, werkbonnen, planning, uren en facturen op één plek." },
      { q: "Voor wie is BossBase geschikt?", a: "BossBase is speciaal gebouwd voor vakmannen en dienstverleners: loodgieters, schilders, elektriciens, aannemers en meer. Ook andere ZZP'ers en bedrijven gebruiken BossBase." },
      { q: "Is BossBase gratis te proberen?", a: "Ja. Je probeert BossBase 14 dagen gratis, met de functies van het Groei-pakket en zonder limieten. Je hoeft geen betaalgegevens in te vullen." },
      { q: "Hoe snel kan ik aan de slag?", a: "Direct na het aanmelden. Je vult je bedrijfsgegevens en logo in, voegt je eerste klant toe en maakt je eerste offerte. Installeren hoeft niet." },
      { q: "Is er een mobiele app?", a: "Nee. Het dashboard werkt op een tablet, laptop of computer (vanaf 768 pixels breed), niet op een smalle telefoon. Klanten kunnen offertes en werkbonnen wel op hun telefoon ondertekenen." },
    ],
  },
  {
    cat: "Abonnement & betaling",
    icon: I.chart,
    items: [
      // Gebruikersaantallen komen uit de matrix (features.js), niet uit los
      // opgeschreven tekst — stond hier eerder op "tot 5" en "tot 15" terwijl de
      // software Groei op 2 zet en Team onbeperkt laat.
      { q: "Welke abonnementen zijn er?", a: `We hebben drie plannen: ${tierLabel('starter')} (€ ${tierPrice('starter')}/maand, ${gebruikersTekst('starter')}), ${tierLabel('groei')} (€ ${tierPrice('groei')}/maand, ${gebruikersTekst('groei')}) en ${tierLabel('team')} (€ ${tierPrice('team')}/maand, ${gebruikersTekst('team')}). Prijzen per maand, exclusief btw. Bij een jaarabonnement kies je één welkomstactie: de eerste ${YEARLY_FREE_MONTHS} maanden gratis, of (vanaf ${tierLabel('groei')}) een gratis website, waarvan de hosting € 5 per maand kost.` },
      { q: "Hoe zit het met opzeggen?", a: "Een maandabonnement is per maand opzegbaar. Een jaarabonnement loopt 12 maanden; opzeggen kan tegen het einde daarvan, en daarna loopt het maandelijks door. Je klanten exporteer je als Excel of CSV, en je offertes en facturen als PDF." },
      { q: "Verandert mijn looptijd als ik upgrade?", a: "Bij een jaarabonnement wel: stap je over naar een groter pakket, dan begint de looptijd van 12 maanden opnieuw vanaf dat moment. De nieuwe einddatum staat in het scherm voordat je bevestigt. Modules bijkopen en teamleden toevoegen veranderen je looptijd niet, en een maandabonnement blijft per maand opzegbaar." },
      { q: "Hoe betaal ik mijn abonnement?", a: "Via Stripe, ook bij een jaarabonnement (in 12 maandtermijnen). Welke betaalmethoden je kunt kiezen, zie je bij het afrekenen." },
      { q: "Is btw inbegrepen in de prijs?", a: "Nee, alle prijzen zijn exclusief btw. De btw komt er op je factuur bij." },
      { q: "Kan ik van pakket wisselen?", a: "Upgraden kan altijd. Naar een kleiner pakket kan bij een maandabonnement, maar niet binnen de looptijd van een jaarabonnement, en niet als je boven de limiet van het kleinere pakket zit." },
      { q: "Wat gebeurt er na de proefperiode?", a: "Na 14 dagen kies je een abonnement. Doe je dat niet, dan blijven je gegevens gewoon staan: je kunt ze bekijken, aanpassen en exporteren, maar niets nieuws aanmaken of versturen." },
    ],
  },
  {
    cat: "Functies",
    icon: I.bolt,
    items: [
      { q: "Kan ik offertes online laten ondertekenen?", a: "Ja, in Groei en Team (en tijdens de proefperiode). De klant krijgt een link, bekijkt de offerte en kiest 'Akkoord en ondertekenen'. Hij krijgt een bevestiging met de PDF." },
      { q: "Doet BossBase mijn btw-aangifte?", a: "Nee. In Groei en Team zie je een btw-overzicht, en met de koppeling met Moneybird of SnelStart gaan je facturen naar je boekhoudpakket. De aangifte doe je daar of via je boekhouder." },
      { q: "Kan ik meerdere gebruikers toevoegen?", a: `Ja. ${tierLabel('starter')}: ${gebruikersTekst('starter')}. ${tierLabel('groei')}: ${gebruikersTekst('groei')} (de tweede kost € 10 per maand). ${tierLabel('team')}: ${gebruikersTekst('team')}, € 10 per gebruiker per maand, ook de eerste.` },
      { q: "Kan ik klanten importeren vanuit Excel?", a: "Nee, een importfunctie is er niet. Je voert klanten in, of ze ontstaan uit een aanvraag. Exporteren als Excel of CSV kan wel." },
      { q: "Kan ik mijn eigen logo en teksten gebruiken?", a: "Ja. Je logo en huisstijlkleur komen op je offertes en facturen. De e-mailteksten (offerte, factuur, herinneringen, afspraken) pas je zelf aan; in Groei en Team maak je ook eigen e-mailtemplates." },
    ],
  },
  {
    cat: "Technisch",
    icon: I.shield,
    items: [
      { q: "Welke browsers worden ondersteund?", a: "BossBase werkt op alle moderne browsers: Chrome, Firefox, Safari en Edge. We raden aan om de laatste versie te gebruiken." },
      { q: "Werkt BossBase offline?", a: "BossBase is een cloud-applicatie en heeft internet nodig. Je kunt wel eerder geladen pagina's bekijken bij een korte verbindingsonderbreking." },
      { q: "Kan ik mijn data exporteren?", a: "Ja. Klanten exporteer je als Excel of CSV, je offertes, facturen en getekende offertes als ZIP met PDF's, en je financiën als CSV." },
      { q: "Is er een API beschikbaar?", a: "Nee, een openbare API is er niet." },
      { q: "Met welke systemen werkt BossBase samen?", a: "Met Moneybird en SnelStart voor je boekhouding (Groei en Team), en met Stripe voor een betaallink met iDEAL op je facturen (Team, of als module bij Groei). Een koppeling met Gmail, Outlook of Google Agenda is er niet." },
    ],
  },
  {
    cat: "Privacy & veiligheid",
    icon: I.shield,
    items: [
      { q: "Hoe gaan jullie om met mijn gegevens?", a: "We gaan zorgvuldig en vertrouwelijk om met je gegevens. Je kunt je klanten, offertes en facturen op elk moment exporteren. Heb je een vraag over je gegevens, mail dan naar info@bossbase.nl." },
      { q: "Kan ik mijn account verwijderen?", a: "Ja, via Instellingen → Mijn profiel → Gevarenzone. Ben je beheerder, dan zeg je daarmee het hele bedrijfsaccount op. Je gegevens worden daarbij niet direct gewist; wil je weten wat er met je gegevens gebeurt, mail dan naar info@bossbase.nl." },
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
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
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
            <div>
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
            </div>
          </div>
        </section>

        {/* Tab filters */}
        {!search && (
          <div style={{ background: "var(--bgs)", position: "sticky", top: 68, zIndex: 10 }}>
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
            <div style={{ marginBottom: 16, color: "var(--dmu)", display: "flex", justifyContent: "center" }}><Search size={48} strokeWidth={1.5} /></div>
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
          <div className="section" style={{ background: "var(--bgs)" }}>
            <div className="container">
              <Reveal><div className="section-head choreo-head">
                <span className="section-kicker">Nog vragen?</span>
                <h2>We helpen je graag persoonlijk</h2>
                <p>Staat jouw vraag er niet bij? Neem contact op en we reageren binnen één werkdag.</p>
              </div></Reveal>
              <Reveal stagger>
                <div className="contact-cards">
                  {[
                    { icon: I.mail,   title: "E-mail ons", desc: "info@bossbase.nl", sub: "We reageren op werkdagen", href: "mailto:info@bossbase.nl" },
                    { icon: I.phone,  title: "Bel ons",    desc: "06 - 4200 5889",   sub: "Ma–Vr 09:00–17:00",       href: "tel:+31642005889" },
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
