import { useMemo, useState } from 'react';
import { useLaad } from './api.js';
import { useSa, Kop, Laden, Tabs, Lijntje, StatusBadge, BedrijfLogo, PAKKETTEN, pakketLabel, euro, geleden } from './ui.jsx';

// Alle bedrijven in één tabel. Tabs op status (daar doe je iets anders mee),
// branche en pakket als filter. Testbedrijven staan erbij (vinkje Test), maar
// tellen niet mee in de kop.
const SORTEER = {
  naam: (a, b) => a.naam.localeCompare(b.naam, 'nl'),
  mrr: (a, b) => b.mrr - a.mrr,
  login: (a, b) => String(b.laatsteLogin ?? '').localeCompare(String(a.laatsteLogin ?? '')),
  nieuw: (a, b) => String(b.aangemaakt).localeCompare(String(a.aangemaakt)),
};

export default function Klanten() {
  const { ga } = useSa();
  const { data, laden, fout, herlaad } = useLaad('klanten');
  const [tab, setTab] = useState('alle');
  const [branche, setBranche] = useState('');
  const [pakket, setPakket] = useState('');
  const [zoek, setZoek] = useState('');
  const [test, setTest] = useState(true);
  const [sorteer, setSorteer] = useState('nieuw');

  const basis = useMemo(() => (data?.klanten ?? []).filter(k => test || !k.isTest), [data, test]);
  if (laden || fout) return <><Kop titel="Klanten" /><Laden fout={fout} herlaad={herlaad} /></>;

  const n = s => basis.filter(k => k.status === s).length;
  const branches = [...new Set(basis.map(k => k.branche || ''))].sort();
  const q = zoek.trim().toLowerCase();
  const lijst = basis
    .filter(k => tab === 'alle' || k.status === tab)
    .filter(k => !branche || (branche === '__geen__' ? !k.branche : k.branche === branche))
    .filter(k => !pakket || k.abonnement?.plan === pakket)
    .filter(k => !q || [k.naam, k.email, k.telefoon, k.eigenaar?.naam, k.eigenaar?.email, k.plaats].some(x => String(x ?? '').toLowerCase().includes(q)))
    .sort(SORTEER[sorteer]);
  // De kop telt alleen echte bedrijven; testbedrijven staan wel in de lijst.
  const echt = basis.filter(k => !k.isTest);
  const nEcht = s => echt.filter(k => k.status === s).length;
  const aantalTest = basis.length - echt.length;
  const mrr = echt.reduce((t, k) => t + k.mrr, 0);

  return (
    <>
      <Kop titel="Klanten" sub={`${echt.length} bedrijven${aantalTest ? ` en ${aantalTest} testbedrijven` : ''} · ${nEcht('actief') + nEcht('betaalprobleem')} betalend · ${nEcht('proef')} in proef · ${euro(mrr)} MRR`} />
      <div className="card afu2">
        <div className="tw-filter">
          <Tabs waarde={tab} onKies={setTab} opties={[
            { id: 'alle', label: 'Alle', n: basis.length }, { id: 'proef', label: 'Proef', n: n('proef') }, { id: 'actief', label: 'Betalend', n: n('actief') },
            { id: 'betaalprobleem', label: 'Betaalprobleem', n: n('betaalprobleem') }, { id: 'opgezegd', label: 'Opgezegd', n: n('opgezegd') },
            { id: 'geblokkeerd', label: 'Geblokkeerd', n: n('geblokkeerd') }, { id: 'geen', label: 'Geen abonnement', n: n('geen') },
          ]} />
          <input className="sa-input" style={{ width: 210 }} placeholder="Zoek naam, e-mail, telefoon" value={zoek} onChange={e => setZoek(e.target.value)} aria-label="Zoeken" />
          <select className="filter-select" value={branche} onChange={e => setBranche(e.target.value)} aria-label="Branche">
            <option value="">Alle branches</option>
            {branches.filter(Boolean).map(b => <option key={b} value={b}>{b} ({basis.filter(k => k.branche === b).length})</option>)}
            <option value="__geen__">Geen branche ({basis.filter(k => !k.branche).length})</option>
          </select>
          <select className="filter-select" value={pakket} onChange={e => setPakket(e.target.value)} aria-label="Pakket">
            <option value="">Alle pakketten</option>
            {PAKKETTEN.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select className="filter-select" value={sorteer} onChange={e => setSorteer(e.target.value)} aria-label="Sorteren">
            <option value="nieuw">Nieuwste eerst</option><option value="naam">Naam</option><option value="mrr">MRR</option><option value="login">Laatste login</option>
          </select>
          <label className="sa-check" style={{ marginTop: 0 }}><input type="checkbox" checked={test} onChange={e => setTest(e.target.checked)} /> Test</label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt sa-dt-klik">
            <thead><tr><th>Bedrijf</th><th>Pakket</th><th>Status</th><th>Gebr.</th><th>Telefoon</th><th>Laatste login</th><th>Activiteit</th><th style={{ textAlign: 'right' }}>MRR</th></tr></thead>
            <tbody>
              {lijst.map(k => (
                <tr key={k.id} onClick={() => ga(`klanten/${k.id}`)}>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <BedrijfLogo k={k} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--dk)' }}>{k.naam}</div>
                        <div className="lrow-sub">{[k.branche, k.plaats, k.eigenaar?.naam].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  </td>
                  <td>{k.abonnement ? <span className="badge b-concept">{pakketLabel(k.abonnement.plan)}</span> : ''}</td>
                  <td><StatusBadge k={k} />{k.upgradeVerzoek && <span className="badge b-blue" style={{ marginLeft: 4 }}>upgrade</span>}</td>
                  <td>{k.gebruikers}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{k.telefoon}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{k.laatsteLogin ? geleden(k.laatsteLogin) : 'nooit'}</td>
                  <td><Lijntje waarden={k.activiteit} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--dk)' }}>{k.mrr ? euro(k.mrr) : ''}</td>
                </tr>
              ))}
              {lijst.length === 0 && <tr><td colSpan={8} className="td-empty">Geen bedrijven met deze filters</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
