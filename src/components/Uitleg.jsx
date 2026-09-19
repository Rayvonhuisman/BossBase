import { useState } from 'react';
import { Info } from 'lucide-react';

// Uitleg achter een info-icoontje.
//
// De schermen stonden vol met hulpzinnen die je één keer leest en daarna in de
// weg staan. Ze zijn niet weggehaald — onze gebruikers hebben vaak geen
// ervaring met dit soort software — maar verplaatst naar een icoontje.
//
// Twee varianten, met hetzelfde icoon en dezelfde bb-info-stijl:
//
//   <InfoTip tekst="Korte zin." />        zweeft bij hover of focus
//   <InfoUitklap tekst="Lange uitleg…" /> klapt open en blijft staan
//
// Wanneer welke: korte tekst (tot ongeveer 120 tekens) als tip, langer als
// uitklap. Let op in een MODAL: die heeft overflow-y:auto, dus een zwevende tip
// kan worden afgeknipt. Staat het icoon daar rechts in beeld of is de tekst
// lang, kies dan de uitklap.
//
// Wat hier NIET in hoort: waarschuwingen over gevolgen ("dit kun je later niet
// meer wijzigen"). Die blijven zichtbaar in het scherm zelf.

/** Korte uitleg die zweeft bij hover of toetsenbordfocus. */
export function InfoTip({ tekst, label }) {
  if (!tekst) return null;
  return (
    <button
      type="button"
      className="bb-info"
      data-tip={tekst}
      // Geen onClick: de tip verschijnt op hover én op focus, dus hij is met
      // muis en toetsenbord te bereiken zonder dat er iets te klikken valt.
      aria-label={label || tekst}
    >
      <Info size={14} />
    </button>
  );
}

/**
 * Langere uitleg die je openklapt en die blijft staan tot je hem sluit.
 * Rendert het icoontje en, als het open staat, de tekst eronder — zet hem dus
 * op de plek waar die tekst mag verschijnen.
 */
export function InfoUitklap({ tekst, label = 'Meer uitleg', id, children }) {
  const [open, setOpen] = useState(false);
  const inhoud = children || tekst;
  if (!inhoud) return null;
  return (
    <>
      <button
        type="button"
        className="bb-info bb-uitleg-knop"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen(v => !v)}
      >
        <Info size={14} />
      </button>
      {open && <div className="bb-uitleg" id={id}>{inhoud}</div>}
    </>
  );
}
