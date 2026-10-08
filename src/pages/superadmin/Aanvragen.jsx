import { useEffect, useState } from 'react';
import { Phone, Mail, ArrowRight } from 'lucide-react';
import { useLaad } from './api.js';
import { useSa, Kop, Laden, Lade, Sectie, Rij, Notities, datum, geleden, dagenSinds } from './ui.jsx';

// Aanvragen via bossbase.nl als pipeline. "In proef" en "Klant" vult de
// server zelf zodra het e-mailadres een account heeft; die zet je hier niet
// met de hand.
export const FASEN = [
  { id: 'nieuw', label: 'Nieuw', badge: 'b-new' },
  { id: 'contact', label: 'Contact gehad', badge: 'b-progress' },
  { id: 'demo', label: 'Demo', badge: 'b-blue' },
  { id: 'proef', label: 'In proef', badge: 'b-orange', automatisch: true },
  { id: 'klant', label: 'Klant', badge: 'b-paid', automatisch: true },
  { id: 'afgewezen', label: 'Afgewezen', badge: 'b-lost' },
];
const REDENEN = ['Spam', 'Past niet bij BossBase', 'Te duur', 'Koos iets anders', 'Geen reactie meer', 'Anders'];

export default function Aanvragen({ sub }) {
  const { ga, doe } = useSa();
  const { data, laden, fout, herlaad } = useLaad('aanvragen');
  const [kanaal, setKanaal] = useState('');
  const [afgewezenTonen, setAfgewezenTonen] = useState(false);
  const [testTonen, setTestTonen] = useState(false);

  if (laden || fout) return <><Kop titel="Aanvragen" /><Laden fout={fout} herlaad={herlaad} /></>;

  const alle = data.aanvragen.filter(a => testTonen || !a.isTest);
  const kanalen = [...new Set(alle.map(a => a.kanaal || 'Onbekend'))].sort();
  const lijst = kanaal ? alle.filter(a => (a.kanaal || 'Onbekend') === kanaal) : alle;
  const kolommen = FASEN.filter(f => afgewezenTonen || f.id !== 'afgewezen');
  const open = data.aanvragen.find(a => a.id === sub) ?? null;
  const recent = alle.filter(a => dagenSinds(a.ontvangen) <= 90);
  const conversie = recent.length ? Math.round((recent.filter(a => a.fase === 'klant').length / recent.length) * 100) : null;

  return (
    <>
      <Kop titel="Aanvragen" sub="Alles wat via bossbase.nl binnenkomt, van eerste bericht tot klant">
        <select className="filter-select" value={kanaal} onChange={e => setKanaal(e.target.value)} aria-label="Kanaal">
          <option value="">Alle kanalen</option>
          {kanalen.map(k => <option key={k}>{k}</option>)}
        </select>
        <label className="sa-check" style={{ marginTop: 0 }}><input type="checkbox" checked={testTonen} onChange={e => setTestTonen(e.target.checked)} /> Test</label>
        <button className="btn btn-s btn-sm" onClick={() => setAfgewezenTonen(v => !v)}>{afgewezenTonen ? 'Afgewezen verbergen' : 'Afgewezen tonen'}</button>
      </Kop>

      <div className="sa-trechter-mini afu2">
        {FASEN.filter(f => f.id !== 'afgewezen').map((f, i) => (
          <div key={f.id} className="sa-tm-stap">
            <div className="sa-tm-n">{lijst.filter(a => a.fase === f.id).length}</div>
            <div className="sa-tm-l">{f.label}</div>
            {i < 4 && <ArrowRight size={14} className="sa-tm-pijl" aria-hidden="true" />}
          </div>
        ))}
        {conversie != null && <div className="sa-tm-conv">Van aanvraag naar klant (90 dagen): <b>{conversie}%</b></div>}
      </div>

      <div className="pipe-wrap afu2">
        <div className="pipe-board" style={{ minHeight: 'auto' }}>
          {kolommen.map(f => {
            const kaarten = lijst.filter(a => a.fase === f.id);
            return (
              <div key={f.id} className="pipe-col" style={{ flex: '0 0 250px', minWidth: 250 }}>
                <div className="pipe-col-hd">
                  <div>
                    <span className={`badge ${f.badge}`}>{f.label}</span>
                    {f.automatisch && <div style={{ fontSize: '.68rem', color: 'var(--dl)', marginTop: 4 }}>vult zichzelf</div>}
                  </div>
                  <span className="pipe-col-cnt">{kaarten.length}</span>
                </div>
                <div className="pipe-cards">
                  {kaarten.map(a => (
                    <div key={a.id} className="pc sa-pc" role="button" tabIndex={0} onClick={() => ga(`aanvragen/${a.id}`)} onKeyDown={e => e.key === 'Enter' && ga(`aanvragen/${a.id}`)}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{a.naam}</div>
                      {a.bedrijf && <div style={{ fontSize: 12, color: 'var(--dmu)' }}>{a.bedrijf}</div>}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '8px 0 6px' }}>
                        {a.onderwerp && <span className="badge b-concept">{a.onderwerp}</span>}
                        {a.kanaal && <span className="badge b-blue">{a.kanaal}</span>}
                        {a.isTest && <span className="badge b-concept">test</span>}
                      </div>
                      {a.volgendeStap && <div style={{ fontSize: 11.5, color: 'var(--dm)' }}>→ {a.volgendeStap}</div>}
                      {a.afwijsreden && <div style={{ fontSize: 11.5, color: 'var(--dl)' }}>Reden: {a.afwijsreden}</div>}
                      <div style={{ fontSize: 11, color: a.fase === 'nieuw' && dagenSinds(a.ontvangen) === 0 ? 'var(--pd)' : 'var(--dl)', marginTop: 6 }}>{geleden(a.ontvangen)}{a.notities.length ? ` · ${a.notities.length} ${a.notities.length === 1 ? 'notitie' : 'notities'}` : ''}</div>
                    </div>
                  ))}
                  {kaarten.length === 0 && <div className="lsec-empty" style={{ padding: 12 }}>Leeg</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {sub && !open && <Lade titel="Aanvraag niet gevonden" onSluit={() => ga('aanvragen')}><div className="lrow-sub">Deze aanvraag bestaat niet (meer).</div></Lade>}
      {open && <AanvraagLade a={open} herlaad={herlaad} onSluit={() => ga('aanvragen')} doe={doe} ga={ga} />}
    </>
  );
}

function AanvraagLade({ a, herlaad, onSluit, doe, ga }) {
  const [stap, setStap] = useState(a.volgendeStap ?? '');
  const [afwijzen, setAfwijzen] = useState(false);
  const [reden, setReden] = useState(REDENEN[0]);
  useEffect(() => { setStap(a.volgendeStap ?? ''); setAfwijzen(false); }, [a.id, a.volgendeStap]);

  const zetFase = async (fase, extra = {}) => {
    const r = await doe('aanvraag-fase', { id: a.id, fase, ...extra }, { succes: `Naar "${FASEN.find(f => f.id === fase).label}"` });
    if (r) { setAfwijzen(false); herlaad(); }
  };
  const bewaarStap = async () => {
    if ((stap.trim() || null) === (a.volgendeStap || null)) return;
    if (await doe('aanvraag-stap', { id: a.id, tekst: stap }, { succes: 'Volgende stap opgeslagen' })) herlaad();
  };
  const antwoord = `mailto:${a.email}?subject=${encodeURIComponent(`Re: ${a.onderwerp || 'je aanvraag bij BossBase'}`)}`;

  return (
    <Lade titel={`${a.naam}${a.bedrijf ? ` · ${a.bedrijf}` : ''}`} sub={`Via bossbase.nl · ${datum(a.ontvangen, true)} (${geleden(a.ontvangen)})${a.isTest ? ' · test' : ''}`} onSluit={onSluit}
      acties={<>
        {a.email && <a className="btn btn-p btn-sm" href={antwoord}><Mail size={13} />Beantwoorden</a>}
        {a.telefoon && <a className="btn btn-s btn-sm" href={`tel:${a.telefoon.replace(/\s/g, '')}`}><Phone size={13} />Bellen</a>}
        {a.companyId && <button className="btn btn-s btn-sm" onClick={() => ga(`klanten/${a.companyId}`)}>Naar klant</button>}
      </>}>
      <Sectie titel="Fase">
        <div className="sa-knoppen">
          {FASEN.map(f => (
            <button key={f.id} className={`btn btn-sm ${a.fase === f.id ? 'btn-p' : 'btn-s'}`}
              disabled={a.fase === f.id || f.automatisch}
              title={f.automatisch ? 'Gaat vanzelf zodra er een account (proef) of een betaald abonnement (klant) is met dit e-mailadres' : undefined}
              onClick={() => f.id === 'afgewezen' ? setAfwijzen(true) : zetFase(f.id)}>{f.label}</button>
          ))}
        </div>
        {afwijzen && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="filter-select" value={reden} onChange={e => setReden(e.target.value)} aria-label="Reden">{REDENEN.map(r => <option key={r}>{r}</option>)}</select>
            <button className="btn btn-p btn-sm" onClick={() => zetFase('afgewezen', { reden })}>Afwijzen</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAfwijzen(false)}>Annuleren</button>
          </div>
        )}
        {a.fase === 'afgewezen' && a.afwijsreden && <div className="lrow-sub" style={{ marginTop: 6 }}>Reden: {a.afwijsreden}</div>}
      </Sectie>

      <Sectie titel="Volgende stap">
        <input className="sa-input" value={stap} onChange={e => setStap(e.target.value)} onBlur={bewaarStap} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} placeholder="Bijv. terugbellen donderdag" maxLength={300} />
      </Sectie>

      <Sectie titel="Gegevens">
        <Rij label="E-mail" waarde={a.email && <a href={`mailto:${a.email}`} style={{ color: 'var(--pd)' }}>{a.email}</a>} />
        <Rij label="Telefoon" waarde={a.telefoon} />
        <Rij label="Branche" waarde={a.branche} />
        <Rij label="Onderwerp" waarde={a.onderwerp} />
        <Rij label="Kanaal" waarde={a.kanaal || 'Onbekend (van vóór de eigen meting)'} />
        <Rij label="Pagina" waarde={a.pagina} />
      </Sectie>

      <Sectie titel="Bericht">
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{a.bericht || '—'}</div>
      </Sectie>

      <Sectie titel="Notities">
        <Notities lijst={a.notities} onToevoegen={async tekst => { if (await doe('notitie', { soort: 'aanvraag', id: a.id, tekst }, { succes: 'Notitie toegevoegd' })) herlaad(); }} />
      </Sectie>
    </Lade>
  );
}

