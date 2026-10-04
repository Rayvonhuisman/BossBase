import { HI } from "./HvBlokken"
import { Beeld } from "./FunctieBeelden"

// Per functiepagina: de accentregel van de kop, de iconen bij de kernpunten en
// de kleine beelden bij de alinea's van het verhaal (één per kop in de tekst).
// Ontwerp: Claude Design, artboards Klantbeheer t/m Facturen. Stijlen: fp-* in
// bossbase-mkt.css. De beelden zijn decoratief (aria-hidden via Beeld); de
// tekst ernaast vertelt het verhaal.

/* ── Bouwstenen ── */
const Kaart = ({ w, children, className = "", style }) => <div className={`fp-mini ${className}`} style={{ width: w, ...style }}>{children}</div>
const Kop = ({ links, rechts }) => <div className="fp-mini-h"><span>{links}</span>{rechts && <span>{rechts}</span>}</div>
const Rond = ({ kl = "groen", children }) => <i className={`hf-rond ${kl}`}>{children}</i>
const Pil = ({ kl = "ok", children }) => <span className={`hv-badge hv-badge-${kl}`}>{children}</span>
const Pijl = ({ klein }) => <span className={`fp-pijl${klein ? " klein" : ""}`}>{HI.arrow}</span>
const Regel = ({ ico, kl = "groen", rechts, children }) => <span className="fp-regel"><Rond kl={kl}>{ico}</Rond><span>{children}</span>{rechts && <b>{rechts}</b>}</span>
const Vak = ({ ico, naam, waarde, sub, actief }) => <span className={`fp-vak${actief ? " actief" : ""}`}><small>{ico && <i>{ico}</i>}{naam}</small><b>{waarde}</b>{sub && <em>{sub}</em>}</span>
const Blokje = ({ kl = "g", children, style }) => <span className={`fp-blokje ${kl}`} style={style}>{children}</span>
const Leeg = ({ children }) => <span className="fp-leeg">{children}</span>
const Vink = () => <i className="fp-vink">{HI.check}</i>

/* ── Klantbeheer ── */
function KbBerichten() {
  return (
    <Beeld b={560} h={250}>
      <div className="fp-flex" style={{ width: 560 }}>
        <div className="fp-kolom" style={{ width: 236 }}>
          <Kaart className="fp-bericht" style={{ transform: "rotate(-2deg)" }}><i className="hv-tegel hv-tegel-blauw">{HI.phone}</i><span><b>Telefoon · Fam. de Vries</b><small>"Kunnen jullie een dakkapel plaatsen?"</small></span></Kaart>
          <Kaart className="fp-bericht" style={{ transform: "rotate(1.5deg)", marginLeft: 14 }}><i className="hv-tegel hf-tegel-oranje">{HI.mail}</i><span><b>Mail · info@</b><small>Offerteaanvraag kozijnen voorgevel</small></span></Kaart>
          <Kaart className="fp-bericht" style={{ transform: "rotate(-1deg)" }}><i className="hv-tegel">{HI.message}</i><span><b>WhatsApp · Bakker</b><small>"Kun je langskomen voor de schuur?"</small></span></Kaart>
        </div>
        <Pijl />
        <Kaart style={{ flex: 1 }}>
          <Kop links="Pipeline · Nieuw" rechts="3 kaarten" />
          <div className="fp-deal">
            <b>Dakkapel plaatsen · Fam. de Vries</b>
            <small>Utrecht · via telefoon · vandaag</small>
            <Pil>{HI.bell}Volgende actie: terugbellen · do 2 okt, 10:00</Pil>
          </div>
          <div className="fp-deal klein"><span>Kozijnen voorgevel · Jansen</span><small>via mail</small></div>
        </Kaart>
      </div>
    </Beeld>
  )
}

