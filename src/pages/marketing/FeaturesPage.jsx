import { useEffect, useRef, useState } from "react"
import { Nav, Footer } from "./MktShared"
import { HI, useGa, naarAnker, Faq, Afsluiting } from "./HvBlokken"

// Functiepagina, herontwerp 2026 (Claude Design, artboards "Functies · deel 1"
// en "deel 2"). Opbouw: kop met de zes onderdelen als index, zes blokken
// (wit en crème om en om), vroeger vs. nu, integraties, vragen, afsluiting.
// Stijlen: bossbase-mkt.css onder "Herontwerp 2026 — functiepagina" (hf-*).
// Alleen bevestigde functies; de teksten komen uit src/content/functies/*.md.

/* ── Beeld: een compositie van 600 × 470 die meeschaalt met de kolom ── */
const BEELD_B = 600
const BEELD_H = 470

function Beeld({ children }) {
  const ref = useRef(null)
  const [schaal, setSchaal] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(([entry]) => {
      setSchaal(Math.min(1, entry.contentRect.width / BEELD_B))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="hf-beeld" ref={ref} style={{ height: Math.round(BEELD_H * schaal) }} aria-hidden="true">
      <div className="hf-beeld-in" style={{ transform: `translateX(-50%) scale(${schaal})` }}>
        <span className="hf-vloer" />
        {children}
      </div>
    </div>
  )
}

function Krabbel({ hoogte = 54 }) {
  return (
    <svg viewBox="0 0 196 54" fill="none" aria-hidden="true" style={{ height: hoogte }}>
      <path d="M8 40c14-26 22-30 26-20s-4 26 2 24 16-30 26-28 4 26 12 22 14-24 24-22 6 22 14 18 12-20 20-16 10 16 20 10 8-10 16-10" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 46h184" stroke="#D9D4CC" strokeWidth="1" strokeDasharray="3 4" />
    </svg>
  )
}

function FrameBar({ url }) {
  return <div className="hv-frame-bar"><i /><i /><i /><span>{HI.lock} {url}</span></div>
}

/* ── 01 Klantbeheer: klantkaart, activiteit, pipeline ── */
function BeeldKlantbeheer() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-kk">
        <FrameBar url="bossbase.nl/dashboard/klanten/bakker-loodgieters" />
        <div className="hf-kk-head">
          <span className="hf-kk-wie"><i className="hf-av">BL</i><span><b>Bakker Loodgieters</b><small>Vijzelstraat 21, Utrecht · 030 123 45 67</small></span></span>
          <span className="hv-badge hv-badge-ok"><i className="hf-dot" />Actief</span>
        </div>
        <div className="hf-tabs"><span className="actief">Overzicht</span><span>Offertes <b>3</b></span><span>Werkbonnen <b>5</b></span><span>Facturen <b>4</b></span><span>Tijdlijn</span></div>
        <div className="hf-kk-body">
          <div>
            <small className="hf-label">Openstaand</small>
            <div className="hf-kk-open"><small>Offerte OF-2026-048</small><b>€ 3.799,40</b><em className="ok">Getekend</em></div>
            <div className="hf-kk-open"><small>Factuur BB-F-12</small><b>€ 1.210,00</b><em className="warn">Herinnering verstuurd</em></div>
          </div>
          <div>
            <small className="hf-label">Tijdlijn</small>
            <ul className="hf-tl">
              <li><i className="hf-rond groen">{HI.pen}</i><span><span><b>Offerte getekend</b> door de klant</span><small>Gisteren, 16:42</small></span></li>
              <li><i className="hf-rond blauw">{HI.calendar}</i><span><span><b>Werkbon ingepland</b> voor di 29 sep</span><small>Gisteren, 16:50</small></span></li>
              <li><i className="hf-rond oranje">{HI.mail}</i><span><span><b>Herinnering</b> voor factuur BB-F-12</span><small>12 sep, 09:00 · automatisch</small></span></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="hv-chip hf-chip-zwart hf-kk-chip"><i>{HI.phone}</i>Vandaag bellen · Fam. de Vries, 14:00</div>
      <div className="hf-kaartje hf-pipe">
        <div className="hf-kaartje-h"><span>Pipeline</span><em>15 open</em></div>
        <div className="hf-pipe-fasen">
          <span><small>Nieuw</small><b>3</b></span>
          <span><small>Offerte</small><b>5</b></span>
          <span className="actief"><small>Akkoord</small><b>4</b></span>
          <span><small>Betaald</small><b>3</b></span>
        </div>
        <div className="hf-pipe-deal"><i /><span><b>Kozijnen voorgevel · Bakker</b><small>Naar Akkoord na handtekening</small></span></div>
      </div>
    </Beeld>
  )
}

