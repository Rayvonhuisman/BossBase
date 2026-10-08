// Voor wie (/voor-wie), herontwerp 2026 in de stijl van de homepage. Ontwerp:
// Claude Design, artboard "Voor wie". Eén keuze (zzp'er of bedrijf met team)
// stuurt het keuzepaneel in de kop én het blok eronder. De branches staan als
// stapel: één kaart in beeld; bij het scrollen schuift de voorste naar boven weg
// en komt de volgende tevoorschijn (scrollvoortgang, zie Branches). Alleen bevestigde functies; de teksten komen
// overeen met de branchepagina's onder /voor-wie/*.
// Stijlen: fp-* (gedeeld) en vw-* in bossbase-mkt.css.
import { useEffect, useRef, useState } from 'react';
import { Nav, Footer } from './MktShared';
import { HI, useGa, Faq, Afsluiting } from './HvBlokken';
import { Kruimelpad } from '../../marketing/templates/Onderdelen.jsx';
import { docVoorPad } from '../../marketing/routes.jsx';

const KRUIMELS = [{ naam: 'Home', pad: '/' }, { naam: 'Voor wie', pad: '/voor-wie' }];

// De vier vakgebieden in het keuzepaneel, met per situatie één of twee punten.
const VAKKEN = [
  { id: 'installateur', naam: 'Installateurs', tag: 'Storingen, onderhoud en installaties', icoon: 'wrench', href: '/voor-wie/installateurs', kort: 'installateurs',
    zzp: ['Klant tekent via een link op zijn telefoon', 'Werkbon met materiaal, foto\'s en uren'],
    bedrijf: ['Planning per monteur en bus, zonder dubbele boekingen', 'Inkoopprijzen afgeschermd voor monteurs (Team)'] },
  { id: 'schilder', naam: 'Schilders', tag: 'Schilderwerk en afwerking', icoon: 'roller', href: '/voor-wie/schilders', kort: 'schilders',
    zzp: ['Offerte met je eigen logo, online akkoord', 'Meerwerk op de werkbon, afgetekend'],
    bedrijf: ['Meerdaagse werkbonnen, eigen ploeg per dag', 'Uren per werkdag en per klus, voor loon en nacalculatie'] },
  { id: 'hovenier', naam: 'Hoveniers', tag: 'Tuinaanleg en onderhoud', icoon: 'leaf', href: '/voor-wie/hoveniers', kort: 'hoveniers',
    zzp: ['Agenda met afspraakherinnering per mail', 'Materiaal met inkoopprijs op de werkbon'],
    bedrijf: ['Ploegen en bussen plannen in het seizoen', 'Waarschuwing bij 80% en 100% van de begrote uren'] },
  { id: 'aannemer', naam: 'Aannemers en klusbedrijven', tag: 'Bouw, verbouw en renovatie', icoon: 'hammer', href: '/voor-wie/aannemers-en-klusbedrijven', kort: 'aannemers en klusbedrijven',
    zzp: ['Zien welke facturen nog openstaan', 'Btw verlegd per factuurregel'],
    bedrijf: ['Uren en kosten per project, marge in beeld', 'Project met offerte, werkbonnen en facturen'] },
];

const SITUATIES = {
  zzp: {
    label: 'ZZP\'er', icoon: 'user', kicker: 'Voor zzp\'ers', titel: 'Jij bent je eigen baas.',
    kort: 'Jij bent je eigen baas: geen personeel, wel alle verantwoordelijkheid. Kies je vak en zie wat BossBase voor je doet.',
    tekst: 'Geen personeel, maar wel alle verantwoordelijkheid. BossBase houdt je administratie bij elkaar, zodat jij kunt werken.',
    punten: [
      ['pen', 'Offertes met je eigen logo', 'Versturen per mail, online laten ondertekenen in Groei en Team.'],
      ['calendar', 'Agenda met herinneringen', 'Je klant krijgt vooraf een afspraakherinnering per mail.'],
      ['chart', 'Zien wat er openstaat', 'Welke facturen betaald zijn, en welke nog niet.'],
      ['users', 'Klanten op één plek', 'Alle klantinfo en historie, snel terug te vinden.'],
    ],
    cta: 'Ga als zzp\'er aan de slag',
  },
  bedrijf: {
    label: 'Bedrijf met team', icoon: 'users', kicker: 'Voor bedrijven', titel: 'Je hebt een team en meerdere klussen tegelijk.',
    kort: 'Je hebt een team en meerdere klussen tegelijk. BossBase houdt iedereen op de hoogte en het overzicht compleet. Kies je vak.',
    tekst: 'BossBase houdt iedereen op de hoogte en het overzicht compleet: wie doet wat, waar, en wat het oplevert.',
    punten: [
      ['users', 'Rollen en rechten', 'Per medewerker bepalen wat hij ziet en doet (Team).'],
      ['kanban', 'Pipeline van aanvraag tot betaling', 'Elke klus in beeld, van aanvraag tot betaalde factuur.'],
      ['truck', 'Planning per medewerker en bus', 'Weekoverzicht met waarschuwing bij dubbel inplannen.'],
      ['clock', 'Uren per werkdag en per klus', 'Voor je loonadministratie en je nacalculatie.'],
    ],
    cta: 'Ga als bedrijf aan de slag',
  },
};

