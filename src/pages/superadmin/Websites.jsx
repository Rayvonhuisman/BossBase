import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/toast.jsx';
import { bevestig } from '../../lib/bevestig.jsx';
import { Bord } from './Bord.jsx';
import { roep as roepWebsite, Detail, actiePunten, betalingSamenvatting } from '../../components/WebsitesBeheer.jsx';
import { getPakket } from '../../lib/website.js';
import { useSa, Kop, Laden, Tabs, Lade, datum, geleden, dagenSinds } from './ui.jsx';

// Websites: het traject als productielijn, met per stap wie aan zet is en een
// norm in dagen. De lade per site is de bestaande Detail uit WebsitesBeheer,
// zodat elke handeling (status met of zonder mail, intakebestanden, intake
// kopiëren, intakelink, hostinglink, regel stoppen, domein en e-mail actief,
// verzoeken afhandelen) precies zo blijft werken. Alles via website-beheer.
const STAPPEN = [
  { id: 'wacht_op_intake', label: 'Wacht op intake', norm: 7, wie: 'Klant' },
  { id: 'intake_ontvangen', label: 'Intake ontvangen', norm: 2, wie: 'Wij' },
  { id: 'in_bouw', label: 'In bouw', norm: 10, wie: 'Wij' },
  { id: 'ter_beoordeling', label: 'Ter beoordeling', norm: 5, wie: 'Klant' },
  { id: 'live', label: 'Live', norm: null, wie: null },
  { id: 'geannuleerd', label: 'Geannuleerd', norm: null, wie: null },
];
const VERZOEK_LABEL = { nieuw: 'Nieuw', in_behandeling: 'In behandeling', prijsopgave: 'Prijsopgave gestuurd', afgerond: 'Afgerond', afgewezen: 'Afgewezen' };

