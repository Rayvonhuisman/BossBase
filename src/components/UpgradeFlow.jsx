import { useEffect, useMemo, useState } from 'react';
import { ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import {
  TIERS, tierLabel, tierPrice, EXTRA_USER_PRICE,
  welkomstactiesVoor, welkomstactieLabel,
} from '../lib/tiers.js';
import {
  MODULES, moduleLabel, modulePrice, canBuyModule, getLimitDef, featureLabel,
  tierForFeature, tierForLimit, moduleForFeature, moduleMetVereisten,
  TIER_FEATURES, ZICHTBARE_FEATURES, TIER_LIMITS,
} from '../lib/features.js';
import { readonlyTekst } from '../lib/readonly.js';
import {
  getBillingStatus, startCheckout, wijzigAbonnement, openPortal, magWisselen,
} from '../services/billingService.js';
import { requestUpgrade } from '../services/planService.js';

// ── DE UPGRADEFLOW ────────────────────────────────────────────────────────────
// Eén scherm voor élke aanleiding: limiet bereikt, feature ontbreekt, account
// read-only, gebruiker erbij, module nodig. Ze verschillen alleen in wat er
// bovenaan staat en welke oplossing wordt voorgesteld — daaronder is het
// dezelfde flow, met dezelfde knop.
//
// Waarom dat uitmaakt: dit is het moment waarop iemand wil betalen. Elke variant
// die je apart onderhoudt, is een variant die stuk kan gaan zonder dat je het
// merkt. Voorheen leidde de limietmelding naar requestUpgrade() — een rij in
// upgrade_requests en de tekst "we zetten het voor je klaar". Dat was het
// fase-1-aanhaakpunt en het is nooit een betaling geworden.
//
// De volgorde is bewust: eerst waaróm je hier bent, dan het antwoord op precies
// dat probleem, en pas daaronder de andere opties. Niet de hele prijstabel
// opnieuw — die heeft de klant al gezien toen hij klant werd.
//
// Gebruik:
//   <UpgradeFlow aanleiding={{ soort: 'limiet', key: 'offertes' }} onClose={…} />
//   <UpgradeFlow aanleiding={{ soort: 'feature', key: 'planning' }} onClose={…} />
//   <UpgradeFlow aanleiding={{ soort: 'readonly' }} onClose={…} />
//   <UpgradeFlow aanleiding={{ soort: 'gebruikers' }} onClose={…} />
//   <UpgradeFlow aanleiding={{ soort: 'abonnement' }} onClose={…} />   ← Instellingen

const GROEN = '#1DDB62';

const euro = n => `€ ${Number(n || 0)}`;

const fmtDatum = d => d
  ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  : '—';

// ── Wat is het probleem, en wat lost het op? ─────────────────────────────────
// Eén functie die van een aanleiding een voorstel maakt. Alles wat het scherm
// toont, komt hieruit — zo kan de kop nooit iets anders beweren dan de knop doet.
function bedenkVoorstel({ aanleiding, plan, stand }) {
  const huidig = stand?.tier || plan.tier;
  const soort = aanleiding?.soort || 'abonnement';
  const key = aanleiding?.key || null;

  // Read-only: er is niets te kiezen dat het probleem oplost behalve betalen.
  // Zijn huidige pakket volstaat — hij moet er alleen een abonnement op nemen.
  if (soort === 'readonly') {
    const t = readonlyTekst(plan.readonlyReden);
    return {
      kop: t.titel,
      uitleg: t.uitleg,
      tier: huidig,
      modules: [],
      extra: stand?.extraGebruikers ?? 0,
      wat: `Je houdt ${tierLabel(huidig)} en alles staat direct weer open.`,
    };
  }

  // Limiet bereikt. De concrete stand erbij — "20 van de 20" zegt meer dan
  // "je limiet is bereikt".
  if (soort === 'limiet' && key) {
    const def = getLimitDef(key);
    const doel = tierForLimit(huidig, key) || 'groei';
    const naam = def?.label?.toLowerCase() || key;
    const nieuweMax = TIER_LIMITS[doel]?.[key];
    return {
      kop: `Je hebt ${plan.used(key)} van de ${plan.limit(key)} ${naam} gebruikt`,
      uitleg: def?.telwijze === 'periode'
        ? 'Dat is de teller van deze factuurperiode. Alles wat er al staat blijft gewoon werken; alleen nieuwe erbij maken lukt niet meer.'
        : 'Alles wat er al staat blijft gewoon werken; alleen nieuwe erbij maken lukt niet meer.',
      tier: doel,
      modules: [],
      extra: stand?.extraGebruikers ?? 0,
      wat: nieuweMax == null
        ? `Met ${tierLabel(doel)} is het aantal ${naam} onbeperkt.`
        : `${tierLabel(doel)} gaat tot ${nieuweMax} ${naam}.`,
    };
  }

  // Feature ontbreekt. Is er een module die hem levert bij het HUIDIGE pakket,
  // dan is dat het antwoord — niet de pakketsprong. Een klant die € 10 nodig
  // heeft € 20 laten betalen omdat dat ons beter uitkomt, is geen advies.
  if (soort === 'feature' && key) {
    const module = moduleForFeature(huidig, key);
    if (module) {
      const meegenomen = moduleMetVereisten(module.key);
      const prijs = meegenomen.reduce((s, k) => s + modulePrice(k), 0);
      return {
        kop: `${featureLabel(key)} zit niet in je abonnement`,
        uitleg: `Je kunt het bijkopen als module — je hoeft er niet voor over te stappen naar een groter pakket.`,
        tier: huidig,
        modules: meegenomen,
        extra: stand?.extraGebruikers ?? 0,
        wat: meegenomen.length > 1
          ? `${meegenomen.map(moduleLabel).join(' + ')} — samen ${euro(prijs)} per maand erbij. ${moduleLabel(module.key)} werkt alleen samen met ${moduleLabel(module.vereist)}.`
          : `${moduleLabel(module.key)} — ${euro(prijs)} per maand erbij.`,
      };
    }
    const doel = tierForFeature(key) || 'team';
    return {
      kop: `${featureLabel(key)} zit niet in je abonnement`,
      uitleg: `Deze functie hoort bij ${tierLabel(doel)}. Je bestaande gegevens blijven staan.`,
      tier: doel,
      modules: [],
      extra: stand?.extraGebruikers ?? 0,
      wat: `${tierLabel(doel)} heeft ${featureLabel(key)} standaard.`,
    };
  }

  // Gebruiker erbij. Past hij binnen het plafond van het huidige pakket, dan is
  // een extra gebruiker het antwoord; anders het volgende pakket.
  if (soort === 'gebruikers') {
    const plafond = TIER_LIMITS[huidig]?.gebruikers ?? null;
    const inGebruik = plan.used('gebruikers');
    const past = plafond == null || inGebruik + 1 <= plafond;
    if (past) {
      return {
        kop: 'Een teamlid erbij',
        uitleg: `Je hebt nu ${inGebruik} gebruiker${inGebruik === 1 ? '' : 's'}.`,
        tier: huidig,
        modules: stand?.modules ?? [],
        extra: Math.max((stand?.extraGebruikers ?? 0) + 1, 1),
        wat: `Elke extra gebruiker kost ${euro(EXTRA_USER_PRICE)} per maand.`,
      };
    }
    const doel = tierForLimit(huidig, 'gebruikers') || 'team';
    return {
      kop: `${tierLabel(huidig)} gaat tot ${plafond} gebruiker${plafond === 1 ? '' : 's'}`,
      uitleg: `Je hebt er ${inGebruik}. Voor meer teamleden is er ${tierLabel(doel)}.`,
      tier: doel,
      modules: stand?.modules ?? [],
      extra: stand?.extraGebruikers ?? 0,
      wat: TIER_LIMITS[doel]?.gebruikers == null
        ? `${tierLabel(doel)} heeft geen maximum aantal gebruikers — je betaalt ${euro(EXTRA_USER_PRICE)} per extra gebruiker.`
        : `${tierLabel(doel)} gaat tot ${TIER_LIMITS[doel].gebruikers} gebruikers.`,
    };
  }

  // Vanuit Instellingen: geen probleem om op te lossen, gewoon de keuze.
  return {
    kop: stand?.heeftStripe ? 'Je abonnement aanpassen' : 'Kies je abonnement',
    uitleg: stand?.heeftStripe
      ? 'Wijzigingen gaan direct in. Het verschil wordt verrekend.'
      : 'Je gegevens blijven staan; je kunt meteen verder waar je gebleven was.',
    tier: huidig,
    modules: stand?.modules ?? [],
    extra: stand?.extraGebruikers ?? 0,
    wat: null,
  };
}

// Wat een medewerker wél kan: het bij de beheerder neerleggen. Eén klik, en hij
// weet dat het is doorgegeven — beter dan een knop die hem naar een scherm
// stuurt waar hij niets mag.
function MelderVoorMedewerker({ aanleiding, voorstel, onClose }) {
  const toast = useToast();
  const [bezig, setBezig] = useState(false);
  const [gemeld, setGemeld] = useState(false);

  const meld = async () => {
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

  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--dmu)', margin: '4px 0 6px' }}>
        Het abonnement aanpassen doet de beheerder van je bedrijf. Jij kunt gewoon
        verder met alles wat je al hebt.
      </p>
      {voorstel?.wat && (
        <p style={{ fontSize: '.86rem', color: 'var(--dmu)', margin: '0 0 18px' }}>{voorstel.wat}</p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
        {!gemeld && (
          <button className="btn btn-p" onClick={meld} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Laat mijn beheerder weten'}
          </button>
        )}
      </div>
      {gemeld && (
        <p style={{ fontSize: '.8rem', color: 'var(--dmu)', margin: '10px 0 0', textAlign: 'right' }}>
          Je beheerder ziet dit terug bij Instellingen → Abonnement.
        </p>
      )}
    </>
  );
}

export function UpgradeFlow({ aanleiding = null, onClose, onKlaar = null }) {
  const toast = useToast();
  const plan = usePlan();
  const { bumpRefresh } = useProfile();

  const [stand, setStand] = useState(null);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const [toonAlles, setToonAlles] = useState(false);

  const [tier, setTier] = useState(null);
  const [interval, setInterval] = useState('maand');
  const [actie, setActie] = useState(null);
  const [modules, setModules] = useState([]);
  const [extra, setExtra] = useState(0);
  // Oordeel van de server over het gekozen pakket: mag het, en start de looptijd
  // opnieuw? Dat laatste moet de klant zien vóór hij bevestigt.
  const [oordeel, setOordeel] = useState(null);
  const [akkoordLooptijd, setAkkoordLooptijd] = useState(false);

  useEffect(() => {
    let leeft = true;
    getBillingStatus()
      .then(s => {
        if (!leeft) return;
        setStand(s);
        const v = bedenkVoorstel({ aanleiding, plan, stand: s });
        setTier(v.tier);
        setModules(v.modules);
        setExtra(v.extra);
        setInterval(s?.billingInterval || 'maand');
        setActie(s?.welkomstactie || null);
      })
      .catch(e => leeft && setFout(e.message || 'Abonnementsgegevens laden mislukt'))
      .finally(() => leeft && setLaden(false));
    return () => { leeft = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bij elke pakketkeuze opnieuw ophalen wat de server ervan vindt. Dezelfde
  // functie die billing-wijzig gebruikt, dus het scherm kan niets beloven wat de
  // server daarna weigert — en de looptijddatum die we tonen is de datum die
  // straks ook echt wordt vastgelegd.
  useEffect(() => {
    if (!tier || !stand?.heeftStripe) { setOordeel(null); return; }
    let leeft = true;
    magWisselen(tier)
      .then(o => { if (leeft) { setOordeel(o); setAkkoordLooptijd(false); } })
      .catch(() => { if (leeft) setOordeel(null); });
    return () => { leeft = false; };
  }, [tier, stand?.heeftStripe]);

  const voorstel = useMemo(
    () => (stand ? bedenkVoorstel({ aanleiding, plan, stand }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stand],
  );

  if (laden) {
    return (
      <div className="overlay">
        <div className="modal" style={{ maxWidth: 520 }}>
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dl)' }}>Even kijken wat je nu hebt…</div>
        </div>
      </div>
    );
  }

  // Alleen wie mag betalen krijgt betaalknoppen. Dit komt van de SERVER
  // (magBeheren), niet van profile.role — de edge functions weigeren op precies
  // dezelfde gate, dus zo kan het scherm niet iets aanbieden dat de server
  // vervolgens afwijst.
  const magBetalen = stand?.magBeheren === true;

  const heeftStripe = stand?.heeftStripe === true;
  const jaarklant = stand?.billingInterval === 'jaar';
  const inLooptijd = stand?.heeftVerplichting === true;

  // Betaaltermijn kiezen kan alleen bij een NIEUW abonnement. Van maandelijks
  // naar een jaarverplichting overstappen is een ander gesprek (nieuwe looptijd,
  // welkomstactie die al vergeven kan zijn) en hoort niet verstopt te zitten in
  // een upgradeknop.
  const magIntervalKiezen = !heeftStripe;

  const totaal = tierPrice(tier || plan.tier)
    + extra * EXTRA_USER_PRICE
    + modules.reduce((s, k) => s + modulePrice(k), 0);

  const huidigTotaal = heeftStripe
    ? tierPrice(stand.tier) + (stand.extraGebruikers || 0) * EXTRA_USER_PRICE
      + (stand.modules || []).reduce((s, k) => s + modulePrice(k), 0)
    : 0;

  const verschil = totaal - huidigTotaal;

  const toggleModule = key => setModules(prev => {
    if (prev.includes(key)) {
      // Een module die als vereiste dient, sleept zijn afhankelijken mee.
      return prev.filter(k => k !== key && MODULES.find(m => m.key === k)?.vereist !== key);
    }
    return [...new Set([...prev, ...moduleMetVereisten(key)])];
  });

  const kiesTier = t => {
    setTier(t);
    // Modules die dit pakket niet kan bijkopen vallen af. Zonder dit zou de
    // knop een combinatie versturen die de server terecht weigert.
    setModules(prev => prev.filter(k => canBuyModule(t, k)));
    const plafond = TIER_LIMITS[t]?.gebruikers ?? null;
    if (plafond != null) setExtra(e => Math.min(e, Math.max(0, plafond - 1)));
  };

  const gebruikersPlafond = TIER_LIMITS[tier]?.gebruikers ?? null;
  const gebruikersVol = gebruikersPlafond != null && 1 + extra >= gebruikersPlafond;

  // ── Afrekenen ──────────────────────────────────────────────────────────────
  const bevestig = async () => {
    setBezig(true);
    setFout(null);
    try {
      if (heeftStripe) {
        // Lopend abonnement → rechtstreeks wijzigen. Geen omweg via het portal;
        // dat kan het niet voor jaarklanten en hangt anders aan een dashboardvinkje.
        const r = await wijzigAbonnement({ tier, extraGebruikers: extra, modules });
        toast.success(r?.bericht || 'Je abonnement is bijgewerkt.');
        bumpRefresh?.();
        onKlaar?.(r);
        onClose?.();
        return;
      }
      // Nog geen abonnement → Checkout. Waar de klant vandaan kwam reist mee,
      // zodat hij na het betalen terugkomt op de plek waar hij vastliep.
      try {
        sessionStorage.setItem('bb.upgrade.herkomst', JSON.stringify({
          pad: window.location.pathname + window.location.search,
          aanleiding: aanleiding || null,
        }));
      } catch { /* privacymodus: dan gewoon naar de abonnementssectie */ }

      const url = await startCheckout({
        tier, interval, extraGebruikers: extra, modules,
        welkomstactie: interval === 'jaar' ? actie : null,
      });
      window.location.href = url;
    } catch (e) {
      // Downgrade boven de limiet: toon wát er weg moet, met aantallen.
      if (e.code === 'downgrade_geblokkeerd' || e.code === 'boven_limiet') {
        setFout({ bericht: e.message, blokkades: e.blokkades || [] });
      } else if (e.code === 'gebruik_portal') {
        // Kan alleen nog voorkomen bij een oude cliëntversie; dan het portal.
        try { window.location.href = await openPortal(); } catch { setFout({ bericht: e.message }); }
      } else {
        setFout({ bericht: e.message || 'Er ging iets mis' });
      }
      setBezig(false);
    }
  };

  const geenActieGekozen = interval === 'jaar' && magIntervalKiezen
    && !stand?.welkomstactie && !actie;

  // Start de looptijd opnieuw, dan gaat er niets door zonder expliciet akkoord.
  const looptijdNietBevestigd = oordeel?.looptijdReset === true && !akkoordLooptijd;

  const nietsGewijzigd = heeftStripe
    && tier === stand.tier
    && extra === (stand.extraGebruikers || 0)
    && modules.length === (stand.modules || []).length
    && modules.every(k => (stand.modules || []).includes(k));

  // Tiers die zinnig zijn om te tonen: het voorstel plus alles daarboven. Lager
  // dan wat je nu hebt is geen upgrade — dat staat onder "andere opties".
  const voorgesteldIdx = TIERS.findIndex(t => t.id === voorstel?.tier);
  const zichtbareTiers = toonAlles ? TIERS : TIERS.slice(Math.max(0, voorgesteldIdx));

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !bezig && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={voorstel?.kop} style={{ maxWidth: 560 }}>

        {/* ── Waarom je hier bent ──────────────────────────────────────────── */}
        <div className="modal-hd">
          <div>
            <div className="modal-title">{voorstel?.kop}</div>
            <div className="modal-sub">{voorstel?.uitleg}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        {!magBetalen ? (
          /* Medewerker. Geen betaalknop — die zou de server toch weigeren. Maar
             ook geen doodlopende weg: hij kan het bij zijn beheerder neerleggen,
             zodat hij iets kán doen behalve wegklikken. */
          <MelderVoorMedewerker aanleiding={aanleiding} voorstel={voorstel} onClose={onClose} />
        ) : (
          <>
            {/* ── Het antwoord op precies dit probleem ──────────────────────── */}
            {voorstel?.wat && (
              <div style={{
                background: '#f0fdf4', border: `1px solid ${GROEN}`, borderRadius: 12,
                padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#166534', letterSpacing: '.04em', marginBottom: 3 }}>
                  DIT LOST HET OP
                </div>
                <div style={{ fontSize: 14, color: '#14532d' }}>{voorstel.wat}</div>
              </div>
            )}

            {/* ── Pakket ───────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gap: 8, marginBottom: 6 }}>
              {zichtbareTiers.map(t => {
                const gekozen = tier === t.id;
                const isVoorstel = t.id === voorstel?.tier;
                const zichtbaar = new Set(ZICHTBARE_FEATURES.map(f => f.key));
                const nieuw = (TIER_FEATURES[t.id] || [])
                  .filter(f => zichtbaar.has(f) && !plan.has(f)).slice(0, 3);
                return (
                  <button key={t.id} onClick={() => kiesTier(t.id)} disabled={bezig}
                    style={{
                      textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      border: gekozen ? `2px solid ${GROEN}` : '1px solid var(--br)',
                      background: gekozen ? '#f0fdf4' : 'var(--bg)',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontWeight: 700 }}>
                        {t.label}
                        {t.id === stand?.tier && heeftStripe && (
                          <span style={{ fontWeight: 400, fontSize: '.78rem', color: 'var(--dmu)' }}> · je hebt dit nu</span>
                        )}
                        {isVoorstel && t.id !== stand?.tier && (
                          <span style={{ fontWeight: 700, fontSize: '.72rem', color: '#166534' }}> · aanbevolen</span>
                        )}
                      </span>
                      <span style={{ fontSize: '.88rem', color: 'var(--dmu)', whiteSpace: 'nowrap' }}>
                        {euro(tierPrice(t.id))} p/mnd
                      </span>
                    </div>
                    {nieuw.length > 0 && (
                      <div style={{ fontSize: '.78rem', color: 'var(--dmu)', marginTop: 4 }}>
                        Nieuw: {nieuw.map(featureLabel).join(' · ')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {!toonAlles && zichtbareTiers.length < TIERS.length && (
              <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }}
                onClick={() => setToonAlles(true)}>
                Andere pakketten bekijken
              </button>
            )}
            {(toonAlles || zichtbareTiers.length === TIERS.length) && <div style={{ marginBottom: 14 }} />}

            {/* ── Betaaltermijn (alleen bij een nieuw abonnement) ───────────── */}
            {magIntervalKiezen && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>BETAALTERMIJN</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['maand', 'Per maand'], ['jaar', 'Jaarabonnement']].map(([w, label]) => (
                    <button key={w} onClick={() => setInterval(w)} disabled={bezig}
                      style={{
                        flex: 1, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                        border: interval === w ? `2px solid ${GROEN}` : '1px solid var(--br)',
                        background: interval === w ? '#f0fdf4' : 'var(--bg)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                {interval === 'jaar' && (
                  <p style={{ fontSize: '.78rem', color: 'var(--dmu)', margin: '6px 0 0' }}>
                    Je betaalt {euro(tierPrice(tier))} per maand, <strong>12 maanden vast</strong> —
                    tussentijds opzeggen kan niet. Daarna maandelijks en per maand opzegbaar.
                    Je kiest er één welkomstactie bij.
                  </p>
                )}
              </div>
            )}

            {/* ── Welkomstactie ────────────────────────────────────────────── */}
            {magIntervalKiezen && interval === 'jaar' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>
                  KIES JE WELKOMSTACTIE
                </div>
                {stand?.welkomstactie ? (
                  <div style={{ background: 'var(--bgs)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                    Je hebt al gekozen voor <strong>{welkomstactieLabel(stand.welkomstactie)}</strong>.
                    Een welkomstactie is eenmalig en kan niet worden gewisseld.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {welkomstactiesVoor(tier).map(a => (
                        <button key={a.key} onClick={() => setActie(a.key)} disabled={bezig}
                          style={{
                            textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                            border: actie === a.key ? `2px solid ${GROEN}` : '1px solid var(--br)',
                            background: actie === a.key ? '#f0fdf4' : 'var(--bg)',
                          }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{a.label}</div>
                          <div style={{ fontSize: '.78rem', color: 'var(--dmu)', marginTop: 2 }}>{a.kort}</div>
                        </button>
                      ))}
                    </div>
                    {welkomstactiesVoor(tier).length === 1 && (
                      <p style={{ fontSize: '.76rem', color: 'var(--dmu)', margin: '6px 0 0' }}>
                        De gratis website hoort bij {tierLabel('groei')} en {tierLabel('team')}.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Modules ──────────────────────────────────────────────────── */}
            {MODULES.some(m => canBuyModule(tier, m.key)) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>MODULES</div>
                {MODULES.filter(m => canBuyModule(tier, m.key)).map(m => (
                  <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={modules.includes(m.key)}
                      onChange={() => toggleModule(m.key)} disabled={bezig} />
                    <span>{m.label}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--dmu)', fontSize: '.85rem' }}>
                      + {euro(m.price)} p/mnd
                    </span>
                  </label>
                ))}
                {modules.includes('voertuigen') && (
                  <div style={{ fontSize: '.76rem', color: 'var(--dmu)', marginTop: 2 }}>
                    Voertuigen werkt alleen samen met de planningsmodule — die is meegenomen.
                  </div>
                )}
              </div>
            )}

            {/* ── Extra gebruikers ─────────────────────────────────────────── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>
                TEAMLEDEN
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-s btn-sm" disabled={bezig || extra <= 0}
                  onClick={() => setExtra(e => Math.max(0, e - 1))}>−</button>
                <span style={{ fontWeight: 700, minWidth: 92, textAlign: 'center' }}>
                  {1 + extra} {1 + extra === 1 ? 'gebruiker' : 'gebruikers'}
                </span>
                <button className="btn btn-s btn-sm" disabled={bezig || gebruikersVol}
                  onClick={() => setExtra(e => e + 1)}>+</button>
                <span style={{ fontSize: '.8rem', color: 'var(--dmu)' }}>
                  {extra > 0
                    ? `${extra} × ${euro(EXTRA_USER_PRICE)} = ${euro(extra * EXTRA_USER_PRICE)} p/mnd erbij`
                    : `1 inbegrepen · ${euro(EXTRA_USER_PRICE)} per extra gebruiker`}
                </span>
              </div>
              {gebruikersVol && (
                <p style={{ fontSize: '.76rem', color: 'var(--dmu)', margin: '6px 0 0' }}>
                  {tierLabel(tier)} gaat tot {gebruikersPlafond} gebruiker{gebruikersPlafond === 1 ? '' : 's'}.
                  Voor meer teamleden is er {tierLabel(tierForLimit(tier, 'gebruikers') || 'team')}.
                </p>
              )}
            </div>

            {/* ── Wat de overstap in de weg staat ──────────────────────────── */}
            {fout && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 13px', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 13 }}>{fout.bericht}</div>
                {fout.blokkades?.length > 0 && (
                  <ul style={{ margin: '5px 0 0', paddingLeft: 18, fontSize: 13, color: '#7f1d1d' }}>
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

            {/* ── Looptijd start opnieuw ───────────────────────────────────
                Verplicht expliciet, niet in de kleine lettertjes. Iemand die in
                maand 11 upgradet zit daarna wéér 12 maanden vast; dat mag geen
                ontdekking achteraf zijn. Vandaar de datum én een vinkje.
                Alleen bij een PAKKETupgrade van een jaarabonnement — modules en
                extra gebruikers raken de looptijd niet. */}
            {oordeel?.looptijdReset && (
              <div style={{
                background: '#fffbf3', border: '1px solid #fcd9a4', borderRadius: 12,
                padding: '13px 15px', marginBottom: 14,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#8a5a00' }}>
                  Je jaarabonnement start opnieuw
                </div>
                <div style={{ fontSize: '.86rem', color: 'var(--dmu)', marginTop: 4 }}>
                  Met deze upgrade begint een nieuwe looptijd van 12 maanden.
                  Nieuwe looptijd t/m <strong>{fmtDatum(oordeel.nieuweVerplichtingTot)}</strong>.
                  {oordeel.huidigeVerplichtingTot && (
                    <> Je huidige looptijd liep tot {fmtDatum(oordeel.huidigeVerplichtingTot)}.</>
                  )}
                </div>
                <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginTop: 4 }}>
                  Tussentijds opzeggen kan tot die datum niet. Daarna loopt het maandelijks
                  door en is het per maand opzegbaar.
                </div>
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11,
                  fontSize: 14, cursor: 'pointer', fontWeight: 600,
                }}>
                  <input type="checkbox" checked={akkoordLooptijd} disabled={bezig}
                    onChange={e => setAkkoordLooptijd(e.target.checked)}
                    style={{ marginTop: 3 }} />
                  <span>
                    Ik ga ermee akkoord dat mijn looptijd opnieuw begint en loopt
                    t/m {fmtDatum(oordeel.nieuweVerplichtingTot)}.
                  </span>
                </label>
              </div>
            )}

            {/* Jaarklant binnen looptijd: upgraden mag, kleiner worden niet. */}
            {inLooptijd && !oordeel?.looptijdReset && (
              <p style={{ fontSize: '.78rem', color: 'var(--dmu)', margin: '0 0 12px' }}>
                Je jaarabonnement loopt t/m {fmtDatum(stand.verplichtingTot)}. Uitbreiden kan
                altijd en gaat direct in; naar een kleiner pakket kan na die datum.
              </p>
            )}

            {/* ── Afrekenen ────────────────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                  {euro(totaal)} <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--dmu)' }}>p/mnd excl. btw</span>
                </div>
                {heeftStripe && verschil !== 0 && (
                  <div style={{ fontSize: '.78rem', color: 'var(--dmu)' }}>
                    {verschil > 0
                      ? `${euro(verschil)} per maand meer dan nu · het verschil wordt direct verrekend`
                      : `${euro(Math.abs(verschil))} per maand minder · verrekend op je volgende factuur`}
                  </div>
                )}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={onClose} disabled={bezig}>Later</button>
                <button className="btn btn-p" onClick={bevestig}
                  disabled={bezig || geenActieGekozen || nietsGewijzigd || looptijdNietBevestigd}>
                  {bezig ? 'Bezig…'
                    : heeftStripe ? 'Wijziging doorvoeren'
                    : `Afrekenen · ${euro(totaal)} p/mnd`}
                </button>
              </div>
            </div>

            {geenActieGekozen && (
              <p style={{ fontSize: '.76rem', color: '#b45309', margin: '8px 0 0', textAlign: 'right' }}>
                Kies eerst een welkomstactie.
              </p>
            )}
            {looptijdNietBevestigd && (
              <p style={{ fontSize: '.76rem', color: '#b45309', margin: '8px 0 0', textAlign: 'right' }}>
                Zet het vinkje om akkoord te gaan met de nieuwe looptijd.
              </p>
            )}
            {nietsGewijzigd && (
              <p style={{ fontSize: '.76rem', color: 'var(--dmu)', margin: '8px 0 0', textAlign: 'right' }}>
                Dit is wat je nu al hebt.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default UpgradeFlow;
