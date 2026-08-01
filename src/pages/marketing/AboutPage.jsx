import { useEffect } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"

const WAARDEN = [
  { icon: I.heart,   title: "Eerlijkheid boven alles",         desc: "Geen verborgen kosten, geen misleidende beloften. We zeggen wat we doen en doen wat we zeggen." },
  { icon: I.bolt,    title: "Eenvoud als ontwerpregel",         desc: "Elke functie die we bouwen moet simpeler zijn dan de status quo. Als het ingewikkeld aanvoelt, is het niet klaar." },
  { icon: I.shield,  title: "Zorgvuldig met je data",           desc: "We gaan zorgvuldig en vertrouwelijk om met jouw gegevens." },
  { icon: I.rocket,  title: "Bouwen voor de lange termijn",     desc: "We bouwen BossBase rustig en gestaag verder, op basis van wat onze klanten écht nodig hebben." },
]

const OPRICHTERS = [
  {
    naam: "Niels Grevink", rol: "Mede-oprichter",
    bio: "Niels werkte veel samen met (startende) vakmensen en zag telkens hetzelfde: veel te veel tijd kwijt aan overbodige administratie. Met BossBase brengt hij alles wat je nodig hebt samen op één plek.",
    initials: "NG",
  },
  {
    naam: "Rayvon Huisman", rol: "Mede-oprichter",
    bio: "Rayvon gelooft dat goede software onzichtbaar hoort te zijn: je regelt je zaken en gaat weer aan het werk. Hij houdt BossBase simpel, duidelijk en betrouwbaar.",
    initials: "RH",
  },
]

export default function AboutPage({ navigate }) {
  const go = (e, href) => {
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }

  useEffect(() => {
    const cleanup = initChoreo()
    return cleanup
  }, [])

  return (
    <div className="bm">
      <ScrollLine />
      <Nav navigate={navigate} />
      <main>
        {/* Hero */}
        <section className="over-hero">
          <div className="container">
            <Reveal>
              <span className="section-kicker">Over ons</span>
              <h1>Gebouwd door ondernemers,<br/>voor ondernemers</h1>
              <p>BossBase ontstond uit frustratie. De frustratie van een vakman die na een lange werkdag nog uren kwijt is aan administratie. Dat kan anders.</p>
            </Reveal>
          </div>
        </section>

        {/* Verhaal */}
        <div className="section">
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Ons verhaal</span>
              <h2>Waarom BossBase bestaat</h2>
            </div></Reveal>
            <Reveal>
              <div className="verhaal-body">
                <p>We werkten veel samen met (startende) vakmensen en zagen telkens hetzelfde: bedrijven waren enorm veel tijd kwijt aan taken die eigenlijk overbodig zijn. Dat moet makkelijker kunnen.</p>
                <p>Het probleem zit in de bestaande systemen. Die zijn gebouwd voor grote bedrijven en niet gericht op vakmanschap — log, ingewikkeld en vol met functies die je nooit gebruikt.</p>
                <p>Daarom richtten wij BossBase op: alle functies die je écht nodig hebt, in een simpel en duidelijk jasje. Zodat je meer tijd overhoudt voor het werk waar je goed in bent.</p>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Oprichters */}
        <div className="section" style={{ background: "var(--bgs)" }}>
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Het team</span>
              <h2>Wie wij zijn</h2>
            </div></Reveal>
            <Reveal>
              <div className="founder-grid choreo-body">
                {OPRICHTERS.map(o => (
                  <div key={o.naam} className="founder-card">
                    <div className="founder-avatar">{o.initials}</div>
                    <div className="founder-name">{o.naam}</div>
                    <div className="founder-role">{o.rol}</div>
                    <p className="founder-bio">{o.bio}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>

        {/* Missie */}
        <div className="section">
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Missie</span>
              <h2>Waarom we doen wat we doen</h2>
            </div></Reveal>
            <Reveal>
              <div className="verhaal-body">
                <p style={{ fontWeight: 700, fontSize: 20, color: "var(--dk)" }}>
                  "Elke vakman verdient tools die even hard werken als hijzelf."
                </p>
                <p>Nederland draait op mensen die iets met hun handen maken. Loodgieters die lekkage verhelpen. Elektriciens die huizen aansluiten. Schilders die gevels opknappen. Zij verdienen software die hen helpt, niet software die hen ophoudt.</p>
                <p>BossBase is gebouwd om vakmannen meer tijd te geven voor het werk dat ze leuk vinden, en minder tijd te laten verdoen aan administratie.</p>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Waarden */}
        <div className="section">
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Waarden</span>
              <h2>Waar we voor staan</h2>
            </div></Reveal>
            <Reveal stagger>
              <div className="waarden-grid choreo-body">
                {WAARDEN.map(w => (
                  <div key={w.title} className="waarde-card">
                    <div className="waarde-icon">{w.icon}</div>
                    <h3>{w.title}</h3>
                    <p>{w.desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>

        {/* Slot CTA */}
        <div className="section">
          <div className="container">
            <Reveal>
              <div className="final-cta">
                <h2>Klaar om kennis te maken? <span className="green">Begin vandaag.</span></h2>
                <p>14 dagen gratis. Geen creditcard nodig.</p>
                <div className="hero-ctas" style={{ justifyContent: "center" }}>
                  <a href="/registreer" className="btn btn-p glow btn-lg" onClick={e => go(e, "/registreer")}>
                    Gratis proberen {I.arrowRight}
                  </a>
                  <a href="/contact" className="btn btn-s btn-lg" onClick={e => go(e, "/contact")}>
                    Neem contact op
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
