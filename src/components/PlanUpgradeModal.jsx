import { useState } from 'react';
import { ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { TIERS, tierLabel, tierPrice } from '../lib/tiers.js';
import {
  featureLabel, getLimitDef, TIER_FEATURES, MODULES, canBuyModule, modulePrice,
  ZICHTBARE_FEATURES,
} from '../lib/features.js';
import { requestUpgrade } from '../services/planService.js';

// Eén modaal voor beide gevallen:
//   <PlanUpgradeModal feature="planning" onClose={…} />   → feature zit niet in het abonnement
//   <PlanUpgradeModal limiet="offertes" onClose={…} />    → limiet bereikt
//
// Houdt het simpel: tier kiezen en bevestigen. De daadwerkelijke betaalflow komt
// in fase 2 — requestUpgrade() is daarvoor het aanhaakpunt.
export function PlanUpgradeModal({ feature = null, limiet = null, onClose }) {
  const toast = useToast();
  const plan = usePlan();
  const { profile, bumpRefresh } = useProfile();
  const isAdmin = profile?.role === 'admin';

  const aanbevolen = feature ? plan.needsFor(feature) : plan.needsForLimit(limiet);
  const [gekozen, setGekozen] = useState(aanbevolen || 'groei');
  const [gekozenModules, setGekozenModules] = useState([]);
  const [bezig, setBezig] = useState(false);

  const limitDef = limiet ? getLimitDef(limiet) : null;

  const titel = feature
    ? `${featureLabel(feature)} zit niet in je abonnement`
    : `Je ${limitDef?.label?.toLowerCase() || limiet}-limiet is bereikt`;

  const uitleg = feature
    ? `Deze functie hoort bij ${tierLabel(aanbevolen)}. Upgraden kan direct — je bestaande gegevens blijven staan.`
    : `Je hebt deze periode ${plan.used(limiet)} van de ${plan.limit(limiet)} ${limitDef?.label?.toLowerCase() || ''} gebruikt. `
      + 'Alles wat er al staat blijft gewoon werken; alleen nieuw aanmaken is geblokkeerd.';

  // Tiers vanaf het aanbevolen niveau — lager upgraden heeft geen zin.
  const vanafIdx = Math.max(0, TIERS.findIndex(t => t.id === (aanbevolen || plan.tier)));
  const keuzes = TIERS.slice(vanafIdx);

  // Modules zijn alleen relevant als de gekozen tier ze kan bijkopen (Groei) én
  // de feature waar het om gaat door een module gedekt wordt.
  const relevanteModules = feature
    ? MODULES.filter(m => m.feature === feature && canBuyModule(gekozen, m.key))
    : [];

  const toggleModule = key => {
    setGekozenModules(prev => {
      if (prev.includes(key)) {
        // Een module die als vereiste dient, sleept zijn afhankelijken mee.
        return prev.filter(k => k !== key && MODULES.find(m => m.key === k)?.vereist !== key);
      }
      const vereist = MODULES.find(m => m.key === key)?.vereist;
      return vereist && !prev.includes(vereist) ? [...prev, vereist, key] : [...prev, key];
    });
  };

  const bevestig = async () => {
    setBezig(true);
    try {
      await requestUpgrade({
        tier: gekozen,
        modules: gekozenModules,
        aanleiding: feature ? `feature:${feature}` : `limiet:${limiet}`,
      });
      toast.success('Upgrade aangevraagd — we zetten het voor je klaar.');
      bumpRefresh?.();
      onClose();
    } catch (e) {
      toast.error(`Aanvragen mislukt: ${e.message}`);
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !bezig && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titel}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">{titel}</div>
            <div className="modal-sub">{uitleg}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        {!isAdmin ? (
          <p style={{ fontSize: 14, color: 'var(--dmu)', margin: '4px 0 20px' }}>
            Vraag de beheerder van je bedrijf om het abonnement aan te passen.
          </p>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 8, marginBottom: relevanteModules.length ? 18 : 22 }}>
              {keuzes.map(t => {
                const actief = gekozen === t.id;
                // Alleen verkoopbare functies noemen — intern gedrag (zoals de
                // gedeelde werkruimte) hoort niet in een upgradepitch.
                const zichtbaar = new Set(ZICHTBARE_FEATURES.map(f => f.key));
                const nieuw = TIER_FEATURES[t.id].filter(f => zichtbaar.has(f) && !plan.has(f)).slice(0, 4);
                return (
                  <button
                    key={t.id}
                    onClick={() => setGekozen(t.id)}
                    style={{
                      textAlign: 'left', padding: '13px 15px', borderRadius: 12, cursor: 'pointer',
                      border: actief ? '2px solid #1DDB62' : '1px solid var(--br)',
                      background: actief ? '#f0fdf4' : 'var(--bg)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontWeight: 700 }}>{t.label}</span>
                      <span style={{ fontSize: '.88rem', color: 'var(--dmu)' }}>€ {tierPrice(t.id)} p/mnd</span>
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

            {relevanteModules.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 7 }}>
                  Of koop alleen deze module bij
                </div>
                {relevanteModules.map(m => (
                  <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={gekozenModules.includes(m.key)}
                      onChange={() => toggleModule(m.key)}
                    />
                    <span>{m.label}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--dmu)', fontSize: '.85rem' }}>+ € {modulePrice(m.key)} p/mnd</span>
                  </label>
                ))}
                {gekozenModules.includes('voertuigen') && (
                  <div style={{ fontSize: '.76rem', color: 'var(--dmu)', marginTop: 2 }}>
                    Voertuigen werkt alleen samen met de planningsmodule — die is meegenomen.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose} disabled={bezig}>Later</button>
              <button className="btn btn-p" onClick={bevestig} disabled={bezig}>
                {bezig ? 'Bezig…' : `Upgraden naar ${tierLabel(gekozen)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Wikkelt een actie in de abonnementscontrole. Zit de feature er niet in of is
// de limiet bereikt, dan gaat de actie niet door maar opent de upgrade-melding.
//
//   const { guardLimiet, planModal } = usePlanGuard();
//   <button onClick={guardLimiet('klanten', () => setShowNew(true))}>Nieuwe klant</button>
//   {planModal}
//
// De server blokkeert hoe dan ook (RLS). Dit is er om het vóór de klik duidelijk
// te maken in plaats van erna met een databasefout.
export function usePlanGuard() {
  const plan = usePlan();
  const [blokkade, setBlokkade] = useState(null);

  const guardLimiet = (key, fn) => (...args) => {
    if (plan.within(key)) return fn?.(...args);
    setBlokkade({ limiet: key });
  };

  const guardFeature = (key, fn) => (...args) => {
    if (plan.has(key)) return fn?.(...args);
    setBlokkade({ feature: key });
  };

  const planModal = blokkade
    ? <PlanUpgradeModal {...blokkade} onClose={() => setBlokkade(null)} />
    : null;

  return { plan, guardLimiet, guardFeature, planModal, toonBlokkade: setBlokkade };
}

// Kleine, herbruikbare "x van y"-teller. Toont de stand vóórdat de limiet in
// beeld komt, zodat een blokkade nooit als verrassing komt.
export function PlanStand({ limiet, style }) {
  const plan = usePlan();
  const max = plan.limit(limiet);
  if (max == null) return null;
  const gebruikt = plan.used(limiet);
  const def = getLimitDef(limiet);
  const vol = gebruikt >= max;
  const bijna = !vol && gebruikt >= max - Math.max(1, Math.round(max * 0.1));
  return (
    <span
      title={`${gebruikt} van ${max} ${def?.label?.toLowerCase() || limiet} in deze periode`}
      style={{
        fontSize: '.76rem', fontWeight: 600, padding: '3px 9px', borderRadius: 20,
        background: vol ? '#fef2f2' : bijna ? '#fffbeb' : 'var(--bgs)',
        color: vol ? '#b91c1c' : bijna ? '#b45309' : 'var(--dmu)',
        ...style,
      }}
    >
      {gebruikt} / {max} {def?.label?.toLowerCase() || limiet}
    </span>
  );
}
