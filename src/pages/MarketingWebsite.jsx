import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  KanbanSquare,
  Wrench
} from 'lucide-react';

/* ── Duotone feature icons — BossBase green palette ── */
const FeatureIcons = {
  leads: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M3 7a4 4 0 014-4h7l5 5v9a4 4 0 01-4 4H7a4 4 0 01-4-4V7z" fill="#d1fae5" stroke="#1DDB62" strokeWidth="1.6"/>
      <path d="M14 3v4a2 2 0 002 2h4" stroke="#1DDB62" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="12" cy="14" r="2.2" fill="#1DDB62"/>
      <path d="M8 19c0-2 1.8-3.4 4-3.4s4 1.4 4 3.4" stroke="#1DDB62" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  pipeline: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="5" height="14" rx="1.5" fill="#d1fae5" stroke="#1DDB62" strokeWidth="1.6"/>
      <rect x="9.5" y="5" width="5" height="10" rx="1.5" fill="#d1fae5" stroke="#1DDB62" strokeWidth="1.6"/>
      <rect x="17" y="5" width="5" height="6" rx="1.5" fill="#1DDB62" stroke="#1DDB62" strokeWidth="1.6"/>
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M5 3h10l4 4v14a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" fill="#d1fae5" stroke="#1DDB62" strokeWidth="1.6"/>
      <path d="M15 3v4h4" stroke="#1DDB62" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 12h8M8 15.5h8M8 19h5" stroke="#1DDB62" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  approval: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="14" rx="2" fill="#d1fae5" stroke="#1DDB62" strokeWidth="1.6"/>
      <path d="M3 9h18" stroke="#1DDB62" strokeWidth="1.6"/>
      <path d="M8 14l2.5 2.5L16 11" stroke="#1DDB62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#d1fae5" stroke="#1DDB62" strokeWidth="1.6"/>
      <path d="M3 10h18" stroke="#1DDB62" strokeWidth="1.6"/>
      <path d="M8 3v4M16 3v4" stroke="#1DDB62" strokeWidth="1.6" strokeLinecap="round"/>
      <rect x="7" y="13" width="3" height="3" rx="0.5" fill="#1DDB62"/>
      <rect x="12" y="13" width="3" height="3" rx="0.5" fill="#1DDB62" opacity="0.5"/>
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="6" y="2" width="12" height="20" rx="2.5" fill="#d1fae5" stroke="#1DDB62" strokeWidth="1.6"/>
      <path d="M9 5h6" stroke="#1DDB62" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="12" cy="18.5" r="1" fill="#1DDB62"/>
      <path d="M9 9h6M9 12h4" stroke="#1DDB62" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
};

const CheckSvg = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6L5 8.5 9.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PlusSvg = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const features = [
  { icon: 'leads',    title: 'Leadbeheer',        desc: 'Verzamel aanvragen vanuit je website, e-mail of handmatige invoer in één overzicht — niets glipt er meer doorheen.' },
  { icon: 'pipeline', title: 'Sales pipeline',     desc: 'Verplaats elk traject door duidelijke fases: nieuw, contact, offerte, akkoord, gepland en afgerond.' },
  { icon: 'quote',    title: 'Slimme offertes',    desc: 'Maak professionele offertes met algemene calculaties of templates voor schilders, hoveniers en aannemers.' },
  { icon: 'approval', title: 'Online akkoord',     desc: 'Klanten bekijken en accepteren je offerte online — direct door naar planning, zonder gedoe.' },
  { icon: 'calendar', title: 'Planning & agenda',  desc: 'Plan jobs, wijs medewerkers toe en synchroniseer met Google Calendar zodat je nooit dubbel inplant.' },
  { icon: 'mobile',   title: 'Werkbonnen mobiel',  desc: "Je team opent de werkbon op de telefoon: klantgegevens, adres, taken, foto's en notities — onderweg." },
];

const steps = [
  ['1', 'Vang elke aanvraag',  'Leads komen automatisch binnen via je website, mail of handmatig — allemaal op één plek.'],
  ['2', 'Stuur de offerte',    'Bouw in minuten een professionele offerte op basis van uren, materialen en marges.'],
  ['3', 'Plan en voer uit',    'Goedgekeurde jobs gaan direct in de planning — je team werkt mobiel met werkbonnen.'],
];

