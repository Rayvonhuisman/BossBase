import { useState } from 'react';
import { useLaad } from './api.js';
import { Kop, Laden, Tabs, datum } from './ui.jsx';

// Analytics: de trechter van bezoek naar betalend, bezoekers en bronnen van
// bossbase.nl (eigen cookievrije meting) en welke functies klanten gebruiken
// (uit onze eigen database). Elk getal zegt waar het vandaan komt.
const BRON_KLEUR = { meting: '#1DDB62', database: '#15A34A' };

export default function Analytics() {
  const [dagen, setDagen] = useState(30);
  const [tab, setTab] = useState('trechter');
  const { data, laden, fout, herlaad } = useLaad('analytics', { dagen });

  const kop = (
    <Kop titel="Analytics" sub="Van bezoeker tot betalende klant">
      <select className="filter-select" value={dagen} onChange={e => setDagen(Number(e.target.value))} aria-label="Periode">
        <option value={7}>7 dagen</option><option value={30}>30 dagen</option><option value={90}>90 dagen</option><option value={365}>12 maanden</option>
      </select>
    </Kop>
  );
  if (laden || fout) return <>{kop}<Laden fout={fout} herlaad={herlaad} /></>;

  const maxBron = Math.max(1, ...data.bronnen.map(b => b.bezoekers));
  const maxDag = Math.max(1, ...data.perDag.map(d => d.bezoekers));
  const bezoekers = data.trechter[0].aantal;

  return (
    <>
      {kop}
      {!data.meetVanaf && (
        <div className="sa-melding">De eigen meting van bossbase.nl is nog niet gestart: zodra de nieuwe versie van de website live staat, komen bezoekers en bronnen hier binnen. De stappen uit de database (accounts, gebruik, betalend) en het functiegebruik werken nu al.</div>
      )}
      {data.meetVanaf && <div className="sa-info">Bezoekers worden cookievrij gemeten sinds {datum(data.meetVanaf, true)}. Een bezoeker telt één keer per dag; over meerdere dagen is niemand te volgen.</div>}

      <div style={{ marginBottom: 14 }}>
        <Tabs waarde={tab} onKies={setTab} opties={[{ id: 'trechter', label: 'Trechter' }, { id: 'bronnen', label: 'Bezoekers en bronnen' }, { id: 'functies', label: 'Functiegebruik' }]} />
      </div>

      {tab === 'trechter' && (
        <div className="card card-p afu2">
          <div className="lsec-hd"><div className="lsec-title">Laatste {dagen === 365 ? '12 maanden' : `${dagen} dagen`}</div></div>
          {data.trechter.map((s, i) => {
            const basis = s.bron === 'meting' ? bezoekers : data.trechter[2].aantal || 1;
            const breedte = s.bron === 'meting' ? (bezoekers ? (s.aantal / bezoekers) * 100 : 0) : (data.trechter[2].aantal ? (s.aantal / data.trechter[2].aantal) * 100 : 0);
            const vorige = i > 0 ? data.trechter[i - 1].aantal : null;
            return (
              <div key={s.stap} className="sa-tr-rij">
                <div className="sa-tr-l">{s.stap}<div className="lrow-sub">{s.bron === 'database' ? 'uit de database' : 'eigen meting'}</div></div>
                <div className="sa-tr-balk"><div style={{ width: `${Math.max(breedte, s.aantal ? 1.5 : 0)}%`, background: BRON_KLEUR[s.bron] }} /></div>
                <div className="sa-tr-n">{s.aantal.toLocaleString('nl-NL')}</div>
                <div className="sa-tr-p">{vorige ? `${Math.round((s.aantal / vorige) * 100)}% van vorige` : basis ? '' : ''}</div>
              </div>
            );
          })}
          <div className="lrow-sub" style={{ marginTop: 10 }}>De balken van de meting en de database staan elk op hun eigen schaal. "Proef echt gebruikt" = 10 of meer handelingen in de app (offertes, facturen, werkbonnen, planning, uren, klanten, projecten).</div>
        </div>
      )}

      {tab === 'bronnen' && (
        <>
          {data.perDag.length > 0 && (
            <div className="card card-p afu2" style={{ marginBottom: 16 }}>
              <div className="lsec-hd"><div className="lsec-title">Bezoekers per dag</div></div>
              <svg width="100%" height="70" viewBox={`0 0 ${data.perDag.length * 10} 70`} preserveAspectRatio="none" role="img" aria-label="Bezoekers per dag">
                {data.perDag.map((d, i) => <rect key={d.dag} x={i * 10 + 1} width={8} y={70 - (d.bezoekers / maxDag) * 66} height={(d.bezoekers / maxDag) * 66} rx={2} fill="#1DDB62"><title>{`${datum(d.dag)}: ${d.bezoekers}`}</title></rect>)}
              </svg>
            </div>
          )}
          <div className="sa-twee">
            <div className="card"><div style={{ overflowX: 'auto' }}><table className="dt">
              <thead><tr><th>Bron</th><th>Bezoekers</th><th></th><th>Aanmeldingen</th><th>Aanvragen</th><th>Conversie</th></tr></thead>
              <tbody>
                {data.bronnen.map(b => (
                  <tr key={b.bron}>
                    <td style={{ fontWeight: 600, color: 'var(--dk)' }}>{b.bron}</td>
                    <td>{b.bezoekers.toLocaleString('nl-NL')}</td>
                    <td style={{ width: 110 }}><div className="sa-minibalk"><div style={{ width: `${(b.bezoekers / maxBron) * 100}%` }} /></div></td>
                    <td>{b.aanmeldingen}</td><td>{b.aanvragen}</td>
                    <td>{b.bezoekers ? `${(((b.aanmeldingen + b.aanvragen) / b.bezoekers) * 100).toFixed(1)}%` : ''}</td>
                  </tr>
                ))}
                {!data.bronnen.length && <tr><td colSpan={6} className="td-empty">Nog geen gegevens</td></tr>}
              </tbody>
            </table></div>
            <div className="lrow-sub" style={{ padding: '10px 16px' }}>"Onbekend" = aanmeldingen en aanvragen van vóór de eigen meting, of van een bezoeker die op een andere dag terugkwam.</div></div>
            <div className="card card-p">
              <div className="lsec-hd"><div className="lsec-title">Meest bezochte pagina's</div></div>
              {!data.paginas.length && <div className="lrow-sub">Nog geen gegevens.</div>}
              <div className="lrows">{data.paginas.map(p => <div key={p.pad} className="lrow lrow-static"><div className="lrow-main"><div className="lrow-title">{p.pad}</div></div><div className="lrow-amount">{p.bezoekers.toLocaleString('nl-NL')}</div></div>)}</div>
              {data.apparaten.length > 0 && <div className="lrow-sub" style={{ marginTop: 12 }}>Apparaten: {data.apparaten.map(a => `${a.apparaat} ${Math.round((a.n / data.apparaten.reduce((t, x) => t + x.n, 0)) * 100)}%`).join(' · ')}</div>}
            </div>
          </div>
        </>
      )}

      {tab === 'functies' && (
        <div className="card card-p afu2">
          <div className="lsec-hd"><div className="lsec-title">Bedrijven die de functie de laatste 30 dagen gebruikten ({data.actieveBedrijven} actieve bedrijven)</div></div>
          {data.functies.map(f => (
            <div key={f.functie} className="sa-tr-rij">
              <div className="sa-tr-l">{f.functie}</div>
              <div className="sa-tr-balk"><div style={{ width: `${(f.bedrijven / Math.max(1, data.actieveBedrijven)) * 100}%`, background: '#15A34A' }} /></div>
              <div className="sa-tr-n">{f.bedrijven} van {data.actieveBedrijven}</div>
              <div className="sa-tr-p">{Math.round((f.bedrijven / Math.max(1, data.actieveBedrijven)) * 100)}%</div>
            </div>
          ))}
          {!data.functies.length && <div className="lrow-sub">De laatste 30 dagen is er niets gebruikt.</div>}
          <div className="lrow-sub" style={{ marginTop: 10 }}>Uit de database; testbedrijven, geblokkeerde en opgezegde bedrijven tellen niet mee.</div>
        </div>
      )}
    </>
  );
}
