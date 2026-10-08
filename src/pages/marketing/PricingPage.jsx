import { useState, useEffect, Fragment } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"
import { tierLabel, tierPrice, extraUserLabel, YEARLY_FREE_MONTHS, WELKOMSTACTIES, welkomstactiesVoor } from "../../lib/tiers.js"
import {
  TIER_FEATURES, TIER_LIMITS, ZICHTBARE_FEATURES, MODULES,
  featureLabel, getLimitDef, moduleLabel, modulePrice,
} from "../../lib/features.js"

// Prijzen/tiernamen komen uit ../../lib/tiers.js; welke FEATURES en LIMIETEN bij
// een plan horen komt uit ../../lib/features.js — dezelfde matrix die de app
// gebruikt en die de database server-side afdwingt. Hier staat dus alleen nog de
// presentatie: doelgroep, volgorde en of het het "hot" plan is. Zo kan de
// prijspagina niet meer iets beloven wat de server niet levert.

// Limietregel als losse tekst, bv. "1 gebruiker" of "Onbeperkt klanten".
const limietRegel = (tier, key) => {
  const def = getLimitDef(key)
  const max = TIER_LIMITS[tier]?.[key]
  const naam = def.label.toLowerCase()
  if (max == null) return `Onbeperkt ${naam}`
  if (max === 1) return `1 ${def.enkelvoud}`
  return `Tot ${max} ${naam}${def.telwijze === 'periode' ? ' per factuurperiode' : ''}`
}

// De featureregels van een plan: alles wat dit plan heeft en het vorige niet.
const nieuweFeatures = (tier, vorigeTier) =>
  TIER_FEATURES[tier]
    .filter(f => !vorigeTier || !TIER_FEATURES[vorigeTier].includes(f))
    .filter(f => ZICHTBARE_FEATURES.some(z => z.key === f))
    .map(featureLabel)

const PLAN_CARDS = [
  {
    id: "starter", who: "Voor de zzp'er die net begint", hasExtra: false, hot: false,
    features: [
      limietRegel('starter', 'gebruikers'),
      limietRegel('starter', 'klanten'),
      limietRegel('starter', 'offertes'),
      limietRegel('starter', 'facturen'),
      // Klanten/offertes/facturen staan hierboven al als limietregel — die niet
      // nog eens als losse functie herhalen.
      ...nieuweFeatures('starter', null).filter(l =>
        !['Klanten', 'Offertes', 'Facturen'].includes(l)),
      "Ondersteuning per e-mail",
    ],
  },
  {
    id: "groei", who: "Voor de zzp'er of een bedrijf van twee", hasExtra: true, hot: true,
    features: [
      limietRegel('groei', 'gebruikers'),
      "Onbeperkt klanten, offertes en facturen",
      "Alles van Starter, plus:",
      ...nieuweFeatures('groei', 'starter'),
    ],
  },
  {
    id: "team", who: "Voor bedrijven met meer mensen en bussen", hasExtra: true, hot: false,
    features: [
      limietRegel('team', 'gebruikers'),
      "Alles van Groei, plus:",
      ...nieuweFeatures('team', 'groei'),
    ],
  },
]

// Losse modules — alleen bij te kopen bij Groei; bij Team inbegrepen.
const MODULE_REGELS = MODULES.map(m => ({
  label: moduleLabel(m.key),
  prijs: modulePrice(m.key),
  vereist: m.vereist ? moduleLabel(m.vereist) : null,
}))

// Vergelijkingstabel. Een rij met `feature` of `limiet` komt uit de matrix; een
// rij met expliciete waarden is puur commercieel (opslag, ondersteuning) en
// staat los van wat de software afdwingt.
const uitMatrix = feature => ({
  starter: TIER_FEATURES.starter.includes(feature),
  groei:   TIER_FEATURES.groei.includes(feature),
  team:    TIER_FEATURES.team.includes(feature),
})
const uitLimiet = key => ({
  starter: limietWaarde('starter', key),
  groei:   limietWaarde('groei', key),
  team:    limietWaarde('team', key),
})
function limietWaarde(tier, key) {
  const max = TIER_LIMITS[tier]?.[key]
  return max == null ? 'Onbeperkt' : String(max)
}
const matrixRij = (label, feature) => ({ label, ...uitMatrix(feature) })
const limietRij = (label, key)     => ({ label, ...uitLimiet(key) })

