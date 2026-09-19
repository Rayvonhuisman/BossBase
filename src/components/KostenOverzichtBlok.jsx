import { fmt0 } from '../bb-shared.jsx';

// Het kostenoverzicht zoals het op het project én op de klantkaart staat.
// Eén component, zodat beide dezelfde regels in dezelfde volgorde tonen en er
// geen twee versies van hetzelfde verhaal ontstaan. Het rekenwerk zit in
// kostenOverzichtService (bouwKostenOverzicht); hier gebeurt niets meer.
//
// De urenregel draagt bewust geen bedrag: er is geen kostprijs per uur in de
// database. Hij staat er wel, want anders lijkt een klus zonder materiaal
// gratis — maar hij telt niet mee in het totaal, en dat staat er ook bij.

const fmtUren = u => `${Number(u || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur`;

const rijStijl = {
  display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0',
  borderBottom: '1px solid var(--border)',
};
const labelKolom = { flex: 1, minWidth: 0 };
const bedragKolom = { fontWeight: 700, whiteSpace: 'nowrap', fontSize: 14 };
const subStijl = { fontSize: 11, color: 'var(--dl)', marginTop: 2, lineHeight: 1.4 };

function Regel({ label, sub, bedrag, aantal, geenBedrag }) {
  return (
    <div style={rijStijl}>
      <div style={labelKolom}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {label}
          {aantal != null && <span style={{ fontWeight: 400, color: 'var(--dl)' }}> ({aantal})</span>}
        </div>
        {sub && <div style={subStijl}>{sub}</div>}
      </div>
      <div style={{ ...bedragKolom, color: geenBedrag ? 'var(--dl)' : 'var(--dk)', fontWeight: geenBedrag ? 400 : 700, fontSize: geenBedrag ? 12.5 : 14 }}>
        {geenBedrag ? 'geen bedrag' : fmt0(bedrag)}
      </div>
    </div>
  );
}

/**
 * @param {object}  overzicht   uit bouwKostenOverzicht()
 * @param {boolean} magInkoop   recht 'inkoopprijzen' — zonder dat komt het
 *                              materiaal niet eens uit de database en zou een
 *                              totaal met "materiaal €0" erin gewoon onwaar zijn
 * @param {string}  bron        'project' of 'klant' — alleen voor de subteksten
 */
export default function KostenOverzichtBlok({ overzicht, magInkoop, bron = 'project' }) {
  const { materiaal, inkopen, uren, boekingen, totaal } = overzicht;
  const waar = bron === 'klant' ? 'van alle werkbonnen van deze klant' : 'van de werkbonnen van dit project';
  const waarInkopen = bron === 'klant' ? 'op de projecten van deze klant' : 'op dit project';

  return (
    <div className="card card-p" style={{ padding: '4px 14px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)', padding: '12px 0 2px' }}>
        Wat dit gekost heeft
      </div>

      {magInkoop && (
        <Regel
          label="Materiaal"
          sub={`Op de werkbonnen geboekt materiaal ${waar}, op inkoopprijs (excl. btw)`}
          aantal={materiaal.regels.length}
          bedrag={materiaal.bedrag}
        />
      )}

      <Regel
        label="Inkopen"
        sub={`Huur, diensten en inkopen ${waarInkopen} die niet op een werkbon staan`}
        aantal={inkopen.regels.length}
        bedrag={inkopen.bedrag}
      />

      <Regel
        label="Uren"
        sub={`Gewerkte uren ${waar}. Er is geen kostprijs per uur, dus deze uren tellen niet mee in het totaal.`}
        aantal={fmtUren(uren.uren)}
        geenBedrag
      />

      <div style={{ ...rijStijl, borderBottom: 'none', borderTop: '2px solid var(--dk)', marginTop: 2, paddingTop: 11 }}>
        <div style={labelKolom}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Totaal kosten</div>
          <div style={subStijl}>
            {magInkoop ? 'Materiaal + inkopen' : 'Inkopen'}, exclusief arbeid
          </div>
        </div>
        <div style={{ ...bedragKolom, fontSize: 16, fontWeight: 800 }}>{fmt0(totaal)}</div>
      </div>

      {!magInkoop && (
        <div style={{ fontSize: 11.5, color: 'var(--dm)', marginTop: 10, lineHeight: 1.5 }}>
          Het materiaal van de werkbonnen telt ook mee, maar staat op inkoopprijs en die is voor jou
          afgeschermd. Dit totaal is daarom alleen de inkopen.
        </div>
      )}

      {/* Niet stil weglaten: wie deze boekingen eerder zag meetellen moet kunnen
          zien waar ze gebleven zijn, en waarom ze er niet bij horen. */}
      {boekingen.regels.length > 0 && (
        <div style={{
          fontSize: 11.5, color: 'var(--dm)', lineHeight: 1.5, marginTop: 12,
          background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px',
        }}>
          <b>Niet meegeteld:</b> {boekingen.regels.length === 1 ? '1 boeking' : `${boekingen.regels.length} boekingen`} op de
          Kosten-pagina ({fmt0(boekingen.bedrag)}). Dat is de boekhouding — de inkoopfactuur van je leverancier.
          Het materiaal daarvan telt hierboven al via de werkbon mee; allebei tellen zou dezelfde inkoop dubbel
          zetten. Hoort een kost bij deze klus en staat hij nergens op een werkbon, zet hem dan bij de inkopen.
        </div>
      )}
    </div>
  );
}

/**
 * De tegels boven het overzicht. Ze rekenen met exact hetzelfde `overzicht`
 * als de regels eronder — dat is de hele reden dat ze hier staan en niet per
 * pagina apart worden uitgerekend.
 */
export function KostenTegels({ overzicht, omzetExclBtw, magBedragen, magInkoop, extra = [] }) {
  const toonWinst = magBedragen && magInkoop;
  const brutowinst = Number(omzetExclBtw || 0) - overzicht.totaal;

  const tegels = [
    ...extra,
    ...(magBedragen ? [{ label: 'Gefactureerd (excl. btw)', val: fmt0(omzetExclBtw || 0) }] : []),
    {
      label: 'Totaal kosten',
      val: fmt0(overzicht.totaal),
      sub: magInkoop
        ? `materiaal ${fmt0(overzicht.materiaal.bedrag)} · inkopen ${fmt0(overzicht.inkopen.bedrag)}`
        : `inkopen ${fmt0(overzicht.inkopen.bedrag)}`,
    },
    ...(toonWinst ? [{
      label: 'Brutowinst vóór arbeid',
      val: fmt0(brutowinst),
      groen: brutowinst >= 0,
      rood: brutowinst < 0,
      sub: 'Arbeid zit er niet in — dit is geen nettowinst',
    }] : []),
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 10 }}>
      {tegels.map((t, i) => (
        <div key={i} style={{ background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r10)', padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{t.label}</div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: t.groen ? '#15A34A' : t.rood ? '#dc2626' : 'var(--dk)' }}>{t.val}</div>
          {t.sub && <div style={{ fontSize: 10.5, color: 'var(--dl)', marginTop: 3, lineHeight: 1.35 }}>{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
