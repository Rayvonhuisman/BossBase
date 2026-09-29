// Aanvragen — alles wat via een websiteformulier binnenkomt (tabel inquiries).
//
// Opbouw zoals de andere lijstpagina's (Leveranciers, Klanten): page-hd met
// teller, filters, tabel, en een drawer met de details. Toont uitsluitend de
// aanvragen van het eigen bedrijf; dat dwingt RLS af, niet deze pagina.

import { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { listPipelineStages } from '../services/dealService.js';
import {
  STATUSSEN, statusInfo, bronLabel,
  listAanvragen, zetAanvraagStatus, zoekBestaandeKlanten, zetOmNaarKlant,
} from '../services/aanvraagService.js';

const datum = d => d
  ? new Date(d).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '';

function StatusBadge({ status }) {
  const s = statusInfo(status);
  return <span className={`badge ${s.badge}`}>{s.label}</span>;
}

function TestLabel() {
  return (
    <span className="badge b-orange" title="Verstuurd vanaf een testomgeving (localhost)">Test</span>
  );
}

function Veld({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, padding: '7px 0', fontSize: '.85rem' }}>
      <div style={{ color: 'var(--dmu)' }}>{label}</div>
      <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

function Sectie({ titel, children }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--dl)', margin: '0 0 6px' }}>
        {titel}
      </h3>
      {children}
    </section>
  );
}

