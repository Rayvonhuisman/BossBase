import { useEffect, useState } from 'react';
import { roep, useLaad } from './api.js';
import { useSa, Kop, Laden, Tabs, Lade, Sectie, Rij, tijdstip, geleden } from './ui.jsx';

// Support: wat klanten melden (meldpunt) en vragen (doorgezet door Boss), plus
// de prijsactie van het meldpunt met de deelnemers.
const MELD_STATUS = [
  { id: 'nieuw', label: 'Nieuw', badge: 'b-new' },
  { id: 'opgepakt', label: 'Opgepakt', badge: 'b-progress' },
  { id: 'afgehandeld', label: 'Afgehandeld', badge: 'b-done' },
  { id: 'afgewezen', label: 'Afgewezen', badge: 'b-lost' },
];
const meldBadge = s => MELD_STATUS.find(x => x.id === s) ?? { label: s, badge: 'b-gray' };

export default function Support({ sub }) {
  const { ga } = useSa();
  const { data, laden, fout, herlaad } = useLaad('support');
  const tab = ['meldpunt', 'boss', 'actie'].includes(sub) ? sub : 'meldpunt';
  if (laden || fout) return <><Kop titel="Support" /><Laden fout={fout} herlaad={herlaad} /></>;
  const nieuw = data.meldingen.filter(m => m.status === 'nieuw').length;
  const bossOpen = data.boss.filter(g => !g.doorzet_afgehandeld_op).length;
  return (
    <>
      <Kop titel="Support" sub="Wat klanten melden en vragen" />
      <div style={{ marginBottom: 14 }}>
        <Tabs waarde={tab} onKies={t => ga(`support/${t}`)} opties={[
          { id: 'meldpunt', label: 'Meldpunt', n: nieuw },
          { id: 'boss', label: 'Vragen via Boss', n: bossOpen },
          { id: 'actie', label: 'Prijsactie' },
        ]} />
      </div>
      {tab === 'meldpunt' && <Meldpunt meldingen={data.meldingen} herlaad={herlaad} />}
      {tab === 'boss' && <Boss gesprekken={data.boss} herlaad={herlaad} />}
      {tab === 'actie' && <Prijsactie instelling={data.prijsactie} meldingen={data.meldingen} herlaad={herlaad} />}
    </>
  );
}

