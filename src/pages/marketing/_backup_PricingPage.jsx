import { useState, Fragment } from 'react';
import MarketingShell from './MarketingShell.jsx';

const TIERS = [
  { name: 'Starter',  desc: "Voor zzp'ers die net beginnen met digitaal werken.", m: 19, y: 15,
    feats: ['Tot 25 leads per maand', 'Onbeperkt offertes maken', 'Online offerte-akkoord', 'Klantprofielen & historie', 'E-mailondersteuning'],
    cta: 'Start gratis' },
  { name: 'Pro',      desc: 'Voor groeiende vakbedrijven met team en planning.', m: 49, y: 39, hot: true,
    feats: ['Alles uit Starter', 'Onbeperkte leads & jobs', 'Sales pipeline + automatisering', 'Planning & Google Calendar sync', 'Mobiele werkbonnen', 'Uren- en materiaalregistratie', 'Tot 5 teamleden'],
    cta: 'Probeer 14 dagen gratis' },
  { name: 'Business', desc: 'Voor grotere ploegen die op meerdere klussen tegelijk draaien.', m: 99, y: 79,
    feats: ['Alles uit Pro', 'Onbeperkte teamleden', 'Geavanceerde rapportages', 'Job costing & winstanalyse', 'API & integraties', 'Persoonlijke onboarding'],
    cta: 'Plan een gesprek' },
];

const COMPARE = [
  { cat: 'Klanten & leads', rows: [
    ['Onbeperkt klantkaarten', true, true, true],
    ['Leads per maand', '25', 'onbeperkt', 'onbeperkt'],
    ['Lead-bron en attribution', false, true, true],
    ['Klant- en projecthistorie', true, true, true],
  ]},
  { cat: 'Pipeline & offertes', rows: [
    ['Sales pipeline', '— eenvoudig', true, true],
    ['Eigen fases & filters', false, true, true],
    ['Slimme offertes met regels', true, true, true],
    ['Online akkoord met audit trail', true, true, true],
    ['Templates per branche', false, true, true],
  ]},
  { cat: 'Planning & uitvoering', rows: [
    ['Agenda & planning', false, true, true],
    ['Google Calendar sync', false, true, true],
    ['Mobiele werkbonnen', false, true, true],
    ['Uren- en materiaalregistratie', false, true, true],
  ]},
  { cat: 'Facturatie & financiën', rows: [
    ['Conceptfactuur uit offerte', true, true, true],
    ['Job costing & winstanalyse', false, false, true],
    ['Boekhouder-export', '— basis', true, true],
    ['API & integraties', false, false, true],
  ]},
  { cat: 'Team & support', rows: [
    ['Aantal teamleden', '1', '5', 'onbeperkt'],
    ['Persoonlijke onboarding', false, false, true],
    ['Support', 'e-mail', 'e-mail + chat', 'prioriteit + chat'],
  ]},
];

const FAQ = [
  ['Kan ik tussendoor wisselen van pakket?', 'Ja, je kunt elk moment up- of downgraden. We rekenen pro rata af.'],
  ['Wat zit er in de gratis proefperiode?', 'De eerste 14 dagen zijn een volledig Pro-account zonder creditcard. Na afloop kies je een pakket of stop je vanzelf.'],
  ['Tellen leads die ik zelf invoer ook mee?', 'Bij Starter wel — wij behandelen elke nieuwe klantkaart als één lead. Bij Pro en Business is het onbeperkt.'],
  ['Is BossBase iDEAL-betaalbaar?', 'Ja. Je betaalt per iDEAL of automatische incasso. Een jaarfactuur (met 20% korting) kan ook.'],
  ['Hoe gaat opzeggen?', 'Maand-abonnementen zeg je direct in je instellingen op. Jaar-abonnementen verlengen niet automatisch.'],
];

function Yes() { return <span className="mkt-cmp-yes">✓</span>; }
function No()  { return <span className="mkt-cmp-no">—</span>; }
function Cell({ v }) {
  if (v === true)  return <Yes />;
  if (v === false) return <No />;
  return <span style={{ fontFamily: 'var(--mono)', fontSize: '.82rem', color: 'var(--ink-soft)' }}>{v}</span>;
}

