import MarketingShell from './MarketingShell.jsx';

const VALUES = [
  { n: '01', h: 'Werk dat klopt', p: 'Geen tool om de tool. Elk scherm in BossBase verdient z’n plek door tijd te besparen — of het hoort er niet thuis.' },
  { n: '02', h: 'Helder en kort', p: 'Eén oogopslag, één begrip. Als je drie keer moet lezen, is het ontwerp niet af. We schrappen liever dan we toevoegen.' },
  { n: '03', h: 'Voor vakmensen', p: 'Schilders, hoveniers, klusbedrijven. We bouwen voor de mensen die met laarzen aan binnenkomen — niet voor afdelingshoofden achter een glaswand.' },
];

const STORY = [
  ['2024', 'Geboren in een loods', 'Twee oprichters — een schilder en een softwarebouwer — beginnen met een schoenendoos vol offertes. BossBase wordt een MVP.'],
  ['2025', 'Eerste 50 ondernemers', 'BossBase gaat live met zelfde-dag onboarding. Pipeline, offertes en planning komen samen in één pakket.'],
  ['2026', '200+ vakbedrijven', 'Mobiele werkbonnen, Google Calendar sync, online akkoord en automatische facturatie. Vandaag.'],
  ['Vooruit', 'Slimmer, niet zwaarder', 'AI-hulp bij offertes, koppelingen met boekhoudpakketten en bredere mobiele app. Maar altijd: minder klikken, niet meer.'],
];

export default function AboutPage({ navigate, isAuthenticated }) {
  return (
    <MarketingShell navigate={navigate} active="over-ons" isAuthenticated={isAuthenticated}>
      <div className="mkt-c">
        <header className="mkt-page-hd mkt-rev">
          <div>
            <div className="mkt-sec-num">Over BossBase</div>
            <h1>De rustige plek<br />tussen <em>jouw werk en je avond.</em></h1>
          </div>
          <p>
            BossBase werd geboren in een schildersloods. Geen pitch deck, geen
            kantoortuin — een schoenendoos vol offertes en de vraag: kan dit niet rustiger?
          </p>
        </header>

        <section className="mkt-sec mkt-sec--first" style={{ paddingTop: 8, borderTop: 0 }}>
          <div className="mkt-rev">
            <p className="mkt-about-lede">
              We bouwen BossBase voor de Nederlandse vakman. Voor de eigenaar
              die op vrijdagmiddag wéér met losse papieren aan de keukentafel
              zit. Voor de hovenier die niet weet welke klus écht winst maakte.
              Voor de schilder die zijn beste klant kwijtraakt omdat de offerte
              een dag te laat de deur uitging.
              <br /><br />
              <em>BossBase brengt het terug naar één plek.</em> Eén dashboard.
              Eén werkstroom. Een paar minuten per dag, in plaats van een avond per week.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="mkt-sec">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Wat ons drijft</div>
              <h2>Drie principes,<br /><em>nul franje.</em></h2>
            </div>
            <p>Elke beslissing in BossBase loopt langs deze drie principes. Als iets botst, sneuvelt het.</p>
          </div>

          <div className="mkt-values mkt-rev">
            {VALUES.map(v => (
              <div key={v.n} className="mkt-value">
                <div className="mkt-value-num">— {v.n}</div>
                <h4>{v.h}</h4>
                <p>{v.p}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Timeline — atelier dark */}
      <section className="mkt-sec mkt-sec--atelier mkt-sec--airy">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num mkt-sec-num--light">Tijdlijn</div>
              <h2>Van loods naar<br /><em>200+ vakbedrijven.</em></h2>
            </div>
            <p>
              We gaan rustig. Liever één scherm dat écht klopt dan tien die half werken.
            </p>
          </div>

          <div className="mkt-timeline mkt-rev">
            {STORY.map(([year, title, desc]) => (
              <div key={year} className="mkt-timeline-cell">
                <div className="mkt-timeline-year">{year}</div>
                <div className="mkt-timeline-title">{title}</div>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team / Made in NL */}
      <section className="mkt-sec mkt-sec--cream">
        <div className="mkt-c">
          <div className="mkt-quote-wrap mkt-rev">
            <div className="mkt-quote-stamp">
              <div>
                <strong>Gemaakt in</strong>
                <b>NL</b>
                Sinds 2024
              </div>
            </div>
            <div>
              <p className="mkt-quote-text">
                Een team in Utrecht en Zwolle — drie bouwers, een ontwerper en een
                klantkampioen — maakt BossBase. <em>We pakken zelf de telefoon op.</em>
                We kennen onze klanten bij naam.
              </p>
              <div className="mkt-hero-ctas" style={{ marginBottom: 0 }}>
                <button className="mkt-btn mkt-btn--primary" onClick={() => navigate('/contact')}>
                  <span className="mkt-btn-dot" /> Neem contact op
                </button>
                <button className="mkt-btn mkt-btn--ghost" onClick={() => navigate('/voor-wie')}>
                  Voor wie we bouwen →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-final">
        <div className="mkt-final-in mkt-rev">
          <div className="mkt-sec-num mkt-sec-num--light" style={{ justifyContent: 'center' }}>Klaar om te beginnen?</div>
          <h2>Jij de baas,<br /><em>wij de basis.</em></h2>
          <p>Word een van de 200+ vakbedrijven die hun werk vanuit BossBase besturen.</p>
          <div className="mkt-final-ctas">
            <button className="mkt-btn mkt-btn--brand mkt-btn--lg" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="mkt-btn mkt-btn--inverse mkt-btn--lg" onClick={() => navigate('/demo')}>Bekijk demo →</button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