function KbKlantkaart() {
  return (
    <Beeld b={520} h={250}>
      <Kaart w={520}>
        <div className="fp-wie">
          <span><i className="hf-av">BL</i><span><b>Bakker Loodgieters</b><small>Belt nu · 030 123 45 67</small></span></span>
          <Pil kl="blauw">{HI.phone}Inkomend gesprek</Pil>
        </div>
        <div className="fp-vakken vier">
          <Vak ico={HI.user} naam="Gegevens" waarde="Vijzelstraat 21" />
          <Vak ico={HI.file} naam="Offertes" waarde="1 lopend · € 3.511" />
          <Vak ico={HI.clipboard} naam="Werkbonnen" waarde="2 ingepland" />
          <Vak ico={HI.euro} naam="Facturen" waarde="1 open · € 1.210" />
        </div>
        <Kop links="Tijdlijn" />
        <Regel ico={HI.pen}><b>Offerte getekend</b> · gisteren 16:42 · door Sven</Regel>
        <Regel ico={HI.mail} kl="oranje"><b>Herinnering factuur BB-F-12</b> · 12 sep · automatisch</Regel>
      </Kaart>
    </Beeld>
  )
}

function KbPipeline() {
  return (
    <Beeld b={540} h={250}>
      <Kaart w={540}>
        <Kop links="Pipeline · Kozijnen voorgevel" rechts={<span className="fp-schakel"><i />Automatisch doorschuiven</span>} />
        <div className="fp-fasen">
          {["Nieuw", "Offerte", "Akkoord", "Uitvoering", "Betaald"].map(f => <span key={f} className={f === "Akkoord" ? "actief" : ""}>{f}</span>)}
        </div>
        <Regel ico={HI.pen} rechts={<span className="fp-naar">{HI.arrow}Akkoord</span>}><b>Offerte getekend door de klant</b></Regel>
        <Regel ico={HI.clipboard} kl="blauw" rechts={<span className="fp-naar">{HI.arrow}Uitvoering</span>}><b>Werkbon gestart en afgerond</b></Regel>
        <Regel ico={HI.euro} kl="oranje" rechts={<span className="fp-naar">{HI.arrow}Betaald</span>}><b>Factuur betaald via iDEAL</b></Regel>
        <small className="fp-noot">Of de aanvraag meeschuift, stel je per bedrijf in.</small>
      </Kaart>
    </Beeld>
  )
}

/* ── Offertes ── */
function OfGoedkeuren() {
  return (
    <Beeld b={520} h={250}>
      <Kaart w={520} className="fp-doc">
        <div className="fp-doc-balk" />
        <div className="fp-wie">
          <span><i className="fp-firma">JS</i><span><b>Jansen Schilderwerk</b><small>Offerte OF-2026-048 · voor Fam. de Vries</small></span></span>
          <Pil kl="blauw">Verstuurd</Pil>
        </div>
        <div className="fp-vakken drie">
          <Vak ico={HI.list} naam="Wat je gaat doen" waarde="Schilderwerk gevel" sub="40 uur, verf en materialen, reiskosten" />
          <Vak ico={HI.euro} naam="Wat het kost" waarde="€ 3.511,40" sub="incl. btw, 9% en 21%" />
          <Vak ico={HI.calendar} naam="Tot wanneer" waarde="13 okt 2026" sub="standaard 14 dagen geldig" />
        </div>
        <div className="fp-flex" style={{ gap: 8 }}>
          <span className="hf-doc-btn-p" style={{ flex: 1 }}>{HI.pen}Akkoord en ondertekenen</span>
          <small style={{ width: 150 }}>Niets printen of terugscannen: tekenen op de telefoon.</small>
        </div>
      </Kaart>
    </Beeld>
  )
}

