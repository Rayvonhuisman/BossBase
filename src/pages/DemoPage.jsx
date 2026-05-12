import { I, Logo, CUSTOMERS_DATA, DEALS, ACTIVITIES_DATA, CAL_EVENTS, fmt, stageLabel, stageCol } from '../bb-shared.jsx';

export default function DemoPage({ navigate }) {
  const openDeals = DEALS.filter(d => d.stage !== 'completed' && d.stage !== 'paid' && d.stage !== 'lost');
  const todayActivities = ACTIVITIES_DATA.filter(a => a.status === 'today' || a.status === 'overdue');

  return (
    <div className="bb-site">
      <nav className="bb-nav">
        <div className="bb-nav-inner">
          <button className="bb-logo-btn" onClick={() => navigate('/')} aria-label="BossBase home">
            <Logo />
          </button>
          <div className="bb-nav-links">
            <button onClick={() => navigate('/')}>Website</button>
            <button onClick={() => navigate('/login')}>Inloggen</button>
            <button className="bb-nav-cta" onClick={() => navigate('/register')}>Account aanmaken</button>
          </div>
        </div>
      </nav>

      <main className="content" style={{ maxWidth: 1180, margin: '0 auto', paddingTop: 110 }}>
        <div className="page-hd afu">
          <div>
            <h1>BossBase demo</h1>
            <p>Read-only voorbeelddata. Deze demo schrijft niets naar Supabase.</p>
          </div>
          <div className="page-hd-actions">
            <button className="btn btn-s btn-sm" onClick={() => navigate('/')}>Terug naar website</button>
            <button className="btn btn-p btn-sm" onClick={() => navigate('/register')}>Start gratis</button>
          </div>
        </div>

        <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div className="sc"><div className="sc-top"><div className="sc-icon">{I.cust}</div></div><div className="sc-val">{CUSTOMERS_DATA.length}</div><div className="sc-label">Demo klanten</div></div>
          <div className="sc"><div className="sc-top"><div className="sc-icon">{I.pipe}</div></div><div className="sc-val">{openDeals.length}</div><div className="sc-label">Open trajecten</div></div>
          <div className="sc"><div className="sc-top"><div className="sc-icon">{I.brief}</div></div><div className="sc-val">{fmt(DEALS.reduce((s, d) => s + d.value, 0))}</div><div className="sc-label">Pipelinewaarde</div></div>
          <div className="sc"><div className="sc-top"><div className="sc-icon">{I.cal}</div></div><div className="sc-val">{CAL_EVENTS.length}</div><div className="sc-label">Agenda items</div></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 14, marginTop: 16 }} className="afu3">
          <section className="tw">
            <div className="tw-hd"><div className="card-title">Demo pipeline</div><span className="badge b-gray">Alleen lezen</span></div>
            <table className="dt">
              <thead><tr><th>Klant</th><th>Opdracht</th><th>Fase</th><th>Waarde</th></tr></thead>
              <tbody>
                {DEALS.slice(0, 6).map(deal => {
                  const customer = CUSTOMERS_DATA.find(c => c.id === deal.custId);
                  return (
                    <tr key={deal.id}>
                      <td style={{ fontWeight: 700 }}>{customer?.name}</td>
                      <td>{deal.title}</td>
                      <td><span className={`badge ${stageCol(deal.stage)}`}>{stageLabel(deal.stage)}</span></td>
                      <td style={{ fontWeight: 800 }}>{fmt(deal.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card card-p">
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Acties vandaag</div>
            {todayActivities.map(activity => {
              const customer = CUSTOMERS_DATA.find(c => c.id === activity.custId);
              return (
                <div key={activity.id} className="act-item">
                  <div className="act-icon task">{I.act}</div>
                  <div>
                    <div className="act-title">{activity.title}</div>
                    <div className="act-meta">{customer?.name} · {activity.time}</div>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </main>
    </div>
  );
}
