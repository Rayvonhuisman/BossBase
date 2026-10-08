import { useState } from 'react';
import { usePlan } from '../hooks/usePlan.js';
import { useProfile } from '../lib/profileContext.jsx';
import { useToast } from '../lib/toast.jsx';
import { tierLabel } from '../lib/tiers.js';
import { wisselProefPakket } from '../services/proefService.js';

// In de proef met één klik van Groei naar Team of terug, zonder opnieuw te
// beginnen. Alleen voor de eigenaar, alleen tijdens de proef. De database
// bewaakt hetzelfde (bb_proef_pakket_wisselen).
export function ProefPakketWissel({ className = '', onGewisseld }) {
  const plan = usePlan();
  const { bumpRefresh } = useProfile();
  const toast = useToast();
  const [bezig, setBezig] = useState(false);
  if (!plan.trial || !plan.magBeheren || !['groei', 'team'].includes(plan.tier)) return null;
  const ander = plan.tier === 'groei' ? 'team' : 'groei';

  const wissel = async () => {
    setBezig(true);
    try {
      await wisselProefPakket(ander);
      bumpRefresh?.();
      toast.success(`Je proef staat nu op ${tierLabel(ander)}.`);
      onGewisseld?.(ander);
    } catch (e) {
      toast.error(e.message || 'Wisselen mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className={`proef-wissel ${className}`}>
      <span>Je probeert nu <strong>{tierLabel(plan.tier)}</strong>.</span>
      <button className="btn btn-s btn-sm" onClick={wissel} disabled={bezig}>
        {bezig ? 'Bezig…' : `Proef naar ${tierLabel(ander)}`}
      </button>
    </div>
  );
}