function OfOpvolgen() {
  const rijen = [
    ["Fam. de Vries", "OF-2026-048", "6 dagen", "3.511", "Nabellen · do 2 okt, 10:00"],
    ["Bakker Loodgieters", "OF-2026-046", "9 dagen", "4.200", ""],
    ["VvE Lindenlaan", "OF-2026-044", "12 dagen", "2.150", ""],
  ]
  return (
    <Beeld b={520} h={260}>
      <Kaart w={520}>
        <Kop links="Offertes · nog geen antwoord" rechts="3 open · € 9.861" />
        {rijen.map(([k, nr, d, b, actie]) => (
          <div key={nr} className={`fp-deal rij${actie ? " actief" : ""}`}>
            <span><b>{k}</b><small>{nr} · € {b} · verstuurd {d} geleden</small></span>
            {actie ? <Pil>{HI.phone}{actie}</Pil> : <Pil kl="blauw">Verstuurd</Pil>}
          </div>
        ))}
        <Regel ico={HI.bell}>Elke offerte hangt aan een aanvraag in je pipeline. Plan een activiteit, dan staat die in je lijst voor die dag.</Regel>
      </Kaart>
    </Beeld>
  )
}

function Stap({ ico, kl, label, titel, children, style }) {
  return (
    <Kaart className="fp-stapkaart" style={style}>
      <span className={`fp-staplabel ${kl}`}><Rond kl={kl}>{ico}</Rond>{label}</span>
      <b>{titel}</b>
      <div className="fp-kolom klein">{children}</div>
    </Kaart>
  )
}

function OfNaAkkoord() {
  return (
    <Beeld b={560} h={250}>
      <div className="fp-flex" style={{ width: 560, gap: 10 }}>
        <Stap ico={HI.file} kl="groen" label="Offerte" titel="OF-2026-048 getekend" style={{ flex: 1 }}>
          <span><Vink />Akkoord van Fam. de Vries</span><span><Vink />€ 3.511,40 incl. btw</span>
        </Stap>
        <Pijl klein />
        <Stap ico={HI.clipboard} kl="blauw" label="Werkbon" titel="Kozijnen voorgevel" style={{ flex: 1 }}>
          <span><i className="fp-ico blauw">{HI.calendar}</i>di 29 sep · Thomas, bus 2</span><span><i className="fp-ico oranje">{HI.plus}</i>Meerwerk: tochtstrips 2 ramen</span>
        </Stap>
        <Pijl klein />
        <Stap ico={HI.euro} kl="oranje" label="Factuur" titel="BB-F-13 uit de offerte" style={{ flex: 1 }}>
          <span><Vink />Klant en regels overgenomen</span><span><i className="fp-ico oranje">{HI.plus}</i>Meerwerk zelf erbij gezet</span>
        </Stap>
      </div>
    </Beeld>
  )
}

/* ── Werkbonnen ── */
function WbPapier() {
  return (
    <Beeld b={560} h={260}>
      <div className="fp-flex" style={{ width: 560, gap: 16 }}>
        <div className="fp-briefje" style={{ width: 228 }}>
          <small>Werkbon · papier</small>
          <p>Kozijnen voorgevel, Jansen<br />houtrot uitgeb… plamuren<br />+ tochtstr. 2 ramen?<br />handtek: ______</p>
          <span className="rood"><Rond kl="rood">{HI.x}</Rond>Kwijt in de bus</span>
          <span className="rood"><Rond kl="rood">{HI.x}</Rond>Pas dagen later overgetypt</span>
        </div>
        <Pijl />
        <Kaart style={{ flex: 1 }}>
          <Kop links="Werkbon · digitaal" rechts={<Pil>Op één plek</Pil>} />
          <b className="fp-titel">Kozijnen voorgevel · Fam. Jansen</b>
          <Regel ico={HI.check}><b>Gepland</b> · di 29 sep, Thomas</Regel>
          <Regel ico={HI.check}><b>Gedaan</b> · houtrot uitboren, plamuren, aflakken</Regel>
          <Regel ico={HI.plus} kl="oranje"><b>Extra erbij</b> · tochtstrips 2 ramen (meerwerk)</Regel>
          <Regel ico={HI.pen}><b>Getekend</b> · Fam. Jansen, 15:10</Regel>
        </Kaart>
      </div>
    </Beeld>
  )
}

