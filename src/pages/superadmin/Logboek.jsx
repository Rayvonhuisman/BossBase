import { useState } from 'react';
import { useLaad } from './api.js';
import { useSa, Kop, Laden, Tabs, tijdstip } from './ui.jsx';

// Elke handeling in de superadmin: wie, wat, wanneer, bij wie. Het logboek
// wordt aan de serverkant geschreven vóór de handeling; niemand kan een regel
// wijzigen of wissen.
export default function Logboek() {
  const { ga } = useSa();
  const [soort, setSoort] = useState('');
  const { data, laden, fout, herlaad } = useLaad('logboek', { soort: soort || undefined, limiet: 500 });
  const [open, setOpen] = useState(null);
  return (
    <>
      <Kop titel="Logboek" sub="Elke handeling in de superadmin: wie, wat, wanneer en bij wie" />
      <div className="card afu2">
        <div className="tw-filter">
          <Tabs waarde={soort} onKies={setSoort} opties={[{ id: '', label: 'Alles' }, { id: 'aanvraag', label: 'Aanvragen' }, { id: 'klant', label: 'Klanten' }, { id: 'website', label: 'Websites' }, { id: 'support', label: 'Support' }, { id: 'systeem', label: 'Systeem' }]} />
        </div>
        {(laden || fout) ? <div style={{ padding: 16 }}><Laden fout={fout} herlaad={herlaad} /></div> : (
          <div style={{ overflowX: 'auto' }}><table className="dt">
            <thead><tr><th>Wanneer</th><th>Wie</th><th>Wat</th><th>Bij</th><th>Uitkomst</th></tr></thead>
            <tbody>
              {data.logboek.map(l => (
                <tr key={l.id} onClick={() => setOpen(open === l.id ? null : l.id)} style={{ cursor: 'pointer', verticalAlign: 'top' }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{tijdstip(l.op)}</td>
                  <td>{l.door_naam}</td>
                  <td style={{ color: 'var(--dk)', fontWeight: 500 }}>
                    {l.omschrijving}
                    {open === l.id && (
                      <div className="lrow-sub" style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                        {[`actie: ${l.actie}`, l.voor ? `voor: ${JSON.stringify(l.voor)}` : null, l.na ? `na: ${JSON.stringify(l.na)}` : null, l.fout ? `fout: ${l.fout}` : null].filter(Boolean).join('\n')}
                      </div>
                    )}
                  </td>
                  <td>{l.company_id ? <a href={`/superadmin/klanten/${l.company_id}`} onClick={e => { e.preventDefault(); e.stopPropagation(); ga(`klanten/${l.company_id}`); }} style={{ color: 'var(--pd)' }}>{l.doel || 'bedrijf'}</a> : l.doel}</td>
                  <td>{l.uitkomst === 'mislukt' ? <span className="badge b-red">mislukt</span> : l.uitkomst ? <span className="badge b-green">gelukt</span> : <span className="badge b-gray" title="Geen uitkomst vastgelegd: de handeling is onderbroken">onbekend</span>}</td>
                </tr>
              ))}
              {!data.logboek.length && <tr><td colSpan={5} className="td-empty">Nog niets vastgelegd</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
