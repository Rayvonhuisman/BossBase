import MarketingShell from './MarketingShell.jsx';

const FBIGS = [
  {
    n: 'Leadbeheer',
    h: 'Elke aanvraag landt op <em>één plek.</em>',
    p: 'Of een lead nu via je website komt, via een mail-formulier, een WhatsApp of een telefoontje — BossBase zet ’m in de inbox, koppelt ’m aan een klantkaart en geeft je een opvolgdatum.',
    pts: ['Inbound vanuit webformulier en e-mail', 'Automatische klantverrijking', 'Opvolgregels en herinneringen', 'Bron tracken voor latere rapportage'],
    art: 'inbox',
  },
  {
    n: 'Sales pipeline',
    h: 'Sleep deals door <em>jouw fases.</em>',
    p: 'Een pipeline die past op hoe vakbedrijven werken — niet hoe softwarebedrijven werken. Van nieuwe lead tot afgerond, met fases die jij zelf bepaalt.',
    pts: ['Eigen fases per branche', 'Drag-and-drop op desktop én mobiel', 'Pipelinewaarde, conversie en velociteit per fase', 'Filters op stad, klustype en ploeg'],
    art: 'pipe',
  },
  {
    n: 'Offertes & online akkoord',
    h: 'Een offerte die klanten <em>willen tekenen.</em>',
    p: 'Regels in uren, m² en materialen. Marge per regel. Btw automatisch. De klant tekent online — datum, IP en signatuur netjes vastgelegd.',
    pts: ['Templates per klustype', 'Materiaalbibliotheek met prijzen', 'Online akkoord met audit trail', 'Eén klik naar werkbon en factuur'],
    art: 'quote',
  },
  {
    n: 'Planning & agenda',
    h: 'Het juiste werk bij <em>de juiste ploeg.</em>',
    p: 'Plan klussen per ploeg of medewerker, sleep door de week en synchroniseer met Google Calendar. Zien wat er nog aankomt — en wie wat doet.',
    pts: ['Drag-and-drop weekplanning', 'Google Calendar sync (twee kanten)', 'Ploegen, rollen en beschikbaarheid', 'Mobiele agenda voor onderweg'],
    art: 'cal',
  },
  {
    n: 'Mobiele werkbonnen',
    h: 'De werkbon werkt waar <em>het werk gebeurt.</em>',
    p: 'Het team opent de werkbon op de telefoon: klantgegevens, adres, taken, foto’s en handtekening — allemaal direct gekoppeld aan de juiste klus.',
    pts: ['Adres, route en klantgegevens', 'Taken, foto’s en notities', 'Digitale handtekening op locatie', 'Direct beschikbaar voor facturatie'],
    art: 'wo',
  },
  {
    n: 'Uren & materiaal',
    h: 'Uren registreren voelt <em>als ademen.</em>',
    p: 'Per project, per klant of per medewerker. Materialen scannen of zelf invoeren. BossBase rekent direct door naar marge en factuur.',
    pts: ['Per project, klant of medewerker', 'Realtime kostenoverzicht', 'Job costing & winstanalyse', 'Export voor je boekhouder'],
    art: 'hours',
  },
  {
    n: 'Facturatie',
    h: 'Van akkoord naar factuur in <em>één klik.</em>',
    p: 'Geaccepteerde offerte? Klus afgerond? BossBase maakt de factuur, koppelt uren en materialen, en stuurt ’m op met betaallink en herinneringen.',
    pts: ['Conceptfactuur uit offerte', 'Automatische btw en kortingen', 'Betaallinks en herinneringen', 'Boekhouder-export (Snelstart, Exact, e-Boekhouden)'],
    art: 'invoice',
  },
  {
    n: 'Rapportages',
    h: 'Zie wat <em>écht werkt</em> in je bedrijf.',
    p: 'Omzet, marge per branche, conversie, doorlooptijd, top-klanten — in heldere weekgrafieken die je in 10 seconden begrijpt.',
    pts: ['Maandomzet en marge', 'Conversie per pipeline-fase', 'Klant- en branche-analyse', 'Vergelijk vorige periodes en jaren'],
    art: 'chart',
  },
];

