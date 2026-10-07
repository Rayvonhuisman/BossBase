// Boekhoudinstellingen voor SnelStart en Moneybird: welke grootboekrekening
// krijgt elke kostencategorie en omzetsoort, en welke categorieën bestaan er?
// Bij Moneybird daarnaast: welk btw-tarief van de administratie hoort bij welke
// btw-soort. SnelStart kent vaste btw-soorten; Moneybird heeft per administratie
// eigen tarieven, dus die moeten gekoppeld worden.
//
// Wat per pakket verschilt staat in PAKKET hieronder: SnelStart kiest een
// rekening op nummer en controleert hem op grootboekfunctie, Moneybird kiest op
// id en kijkt naar het soort rekening (omzet of kosten).
//
// Staat INLINE in de Instellingen-tab van de koppelingsdrawer. Was een modal,
// maar dan moest je vanuit de instellingen nóg een keer doorklikken om je
// instellingen te zien; alles wat je aan deze koppeling kunt instellen hoort op
// één plek. (Die modal was overigens nooit een echte modal: de klassen
// .mo/.mc/.mh stonden in geen enkel stylesheet.)
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
import { useToast } from '../lib/toast.jsx';
import { BTW_REGIMES } from '../lib/btwRegime.js';
import { InfoTip, InfoUitklap } from './Uitleg.jsx';
import {
  getGrootboekrekeningen, getGrootboekVoorkeuren, setGrootboekVoorkeur, haalAllesOpnieuwOp,
  maakMoneybirdInkoopRekening,
} from '../services/accountingService.js';
import {
  listKostenCategorieen, createKostenCategorie, updateKostenCategorie,
  deleteKostenCategorie, getCategorieGebruik,
} from '../services/kostenCategorieService.js';
import { ververKostenCategorieen } from '../hooks/useKostenCategorieen.js';
import { bevestig } from '../lib/bevestig.jsx';

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
function standaardTekst(std, leeg = 'vraagpost') {
  if (!std) return leeg;
  // Moneybird levert een kant-en-klaar label (de rekening heeft niet altijd een code).
  if (std.soort === 'een') return std.label || `${std.nummer} — ${std.omschrijving}`;
  return std.perTarief
    .map(p => `${p.pct}% → ${p.nummer ? `${p.nummer} ${p.omschrijving}` : 'vraagpost'}`)
    .join(' · ');
}

const isGesplitst = std => std?.soort === 'per_tarief';

// Wat er per pakket anders is. De rest van het scherm is voor beide gelijk.
const PAKKET = {
  snelstart: {
    naam: 'SnelStart',
    waarde: g => String(g.nummer),
    label: g => `${g.nummer} — ${g.omschrijving}`,
    gekozen: v => v?.nummer,
    // Wat er wordt opgeslagen bij een keuze.
    keuze: g => ({ nummer: g.nummer, id: g.id, omschrijving: g.omschrijving }),
    pastKosten: g => INKOOP_FUNCTIES.includes(String(g.grootboekfunctie || g.functie || '')),
    pastOmzet: regime => g => String(g.grootboekfunctie || g.functie || '') === OMZET_FUNCTIE[regime],
    // Regels met een afwijkend percentage (oude data, bijvoorbeeld 6%) gaan naar
    // de overige-omzetrekening, niet naar de hoge.
    overigeOmzet: g => String(g.grootboekfunctie || g.functie || '') === 'VerkopenOmzetOverig',
    zonderRekening: 'op de vraagpost te staan, met een markering voor je boekhouder',
    leegStandaard: 'vraagpost',
  },
  moneybird: {
    naam: 'Moneybird',
    waarde: g => String(g.id),
    label: g => (g.code ? `${g.code} — ${g.naam}` : g.naam),
    gekozen: v => v?.id,
    // Moneybird heeft niet altijd een rekeningcode; die is alleen voor de weergave.
    keuze: g => ({ nummer: /^\d+$/.test(String(g.code || '')) ? Number(g.code) : null, id: g.id, omschrijving: g.code ? `${g.code} ${g.naam}` : g.naam }),
    pastKosten: g => g.soort === 'kosten',
    pastOmzet: () => g => g.soort === 'omzet',
    // In Moneybird zit het btw-tarief niet in de rekening maar in het tarief per
    // regel; een afwijkend percentage hoeft dus geen eigen omzetrekening.
    overigeOmzet: null,
    zonderRekening: 'op Algemene kosten te staan, met een melding in Meldingen',
    leegStandaard: 'niet gevonden',
  },
};

