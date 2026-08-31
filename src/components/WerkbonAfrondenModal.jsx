// Afronden van een werkbon, met de handtekening van de klant.
//
// Dit is het moment waarop de monteur klaar is en z'n telefoon omdraait. Het
// scherm moet daarom in één blik kloppen: wat is er gedaan, hoeveel uur, welk
// materiaal — en dan tekenen. Geen bedragen, want de klant kijkt mee.
//
// Drie uitkomsten, in volgorde van wenselijkheid:
//   1. Klant tekent hier → werkbon afgerond én ondertekend, staat op slot.
//   2. Klant is weg → link per mail; de bon blijft open tot hij tekent.
//   3. Geen handtekening nodig → gewoon afronden, zoals het altijd ging.
//
// Zichtbaarheid van de handtekening op de PDF loopt via het sign_token en de
// edge function; deze modal maakt de PDF wel, maar leest niets af wat hij niet
// al op het scherm heeft staan.

import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalX } from '../bb-shared.jsx';
import HandtekeningCanvas from './HandtekeningCanvas.jsx';
import {
  signWerkbon, verstuurWerkbonTerOndertekening, bouwPdfData, bouwPdfWerkbon,
} from '../services/werkbonOndertekenenService.js';
import { getWerkbonPdfBase64, getWerkbonPdfUrl } from '../utils/generateWerkbonPdf.js';

const uurFmt = n => `${Number(n || 0).toFixed(2).replace('.', ',')} u`;