/* ─── Small ASCII-grade art panels per feature, no images ─────── */
function Art({ kind }) {
  if (kind === 'inbox') {
    return (
      <div className="mkt-mini">
        <div className="mkt-mini-hd"><span>Inbox · vandaag</span><span>3 nieuw</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">JV</span><span><b>J. de Vries</b><small>Schilderwerk gevel · via website</small></span><span className="mkt-mini-amt">±€2.450</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">AB</span><span><b>A. Bakker</b><small>Tuinaanleg · WhatsApp</small></span><span className="mkt-mini-amt">±€4.200</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">PS</span><span><b>P. Smits</b><small>Verbouwing keuken · e-mail</small></span><span className="mkt-mini-amt">±€8.900</span></div>
      </div>
    );
  }
  if (kind === 'pipe') {
    return (
      <div className="mkt-mini" style={{ background: 'var(--paper-soft)' }}>
        <div className="mkt-mini-hd"><span>Pipeline · 14 actief</span><span>€48.250</span></div>
        {[
          ['Nieuw', 3, '#9CA3AF'],
          ['Contact', 2, '#2563eb'],
          ['Offerte', 4, '#f59e0b'],
          ['Akkoord', 3, '#1DDB62'],
          ['Gepland', 2, '#0F3D2B'],
        ].map(([label, n, color]) => (
          <div key={label} className="mkt-mini-row" style={{ gridTemplateColumns: '90px 1fr 50px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.78rem', color: 'var(--ink)' }}>{label}</span>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(n / 4) * 100}%`, background: color, borderRadius: 999 }} />
            </div>
            <span className="mkt-mini-amt" style={{ textAlign: 'right' }}>{n}</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'quote') {
    return (
      <div className="mkt-mini">
        <div className="mkt-mini-hd"><span>Offerte BB-024</span><span>Concept</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">m²</span><span><b>Voorbereiding gevel</b><small>32 m² · €18/m²</small></span><span className="mkt-mini-amt">€576</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">u</span><span><b>Schilderen 2 lagen</b><small>14 u · €52/u</small></span><span className="mkt-mini-amt">€728</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">€</span><span><b>Materialen</b><small>verf, plamuur, doek</small></span><span className="mkt-mini-amt">€340</span></div>
        <div className="mkt-mini-row" style={{ borderTop: '1px solid var(--line-strong)' }}>
          <span className="mkt-mini-av" style={{ background: 'var(--brand)', color: 'var(--atelier)' }}>✓</span>
          <span><b>Totaal incl. btw</b><small>21% btw</small></span><span className="mkt-mini-amt">€2.450</span>
        </div>
      </div>
    );
  }
  if (kind === 'cal') {
    const days = ['M', 'D', 'W', 'D', 'V'];
    return (
      <div className="mkt-mini">
        <div className="mkt-mini-hd"><span>Week 22 · planning</span><span>Marco, Tim</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 8 }}>
          {days.map((d, i) => (
            <div key={d + i} style={{ background: 'var(--paper-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 6px', minHeight: 88, position: 'relative' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.65rem', color: 'var(--ink-mute)', textAlign: 'center' }}>{d}</div>
              {i === 0 && <div style={{ background: 'var(--atelier)', color: 'var(--paper)', fontSize: '.62rem', borderRadius: 4, padding: '2px 4px', marginTop: 6 }}>Gevel</div>}
              {i === 1 && <div style={{ background: 'var(--brand)', color: 'var(--atelier)', fontSize: '.62rem', borderRadius: 4, padding: '2px 4px', marginTop: 6, fontWeight: 600 }}>Tuin AB</div>}
              {i === 2 && <div style={{ background: 'var(--atelier-hi)', color: 'var(--paper)', fontSize: '.62rem', borderRadius: 4, padding: '2px 4px', marginTop: 6 }}>Keuken</div>}
              {i === 3 && <div style={{ background: 'var(--atelier)', color: 'var(--paper)', fontSize: '.62rem', borderRadius: 4, padding: '2px 4px', marginTop: 6 }}>Dakkapel</div>}
              {i === 4 && <div style={{ background: 'var(--paper)', border: '1px dashed var(--line-strong)', color: 'var(--ink-mute)', fontSize: '.62rem', borderRadius: 4, padding: '2px 4px', marginTop: 6 }}>Vrij</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'wo') {
    return (
      <div className="mkt-mini">
        <div className="mkt-mini-hd"><span>Werkbon W-184</span><span>In uitvoering</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">📍</span><span><b>Jansen Schilderwerken</b><small>Zwolle · Veerweg 12</small></span><span className="mkt-mini-amt">—</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av" style={{ background: 'var(--brand)', color: 'var(--atelier)' }}>✓</span><span><b>Voorbereiding</b><small>klaar · 14:30</small></span><span className="mkt-mini-amt">2u</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">…</span><span><b>Schilderen 1e laag</b><small>bezig · Marco</small></span><span className="mkt-mini-amt">—</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">○</span><span><b>Schilderen 2e laag</b><small>open</small></span><span className="mkt-mini-amt">—</span></div>
      </div>
    );
  }
  if (kind === 'hours') {
    return (
      <div className="mkt-mini">
        <div className="mkt-mini-hd"><span>Uren week 22</span><span>32u / ploeg</span></div>
        {[['Ma', 8], ['Di', 9], ['Wo', 6], ['Do', 8], ['Vr', 5]].map(([d, h]) => (
          <div key={d} className="mkt-mini-row" style={{ gridTemplateColumns: '60px 1fr 50px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.78rem' }}>{d}</span>
            <div style={{ height: 10, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(h / 9) * 100}%`, background: 'var(--atelier)' }} />
            </div>
            <span className="mkt-mini-amt" style={{ textAlign: 'right' }}>{h}u</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'invoice') {
    return (
      <div className="mkt-mini">
        <div className="mkt-mini-hd"><span>Factuur F-2026-082</span><span style={{ color: 'var(--brand-deep)' }}>Betaald</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">JV</span><span><b>Jansen Schilderwerken</b><small>Veerweg 12 · Zwolle</small></span><span className="mkt-mini-amt">—</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">€</span><span><b>Subtotaal</b><small>5 regels uit offerte BB-024</small></span><span className="mkt-mini-amt">€2.024</span></div>
        <div className="mkt-mini-row"><span className="mkt-mini-av">%</span><span><b>Btw 21%</b><small>automatisch</small></span><span className="mkt-mini-amt">€426</span></div>
        <div className="mkt-mini-row" style={{ borderTop: '1px solid var(--line-strong)' }}>
          <span className="mkt-mini-av" style={{ background: 'var(--brand)', color: 'var(--atelier)' }}>=</span>
          <span><b>Totaal</b><small>Vervaldatum 28 mei</small></span><span className="mkt-mini-amt">€2.450</span>
        </div>
      </div>
    );
  }
  // chart
  const months = [40, 62, 58, 78, 71, 92, 88];
  return (
    <div className="mkt-mini">
      <div className="mkt-mini-hd"><span>Omzet · laatste 7 mnd</span><span style={{ color: 'var(--brand-deep)' }}>↑ 18%</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 130, marginTop: 8 }}>
        {months.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
            <div style={{ width: '100%', height: `${v}%`, background: i === months.length - 1 ? 'var(--brand)' : 'var(--atelier)', borderRadius: '4px 4px 0 0', minHeight: 6 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--ink-mute)' }}>{['nov','dec','jan','feb','mrt','apr','mei'][i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FeaturesPage({ navigate, isAuthenticated }) {
  return (
    <MarketingShell navigate={navigate} active="functies" isAuthenticated={isAuthenticated}>
      <div className="mkt-c">
        <header className="mkt-page-hd mkt-rev">
          <div>
            <div className="mkt-sec-num">Functies</div>
            <h1>Acht modules, <em>één werkstroom.</em></h1>
          </div>
          <p>
            Bekijk wat BossBase doet voor élke fase van je werk —
            van eerste aanvraag tot betaalde factuur. Alle modules
            spreken met elkaar, zodat geen klus tussen wal en schip valt.
          </p>
        </header>

        <section className="mkt-sec mkt-sec--first" style={{ paddingTop: 40, borderTop: 0 }}>
          {FBIGS.map((f, i) => (
            <article key={f.n} className={`mkt-fbig${i % 2 ? ' is-rev' : ''} mkt-rev`}>
              {i % 2 ? <div className="mkt-fbig-art"><Art kind={f.art} /></div> : null}
              <div>
                <div className="mkt-fbig-num">{f.n}</div>
                <h3 dangerouslySetInnerHTML={{ __html: f.h }} />
                <p>{f.p}</p>
                <ul>
                  {f.pts.map(pt => <li key={pt}>{pt}</li>)}
                </ul>
              </div>
              {i % 2 ? null : <div className="mkt-fbig-art"><Art kind={f.art} /></div>}
            </article>
          ))}
        </section>
      </div>

      {/* Final CTA */}
      <section className="mkt-final">
        <div className="mkt-final-in mkt-rev">
          <div className="mkt-sec-num mkt-sec-num--light" style={{ justifyContent: 'center' }}>Probeer het zelf</div>
          <h2>14 dagen gratis,<br /><em>geen creditcard.</em></h2>
          <p>Maak vandaag een account en stuur je eerste offerte vóór de koffie koud is.</p>
          <div className="mkt-final-ctas">
            <button className="mkt-btn mkt-btn--brand mkt-btn--lg" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="mkt-btn mkt-btn--inverse mkt-btn--lg" onClick={() => navigate('/prijzen')}>Bekijk prijzen →</button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