/* ── 02 Offertes: de offerte zoals de klant hem ziet, handtekening, factuurstap ── */
function BeeldOffertes() {
  return (
    <Beeld>
      <div className="hf-doc">
        <div className="hf-doc-balk" />
        <div className="hf-doc-head">
          <span className="hf-doc-firma"><i>JS</i><span><b>Jansen Schilderwerk</b><small>Hattem · KvK 12345678</small></span></span>
          <span className="hf-doc-nr"><b>Offerte OF-2026-048</b><small>Geldig tot 13 okt 2026</small></span>
        </div>
        <div className="hf-doc-voor"><span><b>Voor</b> Fam. de Vries</span><span>Vijzelstraat 21, Hattem</span></div>
        <div className="hf-doc-tabel hf-doc-tabel-4">
          <div className="hf-doc-kop"><span>Omschrijving</span><span>Aantal</span><span>Btw</span><span>Bedrag</span></div>
          <div className="hf-doc-regel"><span><b>Schilderwerk gevel</b><small>Woning ouder dan 2 jaar</small></span><span>40 uur</span><span>9%</span><b>€ 2.400,00</b></div>
          <div className="hf-doc-regel"><span><b>Verf en materialen</b></span><span>1 post</span><span>21%</span><b>€ 650,00</b></div>
          <div className="hf-doc-regel"><span><b>Reiskosten</b></span><span>120 km</span><span>21%</span><b>€ 90,00</b></div>
        </div>
        <div className="hf-doc-totaal">
          <span><span>Subtotaal excl. btw</span><span>€ 3.140,00</span></span>
          <span><span>Btw 9%</span><span>€ 216,00</span></span>
          <span><span>Btw 21%</span><span>€ 155,40</span></span>
          <span className="eind"><span>Totaal incl. btw</span><b>€ 3.511,40</b></span>
        </div>
        <div className="hf-doc-knoppen"><span className="hf-doc-btn-p">{HI.pen}Akkoord en ondertekenen</span><span className="hf-doc-btn-s">{HI.download}PDF</span></div>
      </div>
      <div className="hf-kaartje hf-sign">
        <div className="hf-kaartje-h"><span>Handtekening</span><span className="hv-badge hv-badge-ok">{HI.check}Geaccepteerd</span></div>
        <Krabbel />
        <div className="hf-sign-naam"><b>Fam. de Vries</b><small>Online getekend · gisteren 16:42</small></div>
      </div>
      <div className="hf-kaartje hf-stap">
        <span className="hv-tegel">{HI.euro}</span>
        <span><b>Factuur met één klik</b><small>Zelfde klant, zelfde regels</small></span>
        <i className="hf-stap-knop">{HI.arrow}</i>
      </div>
    </Beeld>
  )
}

