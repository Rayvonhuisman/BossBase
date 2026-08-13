import { useState, useEffect } from 'react';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { tierLabel, tierPrice, EXTRA_USER_PRICE, welkomstactieLabel, getWelkomstactie } from '../lib/tiers.js';
import { moduleLabel, modulePrice, getLimitDef } from '../lib/features.js';
import { getBillingStatus, openPortal, zegOp } from '../services/billingService.js';
import { readonlyTekst, READONLY_BEWAARD } from '../lib/readonly.js';
import { gaNaarAbonnement } from '../lib/abonnementNav.js';

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
  const { profile } = useProfile();
  const [stand, setStand] = useState(null);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [wijzigen, setWijzigen] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const laad = () => {
    setLaden(true);
    getBillingStatus()
      .then(setStand)
      .catch(e => toast.error(e.message || 'Abonnement laden mislukt'))
      .finally(() => setLaden(false));
  };
  useEffect(laad, []);

  if (!isAdmin) return null;
  if (laden) return <div className="card card-p">Abonnement laden…</div>;
  if (!stand) return <div className="card card-p">Geen abonnementsgegevens gevonden.</div>;

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



  return (
    <div className="afu3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Read-only. De banner staat al boven elke pagina; hier herhalen we de
          reden omdat dít het scherm is waar het opgelost wordt — de klant moet
          niet hoeven terugbladeren om te lezen waarom hij hier is. */}
      {stand.readonly && (
        <div className="card card-p" style={{ borderColor: '#fcd9a4', background: '#fffbf3' }}>
          <div style={{ fontWeight: 700, color: '#8a5a00' }}>{readonlyTekst(stand.readonlyReden).titel}</div>
          <div style={{ fontSize: '.86rem', color: 'var(--dmu)', marginTop: 4 }}>
            {readonlyTekst(stand.readonlyReden).uitleg}
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginTop: 6 }}>{READONLY_BEWAARD}</div>
        </div>
      )}

      {/* ── Huidig abonnement ─────────────────────────────────────────────── */}
      <div className="card card-p">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{tierLabel(stand.tier)}</div>
          <StatusPil status={stand.status} opzeggen={stand.opzeggenPerEindePeriode || stand.stoptNaLooptijd} stoptOp={stand.stoptOp} />
          {stand.billingInterval === 'jaar' && (
            <span style={{ fontSize: '.76rem', color: 'var(--dmu)' }}>jaarabonnement</span>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '.9rem', color: 'var(--dmu)' }}>
            {/* extraGebruikers is wat er APART gefactureerd wordt; bij Team is dat
                ook de eerste gebruiker. Het totaal aantal gebruikers is dus dit
                plus wat er in het pakket zit. */}
            € {tierPrice(stand.tier) + (stand.extraGebruikers || 0) * EXTRA_USER_PRICE} p/mnd
            {stand.extraGebruikers > 0 && ` (${tierLabel(stand.tier)} + ${stand.extraGebruikers} × € ${EXTRA_USER_PRICE})`}
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
                : `Tussentijds opzeggen kan niet. Je kunt opzeggen tegen ${fmtDatum(stand.verplichtingTot)}; daarna loopt het maandelijks door en is het per maand opzegbaar. Stap je over naar een groter pakket, dan begint de looptijd opnieuw — je ziet de nieuwe einddatum voordat je bevestigt.`}
            </div>
          </div>
        )}

        {/* Wijzigen staat vooraan en is de primaire knop. Voorheen was dat
            "Abonnement beheren" (het Stripe-portal), en dat trok precies de
            mensen aan die een groter pakket zochten — terwijl het portal daar
            niet over gaat. Alle abonnementswijzigingen lopen via ons eigen
            scherm, met onze regels erop: de downgradegrendel boven de limiet,
            de jaarlooptijd en de looptijdreset bij een upgrade. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stand.heeftStripe ? (
            <>
              <button className="btn btn-p" onClick={() => gaNaarAbonnement(null, { soort: 'abonnement' })} disabled={bezig}>
                Abonnement wijzigen
              </button>
              <button className="btn btn-s" onClick={naarPortal} disabled={bezig}>
                {bezig ? 'Bezig…' : 'Facturen en betaalmethode'}
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
            <button className="btn btn-p" onClick={() => gaNaarAbonnement(null, { soort: 'abonnement' })} disabled={bezig}>
              Abonnement afsluiten
            </button>
          )}
        </div>

        {/* Zeggen wat achter welke knop zit, zodat niemand het portal in gaat
            om iets te doen wat daar niet kan. */}
        {stand.heeftStripe && (
          <p style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 10, marginBottom: 0 }}>
            Van pakket wisselen, modules bij- of afkopen en teamleden toevoegen doe je onder
            <strong> Abonnement wijzigen</strong>. Onder <strong>Facturen en betaalmethode</strong>
            {' '}vind je je facturen, wijzig je je betaalmethode en pas je je factuurgegevens aan.
          </p>
        )}

        {!stand.heeftStripe && (
          <p style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 10, marginBottom: 0 }}>
            Je bent BossBase nu gratis aan het uitproberen. Er is nog geen betaalmethode gekoppeld.
          </p>
        )}
      </div>

      {/* ── Pakket kiezen ─────────────────────────────────────────────────── */}
      {/* Dezelfde flow als bij een bereikte limiet, een ontbrekende feature of
          een read-only account. Voorheen stond hier een tweede, eigen versie van
          hetzelfde scherm — twee plekken om te onderhouden en twee ervaringen
          voor de klant. */}


    </div>
  );
}
