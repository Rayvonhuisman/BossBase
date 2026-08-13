import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Star, ChevronDown, Info, X } from 'lucide-react';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import {
  TIERS, tierLabel, tierPrice, EXTRA_USER_PRICE,
  welkomstactiesVoor, welkomstactieLabel, YEARLY_FREE_MONTHS,
  inbegrepenGebruikers, betaaldeGebruikers, gebruikersPrijs, extraUserLabel,
} from '../lib/tiers.js';
import {
  MODULES, moduleLabel, modulePrice, canBuyModule, getLimitDef, featureLabel,
  tierForLimit, moduleMetVereisten, TIER_FEATURES, ZICHTBARE_FEATURES, TIER_LIMITS,
} from '../lib/features.js';
import {
  getBillingStatus, startCheckout, wijzigAbonnement, magWisselen,
} from '../services/billingService.js';
import { requestUpgrade } from '../services/planService.js';
import { bedenkVoorstel, euro, fmtDatum } from '../lib/upgradeVoorstel.js';
import { aanleidingUitUrl } from '../lib/abonnementNav.js';

// ── DE ABONNEMENTSPAGINA ──────────────────────────────────────────────────────
// Was een modal (UpgradeFlow). Daar moest te veel in: pakketkeuze, betaaltermijn,
// welkomstactie, modules, gebruikersteller, blokkades, looptijdwaarschuwing én
// een afrekenbalk — in 560px breed. Als volwaardige pagina is er ruimte om per
// pakket te laten zien wát je krijgt, in plaats van drie regels samenvatting.
//
// De aanleiding reist mee in de URL (?reden=limiet&key=offertes), zodat een
// refresh hem niet wist en elke plek in de app ernaartoe kan linken.
//
// De opzet volgt de prijzenpagina op de marketingsite; de data komt uit dezelfde
// bron (tiers.js + features.js), dus de twee kunnen niet uiteenlopen.

// Waar elk pakket voor bedoeld is. Alleen tekst — de harde grenzen komen uit
// TIER_LIMITS, zodat hier niets kan verouderen.
const VOOR_WIE = {
  starter: 'De startende eenpitter',
  groei:   'Voor 1-2 personen',
  team:    'Voor 2+ personen',
};

const AANBEVOLEN = 'groei';

// Wat elk pakket ONDERSCHEIDT — niet de volledige lijst. Die staat compleet in
// de vergelijkingstabel onderaan; de kaart hoort in één oogopslag te vertellen
// waaróm je dit pakket kiest. Bewust drie regels per kaart: meer wordt een lijst
// die je scant in plaats van leest.
const VORIGE_TIER = { starter: null, groei: 'starter', team: 'groei' };

const USPS = {
  starter: [
    'Klanten, leads en pipeline',
    'Offertes en facturen als PDF',
    'Agenda, werkbonnen en uren',
  ],
  groei: [
    'Klant tekent digitaal akkoord',
    'Boekhoudkoppeling en BTW-overzicht',
    'Kosten en nacalculatie per klus',
  ],
  team: [
    'Rollen en rechten per medewerker',
    'Teamplanning en voertuigen',
    'Stripe betaallink inbegrepen',
  ],
};

// Limieten die we per kaart tonen. Bewust concreet: "10 klanten" zegt meer dan
// "basisfunctionaliteit".
const KAART_LIMIETEN = ['gebruikers', 'klanten', 'offertes', 'facturen'];

// De labels in features.js staan in het meervoud ("Gebruikers"). Bij precies 1
// levert dat "1 gebruikers" op, dus daar hoort een enkelvoud bij.
const ENKELVOUD = { gebruikers: 'gebruiker', klanten: 'klant', offertes: 'offerte', facturen: 'factuur' };

const limietTekst = (tier, key) => {
  const max = TIER_LIMITS[tier]?.[key];
  const def = getLimitDef(key);
  const meervoud = def?.label?.toLowerCase() || key;
  if (max == null) return `Onbeperkt ${meervoud}`;
  const naam = max === 1 ? (ENKELVOUD[key] || meervoud) : meervoud;
  const per = def?.telwijze === 'periode' ? ' per maand' : '';
  return `${max} ${naam}${per}`;
};

