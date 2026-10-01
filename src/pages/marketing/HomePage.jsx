import { Nav, Footer } from "./MktShared"
import { contentVanType } from "../../marketing/routes.jsx"
import { HI, useGa, naarAnker, Faq, Afsluiting } from "./HvBlokken"

// Homepage, herontwerp 2026. Opbouw: hero met product-podium, koppelingen,
// probleem → oplossing, functies, kennisbank, veelgestelde vragen, afsluiting.
// Alle stijlen staan in bossbase-mkt.css onder "Herontwerp 2026" (hv-*). De
// iconen, het vragenblok en de afsluiting staan in HvBlokken.jsx, gedeeld met
// de functiepagina.

/* ── Hero ── */
const HERO_PUNTEN = [
  "Gratis 14 dagen op proef. Geen betaalgegevens nodig.",
  "Gebouwd in Nederland voor schilders, installateurs, hoveniers en aannemers.",
  "Koppelt met Moneybird, SnelStart, AFAS en Stripe.",
  "Werkbon met handtekening van de klant, direct op de telefoon.",
]

function Sparkline() {
  return (
    <svg viewBox="0 0 236 56" fill="none" aria-hidden="true" className="hv-spark">
      <path d="M2 48 41 40 80 43 119 26 158 29 197 12 234 14" stroke="#1DDB62" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 48 41 40 80 43 119 26 158 29 197 12 234 14 234 56 2 56Z" fill="rgba(29,219,98,0.14)" />
      <circle cx="234" cy="14" r="4" fill="#0F7535" stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  )
}

function Telefoon() {
  // De werkbon-pagina van de app, nagebouwd op telefoonformaat.
  return (
    <div className="hv-phone" aria-hidden="true">
      <div className="hv-phone-screen">
        <div className="hv-phone-top">
          <span className="hv-wm"><b>Boss</b><i>Base</i></span>
          <span className="hv-phone-top-r">
            <span className="hv-phone-bell">{HI.bell}<i /></span>
            <span className="hv-avatar">SV</span>
          </span>
        </div>
        <div className="hv-phone-head">
          <span>
            <small>{HI.arrow} Werkbonnen</small>
            <strong>Werkbon</strong>
          </span>
          <span className="hv-phone-edit">{HI.pen} Bewerken</span>
        </div>
        <div className="hv-phone-body">
          <div className="hv-phone-card">
            <span className="hv-badge hv-badge-warn"><i />In uitvoering</span>
            <strong>Familie Jansen</strong>
            <span className="hv-phone-sub">Kozijnen voorgevel</span>
            <span className="hv-phone-meta">{HI.pin} Vijzelstraat 21, Hattem</span>
            <span className="hv-phone-meta">{HI.calendar} di 29 sep · 08:00 – 15:00</span>
          </div>
          <div className="hv-phone-acts">
            <span><i>{HI.phone}</i>Bel klant</span>
            <span><i>{HI.pin}</i>Route</span>
            <span><i>{HI.check}</i>Afronden</span>
          </div>
          <div className="hv-phone-card hv-phone-card-list">
            <div className="hv-phone-card-h">Omschrijving</div>
            <p>Houtrot uitboren, plamuren en aflakken.</p>
          </div>
          <div className="hv-phone-card hv-phone-card-list">
            <div className="hv-phone-card-h">Taken <small>2 van 3</small></div>
            <ul>
              <li className="done"><i>{HI.check}</i><s>Houtrot uitboren</s></li>
              <li className="done"><i>{HI.check}</i><s>Plamuren</s></li>
              <li><i /> Aflakken</li>
            </ul>
            <div className="hv-phone-input"><span>Nieuwe taak…</span><b>+ Taak</b></div>
          </div>
          <span className="hv-phone-cta">{HI.pen} Klant laat tekenen</span>
        </div>
      </div>
    </div>
  )
}

