// Sjabloon voor de functiepagina's (type "functie"), herontwerp 2026. De
// inhoud komt uit src/content/functies/*.md; de beelden per pagina staan in
// FunctieBeelden.jsx (kop) en FunctieVerhalen.jsx (verhaal, iconen, accent).
// Branche- en koppelingspagina's gebruiken nog LandingTemplate.jsx.
import { Nav, Footer } from '../../pages/marketing/MktShared.jsx';
import { HI, useGa, Faq, Afsluiting } from '../../pages/marketing/HvBlokken.jsx';
import { BEELDEN } from '../../pages/marketing/FunctieBeelden.jsx';
import { PAGINAS, FOTOS } from '../../pages/marketing/FunctieVerhalen.jsx';
import { docVoorPad } from '../routes.jsx';
import { Kruimelpad } from './Onderdelen.jsx';

function metPunt(t) {
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function Kop({ meta, kruimels, cfg, navigate }) {
  const go = useGa(navigate);
  const BeeldKop = BEELDEN[meta.path];
  const accent = cfg.h1Accent;
  const gesplitst = accent && meta.h1.endsWith(accent);
  const voor = gesplitst ? meta.h1.slice(0, -accent.length).trim() : meta.h1;
  return (
    <header className="hv-hero fp-hero">
      <div className="hv-hero-bg" aria-hidden="true">
        <span className="hv-glow-a" /><span className="hv-glow-b" /><span className="hv-ring-a" /><span className="hv-ring-b" /><span className="hv-floor" />
      </div>
      <div className="container fp-hero-in">
        <div className="fp-hero-copy">
          <Kruimelpad items={kruimels} />
          {meta.kicker && <span className="hv-kicker">{meta.kicker}</span>}
          <h1>{gesplitst ? <><span>{voor}</span><span className="hv-groen">{accent}.</span></> : meta.h1}</h1>
          {meta.lead && <p className="fp-lead">{meta.lead}</p>}
          <div className="hv-ctas">
            <a href="/register" className="hv-btn hv-btn-p hv-btn-lg" onClick={e => go(e, '/register')}>Start nu gratis {HI.arrow}</a>
            <a href="/prijzen" className="hv-btn hv-btn-s hv-btn-lg" onClick={e => go(e, '/prijzen')}>Bekijk prijzen</a>
          </div>
          {meta.noot && <p className="fp-noot-kop"><i>{HI.check}</i>{meta.noot}</p>}
        </div>
        {BeeldKop && <BeeldKop />}
      </div>
    </header>
  );
}

function Kaarten({ meta, cfg }) {
  return (
    <section className="hv-sectie hv-sectie-wit fp-blok" id="wat">
      <div className="container">
        <div className="hv-kop">
          <span className="hv-kicker">{meta.kicker}</span>
          <h2>{metPunt(meta.puntenTitel || `Wat je met ${cfg.onderwerp} doet`)}</h2>
          {meta.puntenIntro && <p>{meta.puntenIntro}</p>}
        </div>
        <div className={`fp-kaarten${cfg.kolommen === 4 ? ' vier' : ''}`}>
          {meta.punten.map((p, i) => (
            <div key={p.titel} className="hv-functie-kaart">
              <span className="hv-tegel">{HI[cfg.iconen[i]] || HI.check}</span>
              <h3>{p.titel}</h3>
              <p>{p.tekst}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// De lopende tekst (markdown → HTML in de build) in stukken per kop, zodat
// elk stuk een eigen rij met een klein beeld krijgt.
function splitsSecties(html) {
  return html.split(/(?=<h2)/i).map(d => d.trim()).filter(Boolean).map(d => {
    const m = d.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    return { kop: m ? m[1].replace(/<[^>]+>/g, '').trim() : '', rest: m ? d.replace(m[0], '').trim() : d };
  });
}

function Verhaal({ html, cfg }) {
  const secties = splitsSecties(html);
  return (
    <section className="hv-sectie hv-sectie-creme fp-blok fp-verhaal" id="verhaal">
      <div className="hf-blok-bg" aria-hidden="true"><span className="hf-blok-glow-a" /><span className="hf-blok-glow-b" /></div>
      <div className="container fp-rijen">
        {secties.map((s, i) => {
          const Beeldje = cfg.verhalen[i];
          return (
            <div key={i} className={`fp-rij${i % 2 ? ' flip' : ''}${Beeldje ? '' : ' alleen-tekst'}`}>
              <div className="fp-rij-tekst">
                {s.kop && <h2>{metPunt(s.kop)}</h2>}
                <div dangerouslySetInnerHTML={{ __html: s.rest }} />
              </div>
              {Beeldje && <div className="fp-rij-beeld"><Beeldje /></div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stappen({ stappen }) {
  const titel = stappen.titel.replace(/^zo werkt het,?\s*/i, '');
  return (
    <section className="hv-sectie hv-sectie-wit fp-blok" id="stappen">
      <div className="container">
        <div className="hv-kop">
          <span className="hv-kicker">Zo werkt het</span>
          <h2>{metPunt(titel.charAt(0).toUpperCase() + titel.slice(1))}</h2>
          {stappen.intro && <p>{stappen.intro}</p>}
        </div>
        <div className="fp-stappen">
          <span className="fp-stappen-lijn" aria-hidden="true" />
          <ol>
            {stappen.items.map((s, i) => (
              <li key={s.titel}>
                <span className="fp-stap-nr">{i + 1}</span>
                <div className="hv-functie-kaart"><h3>{s.titel}</h3><p>{s.tekst}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// Soort en leestijd van een gerelateerde pagina, uit de routes.
function soortVan(href, doc) {
  const type = doc?.type || (href.startsWith('/integraties') ? 'integratie' : href.startsWith('/voor-wie') ? 'branche' : href.startsWith('/kennisbank') ? 'artikel' : 'functie');
  return {
    artikel: { label: 'Kennisbank', kl: 'hv-badge-ok', icoon: HI.notebook },
    functie: { label: 'Functie', kl: 'hv-badge-blauw', icoon: HI.kanban },
    branche: { label: 'Voor wie', kl: 'hv-badge-warn', icoon: HI.users },
    integratie: { label: 'Koppelingen', kl: 'hv-badge-blauw', icoon: HI.zap },
  }[type];
}

function Lezen({ items, cfg, navigate }) {
  const go = useGa(navigate);
  return (
    <section className="hv-sectie hv-sectie-creme fp-blok" id="lezen">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Verder lezen</span>
            <h2>Verder lezen over {cfg.onderwerp}</h2>
            <p>Artikelen uit de kennisbank en pagina's die hierop aansluiten.</p>
          </div>
          <a href="/kennisbank" className="hv-link" onClick={e => go(e, '/kennisbank')}>Alle artikelen {HI.arrow}</a>
        </div>
        <div className={`fp-lezen${items.length === 3 ? ' drie' : ''}`}>
          {items.map(k => {
            const doc = docVoorPad(k.href);
            const soort = soortVan(k.href, doc);
            const foto = FOTOS[k.href] || doc?.beeld?.src;
            return (
              <a key={k.href} href={k.href} className="hv-artikel" onClick={e => go(e, k.href)}>
                {foto
                  ? <img src={foto} alt="" width="640" height="360" loading="lazy" decoding="async" />
                  : <span className="fp-foto-leeg" aria-hidden="true">{soort.icoon}</span>}
                <span className="hv-artikel-body">
                  <span className="hv-artikel-meta">
                    <span className={`hv-badge ${soort.kl}`}>{soort.label}</span>
                    {doc?.type === 'artikel' && doc.leestijd && <small>{doc.leestijd} min lezen</small>}
                  </span>
                  <h3>{k.titel}</h3>
                  {k.tekst && <p>{k.tekst}</p>}
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

export default function FunctieTemplate({ inhoud, navigate }) {
  const { meta, html, kruimels } = inhoud;
  const cfg = PAGINAS[meta.path] || { onderwerp: (meta.kruimel || '').toLowerCase(), iconen: [], verhalen: [] };
  return (
    <div className="bm hv fp">
      <Nav navigate={navigate} />
      <main>
        <Kop meta={meta} kruimels={kruimels} cfg={cfg} navigate={navigate} />
        {meta.punten?.length > 0 && <Kaarten meta={meta} cfg={cfg} />}
        {html && <Verhaal html={html} cfg={cfg} />}
        {meta.stappen?.items?.length > 0 && <Stappen stappen={meta.stappen} />}
        {meta.faq?.length > 0 && <Faq navigate={navigate} items={meta.faq.map(v => [v.v, v.a])} titel={`Vragen over ${cfg.onderwerp}`} />}
        {meta.gerelateerd?.length > 0 && <Lezen items={meta.gerelateerd} cfg={cfg} navigate={navigate} />}
        <Afsluiting navigate={navigate} />
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}
