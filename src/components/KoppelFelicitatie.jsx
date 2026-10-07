import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMeldactie } from '../services/meldpuntService.js';

// Boss feliciteert als een bedrijf een koppeling heeft gemaakt.
//
// Eén keer per koppeling: de pagina die het koppelen afrondt roept
// feliciteerKoppeling(id) aan op het moment dat de koppeling er echt staat (terug
// van de OAuth van Moneybird, Stripe net actief). Een synchronisatie roept hem
// nooit aan, dus hij komt niet terug bij elke sync.
//
// Zelfde Boss en ballon als de rondleiding (klassen rl-*), maar dan midden in
// beeld en zonder stappen. Staat in de Bug-of-idee-knop (Meldpunt.jsx): die is er
// altijd, en de knop "Bug of idee" opent dan meteen zijn formulier.

export const KOPPELING_GELUKT = 'bb-koppeling-gelukt';

// Per koppeling: de naam en één zin over wat er voortaan vanzelf gebeurt.
const KOPPELINGEN = {
  moneybird: {
    naam: 'Moneybird',
    vanzelf: 'gaan je facturen en kosten vanzelf naar Moneybird, en komen betalingen en inkoopfacturen vanzelf terug.',
  },
  stripe: {
    naam: 'Stripe',
    vanzelf: 'kunnen je klanten hun factuur online betalen, en staat een betaalde factuur vanzelf op betaald.',
  },
  google: {
    naam: 'Google Agenda',
    vanzelf: 'staan je klussen en afspraken vanzelf in je Google Agenda.',
  },
};

export function feliciteerKoppeling(id) {
  if (!KOPPELINGEN[id]) return;
  window.dispatchEvent(new CustomEvent(KOPPELING_GELUKT, { detail: { id } }));
}

export default function KoppelFelicitatie({ onMeldpunt }) {
  const [id, setId] = useState(null);
  const [prijzen, setPrijzen] = useState(null);

  useEffect(() => {
    const op = e => {
      setId(e.detail?.id || null);
      // Alleen over een prijs praten als de actie echt loopt.
      getMeldactie().then(setPrijzen).catch(() => setPrijzen(null));
    };
    window.addEventListener(KOPPELING_GELUKT, op);
    return () => window.removeEventListener(KOPPELING_GELUKT, op);
  }, []);

  useEffect(() => {
    if (!id) return undefined;
    const opToets = e => { if (e.key === 'Escape') { e.stopPropagation(); setId(null); } };
    window.addEventListener('keydown', opToets, true);
    return () => window.removeEventListener('keydown', opToets, true);
  }, [id]);

  const k = id && KOPPELINGEN[id];
  if (!k) return null;

  const naarMeldpunt = () => {
    setId(null);
    onMeldpunt?.();
  };

  return createPortal(
    <div className="rl-laag" role="dialog" aria-modal="true" aria-labelledby="kf-titel">
      <div className="rl-vanger rl-dim" onClick={() => setId(null)} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div className="rl-gids rl-gids-welkom" style={{ position: 'relative', pointerEvents: 'auto' }}>
          <div className="rl-boss" aria-hidden="true"><img src="/boss-gids.png" alt="" /></div>
          <div className="rl-ballon">
            <div id="kf-titel" className="rl-titel">Goed bezig!</div>
            <p className="rl-tekst">
              Je hebt {k.naam} gekoppeld aan BossBase. Vanaf nu {k.vanzelf}
            </p>
            <p className="rl-tekst">
              Loop je ergens tegenaan, gaat er iets mis bij het synchroniseren of heb je een vraag?
              Laat het me weten via Bug of idee bovenin{prijzen ? ', dan maak je meteen kans op een prijs' : ''}.
            </p>
            <div className="rl-knoppen">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setId(null)}>Sluiten</button>
              <button type="button" className="btn btn-p btn-sm" autoFocus onClick={naarMeldpunt}>Bug of idee</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