export default function Websites({ sub }) {
  const { ga } = useSa();
  const toast = useToast();
  const [rijen, setRijen] = useState(null);
  const [fout, setFout] = useState('');
  const [tab, setTab] = useState('lijn');
  const [test, setTest] = useState(true);
  const [geannuleerd, setGeannuleerd] = useState(false);

  const laad = useCallback(async () => {
    try { setRijen((await roepWebsite('lijst')).websites || []); setFout(''); }
    catch (e) { setFout(e.message || 'Laden mislukt'); }
  }, []);
  useEffect(() => { laad(); }, [laad]);

  if (!rijen) return <><Kop titel="Websites" /><Laden fout={fout} herlaad={laad} /></>;

  const lijst = rijen.filter(w => test || !w.bedrijf?.is_testbedrijf);
  const sinds = w => w.status_gewijzigd_op || w.aangevraagd_op;
  const verzoeken = lijst.flatMap(w => (w.verzoeken || []).map(v => ({ ...v, bedrijf: w.bedrijf, company_id: w.company_id })));
  const betalingen = lijst.flatMap(w => (w.betalingen || []).map(b => ({ ...b, bedrijf: w.bedrijf, company_id: w.company_id })));
  const open = sub ? rijen.find(w => w.company_id === sub) : null;
  const metActie = lijst.filter(w => actiePunten(w).length > 0).length;

  return (
    <>
      <Kop titel="Websites" sub={`Het gratis-website-traject, van betaling tot live en daarna${metActie ? ` · ${metActie} met actie` : ''}`}>
        <label className="sa-check" style={{ marginTop: 0 }}><input type="checkbox" checked={test} onChange={e => setTest(e.target.checked)} /> Test</label>
        <span className="lrow-sub">Sleep een site naar een andere stap</span>
      </Kop>
      <div style={{ marginBottom: 14 }}>
        <Tabs waarde={tab} onKies={setTab} opties={[
          { id: 'lijn', label: 'Productielijn', n: lijst.filter(w => !['live', 'geannuleerd'].includes(w.status)).length },
          { id: 'verzoeken', label: 'Wijzigingsverzoeken', n: verzoeken.filter(v => ['nieuw', 'in_behandeling', 'prijsopgave'].includes(v.status)).length },
          { id: 'betalingen', label: 'Hosting en betalingen', n: betalingen.filter(b => b.status === 'mislukt' || b.fout).length },
        ]} />
      </div>

      {tab === 'lijn' && (
        <>
          <Bord
            kolommen={STAPPEN.map(s => ({
              id: s.id,
              kop: <div className="pipe-col-title">{s.label}</div>,
              sub: s.wie ? `${s.wie} aan zet · norm ${s.norm} dagen` : s.id === 'live' ? 'Hosting loopt' : null,
            }))}
            tijdensSlepen={geannuleerd ? [] : ['geannuleerd']}
            items={lijst}
            sleutel={w => w.id}
            kolomVan={w => w.status}
            onOpen={w => ga(`websites/${w.company_id}`)}
            kaartKlasse={w => { const st = STAPPEN.find(s => s.id === w.status); return st?.norm && dagenSinds(sinds(w)) > st.norm ? 'sa-pc-over' : ''; }}
            onVerplaats={async (w, status) => {
              const naar = STAPPEN.find(s => s.id === status);
              const ok = await bevestig({
                titel: 'Status wijzigen',
                tekst: `${w.bedrijf?.name || 'Deze website'} naar "${naar.label}" zetten? De klant krijgt hierover een mail, net als bij wijzigen in de lade. Zonder mail wijzigen kan in de lade van de site.`,
                knop: 'Zetten en mailen',
              });
              if (!ok) return false;
              try {
                const r = await roepWebsite('status', { companyId: w.company_id, status, siteUrl: w.site_url || '', mail: true });
                toast.success(`${naar.label}${r?.resultaat?.length ? `: ${r.resultaat.join(', ')}` : ''}`);
                laad();
                return true;
              } catch (e) {
                toast.error(e.message || 'Wijzigen mislukt');
                return false;
              }
            }}
            kaart={w => {
              const st = STAPPEN.find(s => s.id === w.status);
              const d = dagenSinds(sinds(w));
              const over = st?.norm && d > st.norm;
              const punten = actiePunten(w);
              return (
                <>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{w.bedrijf?.name || 'Onbekend bedrijf'}{w.bedrijf?.is_testbedrijf && <span className="badge b-concept" style={{ marginLeft: 6 }}>test</span>}</div>
                  <div style={{ display: 'flex', gap: 4, margin: '6px 0', flexWrap: 'wrap' }}><span className="badge b-concept">{getPakket(w.pakket).label}</span>{w.site_url && <span className="badge b-blue">{w.site_url.replace(/^https?:\/\//, '')}</span>}</div>
                  {punten.length > 0 && <div style={{ fontSize: 11.5, color: '#b45309', fontWeight: 600 }}>{punten.join(' · ')}</div>}
                  <div style={{ fontSize: 11.5, color: over ? '#e8784a' : 'var(--dl)', fontWeight: over ? 600 : 400 }}>{w.status === 'live' ? `live sinds ${datum(w.live_op || sinds(w), true)}` : `${d} ${d === 1 ? 'dag' : 'dagen'} in deze stap${over ? ' · over de norm' : ''}`}</div>
                </>
              );
            }}
          />
          <button className="btn btn-ghost btn-xs" onClick={() => setGeannuleerd(v => !v)}>{geannuleerd ? 'Geannuleerd verbergen' : `Geannuleerd tonen (${lijst.filter(w => w.status === 'geannuleerd').length})`}</button>
        </>
      )}

      {tab === 'verzoeken' && (
        <div className="card"><div style={{ overflowX: 'auto' }}><table className="dt sa-dt-klik">
          <thead><tr><th>Bedrijf</th><th>Soort</th><th>Verzoek</th><th>Status</th><th>Ontvangen</th></tr></thead>
          <tbody>
            {verzoeken.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(v => (
              <tr key={v.id} onClick={() => ga(`websites/${v.company_id}`)}>
                <td style={{ fontWeight: 600, color: 'var(--dk)' }}>{v.bedrijf?.name}</td><td>{v.soort}</td><td style={{ maxWidth: 420 }}>{v.omschrijving}</td>
                <td><span className={`badge ${v.status === 'nieuw' ? 'b-new' : ['afgerond', 'afgewezen'].includes(v.status) ? 'b-done' : 'b-progress'}`}>{VERZOEK_LABEL[v.status] ?? v.status}</span></td><td>{geleden(v.created_at)}</td>
              </tr>
            ))}
            {!verzoeken.length && <tr><td colSpan={5} className="td-empty">Geen verzoeken</td></tr>}
          </tbody>
        </table></div><div className="lrow-sub" style={{ padding: '10px 16px' }}>Afhandelen gaat in de lade van de site (klik op een regel).</div></div>
      )}

      {tab === 'betalingen' && (
        <div className="card"><div style={{ overflowX: 'auto' }}><table className="dt sa-dt-klik">
          <thead><tr><th>Bedrijf</th><th>Wat</th><th>Status</th><th>Sinds</th></tr></thead>
          <tbody>
            {betalingen.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(b => (
              <tr key={b.id} onClick={() => ga(`websites/${b.company_id}`)}>
                <td style={{ fontWeight: 600, color: 'var(--dk)' }}>{b.bedrijf?.name}</td>
                <td>{betalingSamenvatting(b)}{b.fout && <div className="lrow-sub" style={{ color: '#dc2626' }}>{b.fout}</div>}</td>
                <td><span className={`badge ${b.status === 'mislukt' || b.fout ? 'b-overdue' : ['loopt', 'betaald', 'afgerond'].includes(b.status) ? 'b-paid' : 'b-gray'}`}>{b.status}</span></td>
                <td>{datum(b.betaald_op || b.created_at, true)}</td>
              </tr>
            ))}
            {!betalingen.length && <tr><td colSpan={4} className="td-empty">Geen betalingen</td></tr>}
          </tbody>
        </table></div></div>
      )}

      {open && (
        <Lade titel={open.bedrijf?.name || 'Website'} sub={`Website ${getPakket(open.pakket).label} · ${STAPPEN.find(s => s.id === open.status)?.label ?? open.status}`} onSluit={() => ga('websites')}
          acties={<button className="btn btn-s btn-sm" onClick={() => ga(`klanten/${open.company_id}`)}>Naar klant</button>}>
          <Detail key={open.id + open.status} w={open} herlaad={laad} toast={toast} />
        </Lade>
      )}
    </>
  );
}
