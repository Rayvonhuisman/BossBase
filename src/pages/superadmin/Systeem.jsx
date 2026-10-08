import { useLaad } from './api.js';
import { Kop, Laden, Sectie, geleden, tijdstip } from './ui.jsx';

// Systeem: per onderdeel een stoplicht, daaronder de details. Alleen lezen:
// herstellen gebeurt in de code, niet met knoppen hier.
const ROOD = '#dc2626', GROEN = '#15A34A', ORANJE = '#e8784a';

export default function Systeem() {
  const { data, laden, fout, herlaad } = useLaad('systeem');
  if (laden || fout) return <><Kop titel="Systeem" /><Laden fout={fout} herlaad={herlaad} /></>;
  const naam = id => data.bedrijven.find(b => b.id === id)?.name ?? '';
  const dag = Date.now() - 86400000;

  // Synchronisaties: laatste run per bedrijf/koppeling/onderdeel, met reeks mislukte.
  const perSleutel = new Map();
  for (const r of data.syncs) {
    const k = `${r.company_id}|${r.provider}|${r.onderdeel}`;
    if (!perSleutel.has(k)) perSleutel.set(k, []);
    perSleutel.get(k).push(r);
  }
  const syncs = [...perSleutel.values()].map(runs => {
    let reeks = 0;
    for (const r of runs) { if (r.gelukt) break; reeks++; }
    return { ...runs[0], reeks };
  }).sort((a, b) => b.reeks - a.reeks || String(b.gestart_op).localeCompare(String(a.gestart_op)));
  const mails24 = data.mails.filter(m => new Date(m.opgetreden_op).getTime() > dag);
  const stripeFout = data.stripe.filter(e => /mislukt|fout|error/i.test(e.resultaat ?? '') || e.resultaat == null);
  const snelstartFout = data.snelstart.filter(w => w.uitkomst !== 'verwerkt' && new Date(w.ontvangen_op).getTime() > dag);
  const cronFout = data.crons.filter(c => Number(c.mislukt_24u) > 0 || (c.actief && c.status === 'failed'));
  const fouten = {
    sync: syncs.filter(s => s.reeks > 0).length,
    mail: mails24.length,
    webhook: stripeFout.length + snelstartFout.length,
    cron: cronFout.length,
  };
  const totaal = Object.values(fouten).reduce((t, n) => t + n, 0);

  return (
    <>
      <Kop titel="Systeem" sub={totaal ? `${totaal} ${totaal === 1 ? 'punt vraagt' : 'punten vragen'} aandacht` : 'Alles draait'}>
        <button className="btn btn-s btn-sm" onClick={herlaad}>Vernieuwen</button>
      </Kop>
      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        {[['Synchronisaties', fouten.sync, 'koppelingen die nu falen'], ['Mails', fouten.mail, 'niet aangekomen, 24 uur'], ['Webhooks', fouten.webhook, 'niet verwerkt'], ['Geplande taken', fouten.cron, 'mislukt, 24 uur']].map(([l, n, s]) => (
          <div key={l} className="sc">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="sa-stip" style={{ background: n ? ROOD : GROEN, width: 10, height: 10 }} /><div className="sc-val" style={{ fontSize: '1.2rem' }}>{n ? `${n}` : 'In orde'}</div></div>
            <div className="sc-label">{l}</div><div className="sc-sub">{n ? s : ''}</div>
          </div>
        ))}
      </div>

      <div className="sa-twee sa-twee-gelijk">
        <div className="card card-p"><Sectie titel="Synchronisaties boekhouding (7 dagen)">
          {!syncs.length && <div className="lrow-sub">Geen runs.</div>}
          <div className="lrows">{syncs.slice(0, 30).map(s => (
            <div key={s.id} className="lrow lrow-static">
              <span className="sa-stip" style={{ background: s.reeks ? ROOD : GROEN }} />
              <div className="lrow-main"><div className="lrow-title">{s.provider} · {s.onderdeel} · {naam(s.company_id)}</div><div className="lrow-sub">{s.reeks ? `${String(s.fout ?? 'mislukt').slice(0, 140)} · ${s.reeks}× op rij` : (typeof s.samenvatting === 'string' ? s.samenvatting : s.bron ?? 'gelukt')}</div></div>
              <div className="lrow-date">{geleden(s.gestart_op)}</div>
            </div>
          ))}</div>
        </Sectie></div>

        <div className="card card-p"><Sectie titel="Mislukte mails (7 dagen)">
          {!data.mails.length && <div className="lrow-sub">Geen mislukte mails.</div>}
          <div className="lrows">{data.mails.slice(0, 30).map(m => (
            <div key={m.id} className="lrow lrow-static">
              <div className="lrow-main"><div className="lrow-title">{m.soort} → {m.ontvanger}</div><div className="lrow-sub">{[m.bedrijf_naam, String(m.fout ?? '').slice(0, 120), m.bron].filter(Boolean).join(' · ')}</div></div>
              <div className="lrow-date">{geleden(m.opgetreden_op)}</div>
            </div>
          ))}</div>
        </Sectie></div>

        <div className="card card-p"><Sectie titel="Webhooks">
          <div className="lrows">
            {data.stripe.slice(0, 15).map(e => (
              <div key={e.event_id} className="lrow lrow-static">
                <span className="sa-stip" style={{ background: stripeFout.includes(e) ? ROOD : GROEN }} />
                <div className="lrow-main"><div className="lrow-title">Stripe · {e.type}</div><div className="lrow-sub">{[naam(e.company_id), String(e.resultaat ?? 'nog niet verwerkt').slice(0, 140)].filter(Boolean).join(' · ')}</div></div>
                <div className="lrow-date">{geleden(e.verwerkt_op)}</div>
              </div>
            ))}
            {data.snelstart.slice(0, 10).map(w => (
              <div key={w.id} className="lrow lrow-static">
                <span className="sa-stip" style={{ background: w.uitkomst === 'verwerkt' ? GROEN : ROOD }} />
                <div className="lrow-main"><div className="lrow-title">SnelStart · {w.actie ?? 'webhook'}</div><div className="lrow-sub">{[w.bedrijf_naam, w.uitkomst, w.melding].filter(Boolean).join(' · ')}</div></div>
                <div className="lrow-date">{geleden(w.ontvangen_op)}</div>
              </div>
            ))}
          </div>
        </Sectie></div>

        <div className="card card-p"><Sectie titel="Geplande taken">
          <div className="lrows">{data.crons.map(c => (
            <div key={c.naam} className="lrow lrow-static">
              <span className="sa-stip" style={{ background: !c.actief ? '#9ca3af' : Number(c.mislukt_24u) > 0 || c.status === 'failed' ? ROOD : /^afas/.test(c.naam) ? ORANJE : GROEN }} />
              <div className="lrow-main">
                <div className="lrow-title">{c.naam}</div>
                <div className="lrow-sub">{[c.schema, c.duur_ms != null ? `${Math.round(c.duur_ms)} ms` : null, !c.actief ? 'uitgezet' : null, Number(c.mislukt_24u) > 0 ? `${c.mislukt_24u}× mislukt in 24 uur` : null, c.status === 'failed' ? String(c.melding ?? '').slice(0, 120) : null, /^afas/.test(c.naam) ? 'AFAS staat geparkeerd: opruimen?' : null].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="lrow-date" title={tijdstip(c.laatst)}>{c.laatst ? geleden(c.laatst) : 'nooit'}</div>
            </div>
          ))}</div>
        </Sectie></div>
      </div>
    </>
  );
}
