import { Nav, Footer } from "./MktShared"
import { HI, useGa, naarAnker, Faq, Afsluiting } from "./HvBlokken"
import { BeeldKlantbeheer, BeeldOffertes, BeeldWerkbonnen, BeeldPlanning, BeeldUren, BeeldFacturen } from "./FunctieBeelden"

// Functiepagina, herontwerp 2026 (Claude Design, artboards "Functies · deel 1"
// en "deel 2"). Opbouw: kop met de zes onderdelen als index, zes blokken
// (wit en crème om en om), vroeger vs. nu, integraties, vragen, afsluiting.
// Stijlen: bossbase-mkt.css onder "Herontwerp 2026 — functiepagina" (hf-*).
// Alleen bevestigde functies; de teksten komen uit src/content/functies/*.md.

/* ── De zes blokken ── */
// In de volgorde van de klus: aanvraag → offerte → werkbon → planning → uren → factuur.
const BLOKKEN = [
  {
    id: "klantbeheer", kicker: "Klantbeheer", icon: HI.users,
    kort: "Klantkaart met historie en een pipeline voor je aanvragen.",
    titel: "Je klanten en aanvragen op één plek.",
    lead: "Elke klant heeft een klantkaart met gegevens, offertes, werkbonnen, facturen en een tijdlijn van wat er gebeurde. Aanvragen volg je in een pipeline: van eerste contact tot akkoord, uitvoering en betaling.",
    punten: ["Klantkaart met historie: offertes, werkbonnen en facturen erbij", "Pipeline die automatisch meeschuift bij offerte, werkbon en factuur", "Activiteiten om op te volgen: bellen, mailen, een bezoek of een taak", "Export naar Excel of CSV, je gegevens blijven van jou"],
    noot: "In elk pakket. Starter heeft ruimte voor 100 klanten, Groei en Team hebben geen limiet.",
    href: "/klantbeheer", link: "Meer over klantbeheer", Beeld: BeeldKlantbeheer,
  },
  {
    id: "offertes", kicker: "Offertes", icon: HI.file,
    kort: "Met je logo en btw per regel. De klant tekent online.",
    titel: "Offertes maken en online laten ondertekenen.",
    lead: "Een offerte met je eigen logo en kleuren, regels met btw per regel en een geldigheidsdatum. Je verstuurt hem per mail en de klant tekent online. Is hij akkoord, dan maak je met één klik de factuur met dezelfde regels.",
    punten: ["Je logo en huisstijlkleur op de PDF, met oplopend nummer", "Btw per regel: 21%, 9%, vrijgesteld of verlegd", "Online ondertekenen, de klant krijgt een bevestiging met PDF", "Nieuwe versie zonder verwarring: de oude wordt 'vervangen'"],
    noot: "Offertes maken en versturen kan in elk pakket. Online laten ondertekenen kan in Groei en Team, en tijdens de proefperiode.",
    href: "/offertes", link: "Meer over offertes", Beeld: BeeldOffertes,
  },
  {
    id: "werkbonnen", kicker: "Werkbonnen", icon: HI.clipboard,
    kort: "Taken, meerwerk, materiaal, foto's en de handtekening van de klant.",
    titel: "Werkbonnen die je klant ter plekke tekent.",
    lead: "Eén werkbon per klus met taken, meerwerk, materiaal, foto's en uren. Op locatie vink je af wat klaar is, en de klant tekent op je tablet, of later via een link op zijn eigen telefoon. Zo ligt vast wat er is gedaan, voordat iemand er later over kan twisten.",
    punten: ["Taken afvinken op locatie, de klant ziet alleen wat klaar is", "Meerwerk apart vastgelegd, met de handtekening ligt het akkoord vast", "Materiaal met prijs en leverancier, foto's direct met de camera", "Tekenen ter plekke of later via een link; daarna gaat de werkbon op slot en krijgt de klant de PDF"],
    noot: "Werkbonnen en de handtekening van de klant zitten in elk pakket, ook in Starter.",
    href: "/werkbonnen", link: "Meer over werkbonnen", Beeld: BeeldWerkbonnen,
  },
  {
    id: "planning", kicker: "Planning", icon: HI.calendar,
    kort: "Dag- en weekoverzicht per medewerker of per bus.",
    titel: "Klussen plannen per medewerker en voertuig.",
    lead: "Zie in één weekoverzicht wie waar staat en met welke bus. Sleep werkbonnen die nog niet gepland zijn naar de juiste dag, en krijg een waarschuwing als iemand of een bus dubbel staat.",
    punten: ["Dag- of weekweergave, voor het hele team, één medewerker of één voertuig", "Werkbonnen zonder datum staan bovenaan: sleep ze naar dag en persoon", "Waarschuwing als een medewerker of bus al ergens ingepland staat", "Wie ingepland wordt krijgt een melding, om 18:00 een samenvatting van de wijzigingen"],
    noot: "De planningsmodule zit in Team. Bij Groei neem je hem erbij voor € 10 per maand. De agenda zit in elk pakket.",
    href: "/planning", link: "Meer over planning", Beeld: BeeldPlanning,
  },
  {
    id: "urenregistratie", kicker: "Urenregistratie", icon: HI.clock,
    kort: "Werkdagen voor het loon, uren op de werkbon voor je nacalculatie.",
    titel: "Uren registreren per werkdag en per klus.",
    lead: "BossBase houdt twee soorten uren bij. De werkdag van een medewerker, met begin, eind en pauze. En de uren die op een klus zijn gemaakt, op de werkbon zelf. Zo zie je wie hoeveel werkte, en wat een klus aan uren kostte.",
    punten: ["Werkdaguren per medewerker: begin, eind, pauze, kilometers en een notitie", "Uren op de werkbon, geboekt door wie de klus uitvoert", "Opgeteld per project: geregistreerd tegenover begroot, met een waarschuwing bij 80% en 100%", "Per dag, week of maand en per medewerker, handig voor de loonadministratie"],
    noot: "Urenregistratie zit in elk pakket. De nacalculatie per project zit in Groei en Team.",
    href: "/urenregistratie", link: "Meer over urenregistratie", Beeld: BeeldUren,
  },
  {
    id: "facturen", kicker: "Facturen", icon: HI.euro,
    kort: "Vanuit de offerte, met herinneringen en een betaallink met iDEAL.",
    titel: "Factureren vanuit je offerte, en sneller betaald worden.",
    lead: "Maak een factuur vanuit een geaccepteerde offerte en alle regels staan er meteen op. Verstuur hem per mail met PDF, stuur automatisch een herinnering als er niet betaald wordt, en laat klanten betalen met iDEAL via een betaallink.",
    punten: ["Vanuit offerte of project, klant en regels staan er meteen op", "Btw per regel: 21%, 9%, vrijgesteld of verlegd", "Herinneringen automatisch, 7 en 14 dagen na de vervaldatum", "Betaallink met iDEAL, en door naar Moneybird of SnelStart"],
    noot: "Facturen maken en versturen kan in elk pakket (Starter tot 20 per periode). Automatische herinneringen en de boekhoudkoppeling zitten in Groei en Team. De betaallink zit in Team, of als module bij Groei.",
    href: "/facturen", link: "Meer over facturen", Beeld: BeeldFacturen,
  },
]