/* ── 03 Werkbonnen: de werkbon in de app, de ondertekenpagina op de telefoon ── */
function BeeldWerkbonnen() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-wb">
        <FrameBar url="bossbase.nl/dashboard/werkbonnen" />
        <img src="/screens/werkbon.webp" alt="Een werkbon in BossBase met klant, adres, planning en de knoppen Bel klant, Route en Afronden" width="1600" height="1000" loading="lazy" decoding="async" />
      </div>
      <div className="hf-phone">
        <div className="hf-phone-in">
          <div className="hf-phone-scherm">
            <div className="hf-phone-top"><span className="hv-wm"><b>Boss</b><i>Base</i></span><small>Jansen Schilderwerk</small></div>
            <div className="hf-phone-body">
              <div className="hf-phone-titel"><small>Werkbon ondertekenen</small><b>Kozijnen voorgevel</b><span>Fam. Jansen · di 29 sep</span></div>
              <div className="hf-phone-kaart">
                <div className="hf-phone-kaart-h">Uitgevoerd</div>
                <ul>
                  <li><i>{HI.check}</i>Houtrot uitboren</li>
                  <li><i>{HI.check}</i>Plamuren en aflakken</li>
                  <li><i>{HI.check}</i><span>Tochtstrips 2 ramen <span className="hv-badge hv-badge-warn">Meerwerk</span></span></li>
                </ul>
              </div>
              <div className="hf-phone-kaart hf-phone-sign"><b>Handtekening</b><Krabbel hoogte={48} /><small>Fam. Jansen</small></div>
              <span className="hf-phone-cta">{HI.check}Akkoord en ondertekenen</span>
            </div>
          </div>
        </div>
      </div>
      <div className="hv-chip hf-chip-zwart hf-wb-chip"><i>{HI.check}</i>Werkbon getekend · op slot, PDF naar de klant</div>
    </Beeld>
  )
}

/* ── 04 Planning: de weekplanning, een werkbon die je sleept, de waarschuwing ── */
function BeeldPlanning() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-pl">
        <FrameBar url="bossbase.nl/dashboard/planning" />
        <img src="/screens/planning.webp" alt="De weekplanning in BossBase met de werkbonnen van één medewerker per dag" width="1600" height="1000" loading="lazy" decoding="async" />
      </div>
      <div className="hf-kaartje hf-sleep">
        <div className="hf-kaartje-h"><span>Niet ingepland</span>{HI.grip}</div>
        <div className="hf-sleep-t"><b>Dakkapel plaatsen</b><small>Fam. de Vries · Utrecht · 2 dagen</small></div>
        <div className="hf-sleep-go">{HI.arrow}Sleep naar woensdag · Thomas, bus 2</div>
      </div>
      <div className="hv-chip hf-waarsch"><span className="hv-tegel hf-tegel-oranje">{HI.warn}</span><span><b>Bus 2 staat woensdag al ingepland</b> · Kozijnen voorgevel, Jansen</span></div>
      <div className="hv-chip hf-chip-zwart hf-pl-chip"><i>{HI.bell}</i>Thomas is op de hoogte · samenvatting om 18:00</div>
    </Beeld>
  )
}

/* ── 05 Urenregistratie: werkdagen, werkbonuren, begroting ── */
const WERKDAGEN = [
  ["Ma 28", "07:30 – 16:00", "0:30", "42", "8:00"],
  ["Di 29", "07:30 – 16:30", "0:30", "18", "8:30"],
  ["Wo 30", "08:00 – 15:00", "0:30", "18", "6:30"],
  ["Do 1",  "07:30 – 16:00", "0:30", "56", "8:00"],
  ["Vr 2",  "07:30 – 13:00", "0:15", "24", "5:15"],
]

function BeeldUren() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-ur">
        <FrameBar url="bossbase.nl/dashboard/uren" />
        <div className="hf-ur-head">
          <span className="hf-ur-wie"><i className="hf-av hf-av-blauw">TV</i><span><b>Thomas Visser</b><small>Week 40 · 28 sep t/m 2 okt</small></span></span>
          <span className="hf-toggle"><span className="actief">Werkdagen</span><span>Werkbonuren</span></span>
        </div>
        <div className="hf-ur-tabel">
          <div className="hf-ur-kop"><span>Dag</span><span>Begin – eind</span><span>Pauze</span><span>Km</span><span>Totaal</span></div>
          {WERKDAGEN.map(r => <div key={r[0]}>{r.map((c, i) => <span key={i}>{c}</span>)}</div>)}
        </div>
        <div className="hf-ur-totaal"><span>Totaal week 40 · eind min begin min pauze</span><b>36:15</b></div>
      </div>
      <div className="hf-kaartje hf-wbu">
        <div className="hf-kaartje-h"><span>Werkbonuren</span><i className="hf-rond groen">{HI.clock}</i></div>
        <div className="hf-wbu-titel">Kozijnen voorgevel · Jansen</div>
        <div className="hf-wbu-rijen">
          <div className="hf-wbu-rij"><span>Thomas · di 29 sep</span><b>6:00</b></div>
          <div className="hf-wbu-rij"><span>Sven · di 29 sep</span><b>4:30</b></div>
        </div>
        <div className="hf-wbu-som"><span>Op de klus</span><b>10:30</b></div>
      </div>
      <div className="hf-kaartje hf-budget">
        <div className="hf-kaartje-h"><span>Project · uren</span><span className="hv-badge hv-badge-warn">{HI.warn}85% van begroot</span></div>
        <div className="hf-budget-getal"><b>34 u</b><small>geregistreerd van 40 u begroot</small></div>
        <div className="hf-balk"><i /></div>
        <div className="hf-budget-voet"><span>Resterend 6 u</span><span>Waarschuwing bij 80% en 100%</span></div>
      </div>
    </Beeld>
  )
}

