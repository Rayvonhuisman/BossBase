import { useState } from 'react';
import { usePlan } from '../hooks/usePlan.js';
import { UpgradeFlow } from './UpgradeFlow.jsx';
import {
  readonlyTekst, READONLY_BLIJFT_WERKEN, READONLY_BEWAARD,
} from '../lib/readonly.js';

// Read-only in beeld: een balk bovenaan die uitlegt wat er speelt, en een
// melding bij een actie die niet meer kan.
//
// De server blokkeert hoe dan ook (restrictive policies). Dit is er om het uit te
// leggen — en vooral om de weg naar de oplossing één klik weg te houden. Een
// klant die wil betalen maar niet kan vinden waar, is het faalscenario dat we
// koste wat kost willen vermijden.
//
// Wie het aangaat: alleen de eigenaar/admin kan betalen, dus alleen die krijgt de
// knop. Een medewerker ziet dát het account beperkt is — hem een betaalknop
// voorhouden die hij niet mag gebruiken, is alleen maar frustrerend.

export function ReadOnlyBanner() {
  const plan = usePlan();
  const [open, setOpen] = useState(false);

  if (!plan.readonly) return null;

  const t = readonlyTekst(plan.readonlyReden);

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
        padding: '14px 16px', marginBottom: 16, borderRadius: 12,
        border: '1px solid #fcd9a4', background: '#fffbf3',
      }}
    >
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#8a5a00' }}>{t.titel}</div>
        <div style={{ fontSize: '.86rem', color: 'var(--dmu)', marginTop: 3 }}>{t.uitleg}</div>
        <div style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 6 }}>
          Blijft gewoon werken: {READONLY_BLIJFT_WERKEN.join(' · ').toLowerCase()}.
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 2 }}>{READONLY_BEWAARD}</div>
      </div>

      {plan.magBeheren ? (
        <button
          className="btn btn-p"
          style={{ flexShrink: 0, alignSelf: 'center' }}
          onClick={() => setOpen(true)}
        >
          {t.knop}
        </button>
      ) : (
        <div style={{ fontSize: '.8rem', color: 'var(--dmu)', alignSelf: 'center', flexShrink: 0, maxWidth: 260 }}>
          Vraag de beheerder van je bedrijf om het abonnement te regelen.
        </div>
      )}

      {/* Dezelfde flow als overal. Niet doorsturen naar Instellingen: dat is een
          extra stap tussen "ik wil dit oplossen" en betalen, en precies daar
          haakt iemand af. */}
      {open && <UpgradeFlow aanleiding={{ soort: 'readonly' }} onClose={() => setOpen(false)} />}
    </div>
  );
}