function WbMeerwerk() {
  return (
    <Beeld b={520} h={260}>
      <div style={{ position: "relative", width: 520, height: 260 }}>
        <Kaart w={380} style={{ position: "absolute", left: 0, top: 0 }}>
          <Kop links="Taken" rechts="3 van 4" />
          <span className="fp-taak"><i className="fp-box aan">{HI.check}</i><s>Houtrot uitboren</s></span>
          <span className="fp-taak"><i className="fp-box aan">{HI.check}</i><s>Plamuren en aflakken</s></span>
          <span className="fp-taak meerwerk"><i className="fp-box aan">{HI.check}</i><span><b>Tochtstrips 2 ramen</b><small>Aparte taak · geen prijs op de werkbon</small></span><Pil kl="warn">Meerwerk</Pil></span>
          <span className="fp-taak"><i className="fp-box" />Hang- en sluitwerk nalopen</span>
          <Regel ico={HI.pen}><b>Gezien en getekend</b> door Fam. Jansen, inclusief het meerwerk</Regel>
        </Kaart>
        <Kaart w={262} className="fp-waarsch" style={{ position: "absolute", right: 0, bottom: 0 }}>
          <span className="fp-staplabel oranje"><Rond kl="oranje">{HI.warn}</Rond>Waarschuwing per mail</span>
          <b>Ondergrond onder het raam is niet deugdelijk</b>
          <small>Gevolg: de laklaag kan loslaten. Verstuurd di 29 sep 11:20, vastgelegd op de werkbon.</small>
        </Kaart>
      </div>
    </Beeld>
  )
}

function FactuurRegel({ t, bedrag, extra }) {
  return <span className={`fp-fregel${extra ? " extra" : ""}`}><span>{extra ? <i className="fp-ico oranje">{HI.plus}</i> : <Vink />}{t}</span><b>{bedrag}</b></span>
}

function WbFactuur() {
  return (
    <Beeld b={560} h={250}>
      <div className="fp-flex" style={{ width: 560 }}>
        <Stap ico={HI.clipboard} kl="groen" label="Werkbon" titel="Kozijnen voorgevel" style={{ width: 210, flex: "none" }}>
          <span><Vink />Getekend door de klant</span><span><i className="fp-ico oranje">{HI.plus}</i>Meerwerk: tochtstrips</span><span><i className="fp-ico oranje">{HI.plus}</i>Extra materiaal: 2 strips</span>
        </Stap>
        <Pijl klein />
        <Kaart style={{ flex: 1 }}>
          <div className="fp-wie"><span className="fp-staplabel oranje"><Rond kl="oranje">{HI.euro}</Rond>Factuur BB-F-13</span><Pil kl="blauw">Uit offerte OF-2026-048</Pil></div>
          <FactuurRegel t="Schilderwerk gevel · 40 uur" bedrag="€ 2.400,00" />
          <FactuurRegel t="Verf en materialen" bedrag="€ 650,00" />
          <FactuurRegel t="Reiskosten · 120 km" bedrag="€ 90,00" />
          <FactuurRegel t="Meerwerk: tochtstrips 2 ramen" bedrag="€ 180,00" extra />
          <FactuurRegel t="Extra materiaal: tochtstrips" bedrag="€ 24,00" extra />
          <small className="fp-noot">Offerteregels overgenomen; meerwerk en extra materiaal zelf toegevoegd.</small>
        </Kaart>
      </div>
    </Beeld>
  )
}

function WbVakmensen() {
  const vak = [[HI.wrench, "Installateur", "Een storing: wat is er gevonden, wat is vervangen, en de klant tekent."], [HI.roller, "Schilder", "Een schilderklus met meerwerk dat de klant gezien heeft."], [HI.hammer, "Aannemer of klusbedrijf", "Een verbouwing die meerdere dagen duurt, met per dag een eigen ploeg."]]
  return (
    <Beeld b={560} h={170}>
      <div className="fp-flex" style={{ width: 560, alignItems: "stretch" }}>
        {vak.map(([ico, naam, klus]) => <Kaart key={naam} className="fp-vakkaart" style={{ flex: 1 }}><i className="hv-tegel">{ico}</i><b>{naam}</b><small>{klus}</small></Kaart>)}
      </div>
    </Beeld>
  )
}

