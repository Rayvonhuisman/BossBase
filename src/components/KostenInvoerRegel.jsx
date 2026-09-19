import { useEffect, useState } from 'react';
import { I, fmt } from '../bb-shared.jsx';
import LeverancierSelect from './LeverancierSelect.jsx';

// Een kostenpost (inkoop) toevoegen: één regel, overal hetzelfde.
//
// Gebruikt in de kostentab van het project en op de klantkaart. Zelfde velden in
// dezelfde volgorde — omschrijving, aantal, eenheid, kostprijs, leverancier,
// subtotaal, knop — en hetzelfde gedrag: Enter voegt toe, na toevoegen is de
// regel weer leeg, zonder omschrijving gebeurt er niets.
//
// Wat hier wordt toegevoegd is een inkoop (project_kosten): een kost die bij de
// klus hoort en in de brutowinst meetelt. Een inkoop hoort altijd bij een
// project; op de klantkaart met meer dan één project kies je dat vooraan.
//
// Onder 640px kaartbreedte (de projectdrawer is op half scherm 520px) blijft
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
    const ro = new ResizeObserver(([e]) => setSmal(e.contentRect.width < 640));
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
