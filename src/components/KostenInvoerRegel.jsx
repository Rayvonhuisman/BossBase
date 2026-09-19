import { useEffect, useState } from 'react';
import { I, fmt } from '../bb-shared.jsx';
import LeverancierSelect from './LeverancierSelect.jsx';
import { InfoTip } from './Uitleg.jsx';
import { useToast } from '../lib/toast.jsx';
import { updateProjectKost, deleteProjectKost } from '../services/projectKostenService.js';

// Een kostenpost (inkoop) toevoegen: één regel, overal hetzelfde.
//
// Gebruikt in de kostentab van het project, op de klantkaart en in de werkbon. Zelfde velden in
// dezelfde volgorde — omschrijving, aantal, eenheid, kostprijs, leverancier,
// subtotaal, knop — en hetzelfde gedrag: Enter voegt toe, na toevoegen is de
// regel weer leeg, zonder omschrijving gebeurt er niets.
//
// Wat hier wordt toegevoegd is een inkoop (project_kosten): een kost die bij de
// klus hoort en in de brutowinst meetelt. Een inkoop hoort altijd bij een
// project; op de klantkaart met meer dan één project kies je dat vooraan.
//
// Onder 780px kaartbreedte (de projectdrawer is op half scherm 520px) blijft
// alles op één regel, met smallere vaste kolommen en "Leverancier" als lege
// keuze — "Geen leverancier" paste daar niet. Gemeten op de kaart zelf, niet op
// het venster: de drawer kan ook gemaximaliseerd staan.

const KOLOMMEN_BREED = 'minmax(0,2.2fr) 62px 74px 84px minmax(0,1.3fr) 84px 30px';
const KOLOMMEN_SMAL = 'minmax(0,1fr) 44px 52px 60px 104px 58px 28px';
const PROJECT_BREED = 'minmax(0,1.2fr) ';
const PROJECT_SMAL = 'minmax(0,.8fr) ';

/**
 * Kolomindeling voor de invoerregel én de regels erboven, zodat die onder
 * dezelfde koppen staan. Hang `ref` aan de kaart die de breedte bepaalt.
 */
export function useKostenKolommen({ metProject = false } = {}) {
  // Callback-ref in plaats van useRef: op de klantkaart bestaat het element pas
  // als de Kosten-tab open gaat. Met een vaste ref bij het mounten werd er dan
  // nooit gemeten.
  const [el, ref] = useState(null);
  const [smal, setSmal] = useState(true);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // 780 en niet 640: tussen die twee kreeg de leverancierskolom in de brede
    // indeling te weinig ruimte ("Geen leverar…" op de werkbon, kaart 724px).
    const ro = new ResizeObserver(([e]) => setSmal(e.contentRect.width < 780));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const basis = smal ? KOLOMMEN_SMAL : KOLOMMEN_BREED;
  const COLS = metProject ? (smal ? PROJECT_SMAL : PROJECT_BREED) + basis : basis;
  return { ref, smal, COLS, GAP: smal ? 4 : 5 };
}

/** Het leveranciersveld in dezelfde maat als de invoerregel. */
export function KostenLeverancier({ smal, value, onChange, disabled, leveranciers, onLeverancierBij }) {
  return (
    <LeverancierSelect value={value || ''} disabled={disabled} leveranciers={leveranciers}
      onLijstGewijzigd={onLeverancierBij} onChange={onChange}
      leegLabel={smal ? 'Leverancier' : undefined}
      style={{ minWidth: 0, width: '100%', ...(smal ? { padding: '0 2px 0 6px' } : null) }} />
  );
}

/** Binnenmarge van de smalle tekstvelden (omschrijving, eenheid). */
export const smalVeld = smal => ({ minWidth: 0, ...(smal ? { padding: '0 6px' } : null) });

