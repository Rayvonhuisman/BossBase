// Boekhoudinstellingen voor SnelStart: welke grootboekrekening krijgt elke
// kostencategorie en omzetsoort, en welke categorieën bestaan er?
//
// Opent als eigen scherm vanaf de SnelStart-kaart. Het hoort daar en niet bij de
// algemene instellingen: alles hierin gaat over hoe déze koppeling boekt.
//
// De koppeling kiest standaard zelf, op vaste voorkeursnummers uit het gangbare
// Nederlandse rekeningschema. Werkt zolang een administratie dat schema volgt.
// Zo niet, dan viel de koppeling terug op de grootboekFUNCTIE — en een functie
// wijst geen rekening aan maar een groep van tientallen, waaruit dan willekeurig
// geplukt werd. Zo belandde materiaal ooit op "Reclame- en advertentiekosten".
//
// Alle velden zijn optioneel, met één uitzondering: bij een ZELF toegevoegde
// categorie kan BossBase niets raden. Die moet een rekening krijgen.

import { useEffect, useMemo, useState } from 'react';
import { ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { BTW_REGIMES } from '../lib/btwRegime.js';
import {
  getGrootboekrekeningen, getGrootboekVoorkeuren, setGrootboekVoorkeur,
} from '../services/accountingService.js';
import {
  listKostenCategorieen, createKostenCategorie, updateKostenCategorie,
  deleteKostenCategorie, getCategorieGebruik,
} from '../services/kostenCategorieService.js';
import { ververKostenCategorieen } from '../hooks/useKostenCategorieen.js';

// Welke functies mag een rekening dragen om bij deze regel te passen? Dezelfde
// controle als server-side in grootboekKeuze.ts — zo zie je alleen rekeningen
// die de boeking ook echt zal accepteren.
const INKOOP_FUNCTIES = ['InkopenKostenAlleBtwTarieven', 'InkopenKostenHoog', 'InkopenKostenLaag',
  'InkopenKostenOverig', 'InkopenHoog', 'InkopenLaag', 'InkopenOverig'];

const OMZET_FUNCTIE = {
  normaal: 'VerkopenOmzetHoog',
  verlaagd: 'VerkopenOmzetLaag',
  vrijgesteld: 'VerkopenOmzetOnbelastVerlegd',
  verlegd: 'VerkopenOmzetOnbelastVerlegd',
};

// Wat er gebeurt als je een regel leeg laat. De server rekent dit uit tegen de
// administratie van de klant; hier alleen de weergave.
//
// Komt een categorie bij elk btw-tarief op dezelfde rekening uit, dan is dat één
// regel. Pakt hij per tarief anders uit, dan MOET dat te zien zijn — anders
// belooft het scherm iets anders dan er geboekt wordt.
function standaardTekst(std) {
  if (!std) return 'vraagpost';
  if (std.soort === 'een') return `${std.nummer} — ${std.omschrijving}`;
  return std.perTarief
    .map(p => `${p.pct}% → ${p.nummer ? `${p.nummer} ${p.omschrijving}` : 'vraagpost'}`)
    .join(' · ');
}

const isGesplitst = std => std?.soort === 'per_tarief';

export default function GrootboekIndelingModal({ onClose }) {
  const toast = useToast();
  const [rekeningen, setRekeningen] = useState(null);
  const [standaarden, setStandaarden] = useState({});
  const [voorkeuren, setVoorkeuren] = useState({});
  const [categorieen, setCategorieen] = useState([]);
  const [gebruik, setGebruik] = useState({});
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const [nieuw, setNieuw] = useState('');

  const laad = async () => {
    setLaden(true);
    setFout(null);
    try {
      const [lijst, gekozen, cats, tellingen] = await Promise.all([
        getGrootboekrekeningen(),
        getGrootboekVoorkeuren(),
        listKostenCategorieen({ inclusiefInactief: true }),
        getCategorieGebruik(),
      ]);
      setRekeningen(lijst.grootboeken ?? lijst);
      setStandaarden(lijst.standaarden || {});
      setVoorkeuren(gekozen);
      setCategorieen(cats);
      setGebruik(tellingen);
    } catch (err) {
      setFout(err.message || 'Gegevens ophalen mislukt');
    } finally {
      setLaden(false);
    }
  };

  useEffect(() => { laad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rijen = useMemo(() => [
    ...categorieen.filter(c => c.actief).map(c => ({
      sleutel: `kosten:${c.naam}`,
      label: c.naam,
      groep: 'Kosten',
      // Een zelf toegevoegde categorie heeft geen ingebouwde standaard.
      verplicht: !c.standaard,
      past: g => INKOOP_FUNCTIES.includes(String(g.grootboekfunctie || g.functie || '')),
    })),
    ...BTW_REGIMES.map(r => ({
      sleutel: `omzet:${r.value}`,
      label: r.label,
      groep: 'Omzet',
      verplicht: false,
      past: g => String(g.grootboekfunctie || g.functie || '') === OMZET_FUNCTIE[r.value],
    })),
    // Regels met een afwijkend percentage (oude data, bijvoorbeeld 6%) gaan naar
    // de overige-omzetrekening, niet naar de hoge. Eigen regel, anders zou de
    // regel "21% — normaal" ook voor die boekingen lijken te gelden.
    {
      sleutel: 'omzet:overig',
      label: 'Afwijkend percentage',
      groep: 'Omzet',
      verplicht: false,
      past: g => String(g.grootboekfunctie || g.functie || '') === 'VerkopenOmzetOverig',
    },
  ], [categorieen]);

  const ontbrekend = rijen.filter(r => r.verplicht && !voorkeuren[r.sleutel]?.nummer);

  const kies = async (rij, nummer) => {
    const gb = rekeningen?.find(g => String(g.nummer) === String(nummer)) || null;
    const vorige = voorkeuren[rij.sleutel];
    // Optimistisch: een keuzelijst die pas na de round-trip verspringt voelt stuk.
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

  const voegToe = async () => {
    const naam = nieuw.trim();
    if (!naam) return;
    try {
      const cat = await createKostenCategorie({ naam });
      setCategorieen(cs => [...cs, cat].sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam, 'nl')));
      setNieuw('');
      ververKostenCategorieen();
      toast.success(`"${naam}" toegevoegd — kies er nog een grootboekrekening bij`);
    } catch (err) {
      toast.error(err.message || 'Toevoegen mislukt');
    }
  };

  const zetActief = async (cat, actief) => {
    try {
      const bij = await updateKostenCategorie(cat.id, { actief });
      setCategorieen(cs => cs.map(c => (c.id === cat.id ? bij : c)));
      ververKostenCategorieen();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    }
  };

  const verwijder = async cat => {
    if (!confirm(`"${cat.naam}" verwijderen?`)) return;
    try {
      await deleteKostenCategorie(cat.id, cat.naam);
      setCategorieen(cs => cs.filter(c => c.id !== cat.id));
      ververKostenCategorieen();
      toast.success('Categorie verwijderd');
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  return (
    <div className="mo" onClick={onClose}>
      <div className="mc" style={{ maxWidth: 720, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="mt">Boekhoudinstellingen</div>
            <div style={{ fontSize: '.8rem', color: 'var(--dmu)', marginTop: 2 }}>
              Hoe BossBase jouw boekingen indeelt in SnelStart
            </div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        <div className="mb" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {laden && <div style={{ fontSize: 12.5, color: 'var(--dl)' }}>Rekeningen ophalen…</div>}
          {fout && (
            <div style={{ fontSize: 12.5, color: 'var(--rd)' }}>
              {fout} <button className="btn btn-s btn-sm" onClick={laad} style={{ marginLeft: 8 }}>Opnieuw</button>
            </div>
          )}

          {!laden && !fout && (
            <>
              {ontbrekend.length > 0 && (
                <div style={{
                  border: '1px solid var(--warn-bd, #e0b050)', background: 'var(--warn-bg, rgba(224,176,80,.10))',
                  borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: '.82rem', color: 'var(--dm)',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {ontbrekend.length === 1 ? 'Eén categorie mist' : `${ontbrekend.length} categorieën missen`} nog een grootboekrekening
                  </div>
                  <div>
                    {ontbrekend.map(r => r.label).join(', ')} {ontbrekend.length === 1 ? 'is' : 'zijn'} zelf toegevoegd,
                    dus BossBase weet niet waar {ontbrekend.length === 1 ? 'die' : 'die'} hoort te boeken. Tot je een rekening
                    kiest komen kosten in {ontbrekend.length === 1 ? 'deze categorie' : 'deze categorieën'} op de vraagpost
                    te staan, met een markering voor je boekhouder.
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--dm)', marginBottom: 14 }}>
                Alle velden zijn optioneel: laat je er een leeg, dan gebruikt BossBase de rekening die erachter staat.
                Wijkt jouw rekeningschema af, kies hem dan hier — je boekhouder weet welke.
              </div>

              {['Kosten', 'Omzet'].map(groep => (
                <div key={groep} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                    color: 'var(--dl)', marginBottom: 6,
                  }}>{groep}</div>

                  {rijen.filter(r => r.groep === groep).map(rij => {
                    const gekozen = voorkeuren[rij.sleutel];
                    const opties = (rekeningen || []).filter(rij.past);
                    const standaard = standaarden[rij.sleutel];
                    const mist = rij.verplicht && !gekozen?.nummer;
                    return (
                      <div key={rij.sleutel} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', flexWrap: 'wrap',
                      }}>
                        <div style={{ flex: '0 0 150px', fontSize: 12.5, color: 'var(--dk)' }}>
                          {rij.label}{rij.verplicht ? ' *' : ''}
                        </div>
                        <select
                          value={gekozen?.nummer ?? ''}
                          onChange={e => kies(rij, e.target.value)}
                          style={{
                            flex: '1 1 280px', minWidth: 0, fontSize: 12.5,
                            borderColor: mist ? 'var(--rd)' : undefined,
                          }}
                        >
                          <option value="">
                            {rij.verplicht
                              ? '— kies een rekening —'
                              : isGesplitst(standaard)
                                ? 'Standaard — hangt af van het btw-tarief'
                                : `Standaard — ${standaardTekst(standaard)}`}
                          </option>
                          {opties.map(g => (
                            <option key={g.nummer} value={g.nummer}>{g.nummer} — {g.omschrijving}</option>
                          ))}
                        </select>
                        {/* Een categorie die per tarief ergens anders landt kan
                            niet in één regel eerlijk worden samengevat. */}
                        {!gekozen?.nummer && isGesplitst(standaard) && (
                          <div style={{ flex: '1 1 100%', fontSize: 11, color: 'var(--dl)', paddingLeft: 160 }}>
                            {standaardTekst(standaard)}
                          </div>
                        )}
                        {/* Een lege keuzelijst betekent dat de administratie geen
                            enkele rekening heeft die dit btw-tarief accepteert.
                            Dan is de standaard óók machteloos. */}
                        {opties.length === 0 && (
                          <div style={{ fontSize: 11, color: 'var(--rd)' }}>Geen passende rekening in je administratie</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* ── Categoriebeheer ─────────────────────────────────────── */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                  color: 'var(--dl)', marginBottom: 6,
                }}>Kostencategorieën</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--dm)', marginBottom: 10 }}>
                  De zes standaardcategorieën kennen hun eigen rekening en zijn niet te verwijderen. Voeg je er zelf
                  een toe, kies er dan hierboven een rekening bij.
                </div>

                {categorieen.map(cat => {
                  const aantal = gebruik[cat.naam] || 0;
                  return (
                    <div key={cat.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0',
                      borderBottom: '1px solid var(--border)', fontSize: 12.5,
                    }}>
                      <div style={{ flex: 1, minWidth: 0, color: cat.actief ? 'var(--dk)' : 'var(--dl)' }}>
                        {cat.naam}
                        {cat.standaard && <span style={{ color: 'var(--dl)', marginLeft: 6, fontSize: 11 }}>standaard</span>}
                        {!cat.actief && <span style={{ color: 'var(--dl)', marginLeft: 6, fontSize: 11 }}>inactief</span>}
                      </div>
                      <div style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--dl)' }}>
                        {aantal === 0 ? 'ongebruikt' : aantal === 1 ? '1 kostenpost' : `${aantal} kostenposten`}
                      </div>
                      <button className="btn btn-s btn-sm" onClick={() => zetActief(cat, !cat.actief)}>
                        {cat.actief ? 'Inactief' : 'Activeren'}
                      </button>
                      {/* Verwijderen alleen bij een eigen, ongebruikte categorie.
                          In gebruik = inactief zetten, net als bij leveranciers:
                          bestaande kosten mogen hun categorie niet kwijtraken. */}
                      {!cat.standaard && aantal === 0 && (
                        <button className="btn btn-danger btn-sm" onClick={() => verwijder(cat)}>Verwijderen</button>
                      )}
                    </div>
                  );
                })}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    type="text"
                    value={nieuw}
                    onChange={e => setNieuw(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && voegToe()}
                    placeholder="Nieuwe categorie, bijvoorbeeld Verzekeringen"
                    style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}
                  />
                  <button className="btn btn-p btn-sm" onClick={voegToe} disabled={!nieuw.trim()}>Toevoegen</button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="fa">
          <button className="btn btn-p" onClick={onClose}>Klaar</button>
        </div>
      </div>
    </div>
  );
}