const CMP_CATS = [
  {
    cat: "Algemeen",
    rows: [
      limietRij("Gebruikers", 'gebruikers'),
      limietRij("Klanten", 'klanten'),
      limietRij("Offertes per factuurperiode", 'offertes'),
      limietRij("Facturen per factuurperiode", 'facturen'),
    ],
  },
  {
    cat: "CRM & Pipeline",
    rows: [
      matrixRij("Klantenkaarten", 'klanten'),
      matrixRij("Pipeline", 'crm_pipeline'),
      matrixRij("Leads", 'leads'),
      matrixRij("Adres-autocomplete", 'adres_autocomplete'),
    ],
  },
  {
    cat: "Offertes & Facturen",
    rows: [
      matrixRij("Offertes", 'offertes'),
      matrixRij("Facturen", 'facturen'),
      matrixRij("Digitale handtekening", 'digitale_handtekening'),
      matrixRij("Automatische betaalherinneringen", 'betaalherinneringen'),
      matrixRij("Stripe betaallink", 'stripe_betaallink'),
    ],
  },
  {
    cat: "Uitvoering",
    rows: [
      matrixRij("Werkbonnen", 'werkbonnen'),
      matrixRij("Urenregistratie", 'uren'),
      matrixRij("Agenda", 'agenda'),
      matrixRij("Afspraakherinnering", 'afspraakherinnering'),
      matrixRij("Planningsmodule", 'planning'),
      matrixRij("Voertuigen", 'voertuigen'),
    ],
  },
  {
    cat: "Administratie",
    rows: [
      matrixRij("Boekhoudkoppeling", 'boekhoudkoppeling'),
      matrixRij("BTW-overzicht", 'btw_overzicht'),
      matrixRij("Kosten & nacalculatie", 'kosten_nacalculatie'),
    ],
  },
  {
    cat: "Team & e-mail",
    rows: [
      matrixRij("Rollen & rechten", 'rollen_rechten'),
      matrixRij("E-mailtemplates bewerken", 'email_templates_bewerken'),
      matrixRij("Eigen e-mailtemplates aanmaken", 'eigen_email_templates'),
    ],
  },
  {
    cat: "Ondersteuning",
    rows: [
      { label: "Ondersteuning per e-mail",   starter: true,  groei: true,  team: true },
    ],
  },
]