/**
 * @param {object}   kolommen          uit useKostenKolommen()
 * @param {Function} onAdd             async ({ naam, aantal, eenheid, prijs_per, leverancier_id, project_id }) — gooit bij een fout
 * @param {Array}    leveranciers
 * @param {Function} onLeverancierBij  na het aanmaken van een nieuwe leverancier
 * @param {Array}   [projecten]        alleen op de klantkaart: [{ id, name }]. Bij
 *                                     meer dan één komt er een projectkeuze vooraan.
 * @param {boolean} [metScheiding]     lijn erboven, als er al regels staan
 */
export default function KostenInvoerRegel({ kolommen, onAdd, leveranciers, onLeverancierBij, projecten, metScheiding = false }) {
  const { smal, COLS, GAP } = kolommen;
  const kiesProject = Array.isArray(projecten) && projecten.length > 1;
  const LEEG = { naam: '', aantal: 1, eenheid: '', prijs_per: '', leverancier_id: '', project_id: '' };
  const [form, setForm] = useState(LEEG);
  const [adding, setAdding] = useState(false);
  const zet = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const subtotaal = (Number(form.aantal) || 0) * (Number(form.prijs_per) || 0);
  // Eén project: dat is het. Meer: kiezen. Geen: niets toe te voegen (zie onder).
  const projectId = kiesProject ? form.project_id : (projecten?.[0]?.id || '');
  const kan = form.naam.trim() && (!Array.isArray(projecten) || projectId);

  const submit = async () => {
    if (!kan || adding) return;
    setAdding(true);
    try {
      await onAdd({ ...form, project_id: projectId });
      // Het gekozen project blijft staan: meestal voer je er een paar achter
      // elkaar in voor dezelfde klus.
      setForm(f => ({ ...LEEG, project_id: f.project_id }));
    } catch { /* de melding komt van onAdd; de invoer blijft staan */ } finally {
      setAdding(false);
    }
  };

  if (Array.isArray(projecten) && projecten.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--dl)', lineHeight: 1.5 }}>
        Een inkoop hoort bij een project. Maak eerst een project aan voor deze klant.
      </div>
    );
  }

  return (
    <div className="wb2-mat-rij" style={metScheiding ? { borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6 } : undefined}>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: GAP, alignItems: 'center' }}>
        {kiesProject && (
          <select value={form.project_id} onChange={e => zet('project_id', e.target.value)}
            style={{ minWidth: 0, ...(smal ? { padding: '0 2px 0 6px' } : null) }} aria-label="Project">
            <option value="">Project</option>
            {projecten.map(p => <option key={p.id} value={p.id}>{p.name || 'Project'}</option>)}
          </select>
        )}
        <input type="text" placeholder="Bijv. steigerhuur" value={form.naam} style={smalVeld(smal)}
          onChange={e => zet('naam', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        <input type="number" min="0" step="0.01" value={form.aantal} placeholder="1" style={{ minWidth: 0 }}
          onChange={e => zet('aantal', e.target.value)} />
        <input type="text" value={form.eenheid} placeholder="stuk" style={smalVeld(smal)}
          onChange={e => zet('eenheid', e.target.value)} />
        <input type="number" min="0" step="0.01" value={form.prijs_per} placeholder="0,00" style={{ minWidth: 0 }}
          title="Kostprijs per eenheid, excl. btw"
          onChange={e => zet('prijs_per', e.target.value)} />
        <div style={{ minWidth: 0 }}>
          <KostenLeverancier smal={smal} value={form.leverancier_id} onChange={v => zet('leverancier_id', v)}
            leveranciers={leveranciers} onLeverancierBij={onLeverancierBij} />
        </div>
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>{fmt(subtotaal)}</div>
        <button onClick={submit} disabled={adding || !kan} className="wb2-mat-add-btn"
          aria-label="Inkoop toevoegen" title="Toevoegen" style={{ justifySelf: 'end' }}>{I.plus}</button>
      </div>
    </div>
  );
}

/**
 * Bewerken en verwijderen van inkopen: direct in beeld, de schrijfactie loopt
 * erachteraan, en bij een fout terug naar wat er stond. Zelfde werkwijze als
 * materiaal op de werkbon.
 *
 * @param {Function} setLijst  setState van de lijst inkopen
 */
