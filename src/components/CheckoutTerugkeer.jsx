import { useEffect, useRef, useState } from 'react';
import { useProfile } from '../lib/profileContext.jsx';
import { getBillingStatus } from '../services/billingService.js';
import { tierLabel } from '../lib/tiers.js';

// ── TERUGKEER UIT STRIPE CHECKOUT ─────────────────────────────────────────────
// De klant komt terug op /dashboard/instellingen?tab=abonnement met
// ?checkout=gelukt of ?checkout=geannuleerd. Tot nu toe deed niemand iets met
// die parameter: je landde op de abonnementspagina zonder bevestiging, en als de
// webhook nog onderweg was stond je oude pakket er nog.
//
// Wat hier gebeurt:
//   1. Wachten tot de webhook binnen is — kort pollen, geen harde verversing.
//   2. De app laten bijwerken (bumpRefresh), zodat limieten en features overal
//      meebewegen zonder dat de klant iets hoeft te doen.
//   3. Bevestigen wát hij heeft, en hem terugbrengen naar de plek waar hij
//      vastliep.
//
// We POLLEN en gokken niet. Een optimistische status zou betekenen dat het
// scherm "Team" zegt terwijl de database nog "Groei" weet — en de RLS luistert
// naar de database, niet naar het scherm. Dan klikt de klant door op iets dat
// alsnog geweigerd wordt, en dat is erger dan drie seconden wachten.

const INTERVAL_MS = 1500;
const MAX_WACHT_MS = 25000;

const HERKOMST_SLEUTEL = 'bb.upgrade.herkomst';

function leesHerkomst() {
  try {
    const rauw = sessionStorage.getItem(HERKOMST_SLEUTEL);
    return rauw ? JSON.parse(rauw) : null;
  } catch { return null; }
}

function wisHerkomst() {
  try { sessionStorage.removeItem(HERKOMST_SLEUTEL); } catch { /* niets aan te doen */ }
}

// Query-parameters weghalen zodat een verversing of terugknop niet opnieuw
// "gelukt!" laat zien voor een betaling van een kwartier geleden.
function schoonUrl() {
  try {
    const u = new URL(window.location.href);
    ['checkout', 'session_id'].forEach(k => u.searchParams.delete(k));
    window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
  } catch { /* oude browser: dan blijft de parameter staan */ }
}

export function CheckoutTerugkeer() {
  const { bumpRefresh } = useProfile();
  const [toestand, setToestand] = useState(null); // 'wachten' | 'klaar' | 'traag' | 'geannuleerd'
  const [stand, setStand] = useState(null);
  const [herkomst, setHerkomst] = useState(null);
  const gestart = useRef(false);

  useEffect(() => {
    if (gestart.current) return;
    gestart.current = true;

    const params = new URLSearchParams(window.location.search);
    const uitkomst = params.get('checkout');
    if (!uitkomst) return;

    setHerkomst(leesHerkomst());
    schoonUrl();

    if (uitkomst === 'geannuleerd') {
      setToestand('geannuleerd');
      wisHerkomst();
      return;
    }
    if (uitkomst !== 'gelukt') return;

    setToestand('wachten');

    let gestopt = false;
    const begin = Date.now();

    const kijk = async () => {
      if (gestopt) return;
      try {
        const s = await getBillingStatus();
        // De webhook is binnen zodra er een Stripe-abonnement aan het bedrijf
        // hangt én dat abonnement loopt. Daarvóór is de database nog eerlijk
        // "nog geen abonnement" en dat is precies wat we niet willen tonen.
        const loopt = s?.heeftStripe
          && ['active', 'trialing'].includes(String(s.stripeStatus || ''));
        if (loopt) {
          setStand(s);
          setToestand('klaar');
          bumpRefresh?.();
          return;
        }
      } catch { /* netwerkhik: gewoon opnieuw proberen */ }

      if (Date.now() - begin > MAX_WACHT_MS) {
        // Niet blijven draaien. De betaling is gelukt — dat weet Stripe zeker —
        // alleen de verwerking duurt langer dan gebruikelijk. Dat zeggen we ook
        // zo, in plaats van een spinner die eeuwig doortolt.
        setToestand('traag');
        bumpRefresh?.();
        return;
      }
      setTimeout(kijk, INTERVAL_MS);
    };
    kijk();

    return () => { gestopt = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!toestand) return null;

  const sluit = () => { wisHerkomst(); setToestand(null); };

  const terugNaarHerkomst = () => {
    const pad = herkomst?.pad;
    wisHerkomst();
    setToestand(null);
    if (pad && pad !== window.location.pathname + window.location.search) {
      window.location.assign(pad);
    }
  };

  // Geannuleerd: geen drama van maken. Er is niets afgeschreven en hij kan het
  // zo weer proberen.
  if (toestand === 'geannuleerd') {
    return (
      <Balk kleur="grijs" onSluit={sluit}
        titel="Je hebt het afrekenen afgebroken"
        tekst="Er is niets in rekening gebracht. Je kunt het op elk moment opnieuw proberen." />
    );
  }

  if (toestand === 'wachten') {
    return (
      <Balk kleur="groen"
        titel="Betaling gelukt — we zetten je abonnement klaar"
        tekst="Dit duurt meestal een paar seconden. Je hoeft niets te doen." />
    );
  }

  if (toestand === 'traag') {
    return (
      <Balk kleur="groen" onSluit={sluit}
        titel="Betaling gelukt"
        tekst="De verwerking duurt iets langer dan gebruikelijk. Je abonnement staat zo klaar — ververs de pagina over een minuutje. Krijgen we het niet rond, dan nemen we contact met je op." />
    );
  }

  return (
    <Balk
      kleur="groen"
      onSluit={sluit}
      titel={`Je ${tierLabel(stand?.tier)}-abonnement is actief`}
      tekst={'Alles staat voor je open. Je krijgt een bevestiging per mail.'}
      knop={herkomst?.pad ? { label: 'Verder waar je was', actie: terugNaarHerkomst } : null}
    />
  );
}

function Balk({ kleur, titel, tekst, knop = null, onSluit = null }) {
  const groen = kleur === 'groen';
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
        padding: '14px 16px', marginBottom: 16, borderRadius: 12,
        border: `1px solid ${groen ? '#bbf7d0' : 'var(--br)'}`,
        background: groen ? '#f0fdf4' : 'var(--bgs)',
      }}
    >
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '.95rem', color: groen ? '#166534' : 'var(--dk)' }}>{titel}</div>
        <div style={{ fontSize: '.86rem', color: 'var(--dmu)', marginTop: 3 }}>{tekst}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignSelf: 'center', flexShrink: 0 }}>
        {knop && <button className="btn btn-p" onClick={knop.actie}>{knop.label}</button>}
        {onSluit && <button className="btn btn-ghost" onClick={onSluit}>Sluiten</button>}
      </div>
    </div>
  );
}

export default CheckoutTerugkeer;
