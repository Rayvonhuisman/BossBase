import { useState, useEffect } from 'react';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { TIERS, tierLabel, tierPrice, tierPriceFirstYear, YEARLY_FREE_MONTHS, yearlySavingPct, EXTRA_USER_PRICE, kortingMaandenVoorActie,
         welkomstactiesVoor, welkomstactieLabel, getWelkomstactie } from '../lib/tiers.js';
import { MODULES, moduleLabel, modulePrice, canBuyModule, getLimitDef } from '../lib/features.js';
import { getBillingStatus, getDowngradeBlokkades, startCheckout, openPortal, zegOp } from '../services/billingService.js';

// Abonnementssectie in Instellingen: huidig pakket, status, verlengdatum,
// verbruik tegen de limieten, modules en de knoppen om te wijzigen.
//
// Alleen zichtbaar en bruikbaar voor de eigenaar/admin. Dat is een APARTE gate
// naast het rechtensysteem — het gaat over geld, niet over werk. De UI verbergt
// hem; de edge functions weigeren het ook als iemand er rechtstreeks omheen gaat.

const STATUS_LABELS = {
  // Dit is uitsluitend de 14 dagen gratis uitproberen vóór het abonnement.
  // De welkomstactie is een KORTING en komt hier nooit als 'trial' binnen.
  trial:          { label: 'Gratis uitproberen', kleur: '#b45309', bg: '#fffbeb' },
  actief:         { label: 'Actief',        kleur: '#15803d', bg: '#f0fdf4' },
  betaalprobleem: { label: 'Betaling mislukt', kleur: '#b91c1c', bg: '#fef2f2' },
  opgezegd:       { label: 'Opgezegd',      kleur: '#b91c1c', bg: '#fef2f2' },
};

const WEBSITE_STATUS = {
  open:              'aangevraagd',
  gegevens_gevraagd: 'we hebben je gegevens opgevraagd per mail',
  in_behandeling:    'in aanbouw',
  opgeleverd:        'opgeleverd',
  geannuleerd:       'geannuleerd',
};

const fmtDatum = d => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

