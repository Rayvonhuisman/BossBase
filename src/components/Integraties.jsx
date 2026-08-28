// Integratieoverzicht + detaildrawer.
//
// OPZET — overgenomen van de klantkaart/leverancierskaart (CustomerPage in
// BbPages1.jsx, LeverancierPage.jsx): sticky sluitknop rechtsboven, header met
// beeldmerk + naam + badge, daaronder de kk-tabs-balk en per tab de inhoud.
//
// Wel de drawer als montage en niet de split-view. `.cust-split` wordt op
// routeniveau toegepast (App.jsx) en verbergt onder 900px de lijst; de
// instellingenpagina heeft zelf al een tabbalk, dus dat zou op tablet drie
// niveaus navigatie naast elkaar geven. De drawer wordt al gebruikt voor klant,
// deal, project en agenda-item — zelfde beeldtaal, en 680px/95vw regelt tablet.
//
// UNIVERSEEL — alles hier is generiek. Wat een integratie eigen maakt staat in
// één beschrijvend object (zie INTEGRATIE-VORM hieronder) dat de aanroeper
// samenstelt uit zijn eigen state en handlers. Een nieuwe integratie is dus een
// item in die lijst, geen nieuwe indeling.
//
// INTEGRATIE-VORM:
//   id            uniek, ook de React-key
//   naam          voor alt-tekst, koppen en aria
//   omschrijving  één zin: wat doet deze koppeling
//   logo          { src, alt } woordmerk | { img, alt } extern logo | { node }
//   verborgen     true = nog niet voor klanten (staat wél in de code)
//   status        { actief, label }
//   gate          null | { pill, tekst, knop, onClick } — pakket ontbreekt
//   koppeling     { inleiding?, velden[], acties[], fout? }
//   instellingen  null | { toggles[], acties[], inhoud }  (inhoud = vrije node)
//   sync          null | { acties[], laatsteSync, toelichting?, status? }
//   meldingen     [] | [{ toon:'fout'|'waarschuwing', titel, tekst?, items[] }]
//
// Een actie: { label, onClick, variant:'p'|'s'|'ghost'|'danger', disabled, icon }
// Een veld:  { key, label, hint?, type:'text'|'password', value, onChange,
//              placeholder, disabled, name? }

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, SlidersHorizontal, RefreshCw, AlertTriangle } from 'lucide-react';
import { I } from '../bb-shared.jsx';

// ── Beeldmerken ─────────────────────────────────────────────────────────────
// De merken hebben sterk verschillende verhoudingen (Stripe ~2,4:1, Moneybird en
// SnelStart ~6:1), dus schalen we op vaste hoogte met vrije breedte: zo ogen ze
// even groot zonder uit te rekken. objectFit vangt de maxWidth-clamp op smalle
// schermen op. De woordmerken tonen de naam al; de alt-tekst levert daarom de
// toegankelijke naam en er staat geen titel onder.
export const INTEG_LOGO_STYLE = {
  height: 22,
  width: 'auto',
  maxWidth: '100%',
  objectFit: 'contain',
  objectPosition: 'left center',
  display: 'block',
  marginBottom: 8,
};

// ── Statuspill ──────────────────────────────────────────────────────────────
// Eén vorm voor alle koppelingen: actief is een groene pill met stip, al het
// overige een neutrale pill.
const INTEG_PILL_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '.72rem',
  fontWeight: 600,
  borderRadius: 999,
  padding: '3px 10px',
  whiteSpace: 'nowrap',
};

export function IntegStatusPill({ actief = false, children }) {
  const tone = actief
    ? { color: 'var(--pd)', background: 'var(--pll)', border: '1px solid var(--pl)' }
    : { color: 'var(--dmu)', background: 'var(--bgs)', border: '1px solid var(--border)' };
  return (
    <span style={{ ...INTEG_PILL_BASE, ...tone }}>
      {actief && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--pd)' }} />}
      {children}
    </span>
  );
}

// ── Bouwstenen ──────────────────────────────────────────────────────────────