export function useInkopenBewerken(setLijst) {
  const toast = useToast();
  const wijzig = async (rij, patch) => {
    const nieuw = { ...rij };
    if ('naam' in patch) nieuw.naam = patch.naam;
    if ('eenheid' in patch) nieuw.eenheid = patch.eenheid;
    if ('aantal' in patch) nieuw.aantal = Number(patch.aantal) || 0;
    if ('prijs_per' in patch) nieuw.prijsPer = Number(patch.prijs_per) || 0;
    if ('leverancier_id' in patch) nieuw.leverancierId = patch.leverancier_id || null;
    nieuw.bedrag = Math.round(nieuw.aantal * nieuw.prijsPer * 100) / 100;
    setLijst(l => l.map(x => (x.id === rij.id ? nieuw : x)));
    try {
      await updateProjectKost(rij.id, patch);
    } catch (e) {
      toast.error(e.message || 'Bijwerken mislukt');
      setLijst(l => l.map(x => (x.id === rij.id ? rij : x)));
    }
  };
  const verwijder = async rij => {
    if (!window.confirm(`"${rij.naam}" verwijderen?`)) return;
    try {
      await deleteProjectKost(rij.id);
      setLijst(l => l.filter(x => x.id !== rij.id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };
  return { wijzig, verwijder };
}

// De kaart met inkopen: bestaande regels direct bewerkbaar, onderaan de
// invoerregel. Zelfde opzet als materiaal op de werkbon. Geen keuze uit de
// materialenbibliotheek: die draagt een inkoopprijs, en een inkoop is voor
// iedereen met het recht 'kosten' zichtbaar — daarmee zou de afgeschermde
// inkoopprijs via deze weg alsnog te lezen zijn. Inkopen zijn bovendien huur en
// diensten, geen artikelen.
//
// Project: titel "Inkopen". Werkbon: titel "Kosten", met de kostprijs erboven
// (`kop`).
export function InkopenKaart({
  kosten, leveranciers, onLeverancierBij, canEdit, loading, laadFout, onAdd, onUpdate, onDelete,
  titel = 'Inkopen', kop = null,
  // De uitleg hoort achter het icoontje bij de titel, niet als losse zin in de
  // kaart: je leest hem één keer, daarna staat hij alleen maar in de weg. De
  // lege kaart houdt een korte regel, anders lijkt een leeg blok stuk.
  leegTekst = 'Nog geen kosten toegevoegd.',
  uitleg = 'Kosten die bij deze klus horen maar niet op een werkbon staan, zoals steigerhuur of een gehuurde hoogwerker. Bedragen exclusief btw.',
}) {
  // De bestaande regels gebruiken dezelfde kolommen als de invoerregel, zodat
  // ze onder dezelfde koppen staan.
  const kolommen = useKostenKolommen();
  const { ref: kaartRef, smal, COLS, GAP } = kolommen;
  const totaal = kosten.reduce((s, k) => s + k.bedrag, 0);
  const rijStijl = { display: 'grid', gridTemplateColumns: COLS, gap: GAP, alignItems: 'center', marginBottom: 5 };
  const subStijl = { textAlign: 'right', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' };

  // Zonder de migratie bestaat de tabel nog niet. Dan geen technische
  // foutmelding in beeld, maar wat er aan de hand is.
  const foutTekst = !laadFout ? ''
    : /schema cache|does not exist|project_kosten/i.test(laadFout)
      ? 'Inkopen zijn nog niet beschikbaar: de database-update hiervoor is nog niet uitgevoerd.'
      : `Inkopen konden niet worden geladen (${laadFout}).`;

  const veld = (r, k, v) => onUpdate(r, { [k]: v });
  // De omschrijving pas bij verlaten opslaan: leegmaken om opnieuw te typen
  // zou anders tussendoor een lege naam wegschrijven, en die weigert de database.
  const naamKlaar = (r, v) => {
    const naam = v.trim();
    if (naam && naam !== r.naam) veld(r, 'naam', naam);
  };

  return (
    <div className="wb2-card" ref={kaartRef}>
      <div className="wb2-card-hd">
        {/* Het icoontje staat ín de titel, niet ernaast als flex-kind: deze rij
            heeft geen gap, dus als tekst houdt het zijn eigen marge. */}
        <div className="wb2-card-hd-title">{titel}<InfoTip tekst={uitleg} /></div>
      </div>
      <div className="wb2-card-body">
        {kop}
        <div className="wb2-mat-body">
          {!kosten.length && (
            <div style={{ fontSize: 12, color: 'var(--dl)', lineHeight: 1.5, marginBottom: canEdit ? 10 : 0 }}>
              {foutTekst || leegTekst}
            </div>
          )}

          {kosten.length > 0 && (
            <div>
              <div className="wb2-mat-kop" style={{ display: 'grid', gridTemplateColumns: COLS, gap: GAP }}>
                {/* Smal: korte koppen, anders liepen ze in elkaar over
                    ("AANTALEENHEID KOSTPRIJS…"). */}
                <span>Omschrijving</span>
                <span title="Aantal">{smal ? 'Aant.' : 'Aantal'}</span>
                <span title="Eenheid">{smal ? 'Eenh.' : 'Eenheid'}</span>
                <span title="Kostprijs per eenheid, excl. btw">{smal ? 'Prijs' : 'Kostprijs'}</span>
                <span>Leverancier</span>
                <span style={{ textAlign: 'right' }} title="Subtotaal">{smal ? 'Totaal' : 'Subtotaal'}</span><span />
              </div>
              {kosten.map(k => (
                <div key={k.id} className="wb2-mat-rij" style={rijStijl}>
                  <input type="text" defaultValue={k.naam} disabled={!canEdit} style={smalVeld(smal)}
                    onBlur={e => naamKlaar(k, e.target.value)} />
                  <input type="number" min="0" step="0.01" value={k.aantal} disabled={!canEdit} style={{ minWidth: 0 }}
                    onChange={e => veld(k, 'aantal', e.target.value)} />
                  <input type="text" value={k.eenheid} placeholder="stuk" disabled={!canEdit} style={smalVeld(smal)}
                    onChange={e => veld(k, 'eenheid', e.target.value)} />
                  <input type="number" min="0" step="0.01" value={k.prijsPer} disabled={!canEdit} style={{ minWidth: 0 }}
                    title="Kostprijs per eenheid, excl. btw" onChange={e => veld(k, 'prijs_per', e.target.value)} />
                  <div style={{ minWidth: 0 }}>
                    <KostenLeverancier smal={smal} value={k.leverancierId} onChange={v => veld(k, 'leverancier_id', v)}
                      disabled={!canEdit} leveranciers={leveranciers} onLeverancierBij={onLeverancierBij} />
                  </div>
                  <div style={subStijl}>{fmt(k.bedrag)}</div>
                  {canEdit
                    ? <button className="btn btn-xs btn-danger btn-icon" onClick={() => onDelete(k)} title="Verwijderen" style={{ justifySelf: 'end' }}>{I.trash}</button>
                    : <div />}
                </div>
              ))}
            </div>
          )}

          {canEdit && !loading && (
            <KostenInvoerRegel kolommen={kolommen} onAdd={onAdd} leveranciers={leveranciers}
              onLeverancierBij={onLeverancierBij} metScheiding={kosten.length > 0} />
          )}
        </div>

        {kosten.length > 0 && (
          <div className="wb2-mat-foot">
            <div className="wb2-mat-foot-add" style={{ visibility: 'hidden' }}>spacer</div>
            <div style={{ textAlign: 'right' }}>
              <div className="wb2-mat-foot-total-lbl">Totaal inkopen (excl. BTW)</div>
              <div className="wb2-mat-foot-total">{fmt(totaal)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