// De stapel: per vak wat herkenbaar is en wat BossBase doet (uit de branchepagina's).
const BRANCHES = [
  { icoon: 'wrench', naam: 'Installateurs, loodgieters en elektriciens', tag: 'Storingen, onderhoud en installaties', href: '/voor-wie/installateurs', link: 'Zo werkt BossBase voor installateurs',
    intro: 'Veel korte klussen op een dag, materiaal dat pas op locatie duidelijk wordt, en een klant die wil zien wat er is gedaan.',
    pijn: ['Gebruikt materiaal komt niet op de factuur', 'Papieren bonnen komen pas eind van de week binnen', 'Klant niet thuis op de afspraak'],
    doet: ['Werkbon met materiaal, foto\'s en uren', 'Klant tekent ter plekke of via een link', 'Afspraakherinnering per mail aan de klant'] },
  { icoon: 'roller', naam: 'Schilders en stukadoors', tag: 'Schilderwerk en afwerking', href: '/voor-wie/schilders', link: 'Zo werkt BossBase voor schilders',
    intro: 'Alles staat of valt met de offerte, en met wat er gebeurt als je onderweg iets tegenkomt dat er niet in stond.',
    pijn: ['Discussie over meerwerk achteraf', 'Offertes die blijven liggen', 'Klussen van meerdere dagen overzien'],
    doet: ['Meerwerk op de werkbon, afgetekend door de klant', 'Offerte online ondertekenen (Groei en Team)', 'Meerdaagse werkbonnen met eigen ploeg per dag'] },
  { icoon: 'leaf', naam: 'Hoveniers en groenvoorziening', tag: 'Tuinaanleg en onderhoud', href: '/voor-wie/hoveniers', link: 'Zo werkt BossBase voor hoveniers',
    intro: 'In het seizoen wil iedereen tegelijk. Dan draait het om planning: welke ploeg, welke bus, welke tuin.',
    pijn: ['Ploegen en bussen plannen in de piek', 'Een aanleg die uitloopt', 'Materiaalkosten per tuin uit het oog'],
    doet: ['Planning per medewerker en bus (Team of module)', 'Waarschuwing bij 80% en 100% van de begrote uren', 'Materiaal met inkoopprijs op de werkbon'] },
  { icoon: 'hammer', naam: 'Aannemers en klusbedrijven', tag: 'Bouw, verbouw en renovatie', href: '/voor-wie/aannemers-en-klusbedrijven', link: 'Zo werkt BossBase voor aannemers en klusbedrijven',
    intro: 'Een verbouwing is een project: meerdere dagen, meerdere mensen, soms onderaannemers, en keuzes onderweg.',
    pijn: ['Veel werkbonnen onder één project', 'Waarschuwingen aan de klant niet vastgelegd', 'Btw verlegd bij onderaanneming'],
    doet: ['Project met offerte, werkbonnen en facturen', 'Waarschuwing per mail vanuit de werkbon, vastgelegd', 'Btw-regime per factuurregel, ook verlegd'] },
  { icoon: 'sparkles', naam: 'Schoonmaakbedrijven', tag: 'Schoonmaak en facilitair', href: '/functies', link: 'Bekijk alle functies',
    intro: 'Klanten, offertes, werkbonnen met handtekening en facturen. Eerlijk is eerlijk: vaste schema\'s die zichzelf elke week herhalen en automatische maandfacturen zitten er niet in.',
    pijn: ['Klantgegevens verspreid over lijstjes', 'Offertes en facturen in losse bestanden', 'Afspraken met klanten niet vastgelegd'],
    doet: ['Klantkaart met historie en notities', 'Offertes en facturen met je eigen logo', 'Werkbon met handtekening van de klant'] },
];

