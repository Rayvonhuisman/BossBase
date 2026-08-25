// Vinkje "gesynchroniseerd met <boekhouding>" op een klant- of leverancierskaart.
//
// Toont zichzelf alleen als er ÉCHT een koppeling actief is. Zonder die
// controle bleef een oud moneybird_id of snelstart_id een vinkje geven nadat de
// koppeling was losgekoppeld — een melding over een boekhouding die er niet is.
//
// De koppelstatus wordt één keer per sessie opgehaald en gedeeld: elk scherm dat
// dit component gebruikt, hangt aan dezelfde belofte in plaats van zijn eigen
// RPC te doen.

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getActieveKoppelingen } from '../services/accountingService.js';

let gedeeld = null;
export function vergeetKoppelingen() { gedeeld = null; }

function useKoppelingen() {
  const [koppelingen, setKoppelingen] = useState(null);
  useEffect(() => {
    let leeft = true;
    if (!gedeeld) gedeeld = getActieveKoppelingen().catch(() => ({}));
    gedeeld.then(k => { if (leeft) setKoppelingen(k); });
    return () => { leeft = false; };
  }, []);
  return koppelingen;
}

const PROVIDERS = [
  { sleutel: 'moneybird', veld: 'moneybirdId', naam: 'Moneybird' },
  { sleutel: 'afas',      veld: 'afasId',      naam: 'AFAS' },
  { sleutel: 'snelstart', veld: 'snelstartId', naam: 'SnelStart' },
];

export default function SyncIndicator({ entiteit }) {
  const koppelingen = useKoppelingen();
  if (!entiteit || !koppelingen) return null;

  // Alleen een provider die zowel gekoppeld is als een id op deze rij heeft.
  const treffer = PROVIDERS.find(p => koppelingen[p.sleutel] && entiteit[p.veld]);
  if (!treffer) return null;

  return (
    <span className="sync-indicator" data-tooltip={`Gesynchroniseerd met ${treffer.naam}`}>
      <Check size={15} style={{ color: '#15A34A' }} />
    </span>
  );
}