function Hero({ navigate }) {
  const go = useGa(navigate)
  return (
    <header className="hv-hero" id="home">
      <div className="hv-hero-bg" aria-hidden="true">
        <span className="hv-glow-a" /><span className="hv-glow-b" /><span className="hv-ring-a" /><span className="hv-ring-b" /><span className="hv-floor" />
      </div>
      <div className="container hv-hero-in">
        <h1>
          <span>Het CRM-systeem voor vakmensen.</span>
          <span className="hv-groen">Jij de baas, wij de basis.</span>
        </h1>
        <div className="hv-hero-row">
          <div className="hv-hero-copy">
            <p>Met BossBase volg je elke aanvraag van lead tot factuur, maak je offertes die de klant online tekent, plan je klussen en werkbonnen per medewerker en stuur je facturen met één klik door naar je boekhouding, zodat jij je helemaal kunt richten op het werk.</p>
            <div className="hv-ctas">
              <a href="/register" className="hv-btn hv-btn-p hv-btn-lg" onClick={e => go(e, "/register")}>Start nu gratis {HI.arrow}</a>
              <a href="#functies" className="hv-btn hv-btn-s hv-btn-lg" onClick={e => naarAnker(e, "functies")}>Bekijk de functies</a>
            </div>
          </div>
          <ul className="hv-hero-punten">
            {HERO_PUNTEN.map(p => <li key={p}><i>{HI.check}</i>{p}</li>)}
          </ul>
        </div>

        <div className="hv-podium">
          <span className="hv-podium-vloer" aria-hidden="true" />
          <div className="hv-frame hv-frame-dash">
            <div className="hv-frame-bar"><i /><i /><i /><span>{HI.lock} app.bossbase.nl/planning</span></div>
            <img src="/screens/planning.webp" alt="Weekplanning per medewerker in BossBase" width="1600" height="1000" />
          </div>
          <div className="hv-widget hv-widget-lead" aria-hidden="true">
            <span className="hv-tegel">{HI.bell}</span>
            <span><b>Nieuwe lead</b><span>Dakkapel plaatsen · Utrecht</span><small>Zojuist binnengekomen</small></span>
          </div>
          <div className="hv-widget hv-widget-omzet" aria-hidden="true">
            <div className="hv-widget-omzet-h"><span>Omzet juni</span><span className="hv-badge hv-badge-ok">{HI.check}Betaald</span></div>
            <strong>€ 24.900</strong>
            <Sparkline />
            <div className="hv-widget-omzet-as"><span>1 jun</span><span>15 jun</span><span>30 jun</span></div>
          </div>
          <div className="hv-chip hv-chip-mail" aria-hidden="true">
            <span className="hv-tegel hv-tegel-blauw">{HI.mail}</span>
            <span><b>Afspraakherinnering verstuurd</b> · Fam. Jansen, di 29 sep 08:00</span>
          </div>
          <Telefoon />
          <div className="hv-chip hv-chip-getekend" aria-hidden="true">
            <i>{HI.check}</i>Werkbon getekend · Fam. Jansen
          </div>
        </div>
      </div>
    </header>
  )
}

/* ── Koppelingen: doorlopende logoband ── */
const KOPPELINGEN = [
  { src: "/brand/moneybird.svg", alt: "Moneybird",  w: 159, h: 26 },
  { src: "/brand/snelstart.svg", alt: "SnelStart",  w: 158, h: 26 },
  { src: "/brand/afas.png",      alt: "AFAS",       w: 36,  h: 36 },  // vierkant beeldmerk
  { src: "/brand/stripe.svg",    alt: "Stripe",     w: 67,  h: 28 },
]