const VRAGEN = [
  ['Kunnen mijn medewerkers op hun telefoon werken?', 'Het dashboard werkt op een scherm vanaf 768 pixels breed, zoals een tablet of laptop. Op een smalle telefoon niet, en er is geen app. De klant kan wel op elke telefoon tekenen via een link.'],
  ['Kan ik terugkerend onderhoud automatisch inplannen?', 'Nee, terugkerende afspraken automatisch aanmaken kan niet. Je plant elk onderhoudsbezoek als werkbon in.'],
  ['Welk pakket heb ik nodig voor ploegen en bussen?', 'De planningsmodule en voertuigen zitten in Team. Bij Groei neem je ze erbij: planning € 10 en voertuigen € 5 per maand. Let op: bij Groei zijn maximaal 2 gebruikers mogelijk.'],
  ['Rekent de nacalculatie de loonkosten mee?', 'Nee. Je ziet gefactureerd tegenover materiaal en projectkosten, en de uren als aantal (begroot, geregistreerd, resterend). Loonkosten reken je er zelf bij.'],
];

// Eén kennisbankartikel per vakgebied.
const LEZEN = [
  { href: '/kennisbank/wat-moet-er-op-een-werkbon-staan', titel: 'Wat moet er op een werkbon staan?', tekst: 'Checklist en een ingevuld voorbeeld.', foto: '/kennisbank/kennisbank-werkbon.webp' },
  { href: '/kennisbank/offerte-maken-vakbedrijf', titel: 'Een offerte maken als vakbedrijf', tekst: 'Stappenplan met een uitgewerkt voorbeeld.', foto: '/kennisbank/kennisbank-offerte.webp' },
  { href: '/kennisbank/medewerkers-en-klussen-plannen', titel: 'Meerdere medewerkers en klussen plannen', tekst: 'Een weekplanning opzetten die overeind blijft.', foto: '/screens/planning.webp' },
  { href: '/kennisbank/nacalculatie-vakbedrijf', titel: 'Nacalculatie voor kleine vakbedrijven', tekst: 'Verdien je wat je dacht? Met rekenvoorbeeld.', foto: '/kennisbank/afsluiting-ondernemers.webp' },
];

function Schakelaar({ situatie, onKies, klein }) {
  return (
    <div className={`vw-schakel${klein ? ' klein' : ''}`} role="group" aria-label="Kies je situatie">
      {Object.entries(SITUATIES).map(([id, s]) => (
        <button key={id} type="button" className={situatie === id ? 'actief' : undefined} aria-pressed={situatie === id} onClick={() => onKies(id)}>
          {HI[s.icoon]}{s.label}
        </button>
      ))}
    </div>
  );
}

