import { Fragment, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../lib/toast.jsx';
import { STATUSSEN, statusInfo, getPakket, getExtra, euroBedrag } from '../lib/website.js';

// De lijst Websites in het super-admin portaal: per klant de intake, het
// pakket, de betalingen, wijzigingsverzoeken en de status. Alles via de edge
// function website-beheer (alleen voor super-admins).

const STATUS_KLEUR = {
  wacht_op_intake:  { kleur: '#6b7280', bg: '#f3f4f6' },
  intake_ontvangen: { kleur: '#b45309', bg: '#fffbeb' },
  in_bouw:          { kleur: '#6d28d9', bg: '#f5f3ff' },
  ter_beoordeling:  { kleur: '#1d4ed8', bg: '#eff6ff' },
  live:             { kleur: '#15803d', bg: '#f0fdf4' },
  geannuleerd:      { kleur: '#6b7280', bg: '#f3f4f6' },
};
const ALLE_STATUSSEN = [...STATUSSEN, statusInfo('geannuleerd')];
const VERZOEK_STATUSSEN = [
  ['nieuw', 'Nieuw'], ['in_behandeling', 'In behandeling'], ['prijsopgave', 'Prijsopgave gestuurd'],
  ['afgerond', 'Afgerond'], ['afgewezen', 'Afgewezen'],
];
const FILTERS = [
  ['actie', 'Actie nodig'], ['wacht_op_intake', 'Wacht op intake'], ['in_bouw', 'In bouw'],
  ['ter_beoordeling', 'Ter beoordeling'], ['live', 'Live'], ['alle', 'Alle'],
];

const fmt = d => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtTijd = d => d ? new Date(d).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const roep = async (actie, extra = {}) => {
  const { data, error } = await supabase.functions.invoke('website-beheer', { body: { actie, ...extra } });
  if (error) {
    let bericht = error.message;
    try { bericht = (await error.context?.json())?.error || bericht; } catch { /* geen json */ }
    throw new Error(bericht);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

// Wat vraagt hier om actie van ons?
function actiePunten(w) {
  const uit = [];
  if (w.status === 'intake_ontvangen') uit.push('intake ontvangen');
  if (w.feedback && w.status !== 'live' && w.status !== 'geannuleerd') uit.push('feedback');
  const nieuweVerzoeken = (w.verzoeken || []).filter(v => v.status === 'nieuw').length;
  if (nieuweVerzoeken) uit.push(`${nieuweVerzoeken} verzoek${nieuweVerzoeken === 1 ? '' : 'en'}`);
  if ((w.betalingen || []).some(b => b.status === 'open')) uit.push('betaling open');
  if ((w.betalingen || []).some(b => b.fout)) uit.push('betaalfout');
  return uit;
}

function betalingSamenvatting(b) {
  if (b.wijze === 'ideal') return `${euroBedrag(b.bedrag)} iDEAL ${b.status === 'betaald' ? 'betaald' : b.status}`;
  if (b.soort === 'hosting') return `hosting ${b.status}`;
  if (b.soort === 'domein') return `domein ${b.status}`;
  if (b.soort === 'email') return `e-mail ${b.status}`;
  if (b.aantal_totaal) return `${b.aantal_totaal} termijnen ${b.aantal_gedaan}/${b.aantal_totaal}`;
  return `${b.omschrijving} ${b.status}`;
}

function Pil({ status }) {
  const s = statusInfo(status);
  const k = STATUS_KLEUR[status] || STATUS_KLEUR.geannuleerd;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: k.bg, color: k.kleur, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

// "eerderWerk.items[0].titel" → "Eerder werk · items 1 · titel"
const leesbaar = sleutel => sleutel
  .replace(/\[(\d+)\]/g, (_, n) => ` ${Number(n) + 1}`)
  .split('.')
  .map(d => d.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
  .join(' · ');

const isBestandenLijst = w => Array.isArray(w) && w.length > 0 && w.every(x => x && typeof x === 'object' && 'pad' in x);

function Intake({ intake, toast }) {
  const antwoorden = intake?.antwoorden || {};
  const ontbreekt = intake?.ontbreekt || [];
  const groepen = {};
  for (const [k, v] of Object.entries(antwoorden)) {
    if (v === '' || v === null || v === false || (Array.isArray(v) && v.length === 0)) continue;
    const g = k.split(/[.[]/)[0];
    (groepen[g] = groepen[g] || []).push([k, v]);
  }

  const open = async pad => {
    try {
      const { url } = await roep('bestand', { pad });
      window.open(url, '_blank', 'noopener');
    } catch (e) { toast.error(e.message); }
  };
  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(intake, null, 2));
      toast.success('Intake gekopieerd');
    } catch { toast.error('Kopiëren lukte niet'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={kop}>Intake</div>
        <button className="btn btn-s btn-sm" style={{ marginLeft: 'auto' }} onClick={kopieer}>Intake kopiëren als JSON</button>
      </div>
      {ontbreekt.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
          <strong>Nog na te vragen</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{ontbreekt.map(o => <li key={o}>{o}</li>)}</ul>
        </div>
      )}
      {Object.keys(groepen).length === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>Nog geen intake.</div>}
      {Object.entries(groepen).map(([g, regels]) => (
        <div key={g} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, textTransform: 'capitalize' }}>{leesbaar(g)}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {regels.map(([k, v]) => (
                <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 12px 5px 0', color: '#6b7280', verticalAlign: 'top', width: '34%' }}>{leesbaar(k.slice(g.length).replace(/^\./, '')) || leesbaar(k)}</td>
                  <td style={{ padding: '5px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {isBestandenLijst(v)
                      ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {v.map(f => (
                            <button key={f.pad} className="btn btn-s btn-sm" onClick={() => open(f.pad)}>{f.naam || f.pad.split('/').pop()}</button>
                          ))}
                        </div>
                      : v === true ? 'ja'
                      : typeof v === 'object' ? JSON.stringify(v)
                      : String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

const kop = { fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6b7280' };
const blok = { borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 };

function Detail({ w, herlaad, toast }) {
  const [status, setStatus] = useState(w.status);
  const [siteUrl, setSiteUrl] = useState(w.site_url || '');
  const [mail, setMail] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [stopVraag, setStopVraag] = useState(null);
  const [domein, setDomein] = useState(w.domein || '');
  const [notities, setNotities] = useState({});

  const doe = async (fn, succes) => {
    setBezig(true);
    try {
      const r = await fn();
      toast.success(r?.resultaat?.length ? `${succes}: ${r.resultaat.join(', ')}` : succes);
      await herlaad();
    } catch (e) { toast.error(e.message); }
    finally { setBezig(false); }
  };

  const opslaan = () => doe(
    () => roep('status', { companyId: w.company_id, status, siteUrl, mail }),
    'Opgeslagen',
  );

  const stop = id => {
    if (stopVraag !== id) { setStopVraag(id); return; }
    setStopVraag(null);
    doe(() => roep('regel-stoppen', { id }), 'Regel gestopt');
  };

  const nieuweStatus = status !== w.status;

  return (
    <div style={{ padding: '6px 4px 16px' }}>
      {/* 1. Status en link */}
      <div style={kop}>Status</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <select value={status} onChange={e => setStatus(e.target.value)} disabled={bezig} style={{ fontSize: 13, padding: '5px 8px' }}>
          {ALLE_STATUSSEN.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <input value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://… (link naar de site)"
          disabled={bezig} style={{ flex: '1 1 260px', fontSize: 13, padding: '5px 8px' }} />
        <label style={{ fontSize: 13, display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={mail} onChange={e => setMail(e.target.checked)} /> klant mailen
        </label>
        <button className="btn btn-p btn-sm" onClick={opslaan} disabled={bezig}>
          {mail && nieuweStatus ? 'Opslaan en klant mailen' : 'Opslaan'}
        </button>
      </div>
      {status === 'ter_beoordeling' && (
        <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 6 }}>Ter beoordeling vraagt een link: die krijgt de klant in de mail.</div>
      )}
      {w.status === 'wacht_op_intake' && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-s btn-sm" disabled={bezig}
            onClick={() => doe(() => roep('traject-starten', { companyId: w.company_id }), 'Intakelink opnieuw gestuurd')}>
            Intakelink opnieuw sturen
          </button>
        </div>
      )}
      {status === 'live' && w.status !== 'live' && (
        <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>Live zetten start de hosting, en domein en e-mail als die in de intake gekozen zijn, als regels op het abonnement van de klant.</div>
      )}
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
        Aangevraagd {fmt(w.aangevraagd_op)}
        {w.mail_verstuurd_op && ` · intakelink gemaild ${fmt(w.mail_verstuurd_op)}`}
        {w.intake_ontvangen_op && ` · intake ${fmt(w.intake_ontvangen_op)}`}
        {w.live_op && ` · live ${fmt(w.live_op)}`}
        {w.abonnement && ` · ${w.abonnement.plan || ''} ${w.abonnement.billing_interval || ''} (${w.abonnement.stripe_status || 'geen Stripe'})`}
      </div>

      {/* 2. Feedback */}
      {w.feedback && (
        <div style={blok}>
          <div style={kop}>Feedback van de klant · {fmtTijd(w.feedback_op)}</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: '#f4f4f2', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>{w.feedback}</div>
        </div>
      )}

      {/* 3. Intake */}
      <div style={blok}><Intake intake={w.intake} toast={toast} /></div>

      {/* 4. Betalingen */}
      <div style={blok}>
        <div style={kop}>Betalingen en abonnementsregels</div>
        {(w.betalingen || []).length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Geen.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11 }}>
                <th style={{ padding: '4px 8px 4px 0' }}>Omschrijving</th><th>Wijze</th><th>Bedrag</th><th>Status</th><th>Termijnen</th><th></th>
              </tr>
            </thead>
            <tbody>
              {w.betalingen.map(b => (
                <tr key={b.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>
                    {b.omschrijving}
                    {b.fout && <div style={{ color: '#dc2626', fontSize: 12 }}>{b.fout}</div>}
                  </td>
                  <td>{b.wijze === 'ideal' ? 'iDEAL' : `abonnement${b.interval_maanden === 12 ? ' (per jaar)' : ''}`}</td>
                  <td>{euroBedrag(b.bedrag)}{b.wijze === 'abonnement' && !b.aantal_totaal ? (b.interval_maanden === 12 ? ' /jr' : ' /mnd') : ''}</td>
                  <td style={{ color: b.status === 'open' || b.status === 'mislukt' ? '#dc2626' : undefined, fontWeight: b.status === 'open' ? 700 : 400 }}>
                    {b.status}{b.betaald_op ? ` ${fmt(b.betaald_op)}` : ''}
                  </td>
                  <td>{b.aantal_totaal ? `${b.aantal_gedaan}/${b.aantal_totaal}` : b.wijze === 'abonnement' ? `${b.aantal_gedaan}×` : ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    {b.status === 'loopt' && (
                      <button className="btn btn-s btn-sm" disabled={bezig} onClick={() => stop(b.id)}
                        style={stopVraag === b.id ? { color: '#dc2626', borderColor: '#dc2626' } : undefined}>
                        {stopVraag === b.id ? 'Zeker?' : 'Stoppen'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 5. Verzoeken */}
      <div style={blok}>
        <div style={kop}>Verzoeken</div>
        {(w.verzoeken || []).length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Geen.</div>
        ) : w.verzoeken.map(v => (
          <div key={v.id} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 13 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ textTransform: 'capitalize' }}>{v.soort}</strong>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{fmtTijd(v.created_at)}</span>
              <select value={v.status} disabled={bezig} style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 6px' }}
                onChange={e => doe(() => roep('verzoek-status', { id: v.id, status: e.target.value, notitie: notities[v.id] ?? v.notitie ?? undefined }), 'Verzoek bijgewerkt')}>
                {VERZOEK_STATUSSEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{v.omschrijving}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={notities[v.id] ?? v.notitie ?? ''} placeholder="Notitie (intern)"
                onChange={e => setNotities(n => ({ ...n, [v.id]: e.target.value }))}
                style={{ flex: 1, fontSize: 12, padding: '4px 7px' }} />
              <button className="btn btn-s btn-sm" disabled={bezig}
                onClick={() => doe(() => roep('verzoek-status', { id: v.id, status: v.status, notitie: notities[v.id] ?? '' }), 'Notitie opgeslagen')}>
                Notitie opslaan
              </button>
            </div>
            {v.soort === 'email' && v.status !== 'afgerond' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn btn-p btn-sm" disabled={bezig}
                  onClick={() => doe(() => roep('email-actief', { companyId: w.company_id }), 'E-mail vastgelegd, maandregel gestart')}>
                  E-mail ingericht
                </button>
              </div>
            )}
            {v.soort === 'domein' && v.status !== 'afgerond' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input value={domein} onChange={e => setDomein(e.target.value)} placeholder="jouwbedrijf.nl"
                  style={{ flex: 1, fontSize: 12, padding: '4px 7px' }} />
                <button className="btn btn-p btn-sm" disabled={bezig || !domein.trim()}
                  onClick={() => doe(() => roep('domein-actief', { companyId: w.company_id, domein }), 'Domein vastgelegd, jaarregel gestart')}>
                  Domein geregistreerd
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WebsitesBeheer() {
  const toast = useToast();
  const [rijen, setRijen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState('actie');
  const [open, setOpen] = useState(null);

  const laad = async () => {
    try {
      const { websites } = await roep('lijst');
      setRijen(websites || []);
    } catch (e) {
      toast.error(e.message || 'Websites laden mislukt');
    } finally {
      setLaden(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { laad(); }, []);

  const metActie = rijen.filter(w => actiePunten(w).length > 0);
  const zichtbaar = filter === 'alle' ? rijen
    : filter === 'actie' ? metActie
    : filter === 'in_bouw' ? rijen.filter(w => w.status === 'in_bouw' || w.status === 'intake_ontvangen')
    : rijen.filter(w => w.status === filter);

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Websites</div>
        {metActie.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#fffbeb', color: '#b45309' }}>
            {metActie.length} actie nodig
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{
                padding: '4px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: filter === k ? 'none' : '1px solid var(--br)',
                background: filter === k ? '#1DDB62' : 'transparent',
                color: filter === k ? '#0D0D0D' : '#6b7280',
                fontWeight: filter === k ? 700 : 500,
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {laden ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '10px 0' }}>
          {filter === 'actie' ? 'Niets dat op ons wacht.' : 'Niets in deze status.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <th style={{ padding: '6px 10px 6px 0' }}>Bedrijf</th>
                <th style={{ padding: '6px 10px' }}>Pakket</th>
                <th style={{ padding: '6px 10px' }}>Betaling</th>
                <th style={{ padding: '6px 10px' }}>Status</th>
                <th style={{ padding: '6px 0 6px 10px' }}>Gewijzigd</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map(w => {
                const b = w.bedrijf || {};
                const actie = actiePunten(w);
                const isOpen = open === w.id;
                return (
                  <Fragment key={w.id}>
                    <tr onClick={() => setOpen(isOpen ? null : w.id)}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--bgs, #fafaf9)' : undefined }}>
                      <td style={{ padding: '9px 10px 9px 0' }}>
                        <div style={{ fontWeight: 600 }}>
                          {b.name || 'Onbekend bedrijf'}
                          {b.is_testbedrijf && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#f3f4f6', color: '#6b7280' }}>test</span>}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 12 }}>{b.email || ''}{b.phone ? ` · ${b.phone}` : ''}</div>
                        {actie.length > 0 && <div style={{ color: '#b45309', fontSize: 12, fontWeight: 600 }}>{actie.join(' · ')}</div>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {getPakket(w.pakket).label}
                        {Object.keys(w.extras || {}).length > 0 && (
                          <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {Object.entries(w.extras).map(([k, n]) => `${n > 1 ? `${n}× ` : ''}${getExtra(k)?.label || k}`).join(', ')}
                          </div>
                        )}
                        {(w.domein_via_ons || w.email) && (
                          <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {[w.domein_via_ons && `domein ${w.domein || ''}`.trim(), w.email && 'zakelijke e-mail'].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {(w.betalingen || []).length === 0 ? <span style={{ color: '#9ca3af' }}>—</span>
                          : w.betalingen.map(x => (
                            <div key={x.id} style={{ color: x.status === 'open' || x.fout ? '#dc2626' : undefined, fontSize: 12 }}>
                              {betalingSamenvatting(x)}
                            </div>
                          ))}
                      </td>
                      <td style={{ padding: '9px 10px' }}><Pil status={w.status} /></td>
                      <td style={{ padding: '9px 0 9px 10px', color: '#6b7280' }}>{fmt(w.status_gewijzigd_op || w.aangevraagd_op)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ padding: '0 0 0 0' }}>
                          <Detail w={w} herlaad={laad} toast={toast} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