const HERO_PUNTEN = [
  "Aan elkaar gekoppeld: de factuur komt uit de geaccepteerde offerte, de uren van de werkbon.",
  "Werkbon met handtekening van de klant, in elk pakket.",
  "Gratis 14 dagen op proef, met de functies van Groei. Geen betaalgegevens nodig.",
]

function Hero({ navigate }) {
  const go = useGa(navigate)
  return (
    <header className="hv-hero hf-hero" id="inhoud">
      <div className="hv-hero-bg" aria-hidden="true">
        <span className="hv-glow-a" /><span className="hv-glow-b" /><span className="hv-ring-a" /><span className="hv-ring-b" /><span className="hv-floor" />
      </div>
      <div className="container hv-hero-in">
        <span className="hv-kicker">Functies</span>
        <h1>
          <span>Alle functies van BossBase.</span>
          <span className="hv-groen">Van aanvraag tot betaalde factuur.</span>
        </h1>
        <div className="hv-hero-row">
          <div className="hv-hero-copy">
            <p>Klantbeheer, offertes, werkbonnen, planning, urenregistratie en facturen werken in BossBase als één geheel. Elke stap bouwt voort op de vorige: van de eerste aanvraag in je pipeline tot de factuur die je met één klik naar je boekhouding stuurt. Kies hieronder een onderdeel voor de details.</p>
            <div className="hv-ctas">
              <a href="/register" className="hv-btn hv-btn-p hv-btn-lg" onClick={e => go(e, "/register")}>Start nu gratis {HI.arrow}</a>
              <a href="/prijzen" className="hv-btn hv-btn-s hv-btn-lg" onClick={e => go(e, "/prijzen")}>Bekijk prijzen</a>
            </div>
          </div>
          <ul className="hv-hero-punten">
            {HERO_PUNTEN.map(p => <li key={p}><i>{HI.check}</i>{p}</li>)}
          </ul>
        </div>

        <ol className="hf-index" aria-label="De zes onderdelen">
          {BLOKKEN.map((b, i) => (
            <li key={b.id}>
              <a href={`#${b.id}`} className="hf-kaart" onClick={e => naarAnker(e, b.id)}>
                <span className="hf-kaart-h"><span className="hv-tegel">{b.icon}</span><small>0{i + 1}</small></span>
                <strong>{b.kicker}</strong>
                <p>{b.kort}</p>
                <span className="hv-link">Bekijk {HI.arrow}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </header>
  )
}

function Blok({ b, i, navigate }) {
  const go = useGa(navigate)
  const creme = i % 2 === 1
  return (
    <section id={b.id} className={`hv-sectie hf-blok ${creme ? "hv-sectie-creme hf-blok-flip" : "hv-sectie-wit"}`}>
      {creme && <div className="hf-blok-bg" aria-hidden="true"><span className="hf-blok-glow-a" /><span className="hf-blok-glow-b" /></div>}
      <div className="container hf-rij">
        <div className="hf-copy">
          <span className="hv-kicker hf-nr"><i>0{i + 1}</i>{b.kicker}</span>
          <h2>{b.titel}</h2>
          <p className="hf-lead">{b.lead}</p>
          <ul className="hf-punten">
            {b.punten.map(p => <li key={p}>{HI.check}{p}</li>)}
          </ul>
          <p className="hf-noot">{b.noot}</p>
          <a href={b.href} className="hv-link" onClick={e => go(e, b.href)}>{b.link} {HI.arrow}</a>
        </div>
        <b.Beeld />
      </div>
    </section>
  )
}

/* ── Vroeger vs. nu ── */
const VROEGER = [
  [HI.file,     "Offertes in losse Word-bestanden"],
  [HI.table,    "Klanten bijhouden in Excel"],
  [HI.clipboard, "Werkbonnen op papier in de bus"],
  [HI.calendar, "Agenda op papier of los in je telefoon"],
  [HI.sticky,   "Herinneren via Post-it briefjes"],
  [HI.hash,     "Facturen handmatig nummeren en versturen"],
]
const NU = [
  ["Offertes met je logo, online te ondertekenen",        "offertes",    "Offertes"],
  ["Klantkaart met historie op één plek",                 "klantbeheer", "Klantbeheer"],
  ["Werkbon met handtekening van de klant",               "werkbonnen",  "Werkbonnen"],
  ["Agenda gekoppeld aan klanten en werkbonnen",          "planning",    "Planning"],
  ["Herinneringen per mail, automatisch in Groei en Team", "facturen",   "Facturen"],
  ["Factuur vanuit de geaccepteerde offerte",             "facturen",    "Facturen"],
]

function Vergelijk() {
  return (
    <section className="hv-sectie hv-sectie-wit" id="vergelijk">
      <div className="container">
        <div className="hv-kop hv-kop-midden">
          <span className="hv-kicker">Vergelijk</span>
          <h2>Vroeger vs. nu.</h2>
          <p>Zes dingen uit de werkdag van een vakbedrijf. Links zoals het vaak nog gaat, rechts zoals het in BossBase gaat.</p>
        </div>
        <div className="hv-voorna hf-vg">
          <div className="hv-voorna-nu hf-vg-oud">
            <span className="hv-stap-label hv-stap-label-zwart"><i>1</i>Vroeger · losse bestanden</span>
            <ul>
              {VROEGER.map(([icon, t]) => <li key={t}><i>{icon}</i>{t}</li>)}
            </ul>
          </div>
          <div className="hv-voorna-mid" aria-hidden="true"><span>{HI.arrow}</span></div>
          <div className="hv-voorna-bb hf-vg-nieuw">
            <span className="hv-stap-label hv-stap-label-groen"><i>2</i>Met BossBase · één systeem</span>
            <ul>
              {NU.map(([t, id, label]) => (
                <li key={t}><i>{HI.check}</i><span>{t}</span><a href={`#${id}`} onClick={e => naarAnker(e, id)}>{label}</a></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Integraties ── */
// Alleen bestaande koppelingen; de teksten komen van de koppelingspagina's.
const KOPPELINGEN = [
  { naam: "Moneybird", src: "/brand/moneybird.svg", w: 159, h: 26, href: "/integraties/moneybird",
    tekst: "Betaalde facturen gaan naar Moneybird. Inkoopfacturen, bonnetjes en uitgaven komen terug als kosten.", pakket: "Groei en Team" },
  { naam: "SnelStart", src: "/brand/snelstart.svg", w: 158, h: 26, href: "/integraties/snelstart",
    tekst: "Facturen als verkoopboeking in SnelStart, met de PDF erbij. Inkoopfacturen komen terug als kosten.", pakket: "Groei en Team" },
  { naam: "AFAS", src: "/brand/afas.png", w: 34, h: 34, href: "/integraties",
    tekst: "Relaties en kosten uitwisselen met je AFAS-omgeving, zodat je boekhouding bij blijft.", pakket: "Groei en Team" },
  { naam: "Betaallink met iDEAL", src: "/brand/stripe.svg", w: 67, h: 28, href: "/integraties/stripe-betaallink",
    tekst: "Via je eigen Stripe-account staat er een betaallink in elke factuurmail. Na betaling gaat de factuur vanzelf op betaald.", pakket: "Team, of module bij Groei" },
]

function Integraties({ navigate }) {
  const go = useGa(navigate)
  return (
    <section className="hv-sectie hv-sectie-creme" id="integraties">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Integraties</span>
            <h2>Werkt samen met wat je al gebruikt.</h2>
            <p>Koppel je boekhouding en laat klanten online betalen. Facturen gaan vanzelf door, kosten komen terug.</p>
          </div>
          <a href="/integraties" className="hv-link" onClick={e => go(e, "/integraties")}>Alle koppelingen {HI.arrow}</a>
        </div>
        <div className="hf-koppelingen">
          {KOPPELINGEN.map(k => (
            <a key={k.naam} href={k.href} className="hf-koppeling" onClick={e => go(e, k.href)}>
              <span className="hf-koppeling-logo"><img src={k.src} alt="" width={k.w} height={k.h} style={{ height: k.h }} loading="lazy" /></span>
              <strong>{k.naam}</strong>
              <p>{k.tekst}</p>
              <span className="hf-koppeling-voet"><span className="hv-badge hf-pakket">{k.pakket}</span><span className="hv-link">Bekijk {HI.arrow}</span></span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Vragen over de functies ── */
// Antwoorden uit de FAQ's van de functiepagina's (src/content/functies/*.md).
const FAQ_FUNCTIES = [
  ["Zit alles in elk pakket?", "Klantbeheer, werkbonnen met handtekening, urenregistratie en offertes maken zitten in elk pakket. Online ondertekenen, automatische herinneringen, de boekhoudkoppeling en de nacalculatie zitten in Groei en Team. De planningsmodule en de betaallink zitten in Team, of als module bij Groei."],
  ["Kan ik een werkbon omzetten in een factuur?", "Nee. Een factuur maak je vanuit een geaccepteerde offerte, dan worden de regels overgenomen, of vanuit een project. Uren, materiaal en meerwerk van de werkbon zet je er zelf bij."],
  ["Ziet de klant mijn prijzen of notities op de werkbon?", "Nee. De ondertekenpagina en de PDF voor de klant tonen geen bedragen, geen inkoopprijzen en geen interne notities. Notities die je als 'voor klant' markeert, zijn wel zichtbaar."],
  ["Kan ik mijn klanten uit Excel importeren?", "Nee, een importfunctie is er niet. Je voert klanten in, of ze ontstaan uit een aanvraag. Exporteren naar Excel of CSV kan wel."],
  ["Kan de klant een offerte online afwijzen?", "Nee. Online kan de klant alleen akkoord geven en tekenen. Wijst hij af, dan zet je de status zelf op afgewezen."],
  ["Werkt het op mijn telefoon?", "Ja, BossBase is ook op je telefoon te gebruiken. Je klant kan offertes en werkbonnen op elke telefoon ondertekenen."],
]

/* ── Pagina ── */
export default function FeaturesPage({ navigate }) {
  return (
    <div className="bm hv">
      <Nav navigate={navigate} />
      <main>
        <Hero navigate={navigate} />
        {BLOKKEN.map((b, i) => <Blok key={b.id} b={b} i={i} navigate={navigate} />)}
        <Vergelijk />
        <Integraties navigate={navigate} />
        <Faq navigate={navigate} items={FAQ_FUNCTIES} titel="Vragen over de functies" />
        <Afsluiting navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