/* ── Planning ── */
function PlAgenda() {
  return (
    <Beeld b={560} h={250}>
      <div className="fp-flex" style={{ width: 560, alignItems: "stretch" }}>
        <Kaart w={230} style={{ flex: "none" }}>
          <div className="fp-wie"><Pil kl="blauw">Alleen</Pil><small>Agenda · elk pakket</small></div>
          <b className="fp-titel">Dinsdag 29 sep</b>
          <span className="fp-tijd"><small>08:00</small><Blokje kl="g">Werkbon · Kozijnen voorgevel, Jansen</Blokje></span>
          <span className="fp-tijd"><small>13:00</small><Blokje kl="b">Afspraak · opname Fam. de Vries</Blokje></span>
          <span className="fp-tijd"><small>16:00</small><Blokje kl="g">Werkbon · Schuur schilderen, Bakker</Blokje></span>
          <small className="fp-noot">Je afspraken en ingeplande werkbonnen, in één lijst.</small>
        </Kaart>
        <Kaart style={{ flex: 1 }}>
          <div className="fp-wie"><Pil>Met een team</Pil><small>Planningsmodule · Team, of module bij Groei</small></div>
          <div className="fp-rooster">
            <span /><span className="kop">Ma</span><span className="kop">Di</span><span className="kop">Wo</span>
            <span className="wie">{HI.user}Thomas</span><Blokje kl="g">Kozijnen</Blokje><Blokje kl="g">Kozijnen</Blokje><Leeg />
            <span className="wie">{HI.user}Sven</span><Blokje kl="g">Schuur</Blokje><Leeg /><Blokje kl="b">Storing cv</Blokje>
            <span className="wie">{HI.truck}Bus 2</span><Blokje kl="o">Thomas</Blokje><Blokje kl="o">Thomas</Blokje><Blokje kl="o">Sven</Blokje>
          </div>
          <small className="fp-noot">Wie gaat waarheen, met welke bus: elke week in één overzicht.</small>
        </Kaart>
      </div>
    </Beeld>
  )
}

function PlWerkbon() {
  return (
    <Beeld b={560} h={250}>
      <div className="fp-flex" style={{ width: 560 }}>
        <Kaart w={250} style={{ flex: "none" }}>
          <Kop links="Planning · Thomas" rechts={HI.grip} />
          <div className="fp-rooster twee">
            <span className="kop">Di 29 sep</span><span className="kop">Wo 30 sep</span>
            <Leeg>verplaatst</Leeg>
            <Blokje kl="g" style={{ padding: "7px 8px", fontWeight: 700, boxShadow: "0 6px 14px rgba(13,13,13,0.12)" }}>Kozijnen voorgevel<br /><span style={{ fontWeight: 500 }}>08:00 – 15:00 · bus 2</span></Blokje>
          </div>
          <small className="fp-noot"><span className="fp-naar">{HI.arrow}</span>Gesleept van dinsdag naar woensdag</small>
        </Kaart>
        <Pijl klein />
        <Kaart style={{ flex: 1 }}>
          <div className="fp-wie"><span className="fp-staplabel groen"><Rond>{HI.clipboard}</Rond>Werkbon</span><Pil kl="warn">In uitvoering</Pil></div>
          <b className="fp-titel">Kozijnen voorgevel · Fam. Jansen</b>
          <span className="fp-punt"><i className="fp-ico">{HI.calendar}</i><span><b>wo 30 sep</b>, 08:00 – 15:00 · schuift mee</span></span>
          <span className="fp-punt"><i className="fp-ico">{HI.check}</i>Taken: houtrot uitboren, plamuren, aflakken</span>
          <span className="fp-punt"><i className="fp-ico">{HI.clock}</i>Uren geboekt: Thomas 6:00</span>
          <span className="fp-punt"><i className="fp-ico">{HI.pakket}</i>Materiaal: 2 tochtstrips</span>
        </Kaart>
      </div>
    </Beeld>
  )
}