/* ── 06 Facturen: de factuur met betaallink, herinneringen, betaling, boekhouding ── */
function BeeldFacturen() {
  return (
    <Beeld>
      <div className="hf-doc">
        <div className="hf-doc-balk" />
        <div className="hf-doc-head">
          <span className="hf-doc-firma"><i>JS</i><span><b>Jansen Schilderwerk</b><small>Hattem · KvK 12345678</small></span></span>
          <span className="hf-doc-nr"><b>Factuur BB-F-13</b><small>Vervalt 15 okt 2026</small></span>
        </div>
        <div className="hf-doc-voor"><span><b>Voor</b> Fam. de Vries, Hattem</span><span className="hv-badge hv-badge-blauw">Uit offerte OF-2026-048</span></div>
        <div className="hf-doc-tabel hf-doc-tabel-3">
          <div className="hf-doc-kop"><span>Omschrijving</span><span>Btw</span><span>Bedrag</span></div>
          <div className="hf-doc-regel"><span><b>Schilderwerk gevel · 40 uur</b></span><span>9%</span><b>€ 2.400,00</b></div>
          <div className="hf-doc-regel"><span><b>Verf en materialen</b></span><span>21%</span><b>€ 650,00</b></div>
          <div className="hf-doc-regel"><span><b>Reiskosten · 120 km</b></span><span>21%</span><b>€ 90,00</b></div>
        </div>
        <div className="hf-doc-totaal">
          <span><span>Subtotaal excl. btw</span><span>€ 3.140,00</span></span>
          <span><span>Btw 9% en 21%</span><span>€ 371,40</span></span>
          <span className="eind"><span>Te betalen</span><b>€ 3.511,40</b></span>
        </div>
        <div className="hf-doc-knoppen"><span className="hf-doc-btn-p">{HI.card}Betaal met iDEAL</span><span className="hf-doc-btn-s">{HI.download}PDF</span></div>
      </div>
      <div className="hf-kaartje hf-herin">
        <div className="hf-kaartje-h"><span>Herinneringen</span><span className="hf-schakel"><i />Automatisch</span></div>
        <ul>
          <li><i className="hf-rond groen">{HI.check}</i><span><b>Factuur verstuurd</b><small>1 okt, per mail met PDF</small></span></li>
          <li><i className="hf-rond oranje">{HI.mail}</i><span><b>Herinnering 1</b><small>7 dagen na de vervaldatum</small></span></li>
          <li><i className="hf-rond grijs">{HI.mail}</i><span><b>Herinnering 2</b><small>14 dagen na de vervaldatum</small></span></li>
        </ul>
      </div>
      <div className="hv-chip hf-chip-zwart hf-fa-chip"><i>{HI.check}</i>Betaald via iDEAL · factuur op betaald</div>
      <div className="hv-chip hf-mb-chip"><span className="hv-tegel hf-tegel-klein">{HI.arrow}</span><span><b>Doorgestuurd naar Moneybird</b> · boekhouding bijgewerkt</span></div>
    </Beeld>
  )
}

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
  ["Werkt het op mijn telefoon?", "Het dashboard werkt op een tablet, laptop of computer, niet op een smalle telefoon, en er is geen app. Je klant kan offertes en werkbonnen wel op elke telefoon ondertekenen."],
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
