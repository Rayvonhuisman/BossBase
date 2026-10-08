import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/toast.jsx';
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
];
const VERZOEK_LABEL = { nieuw: 'Nieuw', in_behandeling: 'In behandeling', prijsopgave: 'Prijsopgave gestuurd', afgerond: 'Afgerond', afgewezen: 'Afgewezen' };

export default function Websites({ sub }) {
  const { ga } = useSa();
  const toast = useToast();
  const [rijen, setRijen] = useState(null);
  const [fout, setFout] = useState('');
  const [tab, setTab] = useState('lijn');
  const [test, setTest] = useState(false);
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
          <div className="pipe-wrap afu2"><div className="pipe-board" style={{ minHeight: 'auto' }}>
            {[...STAPPEN, ...(geannuleerd ? [{ id: 'geannuleerd', label: 'Geannuleerd' }] : [])].map(s => {
              const items = lijst.filter(w => w.status === s.id);
              return (
                <div key={s.id} className="pipe-col" style={{ flex: '0 0 230px', minWidth: 230 }}>
                  <div className="pipe-col-hd">
                    <div><div className="pipe-col-title">{s.label}</div><div style={{ fontSize: '.68rem', color: 'var(--dl)', marginTop: 2 }}>{s.wie ? `${s.wie} aan zet · norm ${s.norm} dagen` : s.id === 'live' ? 'Hosting loopt' : ''}</div></div>
                    <span className="pipe-col-cnt">{items.length}</span>
                  </div>
                  <div className="pipe-cards">
                    {items.map(w => {
                      const d = dagenSinds(sinds(w));
                      const over = s.norm && d > s.norm;
                      const punten = actiePunten(w);
                      return (
                        <div key={w.id} className={`pc sa-pc${over ? ' sa-pc-over' : ''}`} role="button" tabIndex={0} onClick={() => ga(`websites/${w.company_id}`)} onKeyDown={e => e.key === 'Enter' && ga(`websites/${w.company_id}`)}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{w.bedrijf?.name || 'Onbekend bedrijf'}{w.bedrijf?.is_testbedrijf && <span className="badge b-concept" style={{ marginLeft: 6 }}>test</span>}</div>
                          <div style={{ display: 'flex', gap: 4, margin: '6px 0', flexWrap: 'wrap' }}><span className="badge b-concept">{getPakket(w.pakket).label}</span>{w.site_url && <span className="badge b-blue">{w.site_url.replace(/^https?:\/\//, '')}</span>}</div>
                          {punten.length > 0 && <div style={{ fontSize: 11.5, color: '#b45309', fontWeight: 600 }}>{punten.join(' · ')}</div>}
                          <div style={{ fontSize: 11.5, color: over ? '#e8784a' : 'var(--dl)', fontWeight: over ? 600 : 400 }}>{s.id === 'live' ? `live sinds ${datum(w.live_op || sinds(w), true)}` : `${d} ${d === 1 ? 'dag' : 'dagen'} in deze stap${over ? ' · over de norm' : ''}`}</div>
                        </div>
                      );
                    })}
                    {items.length === 0 && <div className="lsec-empty" style={{ padding: 12 }}>Leeg</div>}
                  </div>
                </div>
              );
            })}
          </div></div>
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