export default function AbonnementPage({ setPage }) {
  const toast = useToast();
  const plan = usePlan();
  const { bumpRefresh } = useProfile();

  const [aanleiding] = useState(() => aanleidingUitUrl());
  const [stand, setStand] = useState(null);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const [toonVergelijking, setToonVergelijking] = useState(false);
  const vergelijkRef = useRef(null);

  // Uitklappen en er meteen naartoe scrollen. Zonder dat scrollen leek de knop
  // niets te doen: de tabel opent buiten beeld, onder de vouw.
  const wisselVergelijking = () => {
    setToonVergelijking(v => {
      const open = !v;
      if (open) {
        requestAnimationFrame(() =>
          vergelijkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
      return open;
    });
  };
  const [gemeld, setGemeld] = useState(false);
  // Welke module-uitleg staat open? Bewust op klik en niet op hover: op een
  // tablet bestaat hover niet, en dan zou de uitleg onbereikbaar zijn.
  const [uitlegVoor, setUitlegVoor] = useState(null);
  // Naar boven openen als er onder de knop geen ruimte is. De modulelijst staat
  // laag op de pagina, dus naar beneden zou de uitleg meestal wegvallen achter
  // de afrekenbalk.
  const [uitlegBoven, setUitlegBoven] = useState(false);

  const toonUitleg = (key, evt) => {
    if (uitlegVoor === key) { setUitlegVoor(null); return; }
    const r = evt.currentTarget.getBoundingClientRect();
    setUitlegBoven(window.innerHeight - r.bottom < 190);
    setUitlegVoor(key);
  };

  const [tier, setTier] = useState(null);
  // Nieuw abonnement staat standaard op jaarlijks: daar hoort de welkomstactie
  // bij en dat is voor de meeste klanten de betere keuze. Een lopend abonnement
  // houdt gewoon zijn eigen termijn (zie hieronder).
  const [interval, setInterval] = useState('jaar');
  const [actie, setActie] = useState(null);
  const [modules, setModules] = useState([]);
  // Totaal aantal gebruikers, niet "extra bovenop de eerste". Hoeveel er apart
  // gefactureerd worden hangt van het pakket af (Team rekent ook de eerste).
  const [gebruikers, setGebruikers] = useState(1);
  const [oordeel, setOordeel] = useState(null);
  const [akkoordLooptijd, setAkkoordLooptijd] = useState(false);

  useEffect(() => {
    let leeft = true;
    getBillingStatus()
      .then(s => {
        if (!leeft) return;
        setStand(s);
        const v = bedenkVoorstel({ aanleiding, plan, stand: s });
        // Zonder aanleiding: voorselecteren wat bij aanmelden is gekozen, zodat
        // iemand die nog proefdraait niet opnieuw hoeft te bedenken wat hij wou.
        let start = v.tier;
        if (!aanleiding && !s?.heeftStripe) {
          try {
            const gekozen = sessionStorage.getItem('bb.aanmeld.tier');
            if (gekozen && TIERS.some(t => t.id === gekozen)) start = gekozen;
          } catch { /* privacymodus */ }
        }
        setTier(start);
        setModules(v.modules);
        // Minstens 1: bij Team zit er geen gebruiker in de pakketprijs, dus
        // zonder ondergrens zou de teller op 0 beginnen.
        setGebruikers(Math.max(1, inbegrepenGebruikers(start) + (v.extra || 0)));
        // Alleen een LOPEND abonnement houdt zijn eigen termijn. Zonder Stripe
        // staat er weliswaar een billing_interval in de proefrij, maar die zegt
        // niets over wat de klant straks kiest — daar is jaarlijks de standaard.
        setInterval(s?.heeftStripe ? (s.billingInterval || 'maand') : 'jaar');
        setActie(s?.welkomstactie || null);
      })
      .catch(e => leeft && setFout({ bericht: e.message || 'Abonnementsgegevens laden mislukt' }))
      .finally(() => leeft && setLaden(false));
    return () => { leeft = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wat vindt de server van deze keuze? Dezelfde functie als billing-wijzig
  // gebruikt, dus het scherm belooft nooit iets dat daarna geweigerd wordt.
  useEffect(() => {
    if (!tier || !stand?.heeftStripe) { setOordeel(null); return; }
    let leeft = true;
    magWisselen(tier)
      .then(o => { if (leeft) { setOordeel(o); setAkkoordLooptijd(false); } })
      .catch(() => { if (leeft) setOordeel(null); });
    return () => { leeft = false; };
  }, [tier, stand?.heeftStripe]);

  useEffect(() => {
    if (!uitlegVoor) return;
    const sluit = e => { if (!e.target.closest?.('.ab-module-info')) setUitlegVoor(null); };
    const opEsc = e => { if (e.key === 'Escape') setUitlegVoor(null); };
    document.addEventListener('pointerdown', sluit);
    document.addEventListener('keydown', opEsc);
    return () => {
      document.removeEventListener('pointerdown', sluit);
      document.removeEventListener('keydown', opEsc);
    };
  }, [uitlegVoor]);

  const voorstel = useMemo(
    () => (stand ? bedenkVoorstel({ aanleiding, plan, stand }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stand],
  );

  if (laden) {
    return <div className="ab-page"><div className="ab-laden">Even kijken wat je nu hebt…</div></div>;
  }

  const magBetalen = stand?.magBeheren === true;
  const heeftStripe = stand?.heeftStripe === true;
  const inLooptijd = stand?.heeftVerplichting === true;
  const magIntervalKiezen = !heeftStripe;

  const huidigTier = tier || plan.tier;
  const betaald = betaaldeGebruikers(huidigTier, gebruikers);
  const totaal = tierPrice(huidigTier)
    + gebruikersPrijs(huidigTier, gebruikers)
    + modules.reduce((s, k) => s + modulePrice(k), 0);

  const huidigTotaal = heeftStripe
    ? tierPrice(stand.tier) + (stand.extraGebruikers || 0) * EXTRA_USER_PRICE
      + (stand.modules || []).reduce((s, k) => s + modulePrice(k), 0)
    : 0;
  const verschil = totaal - huidigTotaal;

  const toggleModule = key => setModules(prev => {
    if (prev.includes(key)) {
      return prev.filter(k => k !== key && MODULES.find(m => m.key === k)?.vereist !== key);
    }
    return [...new Set([...prev, ...moduleMetVereisten(key)])];
  });

  const kiesTier = t => {
    setTier(t);
    setModules(prev => prev.filter(k => canBuyModule(t, k)));
    const plafond = TIER_LIMITS[t]?.gebruikers ?? null;
    setGebruikers(g => {
      const ondergrens = Math.max(1, g);
      return plafond != null ? Math.min(ondergrens, plafond) : ondergrens;
    });
  };

  const gebruikersPlafond = TIER_LIMITS[tier]?.gebruikers ?? null;
  const gebruikersVol = gebruikersPlafond != null && gebruikers >= gebruikersPlafond;

  const meldBijBeheerder = async () => {
    setBezig(true);
    try {
      await requestUpgrade({
        tier: voorstel?.tier || null,
        modules: voorstel?.modules || [],
        aanleiding: aanleiding?.soort
          ? `${aanleiding.soort}${aanleiding.key ? `:${aanleiding.key}` : ''}`
          : 'medewerker',
      });
      setGemeld(true);
      toast.success('Doorgegeven aan je beheerder.');
    } catch (e) {
      toast.error(e.message || 'Doorgeven mislukt');
    } finally {
      setBezig(false);
    }
  };

  const bevestig = async () => {
    setBezig(true);
    setFout(null);
    try {
      if (heeftStripe) {
        const r = await wijzigAbonnement({ tier, extraGebruikers: betaald, modules });
        toast.success(r?.bericht || 'Je abonnement is bijgewerkt.');
        bumpRefresh?.();
        setStand(await getBillingStatus().catch(() => stand));
        return;
      }
      try {
        sessionStorage.setItem('bb.upgrade.herkomst', JSON.stringify({
          pad: window.location.pathname + window.location.search,
          aanleiding: aanleiding || null,
        }));
      } catch { /* privacymodus */ }
      const url = await startCheckout({
        tier, interval, extraGebruikers: betaald, modules,
        welkomstactie: interval === 'jaar' ? actie : null,
      });
      window.location.href = url;
    } catch (e) {
      if (e.code === 'downgrade_geblokkeerd' || e.code === 'boven_limiet') {
        setFout({ bericht: e.message, blokkades: e.blokkades || [] });
      } else if (e.code === 'gebruik_portal') {
        try {
          const r = await wijzigAbonnement({ tier, extraGebruikers: betaald, modules });
          toast.success(r?.bericht || 'Je abonnement is bijgewerkt.');
          bumpRefresh?.();
          setStand(await getBillingStatus().catch(() => stand));
          return;
        } catch (e2) {
          setFout({ bericht: e2.message || 'Wijzigen mislukt', blokkades: e2.blokkades || [] });
        }
      } else {
        setFout({ bericht: e.message || 'Er ging iets mis' });
      }
    } finally {
      setBezig(false);
    }
  };

  const geenActieGekozen = interval === 'jaar' && magIntervalKiezen && !stand?.welkomstactie && !actie;
  const looptijdNietBevestigd = oordeel?.looptijdReset === true && !akkoordLooptijd;
  const nietsGewijzigd = heeftStripe
    && tier === stand.tier
    && betaald === (stand.extraGebruikers || 0)
    && modules.length === (stand.modules || []).length
    && modules.every(k => (stand.modules || []).includes(k));

  const zichtbaar = new Set(ZICHTBARE_FEATURES.map(f => f.key));

  return (
    <div className="ab-page">
      <div className="page-hd afu">
        <div>
          <h1>{heeftStripe ? 'Je abonnement' : 'Kies je abonnement'}</h1>
          <p>{heeftStripe
            ? 'Wijzigingen gaan direct in; het verschil wordt verrekend.'
            : 'Je gegevens blijven staan — je gaat verder waar je gebleven was.'}</p>
        </div>
      </div>

      {/* ── Waarom je hier bent ────────────────────────────────────────────── */}
      {/* 'abonnement' is geen probleem maar gewoon de keuze — de paginakop zegt
          dat al, dus dan geen banner die zichzelf herhaalt. */}
      {aanleiding && aanleiding.soort !== 'abonnement' && voorstel && (
        <div className="ab-aanleiding afu">
          <div className="ab-aanleiding-kop">{voorstel.kop}</div>
          <div className="ab-aanleiding-uitleg">{voorstel.uitleg}</div>
          {voorstel.wat && <div className="ab-aanleiding-wat">{voorstel.wat}</div>}
        </div>
      )}

      {!magBetalen ? (
        /* Medewerker: geen betaalknoppen — de server weigert ze toch. Wel een
           weg vooruit, in plaats van een doodlopend scherm. */
        <div className="card card-p afu2" style={{ maxWidth: 620 }}>
          <p style={{ fontSize: 14, color: 'var(--dmu)', marginTop: 0 }}>
            Het abonnement aanpassen doet de beheerder van je bedrijf. Jij kunt gewoon
            verder met alles wat je al hebt.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {!gemeld
              ? <button className="btn btn-p" onClick={meldBijBeheerder} disabled={bezig}>
                  {bezig ? 'Bezig…' : 'Laat mijn beheerder weten'}
                </button>
              : <span style={{ fontSize: '.85rem', color: 'var(--dmu)' }}>
                  Doorgegeven. Je beheerder ziet dit bij Instellingen → Abonnement.
                </span>}
          </div>
        </div>
      ) : (
        <>
          {/* ── Betaaltermijn ─────────────────────────────────────────────── */}
          {magIntervalKiezen && (
            <div className="ab-termijn afu2">
              <div className="ab-termijn-schakel" role="group" aria-label="Betaaltermijn">
                {[['maand', 'Maandelijks'], ['jaar', 'Jaarlijks']].map(([w, label]) => (
                  <button key={w} className={interval === w ? 'on' : ''}
                    onClick={() => setInterval(w)} disabled={bezig}>{label}</button>
                ))}
              </div>
              {interval === 'jaar' && (
                <div className="ab-termijn-uitleg">
                  Je betaalt maandelijks, <strong>12 maanden vast</strong> — tussentijds opzeggen
                  kan niet. Daarna maandelijks opzegbaar. Je kiest er één welkomstactie bij.
                </div>
              )}
            </div>
          )}

          {/* ── Welkomstactie ─────────────────────────────────────────────── */}
          {magIntervalKiezen && interval === 'jaar' && (
            <div className="ab-actie afu2">
              <div className="ab-kop">Kies je welkomstactie</div>
              {stand?.welkomstactie ? (
                <div className="ab-actie-vast">
                  Je hebt al gekozen voor <strong>{welkomstactieLabel(stand.welkomstactie)}</strong>.
                  Een welkomstactie is eenmalig en kan niet worden gewisseld.
                </div>
              ) : (
                <div className="ab-actie-grid">
                  {welkomstactiesVoor(tier).map(a => (
                    <button key={a.key} className={`ab-actie-kaart${actie === a.key ? ' on' : ''}`}
                      onClick={() => setActie(a.key)} disabled={bezig}>
                      <div className="ab-actie-label">{a.label}</div>
                      <div className="ab-actie-kort">{a.kort}</div>
                    </button>
                  ))}
                </div>
              )}
              {welkomstactiesVoor(tier).length === 1 && !stand?.welkomstactie && (
                <p className="ab-hint">De gratis website hoort bij {tierLabel('groei')} en {tierLabel('team')}.</p>
              )}
            </div>
          )}

          {/* ── De drie pakketten ─────────────────────────────────────────── */}
          <div className="ab-grid afu2">
            {TIERS.map(t => {
              const gekozen = tier === t.id;
              const huidig = heeftStripe && t.id === stand?.tier;
              const isVoorstel = voorstel?.tier === t.id && !huidig;
              const vorige = VORIGE_TIER[t.id];
              const usps = USPS[t.id] || [];
              return (
                <div key={t.id} className={`ab-kaart${gekozen ? ' on' : ''}${t.id === AANBEVOLEN ? ' hot' : ''}`}>
                  {t.id === AANBEVOLEN && (
                    <div className="ab-badge"><Star size={11} fill="currentColor" /> Meest gekozen</div>
                  )}
                  <div className="ab-kaart-kop">
                    <div className="ab-tier">{tierLabel(t.id)}</div>
                    {huidig && <span className="ab-merk huidig">Je hebt dit nu</span>}
                    {isVoorstel && <span className="ab-merk advies">Aanbevolen</span>}
                  </div>
                  <div className="ab-wie">{VOOR_WIE[t.id]}</div>
                  <div className="ab-prijs">
                    <strong>€ {tierPrice(t.id)}</strong>
                    <span>/ maand{interval === 'jaar' ? ' · 12 mnd' : ''}</span>
                  </div>
                  <div className="ab-extra-user">{extraUserLabel(t.id)}</div>

                  <ul className="ab-limieten">
                    {KAART_LIMIETEN.map(k => (
                      <li key={k}><Check size={14} strokeWidth={2.4} /> {limietTekst(t.id, k)}</li>
                    ))}
                  </ul>

                  <ul className="ab-features">
                    {vorige && (
                      <li className="ab-erft">Alles van {tierLabel(vorige)}, plus:</li>
                    )}
                    {usps.map(u => (
                      <li key={u}><Check size={13} strokeWidth={2.4} /> {u}</li>
                    ))}
                  </ul>

                  <button className={`btn ${gekozen ? 'btn-s' : 'btn-p'} ab-kies`}
                    onClick={() => kiesTier(t.id)} disabled={bezig}>
                    {gekozen ? 'Gekozen' : huidig ? 'Houden' : `Kies ${tierLabel(t.id)}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Modules + teamleden ───────────────────────────────────────── */}
          <div className={`ab-opties afu3${uitlegVoor ? ' uitleg-open' : ''}`}>
            {MODULES.some(m => canBuyModule(tier, m.key)) && (
              <div className="card card-p">
                <div className="ab-kop">Modules</div>
                {MODULES.filter(m => canBuyModule(tier, m.key)).map(m => (
                  <div key={m.key} className="ab-module-rij">
                    <label className="ab-module">
                      <input type="checkbox" checked={modules.includes(m.key)}
                        onChange={() => toggleModule(m.key)} disabled={bezig} />
                      <span>{m.label}</span>
                    </label>
                    {m.uitleg && (
                      <span className="ab-module-info">
                        <button type="button" className="ab-info-knop"
                          aria-label={`Wat doet ${m.label}?`}
                          aria-expanded={uitlegVoor === m.key}
                          onClick={e => toonUitleg(m.key, e)}>
                          <Info size={15} strokeWidth={2} />
                        </button>
                        {uitlegVoor === m.key && (
                          <span className={`ab-uitleg${uitlegBoven ? ' boven' : ''}`} role="dialog" aria-label={m.label}>
                            <span className="ab-uitleg-kop">
                              {m.label}
                              <button type="button" className="ab-uitleg-x" aria-label="Sluiten"
                                onClick={() => setUitlegVoor(null)}><X size={13} /></button>
                            </span>
                            {m.uitleg}
                          </span>
                        )}
                      </span>
                    )}
                    <span className="ab-module-prijs">+ {euro(m.price)} p/mnd</span>
                  </div>
                ))}
                {modules.includes('voertuigen') && (
                  <p className="ab-hint">Voertuigen werkt alleen samen met de planningsmodule — die is meegenomen.</p>
                )}
              </div>
            )}

            <div className="card card-p">
              <div className="ab-kop">Teamleden</div>
              <div className="ab-teller">
                <button className="btn btn-s btn-sm" disabled={bezig || gebruikers <= 1}
                  onClick={() => setGebruikers(g => Math.max(1, g - 1))} aria-label="Minder gebruikers">−</button>
                <span className="ab-teller-waarde">{gebruikers} {gebruikers === 1 ? 'gebruiker' : 'gebruikers'}</span>
                <button className="btn btn-s btn-sm" disabled={bezig || gebruikersVol}
                  onClick={() => setGebruikers(g => g + 1)} aria-label="Meer gebruikers">+</button>
              </div>
              <p className="ab-hint">
                {betaald > 0
                  ? `${betaald} × ${euro(EXTRA_USER_PRICE)} = ${euro(betaald * EXTRA_USER_PRICE)} p/mnd bovenop ${tierLabel(tier)}`
                  : `${inbegrepenGebruikers(tier)} inbegrepen · ${euro(EXTRA_USER_PRICE)} per extra gebruiker`}
              </p>
              {gebruikersVol && (
                <p className="ab-hint">
                  {tierLabel(tier)} gaat tot {gebruikersPlafond} gebruiker{gebruikersPlafond === 1 ? '' : 's'}.
                  Voor meer is er {tierLabel(tierForLimit(tier, 'gebruikers') || 'team')}.
                </p>
              )}
            </div>
          </div>

          {/* ── Volledige vergelijking ────────────────────────────────────── */}
          <div className="ab-vergelijk afu3" ref={vergelijkRef}>
            <button className="ab-vergelijk-knop" onClick={wisselVergelijking}
              aria-expanded={toonVergelijking}>
              <ChevronDown size={16} className={toonVergelijking ? 'open' : ''} />
              Alles vergelijken
            </button>
            {toonVergelijking && (
              <div className="ab-tabel-wrap">
                <table className="ab-tabel">
                  <thead>
                    <tr>
                      <th>Functie</th>
                      {TIERS.map(t => <th key={t.id}>{tierLabel(t.id)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ZICHTBARE_FEATURES.map(f => (
                      <tr key={f.key}>
                        <td>{f.label || featureLabel(f.key)}</td>
                        {TIERS.map(t => (
                          <td key={t.id} className="ab-cel">
                            {(TIER_FEATURES[t.id] || []).includes(f.key)
                              ? <Check size={15} strokeWidth={2.6} className="ab-ja" />
                              : <Minus size={14} className="ab-nee" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Blokkades ─────────────────────────────────────────────────── */}
          {fout && (
            <div className="ab-fout afu3">
              <div className="ab-fout-kop">{fout.bericht}</div>
              {fout.blokkades?.length > 0 && (
                <ul>
                  {fout.blokkades.map(b => (
                    <li key={b.limiet}>
                      {b.gebruikt} {b.label} — dit pakket gaat tot {b.maximum}.
                      Er {b.teveel === 1 ? 'moet er 1' : `moeten er ${b.teveel}`} weg.
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Looptijd start opnieuw ────────────────────────────────────── */}
          {oordeel?.looptijdReset && (
            <div className="ab-looptijd afu3">
              <div className="ab-looptijd-kop">Je jaarabonnement start opnieuw</div>
              <p>
                Met deze upgrade begint een nieuwe looptijd van 12 maanden, t/m{' '}
                <strong>{fmtDatum(oordeel.nieuweVerplichtingTot)}</strong>.
                {oordeel.huidigeVerplichtingTot && <> Je huidige looptijd liep tot {fmtDatum(oordeel.huidigeVerplichtingTot)}.</>}
                {' '}Tussentijds opzeggen kan tot die datum niet.
              </p>
              <label className="ab-akkoord">
                <input type="checkbox" checked={akkoordLooptijd} disabled={bezig}
                  onChange={e => setAkkoordLooptijd(e.target.checked)} />
                <span>Ik ga ermee akkoord dat mijn looptijd opnieuw begint en loopt t/m {fmtDatum(oordeel.nieuweVerplichtingTot)}.</span>
              </label>
            </div>
          )}

          {inLooptijd && !oordeel?.looptijdReset && (
            <p className="ab-hint afu3">
              Je jaarabonnement loopt t/m {fmtDatum(stand.verplichtingTot)}. Uitbreiden kan altijd
              en gaat direct in; naar een kleiner pakket kan na die datum.
            </p>
          )}

          {/* ── Vaste afrekenbalk ─────────────────────────────────────────── */}
          <div className="ab-balk">
            <div className="ab-balk-som">
              <div className="ab-balk-tier">{tierLabel(tier)}{modules.length > 0 && ` + ${modules.length} module${modules.length === 1 ? '' : 's'}`}</div>
              <div className="ab-balk-totaal">
                {euro(totaal)} <span>p/mnd excl. btw</span>
              </div>
              {heeftStripe && verschil !== 0 && (
                <div className="ab-balk-verschil">
                  {verschil > 0
                    ? `${euro(verschil)} meer dan nu · direct verrekend`
                    : `${euro(Math.abs(verschil))} minder · verrekend op je volgende factuur`}
                </div>
              )}
            </div>
            <div className="ab-balk-acties">
              {geenActieGekozen && <span className="ab-balk-let">Kies eerst een welkomstactie.</span>}
              {looptijdNietBevestigd && <span className="ab-balk-let">Zet het vinkje voor de nieuwe looptijd.</span>}
              {nietsGewijzigd && <span className="ab-balk-rust">Dit is wat je nu al hebt.</span>}
              <button className="btn btn-ghost" onClick={() => setPage?.('instellingen')} disabled={bezig}>
                Later
              </button>
              <button className="btn btn-p" onClick={bevestig}
                disabled={bezig || geenActieGekozen || nietsGewijzigd || looptijdNietBevestigd}>
                {bezig ? 'Bezig…' : heeftStripe ? 'Wijziging doorvoeren' : `Afrekenen · ${euro(totaal)} p/mnd`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