function PlWeek() {
  const dag = (naam, blokken) => <div key={naam} className="fp-dag"><span className="kop">{naam}</span>{blokken}</div>
  return (
    <Beeld b={560} h={250}>
      <div style={{ position: "relative", width: 520 }}>
        <Kaart w={520}>
          <Kop links="Week 40 · Sven" rechts={<span className="fp-legenda"><span><i className="vast" />vast</span><span><i className="vrij" />ruimte voor spoed</span></span>} />
          <div className="fp-rooster vijf">
            {dag("Ma", <><Blokje kl="g">Schuur schilderen · Bakker</Blokje><Blokje kl="g">Schuur schilderen</Blokje></>)}
            {dag("Di", <><Blokje kl="b">Opname Fam. de Vries</Blokje><Leeg>vrij</Leeg></>)}
            {dag("Wo", <><Blokje kl="g">Storing cv · Peters</Blokje><Leeg>vrij</Leeg></>)}
            {dag("Do", <><Blokje kl="g">Kozijnen · Jansen</Blokje><Leeg /></>)}
            {dag("Vr", <><Blokje kl="g">Kozijnen · Jansen</Blokje><Leeg>vrij</Leeg></>)}
          </div>
        </Kaart>
        <Kaart w={236} className="fp-spoed" style={{ position: "absolute", right: -40, bottom: -22, transform: "rotate(2deg)" }}>
          <span className="fp-staplabel oranje"><Rond kl="oranje">{HI.zap}</Rond>Spoed · vandaag</span>
          <b>Lekkage keuken · Fam. Smit</b>
          <small>Past in het vrije vak van donderdag, 13:00.</small>
        </Kaart>
      </div>
    </Beeld>
  )
}

/* ── Urenregistratie ── */
function UrTwee() {
  return (
    <Beeld b={560} h={250}>
      <div className="fp-flex" style={{ width: 560, alignItems: "stretch" }}>
        <Kaart style={{ flex: 1 }}>
          <div className="fp-wie"><Pil kl="blauw">Werkdag · urenpagina</Pil><small>voor loon</small></div>
          <b className="fp-titel">Thomas · di 29 sep</b>
          <small>07:30 – 16:30 · pauze 0:30 · 18 km</small>
          <Regel ico={HI.car} rechts="1:30">Reizen en materiaal halen</Regel>
          <Regel ico={HI.clipboard} rechts="6:00">Kozijnen voorgevel · Jansen</Regel>
          <Regel ico={HI.clipboard} rechts="1:00">Schuur schilderen · Bakker</Regel>
          <span className="fp-som"><span>Werkdag · eind min begin min pauze</span><b>8:30</b></span>
        </Kaart>
        <Kaart w={236} style={{ flex: "none" }}>
          <div className="fp-wie"><Pil>Op de klus · werkbon</Pil></div>
          <b className="fp-titel">Kozijnen voorgevel</b>
          <small>Fam. Jansen · voor je nacalculatie</small>
          <Regel ico={HI.clock} rechts="6:00">Thomas · di 29 sep</Regel>
          <Regel ico={HI.clock} rechts="4:30">Sven · di 29 sep</Regel>
          <span className="fp-som"><span>Op de klus</span><b className="groen">10:30</b></span>
        </Kaart>
      </div>
    </Beeld>
  )
}