function Meldpunt({ meldingen, herlaad }) {
  const { doe } = useSa();
  const [status, setStatus] = useState('open');
  const [soort, setSoort] = useState('');
  const [open, setOpen] = useState(null);
  const lijst = meldingen
    .filter(m => status === 'alle' || (status === 'open' ? ['nieuw', 'opgepakt'].includes(m.status) : m.status === status))
    .filter(m => !soort || m.soort === soort);
  const m = meldingen.find(x => x.id === open);
  return (
    <>
      <div className="card">
        <div className="tw-filter">
          <Tabs waarde={status} onKies={setStatus} opties={[{ id: 'open', label: 'Open' }, ...MELD_STATUS.map(s => ({ id: s.id, label: s.label })), { id: 'alle', label: 'Alle' }]} />
          <select className="filter-select" value={soort} onChange={e => setSoort(e.target.value)} aria-label="Soort"><option value="">Bugs en ideeën</option><option value="bug">Bugs</option><option value="idee">Ideeën</option></select>
        </div>
        <div style={{ overflowX: 'auto' }}><table className="dt sa-dt-klik">
          <thead><tr><th>#</th><th>Soort</th><th>Melding</th><th>Van</th><th>Status</th><th>Ontvangen</th></tr></thead>
          <tbody>
            {lijst.map(x => (
              <tr key={x.id} onClick={() => setOpen(x.id)}>
                <td>{x.nummer}</td>
                <td><span className={`badge ${x.soort === 'bug' ? 'b-red' : 'b-blue'}`}>{x.soort}</span></td>
                <td style={{ maxWidth: 380 }}>{String(x.omschrijving ?? '').slice(0, 160)}{x.actie_deelname && <span className="badge b-purple" style={{ marginLeft: 6 }}>actie</span>}{x.screenshot_pad && <span className="badge b-gray" style={{ marginLeft: 6 }}>schermafdruk</span>}</td>
                <td>{x.bedrijf_naam}<div className="lrow-sub">{x.gebruiker_naam}</div></td>
                <td><span className={`badge ${meldBadge(x.status).badge}`}>{meldBadge(x.status).label}</span>{!x.mail_verstuurd_op && <div className="lrow-sub" style={{ color: '#b45309' }}>mail niet verstuurd</div>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{geleden(x.aangemaakt_op)}</td>
              </tr>
            ))}
            {!lijst.length && <tr><td colSpan={6} className="td-empty">Geen meldingen</td></tr>}
          </tbody>
        </table></div>
      </div>
      {m && <MeldingLade m={m} onSluit={() => setOpen(null)} herlaad={herlaad} doe={doe} />}
    </>
  );
}

function MeldingLade({ m, onSluit, herlaad, doe }) {
  const [notitie, setNotitie] = useState(m.notitie ?? '');
  const [schermafdruk, setSchermafdruk] = useState(null);
  useEffect(() => { setNotitie(m.notitie ?? ''); setSchermafdruk(null); }, [m.id, m.notitie]);
  return (
    <Lade titel={`Melding #${m.nummer} · ${m.soort}`} sub={`${m.gebruiker_naam ?? ''} · ${m.bedrijf_naam ?? ''} · ${tijdstip(m.aangemaakt_op)}`} onSluit={onSluit}
      acties={m.gebruiker_email && <a className="btn btn-p btn-sm" href={`mailto:${m.gebruiker_email}?subject=${encodeURIComponent(`Je melding #${m.nummer} bij BossBase`)}`}>Mailen</a>}>
      <Sectie titel="Status">
        <div className="sa-knoppen">
          {MELD_STATUS.map(s => <button key={s.id} className={`btn btn-sm ${m.status === s.id ? 'btn-p' : 'btn-s'}`} disabled={m.status === s.id} onClick={async () => { if (await doe('melding-status', { id: m.id, status: s.id }, { succes: `Melding #${m.nummer}: ${s.label.toLowerCase()}` })) herlaad(); }}>{s.label}</button>)}
        </div>
      </Sectie>
      <Sectie titel="Melding"><div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.omschrijving}</div></Sectie>
      <Sectie titel="Context">
        <Rij label="Pagina" waarde={m.pagina || m.pagina_url} />
        <Rij label="Browser" waarde={m.browser} />
        <Rij label="Scherm" waarde={m.scherm} />
        <Rij label="Abonnement" waarde={m.abonnement} />
        <Rij label="Rol" waarde={m.gebruiker_rol} />
        <Rij label="Doet mee aan actie" waarde={m.actie_deelname ? 'Ja' : ''} />
        <Rij label="Mail naar ons" waarde={m.mail_verstuurd_op ? tijdstip(m.mail_verstuurd_op) : 'niet verstuurd'} />
      </Sectie>
      {m.screenshot_pad && (
        <Sectie titel="Schermafdruk">
          {schermafdruk ? <a href={schermafdruk} target="_blank" rel="noreferrer"><img src={schermafdruk} alt={`Schermafdruk bij melding ${m.nummer}`} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} /></a>
            : <button className="btn btn-s btn-sm" onClick={async () => { const r = await doe('screenshot', { id: m.id }, { succes: false }); if (r?.url) setSchermafdruk(r.url); }}>Schermafdruk openen</button>}
        </Sectie>
      )}
      <Sectie titel="Notitie (intern)">
        <textarea className="sa-input" value={notitie} onChange={e => setNotitie(e.target.value)} />
        <button className="btn btn-p btn-sm" style={{ marginTop: 8 }} disabled={notitie === (m.notitie ?? '')} onClick={async () => { if (await doe('melding-notitie', { id: m.id, notitie }, { succes: 'Notitie opgeslagen' })) herlaad(); }}>Notitie opslaan</button>
      </Sectie>
    </Lade>
  );
}

function Boss({ gesprekken, herlaad }) {
  const { doe, ga } = useSa();
  const [toonAlles, setToonAlles] = useState(false);
  const [open, setOpen] = useState(null);
  const [gesprek, setGesprek] = useState(null);
  const lijst = gesprekken.filter(g => toonAlles || !g.doorzet_afgehandeld_op);
  const openen = async g => {
    setOpen(g); setGesprek(null);
    try { setGesprek((await roep('boss-gesprek', { id: g.id })).gesprek); } catch (e) { setGesprek({ fout: e.message }); }
  };
  return (
    <>
      <div className="card card-p">
        <div className="lsec-hd">
          <div className="lsec-title">Doorgezet door Boss ({lijst.length})</div>
          <button className="btn btn-ghost btn-xs" onClick={() => setToonAlles(v => !v)}>{toonAlles ? 'Alleen open' : 'Ook afgehandeld'}</button>
        </div>
        {!lijst.length && <div className="lsec-empty">Geen open vragen</div>}
        <div className="lrows">
          {lijst.map(g => (
            <div key={g.id} className="lrow" role="button" tabIndex={0} onClick={() => openen(g)} onKeyDown={e => e.key === 'Enter' && openen(g)}>
              <div className="lrow-main"><div className="lrow-title">{g.titel || 'Gesprek met Boss'}</div><div className="lrow-sub">{[g.door, g.bedrijf].filter(Boolean).join(' · ')}</div></div>
              <span className={`badge ${g.doorzet_afgehandeld_op ? 'b-done' : 'b-new'}`}>{g.doorzet_afgehandeld_op ? 'afgehandeld' : 'open'}</span>
              <div className="lrow-date">{geleden(g.doorzet_verstuurd_op)}</div>
            </div>
          ))}
        </div>
        <div className="lrow-sub" style={{ marginTop: 10 }}>Een gesprek openen staat in het logboek: het is een gesprek van een klant.</div>
      </div>
      {open && (
        <Lade titel={open.titel || 'Gesprek met Boss'} sub={`${[open.door, open.bedrijf].filter(Boolean).join(' · ')} · doorgezet ${tijdstip(open.doorzet_verstuurd_op)}`} onSluit={() => setOpen(null)}
          acties={<>
            {!open.doorzet_afgehandeld_op && <button className="btn btn-p btn-sm" onClick={async () => { if (await doe('boss-afgehandeld', { id: open.id }, { succes: 'Afgehandeld' })) { setOpen(null); herlaad(); } }}>Afgehandeld</button>}
            {open.company_id && <button className="btn btn-s btn-sm" onClick={() => ga(`klanten/${open.company_id}`)}>Naar klant</button>}
          </>}>
          <Sectie titel="Gesprek">
            {!gesprek && <div className="lsec-empty">Laden…</div>}
            {gesprek?.fout && <div className="sa-fout">{gesprek.fout}</div>}
            {Array.isArray(gesprek?.messages) && gesprek.messages.map((r, i) => (
              <div key={i} className={`sa-bubbel ${r.rol === 'boss' ? 'boss' : 'gebruiker'}`}>
                {r.tekst}
                {r.op && <div className="lrow-sub" style={{ marginTop: 4 }}>{r.rol === 'boss' ? 'Boss' : 'Klant'} · {tijdstip(r.op)}</div>}
              </div>
            ))}
          </Sectie>
        </Lade>
      )}
    </>
  );
}

function Prijsactie({ instelling, meldingen, herlaad }) {
  const { doe } = useSa();
  const w = instelling?.waarde ?? {};
  const [actief, setActief] = useState(w.actief === true);
  const [prijzen, setPrijzen] = useState((w.prijzen ?? []).join('\n'));
  const deelnemers = meldingen.filter(m => m.actie_deelname);
  const gewijzigd = actief !== (w.actief === true) || prijzen.trim() !== (w.prijzen ?? []).join('\n').trim();
  return (
    <div className="sa-twee sa-twee-gelijk">
      <div className="card card-p">
        <Sectie titel="Prijsactie meldpunt">
          <label className="sa-check"><input type="checkbox" checked={actief} onChange={e => setActief(e.target.checked)} /> De actie loopt (gebruikers zien de prijzen bij de meldknop)</label>
          <div className="lrow-sub" style={{ margin: '12px 0 6px' }}>Prijzen, één per regel</div>
          <textarea className="sa-input" value={prijzen} onChange={e => setPrijzen(e.target.value)} placeholder="Bijv. een BossBase-cap" />
          <button className="btn btn-p btn-sm" style={{ marginTop: 8 }} disabled={!gewijzigd} onClick={async () => {
            if (await doe('prijsactie', { actief, prijzen: prijzen.split('\n').map(p => p.trim()).filter(Boolean) }, { succes: 'Prijsactie opgeslagen' })) herlaad();
          }}>Opslaan</button>
          {instelling?.bijgewerkt_op && <div className="lrow-sub" style={{ marginTop: 8 }}>Laatst gewijzigd {tijdstip(instelling.bijgewerkt_op)}</div>}
        </Sectie>
      </div>
      <div className="card card-p">
        <Sectie titel={`Deelnemers (${deelnemers.length})`}>
          {!deelnemers.length && <div className="lrow-sub">Nog geen deelnemers.</div>}
          <div className="lrows">
            {deelnemers.map(m => (
              <div key={m.id} className="lrow lrow-static">
                <div className="lrow-main"><div className="lrow-title">{m.gebruiker_naam} · {m.bedrijf_naam}</div><div className="lrow-sub">#{m.nummer} · {m.soort} · {String(m.omschrijving ?? '').slice(0, 90)}</div></div>
                <div className="lrow-date">{tijdstip(m.aangemaakt_op)}</div>
              </div>
            ))}
          </div>
        </Sectie>
      </div>
    </div>
  );
}