const FAQ_P = [
  { q: "Hoe zit het met opzeggen?", a: "Een maandabonnement is per maand opzegbaar. Een jaarabonnement loopt 12 maanden: je betaalt maandelijks en kunt tussentijds niet opzeggen, wel tegen het einde van die 12 maanden. Daarna loopt het maandelijks door en is het per maand opzegbaar." },
  { q: "Wat gebeurt er met mijn looptijd als ik overstap naar een groter pakket?", a: "Bij een jaarabonnement begint de looptijd van 12 maanden dan opnieuw, gerekend vanaf de overstap. Je ziet de nieuwe einddatum in het scherm voordat je bevestigt en gaat er expliciet mee akkoord. Modules bijkopen en teamleden toevoegen raken je looptijd niet — dat zijn bijbestellingen. Bij een maandabonnement verandert er niets: dat blijft per maand opzegbaar, ook na een upgrade." },
  { q: "Wat gebeurt er na de proefperiode?", a: "Tijdens de proefperiode werk je met het pakket dat je kiest, zonder limieten. Losse modules probeer je er gratis bij. Na 14 dagen kies je een abonnement. Doe je dat niet, dan wordt je account alleen-lezen: je kunt je gegevens nog bekijken en exporteren, maar niets nieuws aanmaken." },
  { q: "Kan ik van plan wisselen?", a: "Upgraden naar een groter pakket kan altijd. Naar een kleiner pakket gaan kan bij een maandabonnement; bij een jaarabonnement niet binnen de looptijd van 12 maanden. Zit je boven de limiet van het kleinere pakket (bijvoorbeeld meer dan 100 klanten bij Starter), dan kan het ook niet." },
  { q: "Is BTW inbegrepen in de prijs?", a: "Nee, alle prijzen zijn exclusief btw. De btw komt er op je factuur bij." },
  { q: "Wat zijn de betaalmogelijkheden?", a: "Je sluit het abonnement af en betaalt via Stripe, ook bij een jaarabonnement (in 12 maandtermijnen). Welke betaalmethoden je kunt kiezen, zie je bij het afrekenen." },
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
        <section className="price-hero">
          <div className="container">
            <span className="section-kicker">Prijzen</span>
            <h1>Duidelijke prijs.<br/>Geen verrassingen.</h1>
            <p>Prijzen per maand, exclusief btw. Probeer BossBase 14 dagen gratis met het pakket dat je kiest, en probeer modules er gratis bij. Je hoeft geen betaalgegevens in te vullen.</p>
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
              {yearly && <div className="bill-hook pop">{I.bolt} Kies je welkomstactie</div>}
            </div>
            <Reveal stagger>
              <div className="price-grid-full choreo-body">
                {PLAN_CARDS.map(t => (
                  <div key={t.id} className={`price-card${t.hot ? " hot" : ""}`}>
                    {t.hot && <div className="hot-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Hierop draait je proefperiode</div>}
                    <div className="tier">{tierLabel(t.id)}</div>
                    <div className="who">{t.who}</div>
                    <div className="amount">
                      <strong>€ {tierPrice(t.id)}</strong>
                      <span>/ maand excl. btw{yearly ? " · 12 maandtermijnen" : " · per maand opzegbaar"}</span>
                    </div>
                    <div className="extra-user">{t.hasExtra ? extraUserLabel(t.id) : " "}</div>
                    <ul>{t.features.map(f => <li key={f}>{I.check} {f}</li>)}</ul>
                    <a href="/register" className={`btn ${t.hot ? "btn-p glow" : "btn-s"}`}
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={e => go(e, "/register")}>
                      Start 14 dagen gratis
                    </a>
                  </div>
                ))}
              </div>
            </Reveal>
            {/* Welkomstactie — alleen bij een jaarabonnement, en het is er ÉÉN
                van de twee. De hostingkosten staan er bewust bij: die horen niet
                pas bij de mail achteraf te blijken. */}
            {yearly && (
              <Reveal>
                <div style={{ maxWidth: 720, margin: "28px auto 0" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--dmu)", marginBottom: 10, textAlign: "center" }}>
                    Kies bij een jaarabonnement één welkomstactie
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                    {WELKOMSTACTIES.map(a => (
                      <div key={a.key} style={{ border: "1px solid var(--br)", borderRadius: 14, padding: "16px 18px", background: "var(--bg)" }}>
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>{a.label}</div>
                        <p style={{ fontSize: 14, color: "var(--dmu)", margin: "0 0 8px" }}>{a.kort}</p>
                        {a.kortingMaanden > 0 && (
                          <p style={{ fontSize: 13, color: "var(--dmu)", margin: 0 }}>
                            Je abonnement start direct — de korting staat op je eerste twee facturen.
                          </p>
                        )}
                        {a.key === 'gratis_website' && (
                          <p style={{ fontSize: 13, color: "var(--dmu)", margin: 0 }}>
                            Beschikbaar bij {welkomstactiesVoor('groei').length ? `${tierLabel('groei')} en ${tierLabel('team')}` : ''}.
                            De website blijft beschikbaar zolang je abonnement loopt.
                            <strong> Hosting € 5 per maand.*</strong>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--dmu)", margin: "12px 0 0", textAlign: "center" }}>
                    Je kiest er één, niet allebei. Bij een maandabonnement geldt er geen welkomstactie.
                  </p>
                  <p style={{ fontSize: 13, color: "var(--dmu)", margin: "6px 0 0", textAlign: "center" }}>
                    Een jaarabonnement loopt <strong>12 maanden vast</strong> en wordt maandelijks
                    geïncasseerd. Daarna loopt het maandelijks door en is het per maand opzegbaar.
                    Stap je tussentijds over naar een groter pakket, dan begint de looptijd van
                    12 maanden opnieuw vanaf dat moment.
                  </p>
                  <p style={{ fontSize: 12.5, color: "var(--dmu)", margin: "6px 0 0", textAlign: "center" }}>
                    * De website zelf is gratis; het draaien en onderhouden ervan kost € 5 per maand.
                    Logo-ontwerp en domeinregistratie zijn optioneel tegen meerprijs.
                  </p>
                </div>
              </Reveal>
            )}

            <Reveal>
              <div style={{ maxWidth: 620, margin: "28px auto 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--dmu)", marginBottom: 8 }}>
                  Losse modules bij {tierLabel('groei')}
                </div>
                <p style={{ fontSize: 14, color: "var(--dmu)", margin: 0 }}>
                  {MODULE_REGELS.map((m, i) => (
                    <Fragment key={m.label}>
                      {i > 0 && " · "}
                      {m.label} <strong>€ {m.prijs}</strong> p/mnd
                      {m.vereist && <span> (alleen samen met {m.vereist})</span>}
                    </Fragment>
                  ))}
                </p>
                <p style={{ fontSize: 14, color: "var(--dmu)", marginTop: 6 }}>
                  Bij {tierLabel('team')} zijn alle modules inbegrepen.
                </p>
              </div>
            </Reveal>
            <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--dmu)" }}>
              Alle prijzen exclusief btw · Proefperiode zonder betaalgegevens
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
                    <th>{tierLabel('starter')}</th>
                    <th className="col-hot">{tierLabel('groei')}</th>
                    <th>{tierLabel('team')}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Fragment met key: de <>-shorthand kan er geen dragen, waardoor
                      React klaagde over ontbrekende keys in deze lijst. */}
                  {CMP_CATS.map(cat => (
                    <Fragment key={`cat-${cat.cat}`}>
                      <tr className="compare-cat">
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
                    </Fragment>
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
                  <a href="/register" className="btn btn-p glow btn-lg" onClick={e => go(e, "/register")}>
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