function Kop({ situatie, setSituatie, vak, setVak, navigate }) {
  const go = useGa(navigate);
  const s = SITUATIES[situatie];
  const gekozen = VAKKEN.find(v => v.id === vak) || VAKKEN[0];
  return (
    <header className="hv-hero fp-hero vw-hero">
      <div className="hv-hero-bg" aria-hidden="true">
        <span className="hv-glow-a" /><span className="hv-glow-b" /><span className="hv-ring-a" /><span className="hv-ring-b" /><span className="hv-floor" />
      </div>
      <div className="container fp-hero-in">
        <div className="fp-hero-copy">
          <Kruimelpad items={KRUIMELS} />
          <span className="hv-kicker">Voor wie</span>
          <h1><span>Gebouwd voor de</span><span className="hv-groen">handen die Nederland laten draaien.</span></h1>
          <p className="fp-lead">Installateurs, schilders, hoveniers, aannemers en klusbedrijven. Of je nu zzp&apos;er bent of een bedrijf met een team: kijk per vak hoe je met BossBase werkt.</p>
          <div className="hv-ctas">
            <a href="/register" className="hv-btn hv-btn-p hv-btn-lg" onClick={e => go(e, '/register')}>Start nu gratis {HI.arrow}</a>
            <a href="/prijzen" className="hv-btn hv-btn-s hv-btn-lg" onClick={e => go(e, '/prijzen')}>Bekijk prijzen</a>
          </div>
          <p className="fp-noot-kop"><i>{HI.check}</i>14 dagen gratis met alle functies. Geen betaalgegevens nodig.</p>
        </div>

        <div className="vw-paneel-wrap">
          <div className="vw-paneel">
            <div className="vw-paneel-h">
              <span className="vw-label">Kies je situatie</span>
              <Schakelaar situatie={situatie} onKies={setSituatie} />
            </div>
            <p className="vw-paneel-tekst">{s.kort}</p>
            <div className="vw-tegels">
              {VAKKEN.map(v => {
                const actief = v.id === gekozen.id;
                const punten = actief ? v[situatie] : v[situatie].slice(0, 1);
                return (
                  <button key={v.id} type="button" className={`vw-tegel${actief ? ' gekozen' : ''}`} aria-pressed={actief} onClick={() => setVak(v.id)}>
                    {actief && <i className="vw-vink" aria-hidden="true">{HI.check}</i>}
                    <span className="vw-tegel-h"><span className="vw-tegel-ico">{HI[v.icoon]}</span><span><b>{v.naam}</b><small>{v.tag}</small></span></span>
                    <span className="vw-tegel-punten">{punten.map(p => <span key={p}>{HI.check}{p}</span>)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <a href={gekozen.href} className="hv-chip hf-chip-zwart vw-pil" onClick={e => go(e, gekozen.href)}><i>{HI.arrow}</i>Zo werkt BossBase voor {gekozen.kort}</a>
        </div>
      </div>
    </header>
  );
}

function Situatie({ situatie, setSituatie, navigate }) {
  const go = useGa(navigate);
  const s = SITUATIES[situatie];
  return (
    <section className="hv-sectie hv-sectie-wit fp-blok" id="situatie">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">{s.kicker}</span>
            <h2>{s.titel}</h2>
            <p>{s.tekst}</p>
          </div>
          <Schakelaar situatie={situatie} onKies={setSituatie} klein />
        </div>
        <div className="fp-kaarten vier">
          {s.punten.map(([icoon, titel, tekst]) => (
            <div key={titel} className="hv-functie-kaart">
              <span className="hv-tegel">{HI[icoon]}</span>
              <h3>{titel}</h3>
              <p>{tekst}</p>
            </div>
          ))}
        </div>
        <div className="vw-cta-rij">
          <a href="/register" className="hv-btn hv-btn-p hv-btn-lg" onClick={e => go(e, '/register')}>{s.cta} {HI.arrow}</a>
          <span>14 dagen gratis met alle functies. Geen betaalgegevens nodig.</span>
        </div>
      </div>
    </section>
  );
}

// De stapel: een venster dat bij het scrollen op zijn plek blijft (sticky). Daarin
// staan de bloktitel en de kaarten; de kaarten liggen op elkaar, de eerste bovenop. Per STAP pixels scrollen schuift
// de voorste kaart onder de titel weg en komt de volgende naar voren. Op een smal
// scherm en bij "minder beweging" staan de kaarten gewoon onder elkaar (CSS).
const STAP = 420;      // scrollafstand per kaart
const KAART_H = 340;   // hoogte van het venster, ruim boven de hoogste kaart
const BOVEN = 96;      // afstand tot de bovenrand, onder de navigatie

function Branches({ navigate }) {
  const go = useGa(navigate);
  const ref = useRef(null);
  const vensterRef = useRef(null);
  const [s, setS] = useState(0);
  const [vensterH, setVensterH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const meet = () => {
      raf = 0;
      setS(Math.max(0, BOVEN - el.getBoundingClientRect().top));
      if (vensterRef.current) setVensterH(vensterRef.current.offsetHeight);
    };
    const plan = () => { if (!raf) raf = requestAnimationFrame(meet); };
    meet();
    window.addEventListener('scroll', plan, { passive: true });
    window.addEventListener('resize', plan);
    return () => { window.removeEventListener('scroll', plan); window.removeEventListener('resize', plan); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const n = BRANCHES.length;
  return (
    <section className="hv-sectie hv-sectie-creme" id="branches">
      <div className="container">
        <div className="vw-stapel" ref={ref} style={{ '--stapel-h': `${(n - 1) * STAP + (vensterH || KAART_H + 230) + 40}px`, '--venster-h': `${KAART_H}px`, '--boven': `${BOVEN}px` }}>
          <div className="vw-venster" ref={vensterRef}>
            <div className="hv-kop">
              <span className="hv-kicker">Per branche</span>
              <h2>Speciaal voor jouw vakgebied.</h2>
              <p>Herkenbare problemen per vak, en wat BossBase eraan doet. Scroll door de vakken; elk vak heeft een eigen pagina met de volledige uitleg.</p>
            </div>
            <div className="vw-kaarten">
            {BRANCHES.map((b, i) => {
              const weg = i === n - 1 ? 0 : Math.min(1, Math.max(0, (s - i * STAP) / STAP));
              const diepte = Math.min(3, Math.max(0, i - s / STAP));
              const stijl = {
                '--y': `${Math.round(diepte * 16 - weg * (KAART_H + 60))}px`,
                '--schaal': (1 - diepte * 0.035).toFixed(3),
                zIndex: n - i,
              };
              const verborgen = weg >= 1;
              return (
                <a key={b.naam} href={b.href} className={`vw-vak${verborgen ? ' weg' : ''}`} style={stijl} tabIndex={verborgen ? -1 : undefined} aria-hidden={verborgen || undefined} onClick={e => go(e, b.href)}>
                  <span className="vw-vak-kop">
                    <span className="vw-vak-h"><span className="hv-tegel hv-tegel-groot">{HI[b.icoon]}</span><span><b>{b.naam}</b><small>{b.tag}</small></span></span>
                    <span className="vw-vak-intro">{b.intro}</span>
                    <span className="hv-link">{b.link} {HI.arrow}</span>
                  </span>
                  <span className="vw-vak-kolom">
                    <span className="vw-label">Herkenbaar</span>
                    <ul>{b.pijn.map(t => <li key={t}><i className="hf-rond rood">{HI.x}</i>{t}</li>)}</ul>
                  </span>
                  <span className="vw-vak-kolom">
                    <span className="vw-label">Met BossBase</span>
                    <ul>{b.doet.map(t => <li key={t}><i className="hf-rond groen">{HI.check}</i>{t}</li>)}</ul>
                  </span>
                </a>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Lezen({ navigate }) {
  const go = useGa(navigate);
  return (
    <section className="hv-sectie hv-sectie-creme fp-blok" id="lezen">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Verder lezen</span>
            <h2>Verder lezen voor vakbedrijven</h2>
            <p>Eén artikel uit de kennisbank per vakgebied: werkbonnen, offertes, planning en nacalculatie.</p>
          </div>
          <a href="/kennisbank" className="hv-link" onClick={e => go(e, '/kennisbank')}>Alle artikelen {HI.arrow}</a>
        </div>
        <div className="fp-lezen">
          {LEZEN.map(k => {
            const doc = docVoorPad(k.href);
            return (
              <a key={k.href} href={k.href} className="hv-artikel" onClick={e => go(e, k.href)}>
                <img src={k.foto} alt="" width="640" height="360" loading="lazy" decoding="async" />
                <span className="hv-artikel-body">
                  <span className="hv-artikel-meta">
                    <span className="hv-badge hv-badge-ok">Kennisbank</span>
                    {doc?.leestijd && <small>{doc.leestijd} min lezen</small>}
                  </span>
                  <h3>{k.titel}</h3>
                  <p>{k.tekst}</p>
                  <span className="hv-link">Lees verder {HI.arrow}</span>
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function IndustriesPage({ navigate }) {
  const [situatie, setSituatie] = useState('zzp');
  const [vak, setVak] = useState('schilder');
  return (
    <div className="bm hv fp vw">
      <Nav navigate={navigate} />
      <main>
        <Kop situatie={situatie} setSituatie={setSituatie} vak={vak} setVak={setVak} navigate={navigate} />
        <Situatie situatie={situatie} setSituatie={setSituatie} navigate={navigate} />
        <Branches navigate={navigate} />
        <Faq navigate={navigate} items={VRAGEN} titel="Vragen over BossBase in jouw vak" />
        <Lezen navigate={navigate} />
        <Afsluiting navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}