// ── Omzetten naar klant / lead ──────────────────────────────────────────────
function Omzetten({ aanvraag, onKlaar, openCustomer, setPage }) {
  const toast = useToast();
  const { bumpRefresh } = useProfile();
  const [stap, setStap] = useState('start'); // start | kiezen | bezig | klaar
  const [matches, setMatches] = useState([]);
  const [keuze, setKeuze] = useState('nieuw'); // 'nieuw' of een klant-id
  const [fase, setFase] = useState(null);
  const [maakLead, setMaakLead] = useState(true);
  const [resultaat, setResultaat] = useState(null);
  const [fout, setFout] = useState('');

  if (aanvraag.customerId && stap !== 'klaar') {
    return (
      <div className="card card-p" style={{ fontSize: '.85rem' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Deze aanvraag is gekoppeld aan een klant.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-s btn-sm" onClick={() => openCustomer?.(aanvraag.customerId)}>Klant openen</button>
          {aanvraag.dealId && (
            <button className="btn btn-s btn-sm" onClick={() => setPage?.('pipeline')}>Naar de pipeline</button>
          )}
        </div>
      </div>
    );
  }

  const start = async () => {
    setFout('');
    setStap('bezig');
    try {
      const [gevonden, fases] = await Promise.all([zoekBestaandeKlanten(aanvraag), listPipelineStages()]);
      setMatches(gevonden);
      setKeuze(gevonden.length ? gevonden[0].id : 'nieuw');
      setFase([...fases].sort((a, b) => a.order - b.order)[0] || null);
      setStap('kiezen');
    } catch (e) {
      setFout(e.message || 'Klanten controleren is mislukt.');
      setStap('start');
    }
  };

  const bevestig = async () => {
    setFout('');
    setStap('bezig');
    try {
      const bestaande = keuze === 'nieuw' ? null : matches.find(m => m.id === keuze) || null;
      const r = await zetOmNaarKlant(aanvraag, { bestaandeKlant: bestaande, maakLead, stageId: fase?.id || null });
      setResultaat(r);
      setStap('klaar');
      onKlaar(r.aanvraag);
      bumpRefresh?.();
      if (r.dealFout) toast.error(`Klant gekoppeld, maar de lead is niet aangemaakt: ${r.dealFout}`);
      else toast.success('Aanvraag omgezet');
    } catch (e) {
      setFout(e.message || 'Omzetten is mislukt.');
      setStap('kiezen');
    }
  };

  if (stap === 'klaar' && resultaat) {
    return (
      <div className="card card-p" role="status" style={{ fontSize: '.85rem', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#15A34A', fontWeight: 700 }}>
          {I.check} Omgezet
        </div>
        <div>
          {resultaat.klant.nieuw
            ? <>Nieuwe klant aangemaakt: <strong>{resultaat.klant.naam}</strong></>
            : <>Gekoppeld aan bestaande klant: <strong>{resultaat.klant.naam}</strong></>}
        </div>
        {resultaat.deal && <div>Lead aangemaakt in de pipeline: <strong>{resultaat.deal.title}</strong></div>}
        {resultaat.dealFout && (
          <div style={{ color: '#dc2626' }}>
            De lead is niet aangemaakt ({resultaat.dealFout}). De status van de aanvraag is daarom niet gewijzigd.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn btn-s btn-sm" onClick={() => openCustomer?.(resultaat.klant.id)}>Klant openen</button>
          {resultaat.deal && <button className="btn btn-s btn-sm" onClick={() => setPage?.('pipeline')}>Naar de pipeline</button>}
        </div>
      </div>
    );
  }

  if (stap === 'start' || (stap === 'bezig' && !fase && !matches.length)) {
    return (
      <div>
        <p style={{ fontSize: '.82rem', color: 'var(--dmu)', margin: '0 0 10px' }}>
          Maak van deze aanvraag een klant, en desgewenst een lead in de pipeline. We controleren eerst of de klant al bestaat.
        </p>
        <button className="btn btn-p btn-sm" onClick={start} disabled={stap === 'bezig'}>
          {stap === 'bezig' ? 'Controleren…' : 'Omzetten naar klant'}
        </button>
        {fout && <p role="alert" style={{ color: '#dc2626', fontSize: '.82rem', marginTop: 8 }}>{fout}</p>}
      </div>
    );
  }

  const bezig = stap === 'bezig';
  return (
    <div className="card card-p" style={{ fontSize: '.85rem', display: 'grid', gap: 12 }}>
      {matches.length > 0 ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontWeight: 700, color: '#b45309', marginBottom: 6 }}>
            Er {matches.length === 1 ? 'bestaat al een klant' : `bestaan al ${matches.length} klanten`} met dezelfde gegevens
          </legend>
          {matches.map(m => (
            <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" name="klantkeuze" value={m.id} checked={keuze === m.id}
                onChange={() => setKeuze(m.id)} disabled={bezig} style={{ marginTop: 3, accentColor: '#1DDB62' }} />
              <span>
                Koppel aan <strong>{m.naam}</strong>
                <span style={{ color: 'var(--dmu)' }}>
                  {' '}— zelfde {[m.opMail && 'e-mailadres', m.opTel && 'telefoonnummer'].filter(Boolean).join(' en ')}
                </span>
              </span>
            </label>
          ))}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="klantkeuze" value="nieuw" checked={keuze === 'nieuw'}
              onChange={() => setKeuze('nieuw')} disabled={bezig} style={{ marginTop: 3, accentColor: '#1DDB62' }} />
            <span>Toch een <strong>nieuwe klant</strong> aanmaken (dubbele klant)</span>
          </label>
        </fieldset>
      ) : (
        <div>
          Geen bestaande klant gevonden met dit e-mailadres of telefoonnummer. Er wordt een nieuwe klant aangemaakt:
          {' '}<strong>{aanvraag.bedrijf || aanvraag.naam}</strong>.
        </div>
      )}

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={maakLead} onChange={e => setMaakLead(e.target.checked)} disabled={bezig || !fase}
          style={{ marginTop: 3, accentColor: '#1DDB62' }} />
        <span>
          Maak ook een lead in de pipeline
          {fase ? <span style={{ color: 'var(--dmu)' }}> (fase: {fase.label})</span> : <span style={{ color: 'var(--dmu)' }}> (geen pipelinefases gevonden)</span>}
        </span>
      </label>

      {fout && <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{fout}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-s btn-sm" onClick={() => setStap('start')} disabled={bezig}>Annuleren</button>
        <button className="btn btn-p btn-sm" onClick={bevestig} disabled={bezig}>
          {bezig ? 'Bezig…' : keuze === 'nieuw' ? 'Klant aanmaken' : 'Koppelen'}
        </button>
      </div>
    </div>
  );
}

// ── Detail ──────────────────────────────────────────────────────────────────
function AanvraagDrawer({ aanvraag, onClose, onGewijzigd, openCustomer, setPage }) {
  const toast = useToast();
  const [opslaan, setOpslaan] = useState(false);
  const sluitRef = useRef(null);

  useEffect(() => {
    sluitRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const wijzigStatus = async status => {
    if (status === aanvraag.status) return;
    setOpslaan(true);
    try {
      onGewijzigd(await zetAanvraagStatus(aanvraag.id, status));
      toast.success(`Status gewijzigd naar ${statusInfo(status).label.toLowerCase()}`);
    } catch (e) {
      toast.error(e.message || 'Status wijzigen is mislukt');
    } finally {
      setOpslaan(false);
    }
  };

  const privacy = aanvraag.metadata?.privacy;
  const titelId = `aanvraag-titel-${aanvraag.id}`;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titelId}>
        <div className="drawer-hd">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <StatusBadge status={aanvraag.status} />
              {aanvraag.isTest && <TestLabel />}
            </div>
            <h2 id={titelId} style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{aanvraag.naam}</h2>
            <div style={{ fontSize: '.82rem', color: 'var(--dmu)' }}>
              {aanvraag.bedrijf || 'Geen bedrijfsnaam'} · ontvangen {datum(aanvraag.ontvangen)}
            </div>
          </div>
          <button ref={sluitRef} className="drawer-x" onClick={onClose} aria-label="Sluiten">{I.x}</button>
        </div>

        <div className="drawer-body">
          <Sectie titel="Status">
            <div className="f" style={{ maxWidth: 260 }}>
              <label htmlFor="aanvraag-status" className="bb-sr-only">Status</label>
              <select id="aanvraag-status" value={aanvraag.status} disabled={opslaan}
                onChange={e => wijzigStatus(e.target.value)}>
                {STATUSSEN.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </Sectie>

          <Sectie titel="Contactgegevens">
            <Veld label="Naam">{aanvraag.naam}</Veld>
            <Veld label="Bedrijf">{aanvraag.bedrijf || '—'}</Veld>
            <Veld label="E-mail"><a href={`mailto:${aanvraag.email}`} style={{ color: 'var(--pd)' }}>{aanvraag.email}</a></Veld>
            <Veld label="Telefoon">
              {aanvraag.telefoon
                ? <a href={`tel:${aanvraag.telefoon.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--pd)' }}>{aanvraag.telefoon}</a>
                : '—'}
            </Veld>
            {aanvraag.metadata?.branche && <Veld label="Branche">{aanvraag.metadata.branche}</Veld>}
          </Sectie>

          <Sectie titel="Bericht">
            <Veld label="Onderwerp">{aanvraag.onderwerp || '—'}</Veld>
            {/* Platte tekst: React escapet, dus HTML of scripts uit het formulier worden nooit uitgevoerd. */}
            <div className="card card-p" style={{ whiteSpace: 'pre-wrap', fontSize: '.88rem', lineHeight: 1.55, marginTop: 6 }}>
              {aanvraag.bericht}
            </div>
          </Sectie>

          <Sectie titel="Herkomst">
            <Veld label="Bron">{bronLabel(aanvraag.bron)}</Veld>
            <Veld label="Pagina">
              {/^https?:\/\//.test(aanvraag.bronUrl)
                ? <a href={aanvraag.bronUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pd)' }}>{aanvraag.bronUrl}</a>
                : '—'}
            </Veld>
            <Veld label="Ontvangen">{datum(aanvraag.ontvangen)}</Veld>
            <Veld label="Testaanvraag">{aanvraag.isTest ? 'Ja — verstuurd vanaf een testomgeving' : 'Nee'}</Veld>
          </Sectie>

          {/* Het vinkje op het formulier bevestigt dat de bezoeker de privacy-uitleg
              heeft gelezen. Het is GEEN toestemming en mag niet worden gebruikt als
              grondslag voor andere doelen, zoals marketing. Het veld heet in de
              database nog "akkoord" (vastgelegd door public-website-inquiry). */}
          <Sectie titel="Privacy-uitleg">
            {privacy?.akkoord ? (
              <>
                <Veld label="Uitleg gelezen">Ja (geen toestemming voor andere doelen)</Veld>
                <Veld label="Tijdstip">{datum(privacy.akkoord_op)}</Veld>
                <Veld label="Versie tekst">{privacy.versie || 'onbekend'}</Veld>
              </>
            ) : (
              <Veld label="Uitleg gelezen">Niet vastgelegd</Veld>
            )}
          </Sectie>

          <Sectie titel="Omzetten">
            <Omzetten aanvraag={aanvraag} onKlaar={onGewijzigd} openCustomer={openCustomer} setPage={setPage} />
          </Sectie>
        </div>
      </aside>
    </>
  );
}

// ── Pagina ──────────────────────────────────────────────────────────────────
export function AanvragenPage({ openCustomer, setPage, preOpenAanvraagId, onNavConsumed, onAantalNieuw }) {
  const { refreshKey } = useProfile();
  const [aanvragen, setAanvragen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [status, setStatus] = useState('alle');
  const [soort, setSoort] = useState('alle'); // alle | echt | test
  const [zoek, setZoek] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let actief = true;
    listAanvragen()
      .then(rijen => { if (actief) { setAanvragen(rijen); setFout(''); } })
      .catch(e => { if (actief) setFout(e.message || 'Aanvragen laden is mislukt.'); })
      .finally(() => { if (actief) setLaden(false); });
    return () => { actief = false; };
  }, [refreshKey]);

  // Vanuit een melding: open meteen de juiste aanvraag.
  useEffect(() => {
    if (!preOpenAanvraagId || laden) return;
    if (aanvragen.some(a => a.id === preOpenAanvraagId)) setOpenId(preOpenAanvraagId);
    onNavConsumed?.();
  }, [preOpenAanvraagId, laden, aanvragen, onNavConsumed]);

  useEffect(() => {
    if (!laden) onAantalNieuw?.(aanvragen.filter(a => a.status === 'nieuw' && !a.isTest).length);
  }, [aanvragen, laden, onAantalNieuw]);

  const perStatus = useMemo(() => {
    const n = {};
    for (const a of aanvragen) n[a.status] = (n[a.status] || 0) + 1;
    return n;
  }, [aanvragen]);

  const zichtbaar = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return aanvragen.filter(a => {
      if (status !== 'alle' && a.status !== status) return false;
      if (soort === 'echt' && a.isTest) return false;
      if (soort === 'test' && !a.isTest) return false;
      if (!term) return true;
      return [a.naam, a.bedrijf, a.email, a.telefoon, a.onderwerp, a.bericht]
        .some(v => (v || '').toLowerCase().includes(term));
    });
  }, [aanvragen, status, soort, zoek]);

  const open = aanvragen.find(a => a.id === openId) || null;
  const vervang = bijgewerkt => setAanvragen(lijst => lijst.map(a => a.id === bijgewerkt.id ? bijgewerkt : a));
  const nieuw = perStatus.nieuw || 0;

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1>Aanvragen</h1>
          <p>
            {aanvragen.length} {aanvragen.length === 1 ? 'aanvraag' : 'aanvragen'}
            {nieuw > 0 && ` · ${nieuw} nieuw`}
          </p>
        </div>
      </div>

      {fout && <div className="card card-p" role="alert" style={{ color: '#dc2626', marginBottom: 14 }}>{fout}</div>}

      <div className="afu2" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div className="tabs" role="group" aria-label="Filter op status">
          <button className={`tab${status === 'alle' ? ' active' : ''}`} aria-pressed={status === 'alle'} onClick={() => setStatus('alle')}>
            Alle
          </button>
          {STATUSSEN.map(s => (
            <button key={s.key} className={`tab${status === s.key ? ' active' : ''}`} aria-pressed={status === s.key}
              onClick={() => setStatus(s.key)}>
              {s.label}{perStatus[s.key] ? ` (${perStatus[s.key]})` : ''}
            </button>
          ))}
        </div>
        <div className="tabs" role="group" aria-label="Filter op soort">
          {[['alle', 'Alles'], ['echt', 'Echt'], ['test', 'Test']].map(([k, l]) => (
            <button key={k} className={`tab${soort === k ? ' active' : ''}`} aria-pressed={soort === k} onClick={() => setSoort(k)}>{l}</button>
          ))}
        </div>
        <div className="search" style={{ maxWidth: 320, flex: '1 1 220px' }}>
          {I.search}
          <input aria-label="Zoeken in aanvragen" placeholder="Zoek op naam, bedrijf, e-mail of tekst…"
            value={zoek} onChange={e => setZoek(e.target.value)} />
        </div>
      </div>

      {laden && <div className="card card-p">Aanvragen laden…</div>}

      {!laden && !fout && zichtbaar.length === 0 && (
        <div className="empty">
          <div className="empty-title">Geen aanvragen gevonden</div>
          <div className="empty-sub">
            {aanvragen.length === 0
              ? 'Zodra iemand het contactformulier op je website invult, verschijnt de aanvraag hier.'
              : 'Pas de filters of je zoekterm aan.'}
          </div>
        </div>
      )}

      {!laden && zichtbaar.length > 0 && (
        <div className="tw afu2">
          <table className="dt">
            <thead>
              <tr>
                <th>Naam</th><th>Bedrijf</th><th>Onderwerp</th><th>Bron</th><th>Status</th><th>Ontvangen</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map(a => (
                <tr key={a.id} tabIndex={0} style={{ cursor: 'pointer' }}
                  aria-label={`Aanvraag van ${a.naam} openen`}
                  onClick={() => setOpenId(a.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(a.id); } }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: a.status === 'nieuw' ? 700 : 600 }}>{a.naam}</span>
                      {a.isTest && <TestLabel />}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--dmu)' }}>{a.email}</div>
                  </td>
                  <td>{a.bedrijf || ''}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.onderwerp || ''}</td>
                  <td style={{ color: 'var(--dmu)' }}>{bronLabel(a.bron)}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--dmu)' }}>{datum(a.ontvangen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <AanvraagDrawer
          key={open.id}
          aanvraag={open}
          onClose={() => setOpenId(null)}
          onGewijzigd={vervang}
          openCustomer={openCustomer}
          setPage={setPage}
        />
      )}
    </div>
  );
}