function StatusPil({ status, opzeggen, stoptOp }) {
  const s = STATUS_LABELS[status] || { label: status || 'Onbekend', kleur: 'var(--dmu)', bg: 'var(--bgs)' };
  return (
    <span style={{ fontSize: '.76rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.kleur }}>
      {s.label}{opzeggen ? (stoptOp ? ` · stopt ${fmtDatum(stoptOp)}` : ' · stopt per einde periode') : ''}
    </span>
  );
}

// "3 van de 2 gebruikers" — met de nadruk op wat er te veel is.
function LimietRegel({ sleutel, stand }) {
  const def = getLimitDef(sleutel);
  const max = stand?.max ?? null;
  const gebruikt = Number(stand?.gebruikt || 0);
  const vol = max != null && gebruikt >= max;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
      <span style={{ color: 'var(--dmu)' }}>{def?.label || sleutel}</span>
      <span style={{ fontWeight: 600, color: vol ? '#b45309' : 'var(--dk)' }}>
        {gebruikt}{max == null ? ' · onbeperkt' : ` / ${max}`}
      </span>
    </div>
  );
}

export function AbonnementSectie() {
  const toast = useToast();
  const { profile, bumpRefresh } = useProfile();
  const [stand, setStand] = useState(null);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [wijzigen, setWijzigen] = useState(false);
  const [doelTier, setDoelTier] = useState(null);
  const [interval, setInterval] = useState('maand');
  const [extra, setExtra] = useState(0);
  const [modules, setModules] = useState([]);
  const [actie, setActie] = useState(null);
  const [blokkades, setBlokkades] = useState([]);

  const isAdmin = profile?.role === 'admin';

  const laad = () => {
    setLaden(true);
    getBillingStatus()
      .then(s => {
        setStand(s);
        if (s) { setDoelTier(s.tier); setInterval(s.billingInterval); setExtra(s.extraGebruikers); setModules(s.modules); setActie(s.welkomstactie); }
      })
      .catch(e => toast.error(e.message || 'Abonnement laden mislukt'))
      .finally(() => setLaden(false));
  };
  useEffect(laad, []);

  // Bij elke pakketkeuze meteen ophalen wat een overstap zou blokkeren, zodat de
  // klant het vóór het afrekenen ziet in plaats van erna.
  useEffect(() => {
    if (!doelTier) { setBlokkades([]); return; }
    let alive = true;
    getDowngradeBlokkades(doelTier)
      .then(b => { if (alive) setBlokkades(b); })
      .catch(() => { if (alive) setBlokkades([]); });
    return () => { alive = false; };
  }, [doelTier]);

  if (!isAdmin) return null;
  if (laden) return <div className="card card-p">Abonnement laden…</div>;
  if (!stand) return <div className="card card-p">Geen abonnementsgegevens gevonden.</div>;

  const geblokkeerd = blokkades.length > 0;

  const naarCheckout = async () => {
    setBezig(true);
    try {
      const url = await startCheckout({ tier: doelTier, interval, extraGebruikers: extra, modules, welkomstactie: interval === 'jaar' ? actie : null });
      window.location.href = url;
    } catch (e) {
      if (e.code === 'downgrade_geblokkeerd' && Array.isArray(e.blokkades)) setBlokkades(e.blokkades);
      if (e.code === 'gebruik_portal') { toast.info(e.message); naarPortal(); return; }
      toast.error(e.message || 'Afrekenen mislukt');
    } finally { setBezig(false); }
  };

  // Opzeggen loopt bewust via ons eigen scherm en niet via het Customer Portal:
  // het portal kan alleen "direct" of "per einde factuurperiode" (= één maand)
  // en zou de jaarlooptijd dus omzeilen. billing-cancel houdt de einddatum aan.
  const opzeggen = async (herstel) => {
    if (!herstel) {
      const wanneer = stand.heeftVerplichting
        ? `per ${fmtDatum(stand.verplichtingTot)} (einde looptijd)`
        : 'aan het einde van de lopende maand';
      if (!window.confirm(`Abonnement opzeggen ${wanneer}?`)) return;
    }
    setBezig(true);
    try {
      const r = await zegOp({ herstel });
      toast.success(r?.bericht || 'Bijgewerkt');
      laad();
    } catch (e) {
      toast.error(e.message || 'Opzeggen mislukt');
    } finally { setBezig(false); }
  };

  const naarPortal = async () => {
    setBezig(true);
    try { window.location.href = await openPortal(); }
    catch (e) { toast.error(e.message || 'Abonnementsbeheer openen mislukt'); }
    finally { setBezig(false); }
  };

  const toggleModule = key => setModules(prev => {
    if (prev.includes(key)) return prev.filter(k => k !== key && MODULES.find(m => m.key === k)?.vereist !== key);
    const vereist = MODULES.find(m => m.key === key)?.vereist;
    return vereist && !prev.includes(vereist) ? [...prev, vereist, key] : [...prev, key];
  });

  const kosten = tierPrice(doelTier || stand.tier)
    + extra * EXTRA_USER_PRICE
    + modules.reduce((s, k) => s + modulePrice(k), 0);

  return (
    <div className="afu3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Huidig abonnement ─────────────────────────────────────────────── */}
      <div className="card card-p">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{tierLabel(stand.tier)}</div>
          <StatusPil status={stand.status} opzeggen={stand.opzeggenPerEindePeriode || stand.stoptNaLooptijd} stoptOp={stand.stoptOp} />
          {stand.billingInterval === 'jaar' && (
            <span style={{ fontSize: '.76rem', color: 'var(--dmu)' }}>jaarabonnement</span>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '.9rem', color: 'var(--dmu)' }}>
            € {tierPrice(stand.tier)} p/mnd
            {stand.extraGebruikers > 0 && ` + ${stand.extraGebruikers} × € ${EXTRA_USER_PRICE}`}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
          {stand.trial && (
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Gratis uitproberen t/m</div>
              <div style={{ fontWeight: 600 }}>{fmtDatum(stand.trialEindigtOp)}</div>
            </div>
          )}
          {stand.verlengtOp && (
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {stand.opzeggenPerEindePeriode ? 'Stopt op' : 'Verlengt op'}
              </div>
              <div style={{ fontWeight: 600 }}>{fmtDatum(stand.verlengtOp)}</div>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 4 }}>IN GEBRUIK</div>
          {Object.entries(stand.limieten).map(([k, v]) => <LimietRegel key={k} sleutel={k} stand={v} />)}
        </div>

        {/* Welkomstactie hoort bij een jaarabonnement; bij maandelijks tonen we
            hem niet, want dan is er geen. */}
        {stand.billingInterval === 'jaar' && stand.welkomstactie && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 4 }}>WELKOMSTACTIE</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{welkomstactieLabel(stand.welkomstactie)}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--dmu)', marginTop: 2 }}>
              {getWelkomstactie(stand.welkomstactie)?.kort}
            </div>
            {stand.welkomstactie === 'gratis_website' && stand.websiteAanvraag && (
              <div style={{ fontSize: '.78rem', color: 'var(--dmu)', marginTop: 6 }}>
                Status aanvraag: <strong>{WEBSITE_STATUS[stand.websiteAanvraag.status] || stand.websiteAanvraag.status}</strong>
              </div>
            )}
          </div>
        )}

        {stand.modules.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>MODULES</div>
            {stand.modules.map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                <span>{moduleLabel(k)}</span>
                <span style={{ color: 'var(--dmu)' }}>€ {modulePrice(k)} p/mnd</span>
              </div>
            ))}
          </div>
        )}

        {/* Looptijd van het jaarabonnement: wat er loopt en wanneer je eruit kunt.
            Bij een maandabonnement is er geen looptijd en tonen we dit niet. */}
        {stand.heeftVerplichting && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 4 }}>LOOPTIJD</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Jaarabonnement, loopt t/m {fmtDatum(stand.verplichtingTot)}
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--dmu)', marginTop: 2 }}>
              {stand.stoptNaLooptijd
                ? `Je hebt opgezegd. Het abonnement stopt op ${fmtDatum(stand.verplichtingTot)}; tot dan loopt de incasso van € ${tierPrice(stand.tier)} per maand door.`
                : `Tussentijds opzeggen kan niet. Je kunt opzeggen tegen ${fmtDatum(stand.verplichtingTot)}; daarna loopt het maandelijks door en is het per maand opzegbaar.`}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stand.heeftStripe ? (
            <>
              <button className="btn btn-p" onClick={naarPortal} disabled={bezig}>
                {bezig ? 'Bezig…' : 'Abonnement beheren'}
              </button>
              <button className="btn btn-s" onClick={() => setWijzigen(w => !w)} disabled={bezig}>
                Ander pakket
              </button>
              {stand.stoptNaLooptijd || stand.opzeggenPerEindePeriode ? (
                <button className="btn btn-ghost" onClick={() => opzeggen(true)} disabled={bezig}>
                  Opzegging intrekken
                </button>
              ) : (
                <button className="btn btn-ghost" onClick={() => opzeggen(false)} disabled={bezig}>
                  {stand.heeftVerplichting ? 'Opzeggen per einde looptijd' : 'Opzeggen'}
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-p" onClick={() => setWijzigen(w => !w)} disabled={bezig}>
              Abonnement afsluiten
            </button>
          )}
        </div>

        {!stand.heeftStripe && (
          <p style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 10, marginBottom: 0 }}>
            Je bent BossBase nu gratis aan het uitproberen. Er is nog geen betaalmethode gekoppeld.
          </p>
        )}
      </div>

      {/* ── Pakket kiezen ─────────────────────────────────────────────────── */}
      {wijzigen && (
        <div className="card card-p">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Kies je pakket</div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {TIERS.map(t => {
              const actief = doelTier === t.id;
              return (
                <button key={t.id} onClick={() => setDoelTier(t.id)}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: actief ? '2px solid #1DDB62' : '1px solid var(--br)',
                    background: actief ? '#f0fdf4' : 'var(--bg)',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontWeight: 700 }}>{t.label}</span>
                    <span style={{ fontSize: '.88rem', color: 'var(--dmu)' }}>€ {tierPrice(t.id)} p/mnd</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Betaaltermijn. Het jaarabonnement is geen andere prijs maar dezelfde
              maandprijs met de eerste twee maanden gratis. */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>BETAALTERMIJN</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['maand', 'Per maand'], ['jaar', 'Jaarabonnement (12 maanden)']].map(([w, label]) => (
                <button key={w} onClick={() => setInterval(w)}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                    border: interval === w ? '2px solid #1DDB62' : '1px solid var(--br)',
                    background: interval === w ? '#f0fdf4' : 'var(--bg)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {interval === 'jaar' && (
              <p style={{ fontSize: '.78rem', color: 'var(--dmu)', margin: '6px 0 0' }}>
                Je betaalt € {tierPrice(doelTier || stand.tier)} per maand, <strong>12 maanden vast</strong> —
                tussentijds opzeggen kan niet. Daarna loopt het maandelijks door en is het
                per maand opzegbaar. Bij een jaarabonnement kies je één welkomstactie.
              </p>
            )}
          </div>

          {/* ── Welkomstactie: alleen bij een jaarabonnement, en precies één ── */}
          {interval === 'jaar' && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>
                KIES JE WELKOMSTACTIE
              </div>
              {stand.welkomstactie ? (
                <div style={{ background: 'var(--bgs)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                  Je hebt al gekozen voor <strong>{welkomstactieLabel(stand.welkomstactie)}</strong>.
                  Een welkomstactie is eenmalig en kan niet worden gewisseld.
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {welkomstactiesVoor(doelTier || stand.tier).map(a => (
                      <button key={a.key} onClick={() => setActie(a.key)}
                        style={{
                          textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                          border: actie === a.key ? '2px solid #1DDB62' : '1px solid var(--br)',
                          background: actie === a.key ? '#f0fdf4' : 'var(--bg)',
                        }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{a.label}</div>
                        <div style={{ fontSize: '.78rem', color: 'var(--dmu)', marginTop: 2 }}>
                          {a.kort}
                          {a.kortingMaanden > 0 && ' Je abonnement start meteen; de korting staat op je eerste facturen.'}
                          {a.key === 'gratis_website' && ' Hosting kost € 5 per maand; de website blijft beschikbaar zolang je abonnement loopt.'}
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Starter kent alleen de gratis maanden — dat is geen weglating
                      maar een bewuste beperking, dus benoemen we het. */}
                  {welkomstactiesVoor(doelTier || stand.tier).length === 1 && (
                    <p style={{ fontSize: '.76rem', color: 'var(--dmu)', margin: '6px 0 0' }}>
                      De gratis website hoort bij {tierLabel('groei')} en {tierLabel('team')}.
                    </p>
                  )}
                  {!actie && (
                    <p style={{ fontSize: '.76rem', color: '#b45309', margin: '6px 0 0' }}>
                      Kies een welkomstactie om verder te gaan.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Extra gebruikers */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>
              EXTRA GEBRUIKERS (€ {EXTRA_USER_PRICE} p/st per maand)
            </div>
            <input type="number" min="0" step="1" value={extra}
              onChange={e => setExtra(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              style={{ width: 90 }} />
            <span style={{ fontSize: '.8rem', color: 'var(--dmu)', marginLeft: 8 }}>
              bovenop de inbegrepen gebruiker
            </span>
          </div>

          {/* Modules die dit pakket mag bijkopen */}
          {MODULES.some(m => canBuyModule(doelTier, m.key)) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>MODULES</div>
              {MODULES.filter(m => canBuyModule(doelTier, m.key)).map(m => (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                  <span>{m.label}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--dmu)', fontSize: '.85rem' }}>+ € {m.price} p/mnd</span>
                </label>
              ))}
            </div>
          )}

          {/* Wat een overstap in de weg staat — concreet, met aantallen. */}
          {geblokkeerd && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 13px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 13, marginBottom: 5 }}>
                Dit pakket is te klein voor wat je nu gebruikt
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#7f1d1d' }}>
                {blokkades.map(b => (
                  <li key={b.limiet}>
                    {b.gebruikt} {b.label} — dit pakket gaat tot {b.maximum}.
                    Er {b.teveel === 1 ? 'moet er 1' : `moeten er ${b.teveel}`} weg.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>
              Totaal € {kosten} p/mnd
              <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--dmu)' }}> excl. BTW</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setWijzigen(false)} disabled={bezig}>Annuleren</button>
              <button className="btn btn-p" onClick={naarCheckout}
                disabled={bezig || geblokkeerd || (interval === 'jaar' && !stand.welkomstactie && !actie)}>
                {bezig ? 'Bezig…' : stand.heeftStripe ? 'Wijzigen' : 'Afrekenen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
