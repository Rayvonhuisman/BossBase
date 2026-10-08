import { useState, useEffect } from 'react';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { tierLabel, tierPrice, EXTRA_USER_PRICE, welkomstactieLabel, getWelkomstactie, betaaldeGebruikers } from '../lib/tiers.js';
import { moduleLabel, modulePrice, getLimitDef, TIER_LIMITS } from '../lib/features.js';
import { getBillingStatus, openPortal, zegOp } from '../services/billingService.js';
import { readonlyTekst, READONLY_BEWAARD } from '../lib/readonly.js';
import { gaNaarAbonnement } from '../lib/abonnementNav.js';
import { getOpenUpgradeVerzoeken, rondUpgradeVerzoekAf } from '../services/planService.js';
import { vandaagIso } from '../lib/datumTijd.js';
import { bevestig } from '../lib/bevestig.jsx';
import { statusInfo } from '../lib/website.js';

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

// Statussen van de website staan in lib/website.js; alles over de website
// zelf staat op de pagina Website.

const fmtDatum = d => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function StatusPil({ status, opzeggen, stoptOp }) {
  const s = STATUS_LABELS[status] || { label: status || 'Onbekend', kleur: 'var(--dmu)', bg: 'var(--bgs)' };
  return (
    <span style={{ fontSize: '.76rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.kleur }}>
      {s.label}{opzeggen ? (stoptOp ? ` · stopt ${fmtDatum(stoptOp)}` : ' · stopt per einde periode') : ''}
    </span>
  );
}

// Het maximum van het PAKKET. Tijdens het gratis uitproberen geeft de server
// geen maximum (er wordt dan niets begrensd), maar hier hoort te staan waar het
// pakket op uitkomt: Groei is "1 van 2", ook in de proefperiode.
const maxVan = (tier, sleutel, stand) => stand?.max ?? TIER_LIMITS[tier]?.[sleutel] ?? null;

// "Offertes 8 van 10", en zonder maximum alleen het aantal ("Gebruikers 6").
// Met de nadruk op wat vol is.
function LimietRegel({ sleutel, stand, max }) {
  const def = getLimitDef(sleutel);
  const gebruikt = Number(stand?.gebruikt || 0);
  const vol = max != null && gebruikt >= max;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
      <span style={{ color: 'var(--dmu)' }}>{def?.label || sleutel}</span>
      <span style={{ fontWeight: 600, color: vol ? '#b45309' : 'var(--dk)' }}>
        {gebruikt}{max == null ? '' : ` van ${max}`}
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
  // Verzoeken van teamleden ("Laat mijn beheerder weten"). Alleen de
  // abonnementsbeheerder krijgt ze te zien; die kan ze ook afhandelen.
  const [verzoeken, setVerzoeken] = useState([]);

  const isAdmin = profile?.role === 'admin';

  const laad = () => {
    setLaden(true);
    getBillingStatus()
      .then(setStand)
      .catch(e => toast.error(e.message || 'Abonnement laden mislukt'))
      .finally(() => setLaden(false));
  };
  useEffect(laad, []);
  useEffect(() => {
    if (!stand?.magBeheren) return;
    getOpenUpgradeVerzoeken().then(setVerzoeken).catch(() => {});
  }, [stand?.magBeheren]);

  const verzoekAfhandelen = async (id) => {
    try {
      await rondUpgradeVerzoekAf(id);
      setVerzoeken(v => v.filter(x => x.id !== id));
    } catch (e) {
      toast.error(e.message || 'Afhandelen mislukt');
    }
  };

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
      // Opzeggen stopt alleen de verlenging. Toegang blijft tot het einde van de
      // betaalde periode; daarna blokkeert bb_readonly_reden nieuw werk en
      // versturen (zie docs/uitrol-accountverwijdering.md voor wat precies).
      // Accounts worden hier niet gedeactiveerd: dat is "Bedrijf sluiten".
      if (!(await bevestig({
        titel: `Abonnement opzeggen ${wanneer}?`,
        tekst: 'Jij en je team kunnen tot die datum gewoon doorwerken. Daarna staat je account op '
          + 'alleen-lezen: je kunt alles bekijken en exporteren, maar niets meer toevoegen, wijzigen, '
          + 'verwijderen of versturen. Je gegevens blijven staan en worden niet verwijderd.',
        knop: 'Opzeggen',
      }))) return;
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
            {(() => {
              // Wat er apart wordt gefactureerd: in Stripe (extraGebruikers), en
              // tijdens de proef of zonder Stripe wat het aantal gebruikers kost.
              // Bij Team telt de eerste gebruiker mee: één gebruiker = € 69.
              const gebruikt = Number(stand.limieten?.gebruikers?.gebruikt ?? stand.gebruikers ?? 1) || 1
              const apart = Math.max(stand.extraGebruikers || 0, betaaldeGebruikers(stand.tier, gebruikt))
              return <>
                € {tierPrice(stand.tier) + apart * EXTRA_USER_PRICE} p/mnd excl. btw
                {apart > 0 && ` (${tierLabel(stand.tier)} € ${tierPrice(stand.tier)} + ${apart} × € ${EXTRA_USER_PRICE})`}
              </>
            })()}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
          {stand.trial && (
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Gratis uitproberen t/m</div>
              <div style={{ fontWeight: 600 }}>{fmtDatum(stand.trialEindigtOp)}</div>
            </div>
          )}
          {/* Een verlengdatum in het verleden (bedrijf zonder Stripe) is geen
              informatie maar verwarring; dan niet tonen. */}
          {stand.verlengtOp && !stand.definitiefOpgezegd && String(stand.verlengtOp).slice(0, 10) >= vandaagIso() && (
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {stand.opzeggenPerEindePeriode ? 'Stopt op' : 'Verlengt op'}
              </div>
              <div style={{ fontWeight: 600 }}>{fmtDatum(stand.verlengtOp)}</div>
            </div>
          )}
        </div>

        {/* Gebruikers staan er altijd. De andere limieten (offertes, klanten,
            …) alleen als het pakket ze heeft, en alleen dan het kopje. */}
        {(() => {
          const begrensd = Object.entries(stand.limieten)
            .filter(([k, v]) => k !== 'gebruikers' && maxVan(stand.tier, k, v) != null);
          return (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
              {begrensd.length > 0 && (
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 4 }}>IN GEBRUIK</div>
              )}
              <LimietRegel sleutel="gebruikers" stand={stand.limieten.gebruikers}
                max={maxVan(stand.tier, 'gebruikers', stand.limieten.gebruikers)} />
              {begrensd.map(([k, v]) => <LimietRegel key={k} sleutel={k} stand={v} max={maxVan(stand.tier, k, v)} />)}
              {(() => {
                const max = maxVan(stand.tier, 'gebruikers', stand.limieten.gebruikers);
                const gebruikt = Number(stand.limieten.gebruikers?.gebruikt || 0);
                return max != null && gebruikt > max ? (
                  <p style={{ fontSize: '.8rem', color: '#b45309', margin: '6px 0 0' }}>
                    Je hebt meer gebruikers ({gebruikt}) dan je pakket toestaat ({max}). Kies een groter pakket of deactiveer gebruikers onder Team.
                  </p>
                ) : null;
              })()}
            </div>
          );
        })()}

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
                Status: <strong>{statusInfo(stand.websiteAanvraag.status).label}</strong> · meer onder Website in het menu
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
                : `Opzegbaar per ${fmtDatum(stand.verplichtingTot)}`}
            </div>
          </div>
        )}

        {stand.magBeheren && verzoeken.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--dmu)', marginBottom: 6 }}>VERZOEKEN VAN JE TEAM</div>
            {verzoeken.map(v => (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, padding: '3px 0' }}>
                <span>
                  <strong>{v.naam}</strong>
                  {v.aanleiding ? `: ${v.aanleiding}` : ' wil het abonnement uitbreiden'}
                  {(() => {
                    // Wat er gevraagd wordt: de module(s), of een ander pakket.
                    // Het huidige pakket noemen we niet; dat is geen wens.
                    const wens = v.gewensteModules.length > 0
                      ? v.gewensteModules.map(moduleLabel).join(', ')
                      : (v.gewenstPlan && v.gewenstPlan !== stand.tier ? tierLabel(v.gewenstPlan) : null);
                    return wens ? ` (voorstel: ${wens})` : '';
                  })()}
                  <span style={{ color: 'var(--dmu)' }}> · {fmtDatum(v.createdAt)}</span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => verzoekAfhandelen(v.id)}>
                  Afgehandeld
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Wijzigen staat vooraan en is de primaire knop. Voorheen was dat
            "Abonnement beheren" (het Stripe-portal), en dat trok precies de
            mensen aan die een groter pakket zochten — terwijl het portal daar
            niet over gaat. Alle abonnementswijzigingen lopen via ons eigen
            scherm, met onze regels erop: de downgradegrendel boven de limiet,
            de jaarlooptijd en de looptijdreset bij een upgrade. */}
        {/* Alleen de eigenaar beheert het abonnement; de server (billing-*)
            weigert anderen al vóór er iets naar Stripe gaat. */}
        {!stand.magBeheren && (
          <p style={{ fontSize: '.84rem', color: 'var(--dmu)', margin: 0 }}>
            Alleen de eigenaar van het bedrijf kan het abonnement wijzigen of opzeggen.
          </p>
        )}
        {stand.magBeheren && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        </div>}

        {/* Definitief opgezegd in Stripe: niets meer in te trekken. De knop
            hierboven is dan "Abonnement afsluiten", voor een nieuw abonnement. */}
        {stand.definitiefOpgezegd && (
          <p style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 10, marginBottom: 0 }}>
            Je abonnement is opgezegd. Je kunt een nieuw abonnement afsluiten; je gegevens staan er nog.
          </p>
        )}
        {!stand.heeftStripe && !stand.definitiefOpgezegd && (
          <p style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 10, marginBottom: 0 }}>
            {stand.trial
              ? 'Je bent BossBase nu gratis aan het uitproberen. Er is nog geen betaalmethode gekoppeld.'
              : 'Er is geen betaalmethode gekoppeld.'}
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