function Beeldmerk({ logo, naam, groot = false }) {
  const stijl = groot ? { ...INTEG_LOGO_STYLE, height: 26, marginBottom: 0 } : INTEG_LOGO_STYLE;
  if (logo?.src) return <img src={logo.src} alt={logo.alt || naam} style={stijl} />;
  if (logo?.img) {
    // Extern logo (clearbit): valt weg als het niet laadt, de naam ernaast blijft.
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: groot ? 0 : 8 }}>
        <img
          src={logo.img}
          alt=""
          style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6 }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
        <span style={{ fontWeight: 700, fontSize: '.95rem' }}>{naam}</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: groot ? 0 : 8 }}>
      <div style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bgs)', borderRadius: 'var(--r8)', border: '1px solid var(--border)', flexShrink: 0,
      }}>
        {logo?.node}
      </div>
      <span style={{ fontWeight: 700, fontSize: '.95rem' }}>{naam}</span>
    </div>
  );
}

// Eén invoerveld. Wachtwoordvelden krijgen de Toon/Verberg-knop en de hints die
// Chrome ervan weerhouden hier het wachtwoord van de gebruiker in te vullen —
// dit zijn API-tokens, geen wachtwoorden.
function VeldRij({ veld }) {
  const [zichtbaar, setZichtbaar] = useState(false);
  const isGeheim = veld.type === 'password';
  const opSlot = !!veld.disabled;
  const toonKnop = isGeheim && !opSlot;

  return (
    <div className="f s2">
      <label>
        {veld.label}
        {veld.hint && (
          <span style={{ fontSize: '.73rem', color: 'var(--dl)', fontWeight: 400, marginLeft: 6 }}>
            {veld.hint}
          </span>
        )}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={isGeheim && !zichtbaar ? 'password' : 'text'}
          name={veld.name}
          // 'new-password' en niet 'off': Chrome negeert 'off' op een wachtwoordveld
          // en vulde er het opgeslagen wachtwoord van de gebruiker in. Dat is hier
          // een API-token dat vervolgens ook nog opgeslagen zou worden.
          autoComplete={isGeheim ? 'new-password' : undefined}
          data-1p-ignore={isGeheim ? '' : undefined}
          data-lpignore={isGeheim ? 'true' : undefined}
          value={veld.value}
          onChange={e => veld.onChange(e.target.value)}
          placeholder={veld.placeholder}
          disabled={opSlot}
          // width:100% omdat het veld in een relatieve wikkel zit voor de
          // Toon/Verberg-knop. Een input is inline-block en rekte daardoor niet
          // mee: de tokenvelden stonden op ~170px met de knop los rechts ervan.
          style={{ width: '100%', paddingRight: toonKnop ? 40 : 0, opacity: opSlot ? 0.6 : 1 }}
        />
        {toonKnop && (
          <button
            type="button"
            onClick={() => setZichtbaar(v => !v)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dmu)',
              fontSize: '.8rem', padding: 0,
            }}
          >
            {zichtbaar ? 'Verberg' : 'Toon'}
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleRij({ toggle }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', color: 'var(--dm)', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={!!toggle.checked}
        onChange={e => toggle.onChange(e.target.checked)}
        disabled={!!toggle.disabled}
        style={{ width: 'auto' }}
      />
      {toggle.label}
    </label>
  );
}

const MELDING_TOON = {
  fout: { border: '1px solid #fca5a5', background: 'rgba(220,38,38,.07)' },
  waarschuwing: { border: '1px solid var(--warn-bd, #e0b050)', background: 'var(--warn-bg, rgba(224,176,80,.10))' },
};

function MeldingBlok({ melding }) {
  const toon = MELDING_TOON[melding.toon] || MELDING_TOON.waarschuwing;
  return (
    <div style={{ ...toon, borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', color: 'var(--dm)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{melding.titel}</div>
      {melding.tekst && <div style={{ marginBottom: melding.items?.length ? 6 : 0 }}>{melding.tekst}</div>}
      {!!melding.items?.length && (
        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 170, overflowY: 'auto' }}>
          {melding.items.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}

function ActieRij({ acties = [], links = null }) {
  const zichtbaar = acties.filter(a => a && !a.verborgen);
  if (!zichtbaar.length && !links) return null;
  return (
    <div className="fa" style={{ flexWrap: 'wrap', gap: 8 }}>
      {links}
      {zichtbaar.map((a, i) => (
        <button
          key={i}
          className={`btn btn-${a.variant || 'ghost'} btn-sm`}
          onClick={a.onClick}
          disabled={!!a.disabled}
          title={a.title}
        >
          {a.icon}{a.icon ? ' ' : ''}{a.label}
        </button>
      ))}
    </div>
  );
}

const fmtSync = iso => new Date(iso).toLocaleString('nl-NL', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function LaatsteSync({ iso }) {
  if (!iso) return null;
  return (
    <span style={{ fontSize: '.75rem', color: 'var(--dl)', alignSelf: 'center', marginRight: 'auto' }}>
      Laatste sync: {fmtSync(iso)}
    </span>
  );
}

// ── Overzichtskaart ─────────────────────────────────────────────────────────

export function IntegratieKaart({ integratie, onOpen }) {
  const { naam, omschrijving, logo, status, gate } = integratie;
  return (
    <button
      type="button"
      className="card card-p integ-card"
      onClick={onOpen}
      aria-label={`${naam} instellen`}
      style={{
        border: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 10, width: '100%',
      }}
    >
      <div className="integ-card-hd" style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Beeldmerk logo={logo} naam={naam} />
          <div style={{ fontSize: '.82rem', color: 'var(--dmu)' }}>{omschrijving}</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {gate
            ? <IntegStatusPill>{gate.pill}</IntegStatusPill>
            : <IntegStatusPill actief={!!status?.actief}>{status?.label}</IntegStatusPill>}
        </div>
      </div>
    </button>
  );
}

// ── Detaildrawer ────────────────────────────────────────────────────────────

function tabsVoor(integratie) {
  const t = [{ id: 'koppeling', label: 'Koppeling', icon: <Link2 size={13} /> }];
  if (integratie.instellingen) t.push({ id: 'instellingen', label: 'Instellingen', icon: <SlidersHorizontal size={13} /> });
  if (integratie.sync) t.push({ id: 'sync', label: 'Synchroniseren', icon: <RefreshCw size={13} /> });
  if (integratie.meldingen?.length) t.push({ id: 'meldingen', label: 'Meldingen', icon: <AlertTriangle size={13} /> });
  return t;
}

// Aantal en zwaarte van de meldingen. Die telling hoort op de tab zelf: de
// blokken stonden eerder open op de pagina en vielen daardoor op. Achter een tab
// zonder teller zou je een mislukte boeking domweg missen.
function meldingTelling(meldingen = []) {
  let aantal = 0;
  let fout = false;
  for (const m of meldingen) {
    aantal += m.items?.length || 1;
    if (m.toon === 'fout') fout = true;
  }
  return { aantal, fout };
}

function IntegratieDrawer({ integratie, onClose }) {
  const tabs = tabsVoor(integratie);
  const [tab, setTab] = useState(tabs[0].id);
  const { aantal: meldingAantal, fout: meldingFout } = meldingTelling(integratie.meldingen);

  // Verdwijnt de actieve tab (laatste melding weg, koppeling verbroken), val dan
  // terug op de eerste. Anders staar je naar een leeg paneel.
  useEffect(() => {
    if (!tabs.some(t => t.id === tab)) setTab(tabs[0].id);
  }, [tabs, tab]);

  // Escape sluit, zoals bij de andere drawers.
  useEffect(() => {
    const opToets = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  }, [onClose]);

  const { naam, omschrijving, logo, status, gate, koppeling, instellingen, sync, meldingen } = integratie;

  // Via een portal naar body: de overzichtsgrid draagt de afu3-entree-animatie,
  // en die houdt met fill-mode 'both' een transform vast. Een transform maakt een
  // containing block, waardoor `position: fixed` van de drawer zich naar dat
  // element voegt in plaats van naar het scherm — de drawer klapte dan samen tot
  // de hoogte van de kaartenrij.
  return createPortal(
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label={`${naam} instellingen`}>
        <div className="drawer-body">
          {/* Sticky sluitknop — zelfde plek als op de klant- en leverancierskaart */}
          <button
            className="drawer-x"
            onClick={onClose}
            title="Sluiten"
            style={{ position: 'sticky', top: 16, float: 'right', zIndex: 20, marginBottom: -36, marginLeft: 8 }}
          >
            {I.x}
          </button>

          {/* Header */}
          <div style={{ marginBottom: 20, paddingRight: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <Beeldmerk logo={logo} naam={naam} groot />
              {gate
                ? <IntegStatusPill>{gate.pill}</IntegStatusPill>
                : <IntegStatusPill actief={!!status?.actief}>{status?.label}</IntegStatusPill>}
            </div>
            <div style={{ fontSize: '.84rem', color: 'var(--dmu)' }}>{omschrijving}</div>
          </div>

          {/* Tabs — weg zodra er maar één is; een balk van één knop zegt niets */}
          {tabs.length > 1 && (
            <div>
              <div className="tabs kk-tabs" style={{ marginBottom: 16 }}>
                {tabs.map(t => (
                  <button
                    key={t.id}
                    className={`tab${tab === t.id ? ' active' : ''}`}
                    onClick={() => setTab(t.id)}
                    aria-label={t.label}
                    title={t.label}
                  >
                    {t.icon}
                    <span style={{ marginLeft: 5 }}>{t.label}</span>
                    {t.id === 'meldingen' && meldingAantal > 0 && (
                      <span style={{
                        marginLeft: 5,
                        minWidth: 17,
                        padding: '0 5px',
                        borderRadius: 999,
                        fontSize: '.68rem',
                        fontWeight: 700,
                        lineHeight: '17px',
                        color: '#fff',
                        background: meldingFout ? '#dc2626' : '#b4820f',
                      }}>
                        {meldingAantal}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Koppeling ── */}
          {tab === 'koppeling' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {gate ? (
                <>
                  <div style={{ fontSize: '.84rem', color: 'var(--dmu)' }}>{gate.tekst}</div>
                  <ActieRij acties={[{ label: gate.knop, onClick: gate.onClick, variant: 's' }]} />
                </>
              ) : (
                <>
                  {koppeling?.inleiding && (
                    <div style={{ fontSize: '.84rem', color: 'var(--dm)' }}>{koppeling.inleiding}</div>
                  )}
                  {!!koppeling?.velden?.length && (
                    <div className="fg">
                      {koppeling.velden.map(v => <VeldRij key={v.key} veld={v} />)}
                    </div>
                  )}
                  {koppeling?.fout && (
                    <div style={{
                      padding: '9px 12px', borderRadius: 'var(--r8)', background: '#fef2f2',
                      border: '1px solid #fecaca', color: '#b91c1c', fontSize: '.8rem', lineHeight: 1.5,
                    }}>
                      {koppeling.fout}
                    </div>
                  )}
                  <ActieRij acties={koppeling?.acties} />
                </>
              )}
            </div>
          )}

          {/* ── Instellingen ── */}
          {tab === 'instellingen' && instellingen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!!instellingen.toggles?.length && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {instellingen.toggles.map((t, i) => <ToggleRij key={i} toggle={t} />)}
                </div>
              )}
              {instellingen.inhoud}
              <ActieRij acties={instellingen.acties} />
            </div>
          )}

          {/* ── Synchroniseren ── */}
          {tab === 'sync' && sync && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {sync.status}
              <ActieRij acties={sync.acties} links={<LaatsteSync iso={sync.laatsteSync} />} />
              {sync.toelichting && (
                <div style={{
                  background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r8)',
                  padding: '12px 14px', fontSize: '.8rem', color: 'var(--dm)', lineHeight: 1.55,
                }}>
                  {sync.toelichting}
                </div>
              )}
            </div>
          )}

          {/* ── Meldingen ── */}
          {tab === 'meldingen' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {meldingen.map((m, i) => <MeldingBlok key={i} melding={m} />)}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Overzicht ───────────────────────────────────────────────────────────────

export default function IntegratiesOverzicht({ integraties }) {
  const [open, setOpen] = useState(null);
  const zichtbaar = integraties.filter(i => i && !i.verborgen);
  const actief = zichtbaar.find(i => i.id === open) || null;

  return (
    <div className="afu3">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
        gap: 14,
      }}>
        {zichtbaar.map(i => (
          <IntegratieKaart key={i.id} integratie={i} onOpen={() => setOpen(i.id)} />
        ))}
      </div>

      {actief && <IntegratieDrawer integratie={actief} onClose={() => setOpen(null)} />}
    </div>
  );
}