const tiers = [
  {
    name: 'Starter',
    tagline: "Voor zzp'ers die net beginnen met digitaal werken.",
    monthly: 19, yearly: 15,
    secondary: true,
    cta: 'Start gratis',
    features: ['Tot 25 leads per maand', 'Onbeperkt offertes maken', 'Online offerte-akkoord', 'Klantprofielen & historie', 'E-mailondersteuning'],
  },
  {
    name: 'Pro',
    tagline: 'Voor groeiende vakbedrijven met team en planning.',
    monthly: 49, yearly: 39,
    featured: true,
    cta: 'Probeer 14 dagen gratis',
    features: ['Alles uit Starter', 'Onbeperkte leads & jobs', 'Sales pipeline + automatisering', 'Planning & Google Calendar sync', 'Mobiele werkbonnen', 'Uren- en materiaalregistratie', 'Tot 5 teamleden'],
  },
  {
    name: 'Business',
    tagline: 'Voor grotere ploegen die op meerdere klussen tegelijk draaien.',
    monthly: 99, yearly: 79,
    secondary: true,
    cta: 'Plan een gesprek',
    features: ['Alles uit Pro', 'Onbeperkte teamleden', 'Geavanceerde rapportages', 'Job costing & winstanalyse', 'API & integraties', 'Persoonlijke onboarding'],
  },
];

const faqItems = [
  ['Hoe snel kan ik beginnen?', 'Je maakt in minder dan 5 minuten een account aan en kunt direct je eerste offerte versturen. Geen creditcard nodig voor de gratis proefperiode.'],
  ['Werkt BossBase voor mijn type vakbedrijf?', 'BossBase is gebouwd voor schilders, hoveniers, klusbedrijven en aannemers. We hebben templates per branche, maar je kunt alles aanpassen aan je eigen werkwijze.'],
  ['Kan ik mijn team toevoegen?', 'Ja. Vanaf het Pro-pakket kun je teamleden toevoegen, rollen instellen en jobs toewijzen. Iedereen werkt vanaf telefoon of laptop met dezelfde gegevens.'],
  ['Worden mijn offertes automatisch berekend?', 'BossBase stelt een conceptofferte voor op basis van uren, materialen, reistijd, marges en btw. Je kunt elke regel aanpassen — jij houdt de controle.'],
  ['Wat als ik wil opzeggen?', 'Maandabonnementen zijn op elk moment opzegbaar. Je houdt toegang tot het einde van de betaalperiode en je data kun je altijd exporteren.'],
  ['Is mijn data veilig?', 'Alle data wordt versleuteld opgeslagen in EU-datacenters en dagelijks geback-upt. Wij voldoen aan de AVG/GDPR-richtlijnen.'],
];

