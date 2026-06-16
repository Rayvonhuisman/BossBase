import MarketingShell from './MarketingShell.jsx';

/* ─── Per-industry mini glyphs (no images, no icon libs) ───── */
const Glyph = {
  paint: <svg viewBox="0 0 64 64" fill="none" width="40" height="40"><rect x="14" y="10" width="32" height="14" rx="2" stroke="currentColor" strokeWidth="2.5"/><path d="M14 24h32" stroke="currentColor" strokeWidth="2.5"/><path d="M30 24v12h4v12c0 2 1.5 4 4 4s4-2 4-4V36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><rect x="40" y="6" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="2.5"/></svg>,
  garden: <svg viewBox="0 0 64 64" fill="none" width="40" height="40"><path d="M32 56V30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M32 30c-8 0-14-6-14-14 8 0 14 6 14 14z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M32 36c8 0 14-6 14-14-8 0-14 6-14 14z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M10 56h44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>,
  klus: <svg viewBox="0 0 64 64" fill="none" width="40" height="40"><path d="M20 44l-8 8m0 0l-4-4 8-8m12-12l16 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle cx="44" cy="20" r="10" stroke="currentColor" strokeWidth="2.5"/><path d="M40 16l8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>,
  stuc: <svg viewBox="0 0 64 64" fill="none" width="40" height="40"><rect x="10" y="34" width="44" height="8" rx="2" stroke="currentColor" strokeWidth="2.5"/><path d="M16 34V22h32v12" stroke="currentColor" strokeWidth="2.5"/><path d="M22 30l8-4 6 4 6-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  loodgieter: <svg viewBox="0 0 64 64" fill="none" width="40" height="40"><path d="M14 18h14v8h14v8h-14v18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="46" cy="22" r="6" stroke="currentColor" strokeWidth="2.5"/></svg>,
  install: <svg viewBox="0 0 64 64" fill="none" width="40" height="40"><path d="M14 20l18-8 18 8v24l-18 8-18-8V20z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M14 20l18 8 18-8M32 28v24" stroke="currentColor" strokeWidth="2.5"/></svg>,
};

const INDUSTRIES = [
  { n: '01', g: Glyph.paint,      h: 'Schilders',          p: 'Voor binnen- en buitenwerk. Foto’s per kamer, m²-staat, materialen en uren — alles op één werkbon.', tags: ['Gevelopnames', 'm²-prijzen', 'Foto-werkbonnen', 'Klusplanning'], deep: true },
  { n: '02', g: Glyph.garden,     h: 'Hoveniers',          p: 'Houd onderhoudsabonnementen en eenmalige aanlegklussen netjes uit elkaar — én op één planning.',     tags: ['Vaste rondes', 'Aanlegprojecten', 'Klantabonnementen', 'Materiaalbestelling'] },
  { n: '03', g: Glyph.klus,       h: 'Klusbedrijven',      p: 'Van dakkapel tot keukenrenovatie. Per klus zie je uren, kosten, marge en planning in één oogopslag.', tags: ['Job costing', 'Materiaalstaat', 'Werkbonnen', 'Foto-archief'], deep: true },
  { n: '04', g: Glyph.stuc,       h: 'Stukadoors',         p: 'Strakke calculaties op m². Snelle offertes, slimme planning per ploeg en directe oplevering.',         tags: ['m²-calculatie', 'Ploegplanning', 'Oplevering', 'Foto-akkoord'] },
  { n: '05', g: Glyph.loodgieter, h: 'Loodgieters',        p: 'Snel storingen aannemen, plannen en uitvoeren. Inclusief urenregistratie ter plekke en factuur per mail.', tags: ['Storingen', 'Mobiel werken', 'Snelle facturatie', 'Service-abonnement'], deep: true },
  { n: '06', g: Glyph.install,    h: 'Installateurs',      p: 'Voor cv, elektra, ventilatie en zonnepanelen. Per project uren, materialen en garantie netjes vastgelegd.', tags: ['Materiaalbestelling', 'Garantie & serienr.', 'Onderhoudsplanning', 'API-integraties'] },
];

const PROOF = [
  ['200+', 'Vakbedrijven actief op BossBase'],
  ['18%', 'Gemiddelde stijging in conversie'],
  ['4.9', 'Gemiddelde beoordeling (★)'],
  ['<5 min', 'Tot je eerste offerte na aanmelding'],
];

