import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLaad } from './api.js';
import { useSa, Kop, Laden, Stat, Tabs, euro, datum } from './ui.jsx';

// Omzet: terugkerende omzet per maand (gestapeld per pakket), instroom,
// uitstroom en proef → betaald per startmaand. Websites zijn eenmalige omzet
// en staan apart. Maanden van vóór de momentopnames komen uit de facturen in
// Stripe; maanden zonder gegevens staan er leeg in, niet als nul.
const KLEUR = { starter: '#86efac', groei: '#1DDB62', team: '#15803d' };
const NAAM = { starter: 'Starter', groei: 'Groei', team: 'Team' };
const maandLabel = iso => new Date(iso + 'T00:00:00').toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' });

export default function Omzet() {
  const { doe } = useSa();
  const { data, laden, fout, herlaad } = useLaad('omzet');
  const [periode, setPeriode] = useState('12');
  const [pakket, setPakket] = useState('alle');

  if (laden || fout) return <><Kop titel="Omzet" /><Laden fout={fout} herlaad={herlaad} /></>;

  const alle = data.maanden;
  const reeks = alle.slice(-Number(periode));
  const mrrVan = m => (pakket === 'alle' ? m.totaal : m[pakket]);
  const nu = reeks[reeks.length - 1];
  const vorige = reeks[reeks.length - 2];
  const nieuw = reeks.reduce((t, m) => t + m.nieuw, 0);
  const weg = reeks.reduce((t, m) => t + m.opgezegd, 0);
  const pg = reeks.reduce((t, m) => t + m.proefGestart, 0);
  const pb = reeks.reduce((t, m) => t + m.proefBetaald, 0);
  const website = reeks.reduce((t, m) => t + m.website, 0);
  const pakketten = pakket === 'alle' ? ['starter', 'groei', 'team'] : [pakket];
  const grafiek = reeks.map(m => ({ ...m, label: maandLabel(m.maand) }));
  const gemiddeldBestand = reeks.length ? reeks.reduce((t, m) => t + m.betalend, 0) / reeks.length : 0;

  const ophalen = async () => {
    const r = await doe('stripe-ophalen', {}, { vraag: { titel: 'Uit Stripe ophalen', tekst: 'Alle facturen uit Stripe ophalen en daaruit de omzet afleiden voor maanden zonder momentopname? Dit leest alleen; er verandert niets in Stripe.', knop: 'Ophalen' } });
    if (r) { herlaad(); }
  };

  return (
    <>
      <Kop titel="Omzet" sub={`Terugkerende omzet, instroom en uitstroom${data.momentopnamesVanaf ? ` · momentopnames sinds ${datum(data.momentopnamesVanaf, true)}` : ''}`}>
        <Tabs waarde={pakket} onKies={setPakket} opties={[{ id: 'alle', label: 'Alle pakketten' }, { id: 'starter', label: 'Starter' }, { id: 'groei', label: 'Groei' }, { id: 'team', label: 'Team' }]} />
        <select className="filter-select" value={periode} onChange={e => setPeriode(e.target.value)} aria-label="Periode">
          <option value="3">3 maanden</option><option value="6">6 maanden</option><option value="12">12 maanden</option><option value="24">24 maanden</option>
        </select>
      </Kop>

      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        <Stat label="MRR nu" waarde={euro(nu ? mrrVan(nu) : 0)} sub={vorige?.heeftGegevens ? `${mrrVan(nu) - mrrVan(vorige) >= 0 ? '+' : '−'}${euro(Math.abs(mrrVan(nu) - mrrVan(vorige)))} t.o.v. vorige maand` : 'nog geen vorige maand'} />
        <Stat label={`Nieuwe klanten (${periode} mnd)`} waarde={nieuw} sub="eerste maand met een betaald abonnement" />
        <Stat label={`Opzeggingen (${periode} mnd)`} waarde={weg} sub={gemiddeldBestand ? `gemiddeld ${(weg / reeks.length / gemiddeldBestand * 100).toFixed(1)}% per maand` : ''} />
        <Stat label="Proef → betaald" waarde={pg ? `${Math.round((pb / pg) * 100)}%` : '—'} sub={`${pb} van ${pg} proeven die in deze periode begonnen`} />
      </div>

      <div className="card card-p afu2" style={{ marginBottom: 16 }}>
        <div className="lsec-hd"><div className="lsec-title">MRR per maand</div></div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={grafiek} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `€${v}`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip formatter={(v, n) => [euro(v), NAAM[n] ?? n]} contentStyle={{ border: '1px solid var(--border)', borderRadius: 8, fontSize: '.8rem', boxShadow: 'none' }} cursor={{ fill: 'rgba(0,0,0,.03)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={n => NAAM[n] ?? n} />
            {pakketten.map((p, i) => <Bar key={p} dataKey={p} stackId="a" fill={KLEUR[p]} radius={i === pakketten.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={32} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card afu3" style={{ marginBottom: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Maand</th><th>MRR</th><th>Betalend</th><th>Nieuw</th><th>Opgezegd</th><th>Netto</th><th>Proeven gestart</th><th>Waarvan betalend</th><th>Websites (los)</th></tr></thead>
            <tbody>
              {[...reeks].reverse().map((m, i) => (
                <tr key={m.maand}>
                  <td style={{ fontWeight: 600 }}>{maandLabel(m.maand)}{i === 0 ? ' (lopend)' : ''}{m.bron === 'stripe' && <span className="badge b-gray" style={{ marginLeft: 6 }} title="Afgeleid uit facturen in Stripe">Stripe</span>}</td>
                  <td>{m.heeftGegevens ? euro(mrrVan(m)) : <span style={{ color: 'var(--dl)' }}>geen gegevens</span>}</td>
                  <td>{m.heeftGegevens ? m.betalend : ''}</td>
                  <td>{m.nieuw || ''}</td>
                  <td>{m.opgezegd || ''}</td>
                  <td style={{ color: m.nieuw - m.opgezegd >= 0 ? 'var(--pd)' : '#dc2626', fontWeight: 600 }}>{m.nieuw || m.opgezegd ? `${m.nieuw - m.opgezegd >= 0 ? '+' : ''}${m.nieuw - m.opgezegd}` : ''}</td>
                  <td>{m.proefGestart || ''}</td>
                  <td>{m.proefGestart ? `${m.proefBetaald} (${Math.round((m.proefBetaald / m.proefGestart) * 100)}%)` : ''}</td>
                  <td>{m.website ? euro(m.website) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--dl)', borderTop: '1px solid var(--border)' }}>
          Totaal websites in deze periode: {euro(website)}. MRR = pakketprijs + extra gebruikers + modules, voor betaalde abonnementen; proeven tellen niet mee.
        </div>
      </div>

      <div className="sa-info">
        {data.facturenBewaard} facturen uit Stripe bewaard. Nieuwe facturen komen er vanzelf bij via de webhook.{' '}
        <button className="btn btn-s btn-xs" onClick={ophalen}>Alles opnieuw uit Stripe ophalen</button>
      </div>
    </>
  );
}
