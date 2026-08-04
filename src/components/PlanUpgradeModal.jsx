import { useState } from 'react';
import { usePlan } from '../hooks/usePlan.js';
import { getLimitDef } from '../lib/features.js';
import { UpgradeFlow } from './UpgradeFlow.jsx';

// Dit bestand hield vroeger een eigen upgrade-modal. Die is vervangen door
// UpgradeFlow: één scherm voor élke aanleiding (limiet, feature, read-only,
// gebruikers, of gewoon vanuit Instellingen).
//
// De oude modal eindigde in requestUpgrade() — een rij in upgrade_requests en de
// tekst "we zetten het voor je klaar". Dat was het aanhaakpunt uit fase 1 en het
// is nooit een betaling geworden; elke limietmelding in de app liep daardoor
// dood op een to-do-lijstje. UpgradeFlow rekent gewoon af.
//
// De naam usePlanGuard blijft, want die zit door de hele app heen.

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
  // Eén blokkade-object voor alle drie de gevallen: {limiet}, {feature} of
  // {readonly, actie}. Zo kan er nooit meer dan één melding tegelijk openstaan.
  const [blokkade, setBlokkade] = useState(null);
  const sluit = () => setBlokkade(null);

  // Read-only gaat vóór limiet en feature. Wie geen lopend abonnement heeft,
  // heeft niets aan "je hebt 20 van de 20 offertes gebruikt" — het probleem is
  // een ander en de oplossing ook.
  //
  //   <button onClick={guardSchrijven('Een nieuwe offerte maken', open)}>
  const guardSchrijven = (actie, fn) => (...args) => {
    if (!plan.readonly) return fn?.(...args);
    setBlokkade({ readonly: true, actie });
  };

  const guardLimiet = (key, fn) => (...args) => {
    if (plan.readonly) return setBlokkade({ readonly: true });
    if (plan.within(key)) return fn?.(...args);
    setBlokkade({ limiet: key });
  };

  const guardFeature = (key, fn) => (...args) => {
    if (plan.readonly) return setBlokkade({ readonly: true });
    if (plan.has(key)) return fn?.(...args);
    setBlokkade({ feature: key });
  };

  // Alle drie de gevallen komen uit bij hetzelfde scherm; alleen de aanleiding
  // verschilt. Die bepaalt wat er bovenaan staat en welke oplossing wordt
  // voorgesteld — de flow eronder is overal identiek.
  const planModal = !blokkade
    ? null
    : <UpgradeFlow
        aanleiding={
          blokkade.readonly ? { soort: 'readonly', actie: blokkade.actie }
          : blokkade.limiet === 'gebruikers' ? { soort: 'gebruikers' }
          : blokkade.limiet ? { soort: 'limiet', key: blokkade.limiet }
          : { soort: 'feature', key: blokkade.feature }
        }
        onClose={sluit}
      />;

  return { plan, guardLimiet, guardFeature, guardSchrijven, planModal, toonBlokkade: setBlokkade };
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