export default function MarketingWebsite({ navigate, isAuthenticated = false }) {
  const [yearly,  setYearly]  = useState(true);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const els = document.querySelectorAll('.bb-reveal');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('bb-reveal-in')),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="bb-site">
      {/* ── NAVBAR ── */}
      <nav className="bb-nav">
        <div className="bb-nav-inner">
          <button className="bb-logo-btn" onClick={() => navigate('/')} aria-label="BossBase home">
            <span className="bb-logo-boss">Boss</span>
            <span className="bb-logo-base">Base</span>
            <i className="bb-logo-line" />
          </button>
          <div className="bb-nav-links">
            <a href="#functies">Functies</a>
            <a href="#hoe">Hoe het werkt</a>
            <a href="#prijzen">Prijzen</a>
            <a href="#faq">FAQ</a>
            <button onClick={() => navigate('/login')}>Inloggen</button>
            {isAuthenticated && <button onClick={() => navigate('/dashboard')}>Dashboard</button>}
            <button className="bb-nav-cta" onClick={() => navigate('/register')}>Gratis starten</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="bb-hero" id="top">
        <div className="bb-hero-bg">
          <div className="bb-hero-grid" />
        </div>
        <div className="bb-hero-inner">
          <div className="bb-badge">
            <span className="bb-badge-dot" />
            ✦ Nieuw — Slimmer offertes maken
          </div>
          <h1>
            Jij de baas,<br />
            wij de <span className="bb-gradient-text">basis</span>.
          </h1>
          <p className="bb-hero-sub">
            BossBase helpt kleine vakbedrijven om aanvragen, offertes, planning, werkbonnen,
            uren en omzet te beheren — vanuit één eenvoudig dashboard.
          </p>
          <div className="bb-hero-ctas">
            <button className="bb-btn bb-btn-primary" onClick={() => navigate('/register')}>Gratis beginnen →</button>
            <button className="bb-btn bb-btn-secondary" onClick={() => navigate('/demo')}>Bekijk demo</button>
          </div>
          <div className="bb-hero-proof">
            <div className="bb-avatars">
              <div className="bb-avatar" style={{ background: 'linear-gradient(135deg,#1DDB62,#15A34A)' }}>JV</div>
              <div className="bb-avatar" style={{ background: 'linear-gradient(135deg,#d1fae5,#1DDB62)', color: '#15A34A' }}>MK</div>
              <div className="bb-avatar" style={{ background: 'linear-gradient(135deg,#0D0D0D,#1a1a1a)' }}>RD</div>
              <div className="bb-avatar" style={{ background: 'linear-gradient(135deg,#374151,#0D0D0D)' }}>+</div>
            </div>
            <span className="bb-stars">★★★★★</span>
            <span>Gebruikt door 200+ ondernemers</span>
          </div>
        </div>
        <ProductMock navigate={navigate} />
      </section>

      {/* ── FEATURES ── */}
      <section className="bb-feature-section" id="functies">
        <div className="bb-container">
          <div className="bb-section-head bb-reveal">
            <span className="bb-eyebrow">Functies</span>
            <h2>Alles om je vakbedrijf<br />draaiend te houden</h2>
            <p>Van eerste aanvraag tot betaalde factuur — BossBase volgt elk traject, zonder spreadsheets, plakbriefjes of dubbele agenda&apos;s.</p>
          </div>
          <div className="bb-feature-grid">
            {features.map((f, i) => (
              <article key={f.title} className="bb-feature-card bb-reveal" style={{ transitionDelay: `${i * 60}ms` }}>
                <div className="bb-feature-icon-wrap">{FeatureIcons[f.icon]}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bb-how" id="hoe">
        <div className="bb-container">
          <div className="bb-section-head bb-reveal">
            <span className="bb-eyebrow">In drie stappen</span>
            <h2>Van aanvraag tot afgerond</h2>
            <p>Geen complexe setup. Geen training. Begin vandaag — werk vanaf morgen anders.</p>
          </div>
          <div className="bb-step-grid">
            <div className="bb-step-line" />
            {steps.map(([num, title, text], i) => (
              <article key={num} className="bb-step bb-reveal" style={{ transitionDelay: `${i * 120}ms` }}>
                <div className="bb-step-num">{num}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="bb-pricing" id="prijzen">
        <div className="bb-container">
          <div className="bb-section-head bb-reveal">
            <span className="bb-eyebrow">Prijzen</span>
            <h2>Eerlijke prijzen, geen verrassingen</h2>
            <p>Begin gratis, schaal mee als je groeit. Zeg op wanneer je wilt — geen jaarcontracten als je dat niet wilt.</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="bb-billing-toggle">
              <button className={!yearly ? 'active' : ''} onClick={() => setYearly(false)}>Maandelijks</button>
              <button className={yearly ? 'active' : ''} onClick={() => setYearly(true)}>
                Jaarlijks <span className="bb-save-pill">−20%</span>
              </button>
            </div>
          </div>
          <div className="bb-pricing-grid">
            {tiers.map((t, i) => {
              const price = yearly ? t.yearly : t.monthly;
              return (
                <article key={t.name} className={`bb-price-card${t.featured ? ' featured' : ''} bb-reveal`} style={{ transitionDelay: `${i * 80}ms` }}>
                  {t.featured && <div className="bb-featured-badge">Meest gekozen</div>}
                  <div className="bb-price-name">{t.name}</div>
                  <div className="bb-price-tagline">{t.tagline}</div>
                  <div className="bb-price-amount">
                    <span className="bb-price-currency">€</span>
                    <span className="bb-price-num">{price}</span>
                    <span className="bb-price-period">/maand</span>
                  </div>
                  <div className="bb-price-yearly-note">
                    {yearly ? `€${price * 12} per jaar — bespaar €${(t.monthly - t.yearly) * 12}` : 'Maandelijks opzegbaar'}
                  </div>
                  <button
                    className={`bb-btn bb-price-cta${t.secondary ? ' bb-btn-secondary' : ' bb-btn-primary'}`}
                    onClick={() => navigate('/register')}
                  >
                    {t.cta}
                  </button>
                  <ul className="bb-price-features">
                    {t.features.map((feature) => (
                      <li key={feature}>
                        <span className="bb-check"><CheckSvg /></span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bb-faq" id="faq">
        <div className="bb-container">
          <div className="bb-section-head bb-reveal">
            <span className="bb-eyebrow">Veelgestelde vragen</span>
            <h2>Nog vragen? We hebben antwoorden</h2>
          </div>
          <div className="bb-faq-list">
            {faqItems.map(([question, answer], index) => (
              <div key={question} className={`bb-faq-item${openFaq === index ? ' open' : ''}`}>
                <button className="bb-faq-q" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                  <span>{question}</span>
                  <span className="bb-faq-plus"><PlusSvg /></span>
                </button>
                <div className="bb-faq-a">{answer}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="bb-cta-banner">
        <div className="bb-cta-inner bb-reveal">
          <div className="bb-cta-content">
            <h2>Klaar om de basis<br />op orde te krijgen?</h2>
            <p>Begin vandaag gratis. Geen creditcard, geen training, geen verplichtingen — gewoon werk dat eindelijk klopt.</p>
            <div className="bb-cta-actions">
              <button className="bb-btn bb-btn-primary" onClick={() => navigate('/register')}>Gratis beginnen →</button>
              <button className="bb-btn bb-btn-ghost" onClick={() => navigate('/demo')}>Bekijk demo</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bb-footer">
        <div className="bb-footer-inner">
          <div className="bb-footer-top">
            <div className="bb-footer-brand">
              <button className="bb-logo-btn bb-logo-dark" onClick={() => navigate('/')}>
                <span className="bb-logo-boss">Boss</span>
                <span className="bb-logo-base">Base</span>
                <i className="bb-logo-line" />
              </button>
              <p>Jij de baas, wij de basis. BossBase helpt vakbedrijven om aanvragen, offertes en planning op één plek te beheren.</p>
            </div>
            <div className="bb-footer-col">
              <h4>Product</h4>
              <ul>
                <li><a href="#functies">Functies</a></li>
                <li><a href="#prijzen">Prijzen</a></li>
                <li><a href="#hoe">Hoe het werkt</a></li>
                <li><a href="#">Roadmap</a></li>
              </ul>
            </div>
            <div className="bb-footer-col">
              <h4>Bedrijf</h4>
              <ul>
                <li><a href="#">Over ons</a></li>
                <li><a href="#">Contact</a></li>
                <li><button onClick={() => navigate('/login')}>Inloggen</button></li>
                <li><button onClick={() => navigate('/register')}>Aanmelden</button></li>
              </ul>
            </div>
            <div className="bb-footer-col">
              <h4>Juridisch</h4>
              <ul>
                <li><a href="#">Privacy</a></li>
                <li><a href="#">Algemene voorwaarden</a></li>
                <li><a href="#">Cookies</a></li>
                <li><a href="#">Verwerkersovereenkomst</a></li>
              </ul>
            </div>
          </div>
          <div className="bb-footer-bottom">
            <span>© 2026 BossBase. Alle rechten voorbehouden.</span>
            <div className="bb-footer-social">
              <a href="#" aria-label="LinkedIn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14zM8 17v-7H6v7h2zM7 9a1 1 0 100-2 1 1 0 000 2zm11 8v-4c0-1.7-1.3-3-3-3-.8 0-1.5.4-2 1V10h-2v7h2v-3.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5V17h2z"/></svg>
              </a>
              <a href="#" aria-label="X">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231z"/></svg>
              </a>
              <a href="#" aria-label="Instagram">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Sub-components ── */

function ProductMock({ navigate }) {
  return (
    <div className="bb-product">
      <div className="bb-product-glow" />
      <div className="bb-product-shell">
        <div className="bb-product-top">
          <div className="bb-product-dots">
            <span style={{ background: '#ff5f57' }} />
            <span style={{ background: '#febc2e' }} />
            <span style={{ background: '#28c840' }} />
          </div>
          <div className="bb-product-url">app.bossbase.nl/pipeline</div>
          <div style={{ width: 60 }} />
        </div>
        <div className="bb-product-body">
          <aside className="bb-product-sidebar">
            <button onClick={() => navigate('/demo')} className="bb-product-brand-btn">
              <span className="bb-logo-boss" style={{ fontWeight: 800, fontSize: '0.9rem' }}>Boss</span>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '-0.03em' }}>Base</span>
            </button>
            <div className="bb-sidebar-section">Werk</div>
            <div className="bb-sidebar-item"><ClipboardList size={14} />Leads<span className="bb-sidebar-badge">7</span></div>
            <div className="bb-sidebar-item active"><KanbanSquare size={14} />Pipeline</div>
            <div className="bb-sidebar-item"><FileText size={14} />Offertes</div>
            <div className="bb-sidebar-item"><CalendarDays size={14} />Planning</div>
            <div className="bb-sidebar-item"><Wrench size={14} />Werkbonnen</div>
          </aside>
          <main className="bb-product-main">
            <div className="bb-product-header">
              <div>
                <h3>Sales pipeline</h3>
                <div className="bb-product-header-meta">14 actieve trajecten · €48.250 in offertes</div>
              </div>
              <button className="bb-btn bb-btn-primary bb-btn-sm" onClick={() => navigate('/demo')}>Bekijk demo</button>
            </div>
            <div className="bb-kpi-row">
              <Kpi label="Open offertes" value="€18.420" trend="▲ 12%" />
              <Kpi label="Geaccepteerd"  value="€29.830" trend="▲ 8%"  />
              <Kpi label="Deze week"     value="11 jobs"  trend="▲ 3"   />
              <Kpi label="Conversie"     value="62%"      trend="▲ 4%"  />
            </div>
            <div className="bb-pipeline">
              <PipelineCol title="Nieuw" count={3}>
                <LeadCard name="J. de Vries" job="Schilderwerk gevel"   amount="€2.450" tag="lead"    tagColor=""     />
                <LeadCard name="A. Bakker"   job="Tuinaanleg achter"    amount="€4.200" tag="lead"    tagColor=""     />
                <LeadCard name="P. Smits"    job="Verbouwing keuken"    amount="€8.900" tag="lead"    tagColor=""     />
              </PipelineCol>
              <PipelineCol title="Contact" count={2}>
                <LeadCard name="M. Kuipers"  job="Schuur schilderen"    amount="€1.180" tag="contact" tagColor="blue" />
                <LeadCard name="L. Janssen"  job="Hekwerk plaatsen"     amount="€3.450" tag="contact" tagColor="blue" />
              </PipelineCol>
              <PipelineCol title="Offerte" count={4}>
                <LeadCard name="R. de Boer"  job="Buiten schilderwerk"  amount="€5.620" tag="offerte" tagColor=""     highlight />
                <LeadCard name="K. Hendriks" job="Kozijnen vervangen"   amount="€7.800" tag="offerte" tagColor=""     />
                <LeadCard name="S. Visser"   job="Houten vloer"         amount="€2.940" tag="offerte" tagColor=""     />
              </PipelineCol>
              <PipelineCol title="Akkoord" count={3}>
                <LeadCard name="T. Mulder"   job="Dakkapel plaatsen"    amount="€6.300" tag="akkoord" tagColor="green"/>
                <LeadCard name="E. Dijkstra" job="Tuinaanleg voor"      amount="€3.150" tag="akkoord" tagColor="green"/>
              </PipelineCol>
              <PipelineCol title="Gepland" count={2}>
                <LeadCard name="H. de Wit"   job="Schilderwerk binnen"  amount="€2.100" tag="gepland" tagColor="gray" />
                <LeadCard name="N. Bos"      job="Terras betegelen"     amount="€4.480" tag="gepland" tagColor="gray" />
              </PipelineCol>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function PipelineCol({ title, count, children }) {
  return (
    <div className="bb-pipeline-col">
      <div className="bb-pipeline-col-head">
        {title} <span className="bb-pipeline-count">{count}</span>
      </div>
      {children}
    </div>
  );
}

function LeadCard({ name, job, amount, tag, tagColor, highlight }) {
  return (
    <div className={`bb-lead-card${highlight ? ' highlight' : ''}`}>
      <div className="bb-lead-name">{name}</div>
      <div className="bb-lead-job">{job}</div>
      <div className="bb-lead-meta">
        <span className={`bb-lead-tag${tagColor ? ' ' + tagColor : ''}`}>{tag}</span>
        <span className="bb-lead-amount">{amount}</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, trend }) {
  return (
    <div className="bb-kpi">
      <div className="bb-kpi-label">{label}</div>
      <div className="bb-kpi-value">{value}</div>
      <div className="bb-kpi-trend">{trend}</div>
    </div>
  );
}
