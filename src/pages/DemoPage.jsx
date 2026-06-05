import { I, CUSTOMERS_DATA, DEALS, ACTIVITIES_DATA, CAL_EVENTS, fmt, stageLabel, stageCol } from '../bb-shared.jsx';
import MarketingShell from './marketing/MarketingShell.jsx';

export default function DemoPage({ navigate, isAuthenticated = false }) {
  const openDeals = DEALS.filter(d => d.stage !== 'completed' && d.stage !== 'paid' && d.stage !== 'lost');
  const todayActivities = ACTIVITIES_DATA.filter(a => a.status === 'today' || a.status === 'overdue');

  return (
    <MarketingShell navigate={navigate} active="" isAuthenticated={isAuthenticated}>
      <div className="mkt-c">
        <header className="mkt-page-hd mkt-rev">
          <div>
            <div className="mkt-sec-num">Demo</div>
            <h1>Een rondleiding<br /><em>in de echte app.</em></h1>
          </div>
          <p>
            Read-only voorbeelddata uit een vakbedrijf. Niks wordt opgeslagen.
            Klik door om te zien hoe BossBase werkt — en start een echt account
            wanneer je klaar bent.
          </p>
        </header>

        <section className="mkt-sec mkt-sec--first" style={{ paddingTop: 24, borderTop: 0 }}>
          <div className="mkt-rev mkt-demo-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
              <div>
                <div className="mkt-sec-num">Voorbeelddata</div>
                <h2 style={{
                  fontFamily: 'var(--sans)',
                  fontWeight: 700,
                  fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                  letterSpacing: '-0.03em',
                  margin: '8px 0 0',
                  color: 'var(--ink)',
                  lineHeight: 1.1,
                }}>Een dag in het leven van een schildersbedrijf.</h2>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="mkt-btn mkt-btn--ghost mkt-btn--sm" onClick={() => navigate('/')}>← Terug</button>
                <button className="mkt-btn mkt-btn--primary mkt-btn--sm" onClick={() => navigate('/register')}>
                  <span className="mkt-btn-dot" /> Start gratis
                </button>
              </div>
            </div>

            {/* KPI strip */}
            <div className="mkt-demo-kpis">
              {[
                ['Demo klanten', CUSTOMERS_DATA.length, '↗ vakbedrijven'],
                ['Open trajecten', openDeals.length, '↗ in pipeline'],
                ['Pipelinewaarde', fmt(DEALS.reduce((s, d) => s + d.value, 0)), '↗ totaal'],
                ['Agenda items', CAL_EVENTS.length, '↗ deze week'],
              ].map(([lbl, val, trend]) => (
                <div key={lbl} className="mkt-demo-kpi">
                  <div className="mkt-demo-kpi-lbl">{lbl}</div>
                  <div className="mkt-demo-kpi-val">{val}</div>
                  <div className="mkt-demo-kpi-trend">{trend}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mkt-rev mkt-demo-cols">
            {/* Pipeline table */}
            <section className="mkt-demo-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: '1.15rem', color: 'var(--ink)', letterSpacing: '-0.02em' }}>Demo pipeline</div>
                <span style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '.7rem',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-mute)',
                  background: 'var(--paper-soft)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                }}>Alleen lezen</span>
              </div>
              <div className="mkt-demo-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.92rem' }}>
                <thead>
                  <tr>
                    {['Klant', 'Opdracht', 'Fase', 'Waarde'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--line-strong)',
                        fontFamily: 'var(--mono)',
                        fontSize: '.7rem',
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-mute)',
                        fontWeight: 500,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEALS.slice(0, 6).map(deal => {
                    const customer = CUSTOMERS_DATA.find(c => c.id === deal.custId);
                    return (
                      <tr key={deal.id}>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--line)', fontWeight: 600, color: 'var(--ink)' }}>{customer?.name}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--line)', color: 'var(--ink-soft)' }}>{deal.title}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--line)' }}>
                          <span style={{
                            fontFamily: 'var(--mono)',
                            fontSize: '.66rem',
                            letterSpacing: '.06em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: 'var(--paper-soft)',
                            border: '1px solid var(--line)',
                            color: 'var(--ink)',
                          }}>{stageLabel(deal.stage)}</span>
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>{fmt(deal.value)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </section>

            {/* Today's actions */}
            <section className="mkt-demo-card">
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: '1.15rem', color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 14 }}>Acties vandaag</div>
              {todayActivities.map(activity => {
                const customer = CUSTOMERS_DATA.find(c => c.id === activity.custId);
                return (
                  <div key={activity.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 0',
                    borderTop: '1px solid var(--line)',
                  }}>
                    <span style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'var(--atelier)', color: 'var(--brand)',
                      display: 'grid', placeItems: 'center',
                    }}>{I.act}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '.94rem' }}>{activity.title}</div>
                      <div style={{ fontSize: '.78rem', color: 'var(--ink-mute)', fontFamily: 'var(--mono)' }}>{customer?.name} · {activity.time}</div>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        </section>
      </div>

      <section className="mkt-final">
        <div className="mkt-final-in mkt-rev">
          <div className="mkt-sec-num mkt-sec-num--light" style={{ justifyContent: 'center' }}>Klaar voor jouw bedrijf?</div>
          <h2>Probeer het<br /><em>met je eigen data.</em></h2>
          <p>14 dagen gratis. Eigen klanten, eigen offertes — zoals jij werkt.</p>
          <div className="mkt-final-ctas">
            <button className="mkt-btn mkt-btn--brand mkt-btn--lg" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="mkt-btn mkt-btn--inverse mkt-btn--lg" onClick={() => navigate('/contact')}>Plan een gesprek</button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
