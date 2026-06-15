import { useEffect } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"

const STATS = [
  { num: "2.400+", lbl: "Actieve gebruikers" },
  { num: "€ 2,1M+", lbl: "Aan offertes verstuurd" },
  { num: "98%", lbl: "Klanttevredenheid" },
  { num: "2022", lbl: "Opgericht in" },
]

const WAARDEN = [
  { icon: I.heart,   title: "Eerlijkheid boven alles",         desc: "Geen verborgen kosten, geen misleidende beloften. We zeggen wat we doen en doen wat we zeggen." },
  { icon: I.bolt,    title: "Eenvoud als ontwerpregel",         desc: "Elke functie die we bouwen moet simpeler zijn dan de status quo. Als het ingewikkeld aanvoelt, is het niet klaar." },
  { icon: I.shield,  title: "Jouw data is van jou",             desc: "We verkopen nooit data aan derden. Servers staan in Nederland. AVG-compliant by design." },
  { icon: I.rocket,  title: "Bouwen voor de lange termijn",     desc: "We nemen geen risicokapitaal aan dat ons dwingt tot groeimanie. Winstgevendheid en klantgeluk gaan hand in hand." },
]

const OPRICHTERS = [
  {
    naam: "Niels Grevink", rol: "CEO & Mede-oprichter",
    bio: "Niels groeide op als zoon van een schilder en zag als kind hoe zijn vader worstelde met administratie. Na een carrière in software bouwde hij BossBase om dat probleem op te lossen.",
    initials: "NG",
  },
  {
    naam: "Tim van der Berg", rol: "CTO & Mede-oprichter",
    bio: "Tim bouwde eerder software voor de logistieke sector en snapt als geen ander hoe je complexe processen eenvoudig maakt. Hij schrijft de code die BossBase snel en betrouwbaar houdt.",
    initials: "TB",
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
                <p>Het begon met een belletje. Niels' vader — schilder van beroep — belde op een avond met de vraag: "Kun jij een spreadsheet voor me maken? Ik raak al mijn offertes kwijt." Drie weken later waren er acht. Allemaal vaklieden, allemaal met hetzelfde probleem: te veel losse tools, te weinig overzicht.</p>
                <p>In 2022 richtten Niels en Tim BossBase op met één doel: de administratie van ZZP'ers en kleine bedrijven zo eenvoudig maken dat je er nooit meer wakker van ligt.</p>
                <p>Vandaag gebruiken meer dan 2.400 vakmensen BossBase dagelijks. Van loodgieters in Rotterdam tot aannemers in Groningen. We groeien op basis van mond-tot-mondreclame, omdat onze klanten ons product écht aanbevelen.</p>
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
                    <a href="https://linkedin.com" className="founder-li" target="_blank" rel="noopener noreferrer">
                      {I.linkedIn} LinkedIn
                    </a>
                  </div>
                ))}
              </div>
              <p className="founder-tagline">
                En verder een klein team van <span>developers, designers en support-helden</span> verspreid over Nederland.
              </p>
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

        {/* Statistieken */}
        <div className="section" style={{ background: "var(--bgs)" }}>
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">In cijfers</span>
              <h2>BossBase in 2024</h2>
            </div></Reveal>
            <Reveal stagger>
              <div className="stats-row choreo-body">
                {STATS.map(s => (
                  <div key={s.num} className="stat-block">
                    <div className="num">{s.num}</div>
                    <div className="lbl">{s.lbl}</div>
                  </div>
                ))}
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

        {/* Waarom niet VC */}
        <div className="section" style={{ background: "var(--bgs)" }}>
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Onze aanpak</span>
              <h2>Waarom we geen durfkapitaal aannemen</h2>
            </div></Reveal>
            <Reveal>
              <div className="waarom-body">
                <p>Veel SaaS-bedrijven nemen tientallen miljoenen aan en groeien daarna ten koste van hun klanten: prijsverhogingen, verslechterende service, feature bloat. Dat willen we niet.</p>
                <p>BossBase is winstgevend vanaf dag één. We groeien op eigen tempo, op basis van wat onze klanten willen betalen. Dat houdt ons scherp: elke euro die je betaalt, moet zijn waarde meerdere keren terugverdienen.</p>
                <p>Dit betekent ook dat we je data nooit hoeven te verkopen. We hebben geen investeerder die dat eist.</p>
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
                <p>14 dagen gratis. Geen creditcard. Annuleer wanneer je wilt.</p>
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