export default function IndustriesPage({ navigate, isAuthenticated }) {
  return (
    <MarketingShell navigate={navigate} active="voor-wie" isAuthenticated={isAuthenticated}>
      <div className="mkt-c">
        <header className="mkt-page-hd mkt-rev">
          <div>
            <div className="mkt-sec-num">Voor wie</div>
            <h1>Voor mensen die<br /><em>met hun handen werken.</em></h1>
          </div>
          <p>
            BossBase is gebouwd voor de Nederlandse vakman. We praten geen
            corporate, we ondersteunen geen 50.000 features die jij toch niet
            gebruikt — alleen het werk dat klopt.
          </p>
        </header>
      </div>

      <section className="mkt-sec mkt-sec--first" style={{ paddingTop: 32, borderTop: 0 }}>
        <div className="mkt-c">
          <div className="mkt-ind mkt-rev">
            {INDUSTRIES.map(ind => (
              <article key={ind.h} className={`mkt-ind-card${ind.deep ? ' is-deep' : ''}`}>
                <div className="mkt-ind-art">
                  <span className="mkt-ind-num">{ind.n}</span>
                  {ind.g}
                </div>
                <div>
                  <h4>{ind.h}</h4>
                  <p>{ind.p}</p>
                  <ul>
                    {ind.tags.map(t => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Atelier proof block */}
      <section className="mkt-sec mkt-sec--atelier mkt-sec--airy">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num mkt-sec-num--light">In cijfers</div>
              <h2>Vakmensen vinden<br /><em>de basis bij BossBase.</em></h2>
            </div>
            <p>
              Vier cijfers die laten zien wat BossBase oplevert — en waarom we
              elke dag wakker worden om het iets beter te maken.
            </p>
          </div>

          <div className="mkt-stats mkt-rev">
            {PROOF.map(([n, label]) => (
              <div key={label} className="mkt-stat">
                <b>{n}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial trio */}
      <section className="mkt-sec mkt-sec--cream">
        <div className="mkt-c">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Wat ze zeggen</div>
              <h2>Drie verhalen,<br /><em>één rode draad.</em></h2>
            </div>
            <p>
              Verschillende branches, dezelfde winst: minder zoekwerk, snellere
              offertes en eerder geld op de rekening.
            </p>
          </div>

          <div className="mkt-aud mkt-rev">
            <div className="mkt-aud-card">
              <span className="mkt-eye">Schilder · Zwolle</span>
              <h4 style={{ fontSize: '1.2rem' }}>“Drie uur per week erbij — en meer omzet.”</h4>
              <p>“Mijn offertes gaan binnen de dag de deur uit. Klanten tekenen online. Voor BossBase had ik altijd een avond papierwerk per week — nu een paar minuten op de bouw.”</p>
              <div className="mkt-aud-foot">
                <strong>Pieter Jansen</strong>
                <span className="mkt-aud-arrow">→</span>
              </div>
            </div>
            <div className="mkt-aud-card">
              <span className="mkt-eye">Hovenier · Groningen</span>
              <h4 style={{ fontSize: '1.2rem' }}>“Abonnementen op de automaat.”</h4>
              <p>“Tuinonderhoud-abonnementen factureren we automatisch per maand. Voor BossBase zat ik elke maand een dag te knippen en plakken — nu nul.”</p>
              <div className="mkt-aud-foot">
                <strong>Henk de Boer</strong>
                <span className="mkt-aud-arrow">→</span>
              </div>
            </div>
            <div className="mkt-aud-card">
              <span className="mkt-eye">Klusbedrijf · Hardenberg</span>
              <h4 style={{ fontSize: '1.2rem' }}>“Eindelijk zie ik de marge per klus.”</h4>
              <p>“We hebben er drie ploegen tegelijk op draaien. Met BossBase zie ik dezelfde avond wat een klus heeft opgeleverd. Geen Excel-gepuzzel meer.”</p>
              <div className="mkt-aud-foot">
                <strong>Frank van Dijk</strong>
                <span className="mkt-aud-arrow">→</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-final">
        <div className="mkt-final-in mkt-rev">
          <div className="mkt-sec-num mkt-sec-num--light" style={{ justifyContent: 'center' }}>Past BossBase bij jouw werk?</div>
          <h2>Eén werkdag<br /><em>en je weet het.</em></h2>
          <p>14 dagen gratis Pro-account. Geen creditcard. Stop wanneer je wilt.</p>
          <div className="mkt-final-ctas">
            <button className="mkt-btn mkt-btn--brand mkt-btn--lg" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="mkt-btn mkt-btn--inverse mkt-btn--lg" onClick={() => navigate('/contact')}>Stel een vraag →</button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
