// Overzicht van de koppelingen (/integraties), herontwerp 2026 in de stijl van
// de homepage en de functiepagina's. Ontwerp: Claude Design, artboard
// "Koppelingen". Alleen koppelingen die klanten nu echt kunnen gebruiken; de
// teksten komen overeen met src/content/integraties/*.md.
// Stijlen: fp-* (gedeeld met de functiepagina's) en kp-* in bossbase-mkt.css.
import { Nav, Footer } from './MktShared';
import { HI, useGa, Faq, Afsluiting } from './HvBlokken';
import { BeeldKoppelingen } from './FunctieBeelden';
import { Kruimelpad } from '../../marketing/templates/Onderdelen.jsx';

const KRUIMELS = [{ naam: 'Home', pad: '/' }, { naam: 'Koppelingen', pad: '/integraties' }];

// Richting van de uitwisseling: naar het pakket, terug naar BossBase, of twee kanten op.
const RICHTING = {
  naar: { icoon: HI.arrow, kl: 'groen' },
  terug: { icoon: HI.arrowL, kl: 'blauw' },
  beide: { icoon: HI.sync, kl: 'grijs' },
};

const KOPPELINGEN = [
  {
    href: '/integraties/moneybird',
    logo: { src: '/brand/moneybird.svg', alt: 'Moneybird', w: 159, h: 26 },
    titel: 'Moneybird',
    tekst: 'Je doet het werk in BossBase, je boekhouding in Moneybird. Betaalde facturen gaan erheen; inkoopfacturen, bonnetjes en uitgaven komen terug als kosten.',
    regels: [['naar', 'Betaalde facturen naar Moneybird'], ['terug', 'Inkoop, bonnetjes en uitgaven terug als kosten'], ['beide', 'Contacten elk uur gelijkgetrokken']],
    pakket: 'In Groei en Team, ook in de proefperiode',
  },
  {
    href: '/integraties/snelstart',
    logo: { src: '/brand/snelstart.svg', alt: 'SnelStart', w: 158, h: 26 },
    titel: 'SnelStart',
    tekst: 'Werkt je boekhouder in SnelStart? Dan boekt BossBase je facturen daar als verkoopboeking, met de PDF erbij, en haalt het inkoopfacturen terug als kosten.',
    regels: [['naar', 'Facturen als verkoopboeking, met de PDF erbij'], ['terug', 'Inkoopfacturen terug als kosten, btw per regel'], ['beide', 'Klanten en leveranciers dagelijks gelijk']],
    pakket: 'In Groei en Team, ook in de proefperiode',
  },
  {
    href: '/integraties/stripe-betaallink',
    logo: { src: '/brand/stripe.svg', alt: 'Stripe', w: 67, h: 28, hoog: true },
    titel: 'Betaallink met iDEAL',
    tekst: 'Koppel je eigen Stripe-account en elke factuurmail krijgt een betaallink. Je klant betaalt met iDEAL, en de factuur gaat vanzelf op betaald.',
    regels: [['naar', 'Betaallink in elke factuurmail, blijft werken'], ['terug', 'Betaling terug: factuur op betaald'], ['naar', 'Daarna door naar Moneybird of SnelStart']],
    pakket: 'In Team, of € 10 per maand bij Groei, ook in de proefperiode',
  },
];

const VRAGEN = [
  ['Gaat elke factuur meteen naar mijn boekhouding?', 'Bij Moneybird pas als de factuur betaald is: dan maakt BossBase de factuur aan en registreert hij de betaling. Bij SnelStart gaat elke verstuurde factuur als verkoopboeking door, met de PDF erbij; de betaling verwerk je daar zelf.'],
  ['Welke koppeling zit in welk pakket?', 'Moneybird en SnelStart zitten in Groei en Team, en in de proefperiode. De betaallink zit in Team, of als module van € 10 per maand bij Groei. In de proefperiode werken ze allemaal.'],
  ['Heb ik een eigen account bij Moneybird, SnelStart of Stripe nodig?', 'Ja. Je koppelt je eigen administratie of Stripe-account; BossBase vervangt je boekhoudpakket niet. De kosten van dat pakket, en de transactiekosten van Stripe, betaal je daar zelf.'],
  ['Ik werk met een ander boekhoudpakket. Kan dat?', 'Andere pakketten zijn nu niet te koppelen. Laat het ons weten via de contactpagina. Exporteren kan altijd: klanten als Excel of CSV, offertes en facturen als PDF.'],
];

// De kennisbank heeft nog geen artikelen over koppelingen. Tot die er zijn
// staan hier plaatshouders; vervang ze door echte artikelen (href, titel,
// tekst) zodra ze gepubliceerd zijn.
const BINNENKORT = [
  { titel: 'Moneybird koppelen aan BossBase', tekst: 'Stap voor stap, en wat er wel en niet overgaat.' },
  { titel: 'SnelStart en je boekhouder', tekst: 'Elke factuur als verkoopboeking, met de PDF erbij.' },
  { titel: 'Sneller betaald met iDEAL op je factuur', tekst: 'Wat een betaallink doet met je betaaltermijn.' },
  { titel: 'Kosten uit je boekhouding naast je omzet', tekst: 'Inkoopfacturen terug in BossBase, per project.' },
];