export default function WerkbonAfrondenModal({
  werkbon, detail, customer, company, uitvoerders = [], onTaakToggle, onClose, onKlaar,
}) {
  // 'overzicht' → 'tekenen' | 'mailen'
  const [stap, setStapRuw] = useState('overzicht');
  const [naam, setNaam] = useState(customer?.name || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [heeftHandtekening, setHeeftHandtekening] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [pdfBezig, setPdfBezig] = useState(false);
  // Welke taak op dit moment wordt omgezet — zodat er niet twee keer op hetzelfde
  // vinkje getikt kan worden terwijl de schrijfactie nog loopt.
  const [taakBezig, setTaakBezig] = useState(null);
  const canvasRef = useRef(null);

  // Bij elke stapwissel de oude foutmelding weg: een melding over het tekenen
  // die blijft staan boven het mailformulier leest als een fout in het mailen.
  const setStap = volgende => { setFout(''); setStapRuw(volgende); };

  const { taken = [], uren = [], materialen = [], notities = [], fotos = [] } = detail || {};
  const totaalUren = useMemo(() => uren.reduce((s, u) => s + Number(u.uren || 0), 0), [uren]);
  const openTaken = taken.filter(t => !t.afgerond);
  const klantNotities = notities.filter(n => n.voorKlant);

  const pdfArgs = (extra = {}) => ([
    bouwPdfWerkbon(werkbon, { uitvoerders, ...extra }),
    bouwPdfData({ taken, uren, materialen, notities, fotos }),
    customer,
    company,
  ]);

  const bekijkPdf = async () => {
    setPdfBezig(true);
    setFout('');
    try {
      window.open(await getWerkbonPdfUrl(...pdfArgs()), '_blank');
    } catch (e) {
      setFout(`PDF maken mislukt: ${e.message}`);
    } finally {
      setPdfBezig(false);
    }
  };

  const onderteken = async () => {
    setFout('');
    if (!naam.trim()) { setFout('Vul de naam van de ondertekenaar in.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFout('Vul een geldig e-mailadres in — daar gaat de bevestiging heen.'); return; }
    const dataUrl = canvasRef.current?.dataUrl();
    if (!dataUrl) { setFout('Laat de klant eerst tekenen.'); return; }

    setBezig(true);
    try {
      // PDF mét handtekening, hier in de browser. Mislukt dat, dan gaat het
      // tekenen door: de handtekening in de database is het bewijsstuk.
      let pdfBase64 = null;
      try {
        pdfBase64 = await getWerkbonPdfBase64(...pdfArgs({
          ondertekendOp: new Date().toISOString(),
          ondertekendDoorNaam: naam.trim(),
          ondertekendDoorEmail: email.trim(),
          handtekeningDataUrl: dataUrl,
        }));
      } catch (e) {
        console.warn('[werkbon] PDF met handtekening mislukt:', e.message);
      }

      const res = await signWerkbon({
        signToken: werkbon.signToken,
        name: naam.trim(),
        email: email.trim(),
        signatureDataUrl: dataUrl,
        signedPdfBase64: pdfBase64,
      });
      onKlaar?.({ ondertekend: true, resultaat: res });
    } catch (e) {
      setFout(e.message || 'Ondertekenen mislukt');
    } finally {
      setBezig(false);
    }
  };

  const mailen = async () => {
    setFout('');
    setBezig(true);
    try {
      const res = await verstuurWerkbonTerOndertekening({
        werkbon, email, customer, company,
        detail: { taken, uren, materialen, notities, fotos },
      });
      onKlaar?.({ gemaild: true, email: res.email });
    } catch (e) {
      setFout(e.message || 'Versturen mislukt');
    } finally {
      setBezig(false);
    }
  };

  const zonderHandtekening = async () => {
    setFout('');
    setBezig(true);
    try {
      await onKlaar?.({ zonderHandtekening: true });
    } catch (e) {
      setFout(e.message || 'Afronden mislukt');
    } finally {
      setBezig(false);
    }
  };

  // Geportaleerd naar body: een voorouder met een animatie houdt een transform
  // vast en wordt dan het referentiekader voor position:fixed — dan zakt de
  // modal in tot de hoogte van de kaart eronder. Zelfde reden als bij de
  // integratie-drawer.
  return createPortal(
    <div className="overlay" onClick={e => e.target === e.currentTarget && !bezig && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">
              {stap === 'mailen' ? 'Werkbon ter ondertekening sturen' : 'Klus afronden'}
            </div>
            <div className="modal-sub">
              {werkbon.nummer ? `${werkbon.nummer} · ` : ''}{werkbon.titel}
            </div>
          </div>
          <ModalX onClose={() => !bezig && onClose()} />
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Samenvatting — wat de klant straks op de bon ziet */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
            <Cijfer label="Taken" waarde={`${taken.filter(t => t.afgerond).length}/${taken.length}`} />
            <Cijfer label="Uren" waarde={uurFmt(totaalUren)} />
            <Cijfer label="Materiaal" waarde={`${materialen.length}`} />
            <Cijfer label="Foto's" waarde={`${fotos.length}`} />
          </div>

          {/* Openstaande taken — met een vinkje, geen bevestigingsvraag.
              Een niet-afgevinkte taak is vaker vergeten dan echt niet gedaan, en
              dan verdwijnt uitgevoerd werk van de bon waar de klant voor tekent.
              Hier aantikken kost één tik; achteraf kan het niet meer. */}
          {openTaken.length > 0 && (
            <div style={{
              background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 8,
              padding: '10px 12px',
            }}>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#9A3412', marginBottom: 8 }}>
                {openTaken.length === 1 ? 'Eén taak staat nog open' : `${openTaken.length} taken staan nog open`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                {openTaken.map(t => (
                  <label
                    key={t.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9,
                      fontSize: '.85rem', color: '#7C2D12', lineHeight: 1.45,
                      padding: '5px 4px', borderRadius: 6,
                      cursor: onTaakToggle && !bezig ? 'pointer' : 'default',
                      opacity: taakBezig === t.id ? .5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={!onTaakToggle || bezig || taakBezig === t.id}
                      onChange={async () => {
                        setTaakBezig(t.id);
                        try { await onTaakToggle(t); } finally { setTaakBezig(null); }
                      }}
                      style={{ marginTop: 2, flexShrink: 0, accentColor: '#0f9d58', cursor: 'inherit' }}
                    />
                    <span>{t.omschrijving}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: '.76rem', color: '#9A3412', lineHeight: 1.5 }}>
                Deze taken komen niet op de bon die de klant tekent. Vink af wat je wél hebt
                gedaan — na ondertekenen ligt de bon vast en kan dat niet meer.
              </div>
            </div>
          )}

          {uren.length === 0 && (
            <Melding toon="waarschuwing">
              Er zijn nog geen uren op deze werkbon geboekt. Na ondertekenen kan dat niet meer —
              de bon gaat dan op slot.
            </Melding>
          )}

          <Melding toon="info">
            Op de werkbon staan <strong>geen bedragen</strong>: geen prijzen, geen tarieven, geen inkoop.
            {klantNotities.length > 0
              ? ` Wel ${klantNotities.length === 1 ? 'één notitie' : `${klantNotities.length} notities`} die je als "voor de klant" hebt gemarkeerd.`
              : ' Interne notities blijven intern.'}
          </Melding>

          <button type="button" className="btn btn-s" onClick={bekijkPdf} disabled={pdfBezig}>
            {pdfBezig ? 'PDF laden…' : 'Bekijk de bon zoals de klant hem ziet'}
          </button>

          {/* ── Tekenen ───────────────────────────────────────────────────── */}
          {stap === 'tekenen' && (
            <>
              <div className="f">
                <label>Naam ondertekenaar</label>
                <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Naam van de klant" />
              </div>
              <div className="f">
                <label>E-mailadres</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="klant@voorbeeld.nl" />
                <div style={{ fontSize: '.75rem', color: 'var(--dl)', marginTop: 3 }}>
                  Hier gaat de ondertekende werkbon als bevestiging heen.
                </div>
              </div>
              <HandtekeningCanvas ref={canvasRef} onChange={setHeeftHandtekening} disabled={bezig} />
            </>
          )}

          {/* ── Mailen ────────────────────────────────────────────────────── */}
          {stap === 'mailen' && (
            <div className="f">
              <label>E-mailadres klant</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="klant@voorbeeld.nl" autoFocus />
              <div style={{ fontSize: '.75rem', color: 'var(--dl)', marginTop: 3 }}>
                De klant krijgt de werkbon als PDF én een link om te tekenen. De werkbon blijft
                open tot hij getekend heeft.
              </div>
            </div>
          )}

          {fout && (
            <div style={{ color: '#b91c1c', fontSize: '.85rem', fontWeight: 600 }}>{fout}</div>
          )}
        </div>

        {/* ── Knoppen ──────────────────────────────────────────────────────── */}
        <div className="fa" style={{ flexWrap: 'wrap', gap: 8 }}>
          {stap === 'overzicht' && (
            <>
              {/* Kort gehouden: met drie volledige zinnen wikkelt de rij en valt de
                  hoofdknop op een eigen regel. */}
              <button className="btn btn-ghost" onClick={zonderHandtekening} disabled={bezig}
                title="Rond de klus af zonder handtekening van de klant">
                Zonder handtekening
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-s" onClick={() => setStap('mailen')} disabled={bezig}>
                Per mail
              </button>
              <button className="btn btn-p" onClick={() => setStap('tekenen')} disabled={bezig}>
                Klant tekent nu
              </button>
            </>
          )}
          {stap === 'tekenen' && (
            <>
              <button className="btn btn-ghost" onClick={() => setStap('overzicht')} disabled={bezig}>Terug</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-p" onClick={onderteken} disabled={bezig || !heeftHandtekening}>
                {bezig ? 'Bezig…' : 'Ondertekenen en afronden'}
              </button>
            </>
          )}
          {stap === 'mailen' && (
            <>
              <button className="btn btn-ghost" onClick={() => setStap('overzicht')} disabled={bezig}>Terug</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-p" onClick={mailen} disabled={bezig || !email}>
                {bezig ? 'Versturen…' : 'Versturen'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Cijfer({ label, waarde }) {
  return (
    <div style={{ background: '#F6F7FA', borderRadius: 8, padding: '9px 11px' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--dk)' }}>{waarde}</div>
    </div>
  );
}

function Melding({ toon = 'info', children }) {
  const kleuren = toon === 'waarschuwing'
    ? { bg: '#FFF7ED', rand: '#FDBA74', tekst: '#9A3412' }
    : { bg: '#F0F9FF', rand: '#BAE6FD', tekst: '#075985' };
  return (
    <div style={{
      background: kleuren.bg, border: `1px solid ${kleuren.rand}`, borderRadius: 8,
      padding: '9px 12px', fontSize: '.82rem', color: kleuren.tekst, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}