function Koppelingen() {
  const reeks = [...KOPPELINGEN, ...KOPPELINGEN]
  return (
    <div className="hv-koppel" aria-label="Koppelt met Moneybird, SnelStart, AFAS en Stripe">
      <div className="container hv-koppel-in">
        <span className="hv-koppel-label">Koppelt met</span>
        <div className="hv-marquee">
          <div className="hv-marquee-track">
            {[0, 1].map(kopie => (
              <div className="hv-marquee-set" key={kopie} aria-hidden={kopie === 1 ? "true" : undefined}>
                {reeks.map((l, i) => (
                  <img key={i} src={l.src} alt={kopie === 1 ? "" : l.alt} width={l.w} height={l.h} style={{ height: l.h }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Probleem → oplossing ── */
const KLUS_STAPPEN = [
  { icon: HI.check, kleur: "groen", titel: "Aanvraag via appje",   meta: "di 3 jun · staat in de pipeline, terugbellen gepland",          badge: ["ok", "Opgevolgd", HI.check] },
  { icon: HI.check, kleur: "groen", titel: "Offerte € 4.850",      meta: "do 5 jun · online getekend door de klant",                     badge: ["ok", "Geaccepteerd", HI.check] },
  { icon: HI.check, kleur: "groen", titel: "Ingepland",            meta: "ma 15 jun 08:00 · herinnering gaat automatisch per mail",      badge: ["grijs", "Herinnering staat", HI.bell] },
  { icon: HI.euro,  kleur: "blauw", titel: "Factuur verstuurd",    meta: "wo 25 jun · met één klik uit de offerte, naar je boekhouding", badge: ["blauw", "Betaald", HI.check] },
]

function ProbleemOplossing({ navigate }) {
  const go = useGa(navigate)
  return (
    <section className="hv-sectie hv-sectie-creme" id="herkenbaar">
      <div className="container">
        <div className="hv-kop hv-kop-midden">
          <span className="hv-kicker">Herkenbaar?</span>
          <h2>Nu spring je de hele dag tussen WhatsApp, je mailbox, een schriftje en Excel.</h2>
          <p>Dezelfde klus, twee werelden. Links zoals het nu gaat, rechts zoals het in BossBase op de klantkaart staat.</p>
        </div>

        <div className="hv-voorna">
          <div className="hv-voorna-nu" aria-hidden="true">
            <span className="hv-stap-label hv-stap-label-zwart"><i>1</i>Nu · vijf plekken</span>
            <div className="hv-nu-kaart hv-nu-chat">
              <div className="hv-nu-kaart-h"><span className="hv-avatar hv-avatar-grijs">FB</span><b>Fam. Bakker</b><small>07:42</small></div>
              <div className="hv-nu-bubbel">Kun je morgen om 8 uur langskomen? En wat gaat het ongeveer kosten?</div>
              <span className="hv-nu-nieuw"><i />2 nieuwe berichten</span>
            </div>
            <div className="hv-nu-kaart hv-nu-mail">
              <div className="hv-nu-kaart-h"><span className="hv-tegel hv-tegel-blauw">{HI.mail}</span><b>Visser — Offerte dakkapel v3?</b></div>
              <p>Kun je de prijs nog even nakijken, ik zie twee versies…</p>
              <span className="hv-badge hv-badge-rood">{HI.alert}23 ongelezen</span>
            </div>
            <div className="hv-nu-kaart hv-nu-schriftje">
              <small>Schriftje in de bus</small>
              <p>ma 15 jun — De Lange, 09:00 buitenschilderwerk. Nog bellen over de kleur!</p>
            </div>
            <div className="hv-nu-kaart hv-nu-excel">
              <div className="hv-nu-excel-h">{HI.table}Offertes_DEFINITIEF_v3.xlsx</div>
              <div className="hv-nu-excel-grid">
                <span>Bakker</span><span>badkamer</span><b>4.850</b>
                <span>Visser</span><span>dakkapel</span><b>7.200?</b>
                <span>De Wit</span><span>kozijnen</span><b className="rood">???</b>
              </div>
            </div>
            <div className="hv-nu-kaart hv-nu-agenda">
              <div className="hv-nu-agenda-h"><span>{HI.calendar} di 16 jun</span><span className="rood">{HI.alert}Dubbele afspraak?!</span></div>
              <div className="hv-nu-agenda-rows">
                <span className="a1">08:00 De Lange</span>
                <span className="a2">08:00 Jansen</span>
                <span className="a3">09:30 Materialen halen</span>
              </div>
            </div>
          </div>

          <div className="hv-voorna-mid" aria-hidden="true"><span>{HI.arrow}</span></div>

          <div className="hv-voorna-bb">
            <div className="hv-voorna-bb-h">
              <span className="hv-stap-label hv-stap-label-groen"><i>2</i>Met BossBase · één plek</span>
              <span className="hv-voorna-bb-tag">{HI.users} Klantkaart</span>
            </div>
            <div className="hv-klant">
              <span className="hv-avatar hv-avatar-zwart">FB</span>
              <span><strong>Badkamerrenovatie — Fam. Bakker</strong><small>Van eerste appje tot betaalde factuur, in één overzicht</small></span>
            </div>
            <ol className="hv-tijdlijn">
              {KLUS_STAPPEN.map(s => (
                <li key={s.titel}>
                  <i className={`hv-tijdlijn-dot ${s.kleur}`}>{s.icon}</i>
                  <span className="hv-tijdlijn-txt"><b>{s.titel}</b><small>{s.meta}</small></span>
                  <span className={`hv-badge hv-badge-${s.badge[0]}`}>{s.badge[2]}{s.badge[1]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="hv-winst">
          <span><i>{HI.kanban}</i>Elke aanvraag wordt een kaart in je pipeline</span>
          <span><i>{HI.file}</i>Offerte, planning en factuur hangen aan elkaar</span>
          <span><i>{HI.chart}</i>In één oogopslag zien wat open staat</span>
        </div>
        <div className="hv-ctas hv-ctas-midden">
          <a href="/register" className="hv-btn hv-btn-zwart" onClick={e => go(e, "/register")}>Start nu gratis</a>
          <a href="#functies" className="hv-link" onClick={e => naarAnker(e, "functies")}>Zo werkt het {HI.arrow}</a>
        </div>
      </div>
    </section>
  )
}

/* ── Functies ── */
// Alleen wat het product echt doet: zie docs/seo/productfeiten.md.
const FUNCTIE_KAARTEN = [
  { icon: HI.kanban, titel: "Klanten & pipeline",        tekst: "Elke aanvraag wordt een kaart, van eerste contact tot betaalde factuur.",       href: "/klantbeheer", link: "Meer over klantbeheer", visual: "pipeline" },
  { icon: HI.pen,    titel: "Offertes & online akkoord", tekst: "PDF met je eigen logo. De klant tekent online, jij maakt met één klik de factuur.", href: "/offertes",    link: "Meer over offertes",    visual: "offerte" },
  { icon: HI.chart,  titel: "Uren, facturen & omzet",    tekst: "Uren per klus, facturen met herinneringen en nacalculatie per project.",          href: "/facturen",    link: "Meer over facturen",    visual: "omzet" },
  { icon: HI.users,  titel: "Team & rollen",             tekst: "Collega's uitnodigen, werkbonnen verdelen en rechten per medewerker.",             href: "/planning",    link: "Meer over planning",    visual: "team" },
]

function FunctieVisual({ soort }) {
  if (soort === "pipeline") return (
    <div className="hv-fv hv-fv-pipeline" aria-hidden="true">
      <span>Nieuw<b>€ 7.200</b></span><span className="actief">Offerte<b>€ 4.850</b></span><span>Gepland<b>€ 3.400</b></span>
    </div>
  )
  if (soort === "offerte") return (
    <div className="hv-fv hv-fv-offerte" aria-hidden="true">
      <svg width="90" height="22" viewBox="0 0 90 22" fill="none"><path d="M3 16c6-11 10-11 13-3s6 5 10-3 9-6 12 1 6 6 10 0 8-8 12-1 9 6 15 3" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <span className="hv-badge hv-badge-ok">{HI.check}Getekend</span>
    </div>
  )
  if (soort === "omzet") return (
    <div className="hv-fv hv-fv-omzet" aria-hidden="true">
      <i style={{ height: "40%" }} /><i style={{ height: "55%" }} /><i style={{ height: "48%" }} /><i className="d" style={{ height: "72%" }} /><i className="p" style={{ height: "100%" }} /><i className="d" style={{ height: "85%" }} />
    </div>
  )
  return (
    <div className="hv-fv hv-fv-team" aria-hidden="true">
      <span className="hv-avatars"><i className="z">SV</i><i className="d">IK</i><i className="p">MB</i></span>
      <span className="hv-rol">Admin</span><span className="hv-rol">Monteur</span>
    </div>
  )
}

function Functies({ navigate }) {
  const go = useGa(navigate)
  return (
    <section className="hv-sectie hv-sectie-wit" id="functies">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Functies</span>
            <h2>Alles wat je nodig hebt. Niks wat je niet snapt.</h2>
            <p>Van eerste appje tot betaalde factuur — BossBase regelt de basis.</p>
          </div>
          <a href="/functies" className="hv-link" onClick={e => go(e, "/functies")}>Alle functies bekijken {HI.arrow}</a>
        </div>

        <div className="hv-functie-groot">
          <div className="hv-functie-copy">
            <span className="hv-tegel hv-tegel-groot">{HI.calendar}</span>
            <h3>Planning &amp; werkbonnen</h3>
            <p>Plan klussen in de agenda of, met meerdere mensen, per medewerker en bus. Op de werkbon staan taken, meerwerk, materiaal en foto's, en de klant tekent ter plekke op de telefoon.</p>
            <ul>
              <li>{HI.check}Werkbon met handtekening van de klant</li>
              <li>{HI.check}Automatische afspraakherinnering per mail</li>
              <li>{HI.check}Planning per medewerker en bus (Team)</li>
            </ul>
            <a href="/werkbonnen" className="hv-link" onClick={e => go(e, "/werkbonnen")}>Meer over werkbonnen {HI.arrow}</a>
          </div>
          <div className="hv-frame hv-frame-licht">
            <div className="hv-frame-bar"><i /><i /><i /><span>BossBase — Werkbonnen</span></div>
            <img src="/screens/werkbon.webp" alt="Werkbon Familie Jansen in BossBase" width="1600" height="1000" loading="lazy" />
          </div>
        </div>

        <div className="hv-functie-kaarten">
          {FUNCTIE_KAARTEN.map(f => (
            <div className="hv-functie-kaart" key={f.titel}>
              <span className="hv-tegel">{f.icon}</span>
              <h3>{f.titel}</h3>
              <p>{f.tekst}</p>
              <FunctieVisual soort={f.visual} />
              <a href={f.href} className="hv-link" onClick={e => go(e, f.href)}>{f.link} {HI.arrow}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Kennisbank: populaire artikelen ── */
const KENNISBANK_HOME = [
  { pad: "/kennisbank/wat-moet-er-op-een-werkbon-staan", foto: "/kennisbank/kennisbank-werkbon.webp",     alt: "Schilder laat de klant bij de voordeur een werkbon tekenen op de telefoon" },
  { pad: "/kennisbank/offerte-maken-vakbedrijf",         foto: "/kennisbank/kennisbank-offerte.webp",     alt: "Installateur maakt aan de keukentafel aantekeningen voor een offerte" },
  { pad: "/kennisbank/betalingsherinnering-sturen",      foto: "/kennisbank/kennisbank-herinnering.webp", alt: "Hovenier bekijkt in de bus op haar telefoon een openstaande factuur" },
]

function Kennisbank({ navigate }) {
  const go = useGa(navigate)
  const artikelen = contentVanType("artikel")
  const kaarten = KENNISBANK_HOME.map(k => ({ ...k, doc: artikelen.find(a => a.path === k.pad) })).filter(k => k.doc)
  return (
    <section className="hv-sectie hv-sectie-creme" id="kennisbank">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Kennisbank</span>
            <h2>Populaire artikelen</h2>
            <p>Praktische uitleg voor vakbedrijven over werkbonnen, offertes, facturen en administratie. Met voorbeelden en checklists.</p>
          </div>
          <a href="/kennisbank" className="hv-link" onClick={e => go(e, "/kennisbank")}>Alle artikelen {HI.arrow}</a>
        </div>
        <div className="hv-artikelen">
          {kaarten.map(k => (
            <a href={k.pad} className="hv-artikel" key={k.pad} onClick={e => go(e, k.pad)}>
              <img src={k.foto} alt={k.alt} width="1586" height="992" loading="lazy" />
              <div className="hv-artikel-body">
                <div className="hv-artikel-meta">
                  <span className={`hv-badge ${k.doc.onderwerp === "Facturen en administratie" ? "hv-badge-blauw" : "hv-badge-ok"}`}>{k.doc.onderwerp}</span>
                  <small>{k.doc.leestijd} min lezen</small>
                </div>
                <h3>{k.doc.h1}</h3>
                <p>{k.doc.description}</p>
                <span className="hv-link">Lees het artikel {HI.arrow}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Veelgestelde vragen ── */
const FAQ_HOME = [
  ["Heb ik technische kennis nodig?",       "Nee. BossBase is gemaakt voor vakmensen, niet voor IT'ers. Na het aanmelden voer je je eerste klant in en maak je je eerste offerte; installeren hoeft niet."],
  ["Kan ik mijn eigen logo op offertes zetten?", "Ja. Je uploadt één keer je logo en bedrijfsgegevens, en je offertes en facturen krijgen je eigen logo en huisstijlkleur."],
  ["Werkt het op mijn telefoon?",           "Ja, BossBase is ook op je telefoon te gebruiken. Je klant kan offertes en werkbonnen op elke telefoon ondertekenen."],
  ["Hoe zit het met opzeggen?",             "Een maandabonnement is per maand opzegbaar. Een jaarabonnement loopt 12 maanden en daarna per maand. Je klanten exporteer je als Excel of CSV, en je offertes en facturen als PDF."],
  ["Wat als ik overstap naar een groter pakket?", "Bij een jaarabonnement begint de looptijd van 12 maanden opnieuw vanaf de overstap; je ziet de nieuwe einddatum voordat je bevestigt. Modules of teamleden bijkopen raakt je looptijd niet, en een maandabonnement blijft gewoon per maand opzegbaar."],
  ["Wat krijg ik bij een jaarabonnement?",  "Je kiest één welkomstactie: 2 maanden gratis, of (vanaf Groei) een gratis website met een formulier waarvan de aanvragen in je BossBase-pipeline binnenkomen. Voor de hosting van die website betaal je € 5 per maand."],
]

/* ── HomePage ── */
export default function HomePage({ navigate }) {
  return (
    <div className="bm hv">
      <Nav navigate={navigate} />
      <main>
        <Hero navigate={navigate} />
        <Koppelingen />
        <ProbleemOplossing navigate={navigate} />
        <Functies navigate={navigate} />
        <Kennisbank navigate={navigate} />
        <Faq navigate={navigate} items={FAQ_HOME} />
        <Afsluiting navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
