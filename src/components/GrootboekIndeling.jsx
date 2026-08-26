// Welke grootboekrekening krijgt elke kostencategorie en omzetsoort?
//
// De koppeling kiest standaard zelf, op vaste voorkeursnummers uit het gangbare
// Nederlandse rekeningschema. Dat werkt zolang een administratie dat schema
// volgt. Doet ze dat niet, dan viel de koppeling terug op de grootboekFUNCTIE —
// en een functie wijst geen rekening aan maar een groep van tientallen, waaruit
// dan willekeurig geplukt werd. Zo belandde materiaal ooit op "Reclame- en
// advertentiekosten".
//
// Hier kan de klant het vastleggen. Leeg laten mag: dan geldt de standaard.

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../lib/toast.jsx';
import { KOSTEN_CATEGORIEEN } from '../lib/kostenCategorieen.js';
import { BTW_REGIMES } from '../lib/btwRegime.js';
import {
  getGrootboekrekeningen, getGrootboekVoorkeuren, setGrootboekVoorkeur,
} from '../services/accountingService.js';

// Welke functies mag een rekening dragen om bij deze regel te passen? Dezelfde
// controle als server-side in grootboekKeuze.ts — zo ziet de gebruiker alleen
// rekeningen die de boeking ook echt zal accepteren.
const INKOOP_FUNCTIES = ['InkopenKostenAlleBtwTarieven', 'InkopenKostenHoog', 'InkopenKostenLaag',
  'InkopenKostenOverig', 'InkopenHoog', 'InkopenLaag', 'InkopenOverig'];

const OMZET_FUNCTIE = {
  normaal: 'VerkopenOmzetHoog',
  verlaagd: 'VerkopenOmzetLaag',
  vrijgesteld: 'VerkopenOmzetOnbelastVerlegd',
  verlegd: 'VerkopenOmzetOnbelastVerlegd',
};

// Wat de koppeling kiest als hier niets staat. Alleen ter informatie in de UI;
// de echte lijst staat in grootboekKeuze.ts.
const STANDAARD = {
  'kosten:Materiaal': '7002 / 7001 / 7000 Inkopen',
  'kosten:Inkoopfactuur': '7000 Inkopen alle btw tarieven',
  'kosten:Gereedschap': '4303 Kleine aanschaffingen inventaris',
  'kosten:Reiskosten': '4406 Reis- en verblijfkosten',
  'kosten:Algemene kosten': '4798 Algemene kosten',
  'kosten:Overig': '4798 Algemene kosten',
  'omzet:normaal': '8200 Omzet hoog (diensten)',
  'omzet:verlaagd': '8210 Omzet laag (diensten)',
  'omzet:vrijgesteld': '8240 Omzet nultarief (diensten)',
  'omzet:verlegd': '8250 Omzet verlegd (diensten)',
};

export default function GrootboekIndeling({ verbonden }) {
  const toast = useToast();
  const [rekeningen, setRekeningen] = useState(null);
  const [voorkeuren, setVoorkeuren] = useState({});
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState(null);

  const laad = async () => {
    setLaden(true);
    setFout(null);
    try {
      const [lijst, gekozen] = await Promise.all([getGrootboekrekeningen(), getGrootboekVoorkeuren()]);
      setRekeningen(lijst);
      setVoorkeuren(gekozen);
    } catch (err) {
      setFout(err.message || 'Rekeningen ophalen mislukt');
    } finally {
      setLaden(false);
    }
  };

  useEffect(() => { if (verbonden) laad(); }, [verbonden]); // eslint-disable-line react-hooks/exhaustive-deps

  const rijen = useMemo(() => [
    ...KOSTEN_CATEGORIEEN.map(c => ({
      sleutel: `kosten:${c.value}`,
      label: c.label,
      groep: 'Kosten',
      past: g => INKOOP_FUNCTIES.includes(String(g.functie || '')),
    })),
    ...BTW_REGIMES.map(r => ({
      sleutel: `omzet:${r.value}`,
      label: r.label,
      groep: 'Omzet',
      past: g => String(g.functie || '') === OMZET_FUNCTIE[r.value],
    })),
  ], []);

  const kies = async (rij, nummer) => {
    const gb = rekeningen?.find(g => String(g.nummer) === String(nummer)) || null;
    // Optimistisch bijwerken: een keuzelijst die pas na de round-trip verspringt
    // voelt stuk.
    const vorige = voorkeuren[rij.sleutel];
    setVoorkeuren(v => ({
      ...v,
      [rij.sleutel]: gb ? { nummer: gb.nummer, omschrijving: gb.omschrijving } : undefined,
    }));
    try {
      await setGrootboekVoorkeur(rij.sleutel, gb ? { nummer: gb.nummer, id: gb.id, omschrijving: gb.omschrijving } : null);
    } catch (err) {
      setVoorkeuren(v => ({ ...v, [rij.sleutel]: vorige }));
      toast.error(err.message || 'Opslaan mislukt');
    }
  };

  if (!verbonden) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dk)', marginBottom: 4 }}>
        Grootboekindeling
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--dm)', marginBottom: 12 }}>
        Op welke rekening komt elke soort boeking in je boekhouding? Laat je een regel leeg, dan kiest
        BossBase zelf de gebruikelijke rekening. Wijkt jouw rekeningschema af, of wil je het anders
        indelen, kies hem dan hier — je boekhouder weet welke.
      </div>

      {laden && <div style={{ fontSize: 12, color: 'var(--dl)' }}>Rekeningen ophalen…</div>}
      {fout && (
        <div style={{ fontSize: 12, color: 'var(--rd)', marginBottom: 8 }}>
          {fout} <button className="btn btn-s btn-sm" onClick={laad} style={{ marginLeft: 8 }}>Opnieuw</button>
        </div>
      )}

      {rekeningen && ['Kosten', 'Omzet'].map(groep => (
        <div key={groep} style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
            color: 'var(--dl)', marginBottom: 6,
          }}>{groep}</div>

          {rijen.filter(r => r.groep === groep).map(rij => {
            const gekozen = voorkeuren[rij.sleutel];
            const opties = rekeningen.filter(rij.past);
            return (
              <div key={rij.sleutel} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0',
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: '0 0 160px', fontSize: 12.5, color: 'var(--dk)' }}>{rij.label}</div>
                <select
                  value={gekozen?.nummer ?? ''}
                  onChange={e => kies(rij, e.target.value)}
                  style={{ flex: '1 1 260px', minWidth: 0, fontSize: 12.5 }}
                >
                  <option value="">Standaard — {STANDAARD[rij.sleutel] || 'automatisch'}</option>
                  {opties.map(g => (
                    <option key={g.nummer} value={g.nummer}>{g.nummer} — {g.omschrijving}</option>
                  ))}
                </select>
                {/* Een lege keuzelijst betekent dat de administratie geen enkele
                    rekening heeft die dit btw-tarief accepteert. Dan is de
                    standaard óók machteloos en moet de boekhouder eraan te pas. */}
                {opties.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--rd)' }}>
                    Geen passende rekening in je administratie
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
