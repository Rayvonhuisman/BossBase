import { useEffect, useRef, useState } from "react"
import { HI } from "./HvBlokken"

// De productbeelden van de zes functies: composities van 600 × 470 die
// meeschalen met de kolom. Gebruikt op de functiepagina (/functies) en in de
// kop van elke functiepagina (FunctieTemplate). Stijlen: hf-* in bossbase-mkt.css.

/* ── Beeld: een compositie van 600 × 470 die meeschaalt met de kolom ── */
export function Beeld({ children, b = 600, h = 470 }) {
  const ref = useRef(null)
  const [schaal, setSchaal] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(([entry]) => {
      setSchaal(Math.min(1, entry.contentRect.width / b))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [b])
  return (
    <div className="hf-beeld" ref={ref} style={{ height: Math.round(h * schaal), maxWidth: b }} aria-hidden="true">
      <div className="hf-beeld-in" style={{ width: b, height: h, transform: `translateX(-50%) scale(${schaal})` }}>
        <span className="hf-vloer" />
        {children}
      </div>
    </div>
  )
}

export function Krabbel({ hoogte = 54 }) {
  return (
    <svg viewBox="0 0 196 54" fill="none" aria-hidden="true" style={{ height: hoogte }}>
      <path d="M8 40c14-26 22-30 26-20s-4 26 2 24 16-30 26-28 4 26 12 22 14-24 24-22 6 22 14 18 12-20 20-16 10 16 20 10 8-10 16-10" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 46h184" stroke="#D9D4CC" strokeWidth="1" strokeDasharray="3 4" />
    </svg>
  )
}

export function FrameBar({ url }) {
  return <div className="hv-frame-bar"><i /><i /><i /><span>{HI.lock} {url}</span></div>
}

/* ── 01 Klantbeheer: klantkaart, activiteit, pipeline ── */
export function BeeldKlantbeheer() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-kk">
        <FrameBar url="app.bossbase.nl/klanten/bakker-loodgieters" />
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
export function BeeldOffertes() {
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
export function BeeldWerkbonnen() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-wb">
        <FrameBar url="app.bossbase.nl/werkbonnen" />
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
export function BeeldPlanning() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-pl">
        <FrameBar url="app.bossbase.nl/planning" />
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

export function BeeldUren() {
  return (
    <Beeld>
      <div className="hv-frame hf-frame hf-ur">
        <FrameBar url="app.bossbase.nl/uren" />
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
export function BeeldFacturen() {
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

// Per pad, voor de kop van de functiepagina's.
export const BEELDEN = {
  "/klantbeheer": BeeldKlantbeheer,
  "/offertes": BeeldOffertes,
  "/werkbonnen": BeeldWerkbonnen,
  "/planning": BeeldPlanning,
  "/urenregistratie": BeeldUren,
  "/facturen": BeeldFacturen,
}