function UrInzicht() {
  return (
    <Beeld b={520} h={250}>
      <Kaart w={520}>
        <Kop links="Project · Kozijnen voorgevel" rechts={<Pil kl="warn">{HI.warn}85% van begroot</Pil>} />
        <div className="fp-vakken drie"><Vak naam="Begroot" waarde="40 u" /><Vak naam="Geregistreerd" waarde="34 u" /><Vak naam="Resterend" waarde="6 u" /></div>
        <div className="fp-balk"><i style={{ width: "85%" }} /><em style={{ left: "80%" }} /><em className="rood" style={{ left: "100%" }} /></div>
        <div className="fp-balk-as"><span>0</span><span className="oranje">waarschuwing bij 80%</span><span className="rood">en bij 100%</span></div>
        <div className="fp-deal rij"><i className="hv-tegel hf-tegel-klein">{HI.euro}</i><span><b>Gefactureerd € 3.511</b> tegenover materiaal € 674 en projectkosten € 90</span><Pil kl="grijs">Groei en Team</Pil></div>
      </Kaart>
    </Beeld>
  )
}

/* ── Facturen ── */
function BtwRegel({ t, btw, bedrag, extra }) {
  return <span className={`fp-fregel btw${extra ? " extra" : ""}`}><span>{extra ? <i className="fp-ico oranje">{HI.plus}</i> : <Vink />}{t}</span><small>{btw}</small><b>{bedrag}</b></span>
}

function FaAkkoord() {
  return (
    <Beeld b={560} h={250}>
      <div className="fp-flex" style={{ width: 560 }}>
        <Stap ico={HI.file} kl="groen" label="Offerte" titel="OF-2026-048" style={{ width: 200, flex: "none" }}>
          <span><i className="fp-ico">{HI.pen}</i>Geaccepteerd · Fam. de Vries</span><span><Vink />3 regels, btw per regel</span><span><Vink />€ 3.511,40 incl. btw</span>
        </Stap>
        <Pijl klein />
        <Kaart style={{ flex: 1 }}>
          <div className="fp-wie"><span className="fp-staplabel oranje"><Rond kl="oranje">{HI.euro}</Rond>Factuur BB-F-13</span><Pil kl="blauw">Klant en regels overgenomen</Pil></div>
          <BtwRegel t="Schilderwerk gevel · 40 uur" btw="9%" bedrag="€ 2.400,00" />
          <BtwRegel t="Verf en materialen" btw="21%" bedrag="€ 650,00" />
          <BtwRegel t="Reiskosten · 120 km" btw="21%" bedrag="€ 90,00" />
          <BtwRegel t="Meerwerk: tochtstrips 2 ramen" btw="21%" bedrag="€ 180,00" extra />
          <small className="fp-noot">Meerwerk en extra materiaal voeg je zelf toe als regel.</small>
        </Kaart>
      </div>
    </Beeld>
  )
}

function FaBetaald() {
  const stap = (ico, kl, titel, sub, pil) => (
    <span className="fp-tl-stap" key={titel}><Rond kl={kl}>{ico}</Rond><span><b>{titel}</b><small>{sub}</small></span>{pil}</span>
  )
  return (
    <Beeld b={520} h={270}>
      <Kaart w={520}>
        <Kop links="Factuur BB-F-13 · € 3.511,40" rechts="Vervaldatum 15 okt" />
        <div className="fp-tl">
          {stap(HI.send, "blauw", "Verstuurd per mail, met PDF en betaallink", "1 okt · BossBase volgt de vervaldatum")}
          {stap(HI.mail, "oranje", "Herinnering 1 · 7 dagen na de vervaldatum", "Met één klik, of automatisch in Groei en Team", <Pil kl="grijs">Tekst zelf aan te passen</Pil>)}
          {stap(HI.mail, "grijs", "Herinnering 2 · 14 dagen na de vervaldatum", "Alleen als er nog niet betaald is")}
          {stap(HI.card, "groen", "Betaald via iDEAL", "Bevestiging met PDF voor klant en jou · factuur op betaald", <Pil>Betaald</Pil>)}
        </div>
      </Kaart>
    </Beeld>
  )
}