function Kop({ navigate }) {
  const go = useGa(navigate);
  return (
    <header className="hv-hero fp-hero">
      <div className="hv-hero-bg" aria-hidden="true">
        <span className="hv-glow-a" /><span className="hv-glow-b" /><span className="hv-ring-a" /><span className="hv-ring-b" /><span className="hv-floor" />
      </div>
      <div className="container fp-hero-in">
        <div className="fp-hero-copy">
          <Kruimelpad items={KRUIMELS} />
          <span className="hv-kicker">Koppelingen</span>
          <h1><span>Koppel je boekhouding</span><span className="hv-groen">en je betalingen.</span></h1>
          <p className="fp-lead">BossBase werkt samen met Moneybird en SnelStart, en met Stripe voor een betaallink op je facturen. Per koppeling lees je precies wat er wordt uitgewisseld, in welke richting en in welk pakket.</p>
          <div className="hv-ctas">
            <a href="/register" className="hv-btn hv-btn-p hv-btn-lg" onClick={e => go(e, '/register')}>Start nu gratis {HI.arrow}</a>
            <a href="/prijzen" className="hv-btn hv-btn-s hv-btn-lg" onClick={e => go(e, '/prijzen')}>Bekijk prijzen</a>
          </div>
          <p className="fp-noot-kop"><i>{HI.check}</i>Moneybird en SnelStart zitten in Groei en Team, en in de proefperiode. De betaallink zit in Team, of als module bij Groei.</p>
        </div>
        <BeeldKoppelingen />
      </div>
    </header>
  );
}

function Rond({ soort }) {
  const r = RICHTING[soort];
  return <i className={`hf-rond ${r.kl}`}>{r.icoon}</i>;
}

function Beschikbaar({ navigate }) {
  const go = useGa(navigate);
  return (
    <section className="hv-sectie hv-sectie-wit fp-blok" id="koppelingen">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Beschikbare koppelingen</span>
            <h2>Drie koppelingen die je vandaag kunt aanzetten.</h2>
            <p>Elke koppeling heeft een eigen pagina met wat er precies wordt uitgewisseld en de stappen om te koppelen.</p>
          </div>
          <div className="kp-legenda" aria-label="Richting van de uitwisseling">
            <span><Rond soort="naar" />Van BossBase naar het pakket</span>
            <span><Rond soort="terug" />Van het pakket naar BossBase</span>
            <span><Rond soort="beide" />Twee kanten op</span>
          </div>
        </div>
        <div className="kp-kaarten">
          {KOPPELINGEN.map(k => (
            <a key={k.href} href={k.href} className="kp-kaart" onClick={e => go(e, k.href)}>
              <span className="kp-kaart-h">
                <img src={k.logo.src} alt={k.logo.alt} width={k.logo.w} height={k.logo.h} className={k.logo.hoog ? 'hoog' : undefined} loading="lazy" decoding="async" />
                <span className="kp-status"><i />Beschikbaar</span>
              </span>
              <h3>{k.titel}</h3>
              <p>{k.tekst}</p>
              <ul className="kp-regels">
                {k.regels.map(([soort, tekst]) => <li key={tekst}><Rond soort={soort} />{tekst}</li>)}
              </ul>
              <span className="kp-kaart-voet">
                <small>{k.pakket}</small>
                <span className="hv-link">Bekijk de koppeling {HI.arrow}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Lezen({ navigate }) {
  const go = useGa(navigate);
  return (
    <section className="hv-sectie hv-sectie-wit fp-blok" id="lezen">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Verder lezen</span>
            <h2>Verder lezen over koppelingen</h2>
            <p>De eerste artikelen over koppelingen zijn in de maak. Tot die tijd staat alles over Moneybird, SnelStart en de betaallink op de pagina van de koppeling zelf.</p>
          </div>
          <a href="/kennisbank" className="hv-link" onClick={e => go(e, '/kennisbank')}>Alle artikelen {HI.arrow}</a>
        </div>
        <div className="fp-lezen">
          {BINNENKORT.map(b => (
            <div key={b.titel} className="hv-artikel kp-binnenkort">
              <span className="fp-foto-leeg kp-foto-leeg" aria-hidden="true">{HI.pen}Blog volgt binnenkort</span>
              <span className="hv-artikel-body">
                <span className="hv-artikel-meta">
                  <span className="hv-badge hv-badge-grijs">Binnenkort</span>
                  <small>Kennisbank</small>
                </span>
                <h3>{b.titel}</h3>
                <p>{b.tekst}</p>
                <span className="kp-nog">Nog niet gepubliceerd</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function IntegratiesPage({ navigate }) {
  return (
    <div className="bm hv fp kp">
      <Nav navigate={navigate} />
      <main>
        <Kop navigate={navigate} />
        <Beschikbaar navigate={navigate} />
        <Faq navigate={navigate} items={VRAGEN} titel="Vragen over koppelingen" creme />
        <Lezen navigate={navigate} />
        <Afsluiting navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}