// Btw-tarieven (alleen Moneybird). Verkoop per btw-regime van een factuurregel,
// inkoop per percentage van een kostenpost.
const BTW_RIJEN = [
  ...BTW_REGIMES.map(r => ({ sleutel: `btw:${r.value}`, label: r.label, soort: 'verkoop', groep: 'Btw op facturen' })),
  { sleutel: 'btwinkoop:21', label: '21% — normaal', soort: 'inkoop', groep: 'Btw op kosten' },
  { sleutel: 'btwinkoop:9', label: '9% — verlaagd', soort: 'inkoop', groep: 'Btw op kosten' },
  { sleutel: 'btwinkoop:0', label: '0% — geen btw', soort: 'inkoop', groep: 'Btw op kosten' },
];

export default function GrootboekIndeling({ provider = 'snelstart' }) {
  const pakket = PAKKET[provider] || PAKKET.snelstart;
  const toast = useToast();
  const [rekeningen, setRekeningen] = useState(null);
  const [btwTarieven, setBtwTarieven] = useState([]);
  const [controle, setControle] = useState([]);
  const [aanmaken, setAanmaken] = useState(false);
  const [standaarden, setStandaarden] = useState({});
  const [voorkeuren, setVoorkeuren] = useState({});
  const [categorieen, setCategorieen] = useState([]);
  const [gebruik, setGebruik] = useState({});
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const [nieuw, setNieuw] = useState('');
  const [ophalen, setOphalen] = useState(false);

  const laad = async () => {
    setLaden(true);
    setFout(null);
    try {
      const [lijst, gekozen, cats, tellingen] = await Promise.all([
        getGrootboekrekeningen(provider),
        getGrootboekVoorkeuren(provider),
        listKostenCategorieen({ inclusiefInactief: true }),
        getCategorieGebruik(),
      ]);
      setRekeningen(lijst.grootboeken ?? lijst);
      setStandaarden(lijst.standaarden || {});
      setBtwTarieven(lijst.btwTarieven || []);
      setControle(lijst.controle || []);
      setVoorkeuren(gekozen);
      setCategorieen(cats);
      setGebruik(tellingen);
    } catch (err) {
      setFout(err.message || 'Gegevens ophalen mislukt');
    } finally {
      setLaden(false);
    }
  };

  useEffect(() => { laad(); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const rijen = useMemo(() => [
    ...categorieen.filter(c => c.actief).map(c => ({
      sleutel: `kosten:${c.naam}`,
      label: c.naam,
      groep: 'Kosten',
      // Een zelf toegevoegde categorie heeft geen ingebouwde standaard.
      verplicht: !c.standaard,
      past: pakket.pastKosten,
    })),
    ...BTW_REGIMES.map(r => ({
      sleutel: `omzet:${r.value}`,
      label: r.label,
      groep: 'Omzet',
      verplicht: false,
      past: pakket.pastOmzet(r.value),
    })),
    // Eigen regel, anders zou de regel "21% — normaal" ook voor die boekingen
    // lijken te gelden. Alleen waar het pakket er een aparte rekening voor kent.
    ...(pakket.overigeOmzet ? [{
      sleutel: 'omzet:overig',
      label: 'Afwijkend percentage',
      groep: 'Omzet',
      verplicht: false,
      past: pakket.overigeOmzet,
    }] : []),
  ], [categorieen, pakket]);

  // Moneybird toont de rekening per kostencategorie in de categorielijst zelf.
  // SnelStart houdt de indeling van vóór de Moneybird-herbouw: kosten en omzet
  // samen onder Rekeningen, en daaronder een losse lijst om categorieën te beheren.
  const rekeningPerCategorie = provider === 'moneybird';

  // Keuzelijsten met btw-tarieven; alleen bij een pakket dat ze levert.
  const btwRijen = provider === 'moneybird' ? BTW_RIJEN : [];

  const ontbrekend = rijen.filter(r => r.verplicht && !pakket.gekozen(voorkeuren[r.sleutel]));

  const kies = async (rij, waarde, bron = rekeningen) => {
    const gb = (bron || []).find(g => pakket.waarde(g) === String(waarde)) || null;
    const vorige = voorkeuren[rij.sleutel];
    const keuze = gb ? pakket.keuze(gb) : null;
    // Optimistisch: een keuzelijst die pas na de round-trip verspringt voelt stuk.
    setVoorkeuren(v => ({ ...v, [rij.sleutel]: keuze || undefined }));
    try {
      await setGrootboekVoorkeur(rij.sleutel, keuze, provider);
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
    if (!(await bevestig(`"${cat.naam}" verwijderen?`))) return;
    try {
      await deleteKostenCategorie(cat.id, cat.naam);
      setCategorieen(cs => cs.filter(c => c.id !== cat.id));
      ververKostenCategorieen();
      toast.success('Categorie verwijderd');
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  // De keuzelijst voor één rekening (kostencategorie of omzetsoort), met de
  // standaard erachter en een waarschuwing als er niets past. Voor SnelStart en
  // Moneybird hetzelfde; wat per pakket verschilt zit in PAKKET.
  const rekeningKeuze = rij => {
    const gekozen = pakket.gekozen(voorkeuren[rij.sleutel]);
    const opties = (rekeningen || []).filter(rij.past);
    const standaard = standaarden[rij.sleutel];
    const mist = rij.verplicht && !gekozen;
    return (
      <>
        <select
          value={gekozen ?? ''}
          onChange={e => kies(rij, e.target.value)}
          style={{ flex: '1 1 280px', minWidth: 0, fontSize: 12.5, borderColor: mist ? 'var(--rd)' : undefined }}
        >
          <option value="">
            {rij.verplicht
              ? '— kies een rekening —'
              : isGesplitst(standaard)
                ? 'Standaard — hangt af van het btw-tarief'
                : `Standaard — ${standaardTekst(standaard, pakket.leegStandaard)}`}
          </option>
          {opties.map(g => (
            <option key={pakket.waarde(g)} value={pakket.waarde(g)}>{pakket.label(g)}</option>
          ))}
        </select>
        {/* Een categorie die per tarief ergens anders landt kan niet in één
            regel eerlijk worden samengevat. */}
        {!gekozen && isGesplitst(standaard) && (
          <div style={{ flex: '1 1 100%', fontSize: 11, color: 'var(--dl)', paddingLeft: 160 }}>{standaardTekst(standaard)}</div>
        )}
        {/* Lege keuzelijst: de administratie heeft geen passende rekening. */}
        {opties.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--rd)' }}>Geen passende rekening in je administratie</div>
        )}
      </>
    );
  };

  // Klassen .mo/.mc/.mh/.mt/.mb bestonden in geen enkel stylesheet: dit scherm
  // rendeerde daardoor als een gewoon blok onderaan de pagina in plaats van als
  // modal. Nu de bestaande overlay/modal-klassen, dezelfde als elders in het
  // dashboard — zichtbaar zodra je hem vanuit de integratiedrawer opent.
  return (
    <div>
      <div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            Grootboekindeling
            <InfoTip tekst={`Hoe BossBase jouw boekingen indeelt in ${pakket.naam}.`} />
          </div>
        </div>

        <div>
          {laden && <div style={{ fontSize: 12.5, color: 'var(--dl)' }}>Rekeningen ophalen…</div>}
          {fout && (
            <div style={{ fontSize: 12.5, color: 'var(--rd)' }}>
              {fout} <button className="btn btn-s btn-sm" onClick={laad} style={{ marginLeft: 8 }}>Opnieuw</button>
            </div>
          )}

          {!laden && !fout && (
            <>
              {/* Checklist na het koppelen: wat moet er in de administratie staan
                  om alles te kunnen boeken. Wat BossBase zelf kan aanmaken krijgt
                  een knop; de rest een link naar de juiste plek in het pakket. */}
              {controle.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Controleer na het koppelen</span>
                    <button className="btn btn-s btn-sm" onClick={laad}>Opnieuw controleren</button>
                  </div>
                  {controle.map(c => (
                    <div key={c.titel} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: '.8rem' }}>
                      <span aria-hidden="true" style={{ color: c.ok ? 'var(--pd)' : 'var(--rd)', fontWeight: 700 }}>{c.ok ? '✓' : '✗'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--dk)' }}>{c.titel}{c.ok ? '' : ' — ontbreekt'}</div>
                        {!c.ok && <div style={{ color: 'var(--dm)' }}>{c.uitleg}</div>}
                        {!c.ok && c.actie?.soort === 'link' && (
                          <a href={c.actie.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.78rem' }}>{c.actie.label} ↗</a>
                        )}
                      </div>
                      {!c.ok && c.actie?.soort === 'aanmaken' && (
                        <button
                          className="btn btn-p btn-sm"
                          disabled={aanmaken}
                          style={{ alignSelf: 'flex-start' }}
                          onClick={async () => {
                            setAanmaken(true);
                            try {
                              await maakMoneybirdInkoopRekening();
                              toast.success('Categorie "Inkoop materialen" aangemaakt in Moneybird');
                              await laad();
                            } catch (err) {
                              toast.error(err.message || 'Aanmaken mislukt');
                            } finally {
                              setAanmaken(false);
                            }
                          }}
                        >
                          {aanmaken ? 'Aanmaken…' : c.actie.label}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

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
                    dus BossBase weet niet waar die hoort te boeken. Tot je een rekening
                    kiest komen kosten in {ontbrekend.length === 1 ? 'deze categorie' : 'deze categorieën'} {pakket.zonderRekening}.
                  </div>
                </div>
              )}

              <div className="f-label-rij" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 12.5, color: 'var(--dm)', fontWeight: 600 }}>Rekeningen</span>
                <InfoUitklap
                  id="uitleg-rekeningen"
                  tekst="Alle velden zijn optioneel: laat je er een leeg, dan gebruikt BossBase de rekening die erachter staat. Wijkt jouw rekeningschema af, kies hem dan hier — je boekhouder weet welke."
                />
              </div>

              {(rekeningPerCategorie ? ['Omzet'] : ['Kosten', 'Omzet']).map(groep => (
                <div key={groep} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                    color: 'var(--dl)', marginBottom: 6,
                  }}>{groep}</div>
                  {rijen.filter(r => r.groep === groep).map(rij => (
                    <div key={rij.sleutel} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', flexWrap: 'wrap' }}>
                      <div style={{ flex: '0 0 150px', fontSize: 12.5, color: 'var(--dk)' }}>
                        {rij.label}{rij.verplicht ? ' *' : ''}
                      </div>
                      {rekeningKeuze(rij)}
                    </div>
                  ))}
                </div>
              ))}

              {/* ── Btw-tarieven (Moneybird) ────────────────────────────── */}
              {btwRijen.length > 0 && ['Btw op facturen', 'Btw op kosten'].map(groep => (
                <div key={groep} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                    color: 'var(--dl)', marginBottom: 6,
                  }}>{groep}</div>
                  {btwRijen.filter(r => r.groep === groep).map(rij => {
                    const gekozen = voorkeuren[rij.sleutel]?.id;
                    const opties = btwTarieven.filter(t => t.soort === rij.soort);
                    const standaard = standaarden[rij.sleutel];
                    return (
                      <div key={rij.sleutel} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', flexWrap: 'wrap',
                      }}>
                        <div style={{ flex: '0 0 150px', fontSize: 12.5, color: 'var(--dk)' }}>{rij.label}</div>
                        <select
                          value={gekozen ?? ''}
                          onChange={e => kies(rij, e.target.value, btwTarieven)}
                          style={{ flex: '1 1 280px', minWidth: 0, fontSize: 12.5, borderColor: !gekozen && !standaard ? 'var(--rd)' : undefined }}
                        >
                          <option value="">
                            {standaard ? `Standaard — ${standaard.label}` : '— kies een btw-tarief —'}
                          </option>
                          {opties.map(t => (
                            <option key={t.id} value={String(t.id)}>{t.naam}</option>
                          ))}
                        </select>
                        {!gekozen && !standaard && (
                          <div style={{ flex: '1 1 100%', fontSize: 11, color: 'var(--rd)', paddingLeft: 160 }}>
                            Geen passend tarief gevonden. Kies er een, anders worden regels met deze btw-soort niet geboekt.
                          </div>
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
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  Kostencategorieën
                  <InfoUitklap
                    id="uitleg-kostencategorieen"
                    tekst={rekeningPerCategorie
                      ? 'Per categorie kies je hier de rekening in je boekhouding. De zes standaardcategorieën hebben een standaard en zijn niet te verwijderen. Voeg je er zelf een toe, kies er dan een rekening bij.'
                      : 'De zes standaardcategorieën kennen hun eigen rekening en zijn niet te verwijderen. Voeg je er zelf een toe, kies er dan hierboven een rekening bij.'}
                  />
                </div>

                {rekeningPerCategorie ? (
                  <>
                    {/* Per categorie de rekening, het gebruik en (in)actief in één
                        regel. Stond eerder in twee blokken: de keuze bovenaan en hier
                        alleen een knop "Inactief" — die leek een status, waardoor het
                        hele blok inactief oogde terwijl alles actief was. */}
                    {categorieen.map(cat => {
                      const aantal = gebruik[cat.naam] || 0;
                      const rij = rijen.find(r => r.sleutel === `kosten:${cat.naam}`);
                      return (
                        <div key={cat.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: '0 0 150px', color: cat.actief ? 'var(--dk)' : 'var(--dl)' }}>
                              {cat.naam}{rij?.verplicht ? ' *' : ''}
                            </div>
                            {cat.actief && rij
                              ? rekeningKeuze(rij)
                              : <div style={{ flex: '1 1 280px', fontSize: 12, color: 'var(--dl)' }}>Inactief — niet te kiezen bij nieuwe kosten</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingLeft: 160, flexWrap: 'wrap' }}>
                            <span style={{ flex: 1, fontSize: 11, color: 'var(--dl)' }}>
                              {cat.standaard ? 'standaard · ' : ''}{aantal === 0 ? 'ongebruikt' : aantal === 1 ? '1 kostenpost' : `${aantal} kostenposten`}
                            </span>
                            <button className="btn btn-s btn-sm" onClick={() => zetActief(cat, !cat.actief)}>
                              {cat.actief ? 'Op inactief zetten' : 'Activeren'}
                            </button>
                            {/* Verwijderen alleen bij een eigen, ongebruikte categorie.
                                In gebruik = inactief zetten, net als bij leveranciers:
                                bestaande kosten mogen hun categorie niet kwijtraken. */}
                            {!cat.standaard && aantal === 0 && (
                              <button className="btn btn-danger btn-sm" onClick={() => verwijder(cat)}>Verwijderen</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {/* SnelStart: de lijst van vóór de Moneybird-herbouw. De rekening
                        per categorie staat hierboven onder Rekeningen › Kosten. */}
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
                  </>
                )}

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

        <div className="fa" style={{ justifyContent: 'space-between' }}>
          {/* Wat hier verwijderd is komt normaal niet meer terug — de import
              respecteert die keuze. Dit is de enige weg terug, en dus expres
              een bewuste handeling in plaats van iets dat elke sync doet. */}
          <button
            className="btn btn-s btn-sm"
            disabled={ophalen}
            onClick={async () => {
              if (!(await bevestig(
                `Alles opnieuw ophalen uit ${pakket.naam}?\n\n`
                + 'Ook wat je hier eerder hebt verwijderd komt dan terug. '
                + 'Wat in BossBase is gemaakt en al geboekt is, blijft ongemoeid.',
              ))) return;
              setOphalen(true);
              try {
                const r = await haalAllesOpnieuwOp(provider);
                const i = r?.imported || {};
                const c = r?.contacten || {};
                const lev = c.leveranciers || {};
                toast.success(
                  `Opgehaald: ${c.imported ?? 0} klanten, ${lev.geimporteerd ?? 0} leveranciers, `
                  + `${i.inkoopfacturen ?? 0} inkoopfacturen en ${i.verkoopfacturen ?? 0} verkoopfacturen.`,
                );
              } catch (err) {
                toast.error(err.message || 'Ophalen mislukt');
              } finally {
                setOphalen(false);
              }
            }}
          >
            {ophalen ? 'Ophalen…' : 'Alles opnieuw ophalen'}
          </button>
        </div>
      </div>
    </div>
  );
}