function FaBoekhouding() {
  return (
    <Beeld b={560} h={230}>
      <div className="fp-flex" style={{ width: 560 }}>
        <Kaart w={190} style={{ flex: "none" }}>
          <span className="fp-staplabel groen"><Rond>{HI.euro}</Rond>Facturen</span>
          <span className="fp-som klein"><span>BB-F-13</span><Pil>Betaald</Pil></span>
          <span className="fp-som klein"><span>BB-F-12</span><Pil>Betaald</Pil></span>
          <span className="fp-som klein"><span>BB-F-11</span><Pil kl="blauw">Verstuurd</Pil></span>
        </Kaart>
        <Pijl klein />
        <div className="fp-kolom" style={{ flex: 1 }}>
          <Kaart className="fp-logo"><img src="/brand/moneybird.svg" alt="Moneybird" width="159" height="26" style={{ height: 22 }} /><span><Vink />Facturen doorgezet naar je administratie</span></Kaart>
          <Kaart className="fp-logo"><img src="/brand/snelstart.svg" alt="SnelStart" width="158" height="26" style={{ height: 22 }} /><span><Vink />Als verkoopboeking, met de PDF erbij</span></Kaart>
          <small>Wat er precies wordt uitgewisseld, verschilt per pakket.</small>
        </div>
      </div>
    </Beeld>
  )
}

/* ── Per pagina ── */
export const PAGINAS = {
  "/klantbeheer": {
    onderwerp: "klantbeheer", h1Accent: "op één plek",
    iconen: ["users", "kanban", "bell", "chart", "truck", "download"],
    verhalen: [KbBerichten, KbKlantkaart, KbPipeline],
  },
  "/offertes": {
    onderwerp: "offertes", h1Accent: "online laten ondertekenen",
    iconen: ["list", "brush", "pen", "copy", "euro", "chart"],
    verhalen: [OfGoedkeuren, OfOpvolgen, OfNaAkkoord],
  },
  "/werkbonnen": {
    onderwerp: "werkbonnen", h1Accent: "ter plekke tekent",
    iconen: ["clipboard", "plus", "camera", "clock", "pen", "file"],
    verhalen: [WbPapier, WbMeerwerk, WbFactuur, WbVakmensen],
  },
  "/planning": {
    onderwerp: "planning", h1Accent: "medewerker en voertuig",
    iconen: ["calendar", "layers", "warn", "users", "bell", "truck"],
    verhalen: [PlAgenda, PlWerkbon, PlWeek],
  },
  "/urenregistratie": {
    onderwerp: "urenregistratie", h1Accent: "werkdag en per klus",
    iconen: ["clock", "clipboard", "chart", "filter"], kolommen: 4,
    verhalen: [UrTwee, UrInzicht],
  },
  "/facturen": {
    onderwerp: "facturen", h1Accent: "en sneller betaald worden",
    iconen: ["file", "list", "send", "mail", "card", "zap"],
    verhalen: [FaAkkoord, FaBetaald, FaBoekhouding],
  },
}

// Foto's bij 'Verder lezen' (zelfde als op de homepage en de functiepagina).
export const FOTOS = {
  "/kennisbank/wat-moet-er-op-een-werkbon-staan": "/kennisbank/kennisbank-werkbon.webp",
  "/kennisbank/offerte-maken-vakbedrijf": "/kennisbank/kennisbank-offerte.webp",
  "/kennisbank/betalingsherinnering-sturen": "/kennisbank/kennisbank-herinnering.webp",
  "/kennisbank/wat-moet-er-op-een-factuur": "/kennisbank/kennisbank-herinnering.webp",
  "/kennisbank/nacalculatie-vakbedrijf": "/kennisbank/afsluiting-ondernemers.webp",
  "/werkbonnen": "/screens/werkbon.webp",
  "/planning": "/screens/planning.webp",
  "/voor-wie/hoveniers": "/kennisbank/kennisbank-herinnering.webp",
  "/offertes": "/kennisbank/kennisbank-offerte.webp",
  "/facturen": "/kennisbank/kennisbank-herinnering.webp",
}