export default function PricingPage({ navigate, isAuthenticated }) {
  const [yearly, setYearly] = useState(true);
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <MarketingShell navigate={navigate} active="prijzen" isAuthenticated={isAuthenticated}>
      <div className="mkt-c">
        <header className="mkt-page-hd mkt-rev">
          <div>
            <div className="mkt-sec-num">Prijzen</div>
            <h1>Eerlijk geprijsd,<br /><em>maandelijks opzegbaar.</em></h1>
          </div>
          <p>
            Begin gratis. Schaal mee als je groeit. Geen jaarcontracten,
            geen verstopte kosten — en geen prijs-per-feature.
          </p>
        </header>

        <section className="mkt-sec mkt-sec--first" style={{ paddingTop: 24, borderTop: 0 }}>
          <div style={{ textAlign: 'center' }} className="mkt-rev">
            <div className="mkt-billing">
              <button className={!yearly ? 'is-on' : ''} onClick={() => setYearly(false)}>Maandelijks</button>
              <button className={yearly ? 'is-on' : ''} onClick={() => setYearly(true)}>
                Jaarlijks <span className="mkt-billing-save">−20%</span>
              </button>
            </div>
          </div>

          <div className="mkt-tiers mkt-rev">
            {TIERS.map(t => {
              const price = yearly ? t.y : t.m;
              return (
                <article key={t.name} className={`mkt-tier${t.hot ? ' mkt-tier--hot' : ''}`}>
                  {t.hot && <div className="mkt-tier-tag">Meest gekozen</div>}
                  <h3>{t.name}</h3>
                  <p className="mkt-tier-desc">{t.desc}</p>
                  <div className="mkt-tier-price">
                    <span className="mkt-tier-cur">€</span>
                    <b>{price}</b>
                    <span className="mkt-tier-per">/maand</span>
                  </div>
                  <p className="mkt-tier-note">
                    {yearly ? `€${price * 12} per jaar · bespaar €${(t.m - t.y) * 12}` : 'Maandelijks opzegbaar'}
                  </p>
                  <button className={`mkt-btn mkt-tier-cta ${t.hot ? 'mkt-btn--brand' : 'mkt-btn--ghost'}`} onClick={() => navigate('/register')}>
                    {t.cta}
                  </button>
                  <ul className="mkt-tier-feat">
                    {t.feats.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        {/* Compare table */}
        <section className="mkt-sec">
          <div className="mkt-sec-head mkt-rev">
            <div>
              <div className="mkt-sec-num">Vergelijking</div>
              <h2>Wat zit er<br /><em>in elk pakket.</em></h2>
            </div>
            <p>Alles op één rij — zodat je niet hoeft te puzzelen welke functie waar zit.</p>
          </div>

          <div className="mkt-rev" style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden' }}>
            <table className="mkt-cmp">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Functie</th>
                  <th>Starter</th>
                  <th>Pro</th>
                  <th>Business</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(group => (
                  <Fragment key={group.cat}>
                    <tr>
                      <td colSpan={4} style={{
                        background: 'var(--paper-soft)',
                        fontFamily: 'var(--mono)',
                        fontSize: '.74rem',
                        textTransform: 'uppercase',
                        letterSpacing: '.1em',
                        color: 'var(--atelier)',
                        fontWeight: 600,
                      }}>{group.cat}</td>
                    </tr>
                    {group.rows.map(([label, a, b, c]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td><Cell v={a} /></td>
                        <td><Cell v={b} /></td>
                        <td><Cell v={c} /></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mkt-sec mkt-sec--cream" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', paddingLeft: 32, paddingRight: 32 }}>
          <div className="mkt-c">
            <div className="mkt-sec-head mkt-rev">
              <div>
                <div className="mkt-sec-num">Veelgestelde vragen</div>
                <h2>Vragen over <em>prijzen?</em></h2>
              </div>
              <p>Andere vraag? Stuur een mail via <button className="mkt-link" onClick={() => navigate('/contact')}>contact →</button></p>
            </div>
            <div className="mkt-faq mkt-rev">
              {FAQ.map(([q, a], i) => (
                <div key={q} className={`mkt-faq-item${openFaq === i ? ' is-open' : ''}`}>
                  <button className="mkt-faq-q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                    <span>{q}</span>
                    <span>+</span>
                  </button>
                  <div className="mkt-faq-a"><p style={{ margin: 0 }}>{a}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="mkt-final">
        <div className="mkt-final-in mkt-rev">
          <div className="mkt-sec-num mkt-sec-num--light" style={{ justifyContent: 'center' }}>Klaar?</div>
          <h2>Geen risico,<br /><em>14 dagen gratis.</em></h2>
          <p>Geen creditcard, geen verplichtingen. Alleen werk dat eindelijk klopt.</p>
          <div className="mkt-final-ctas">
            <button className="mkt-btn mkt-btn--brand mkt-btn--lg" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="mkt-btn mkt-btn--inverse mkt-btn--lg" onClick={() => navigate('/contact')}>Plan een gesprek</button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
