// Kostencategorieën ophalen voor de keuzelijsten.
//
// De lijst zit in de database (per bedrijf instelbaar), maar wordt op drie
// plekken tegelijk getoond: de kostenmodal, het kostendetail en het snelle
// formulier in de projectdrawer. Zonder cache zou elk daarvan zijn eigen query
// doen, en zou een nieuwe categorie pas na een harde refresh overal opduiken.
//
// Daarom één module-cache met een teller: wie een categorie toevoegt of wijzigt
// roept `ververKostenCategorieen()` aan en alle gemonteerde lijsten halen
// opnieuw op.

import { useEffect, useState } from 'react';
import { listKostenCategorieen } from '../services/kostenCategorieService.js';
import { KOSTEN_CATEGORIEEN } from '../lib/kostenCategorieen.js';

let cache = null;
let inFlight = null;
const luisteraars = new Set();

async function haal() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = listKostenCategorieen()
      .then(rijen => {
        // Draait de migratie nog niet, of is de lijst leeg, dan terugvallen op
        // de ingebouwde zes. Zo blijft het invoeren van kosten werken in plaats
        // van te stranden op een lege keuzelijst.
        cache = rijen.length ? rijen : KOSTEN_CATEGORIEEN.map((c, i) => ({
          id: `standaard-${c.value}`, naam: c.value, standaard: true, actief: true,
          bonVerplicht: !['Reiskosten', 'Arbeid'].includes(c.value), volgorde: (i + 1) * 10,
        }));
        return cache;
      })
      .catch(() => {
        cache = KOSTEN_CATEGORIEEN.map((c, i) => ({
          id: `standaard-${c.value}`, naam: c.value, standaard: true, actief: true,
          bonVerplicht: !['Reiskosten', 'Arbeid'].includes(c.value), volgorde: (i + 1) * 10,
        }));
        return cache;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Leegt de cache en laat alle gemonteerde lijsten opnieuw ophalen. */
export function ververKostenCategorieen() {
  cache = null;
  for (const fn of luisteraars) fn();
}

export function useKostenCategorieen() {
  const [categorieen, setCategorieen] = useState(cache || []);

  useEffect(() => {
    let leeft = true;
    const laad = () => { haal().then(r => { if (leeft) setCategorieen(r); }); };
    laad();
    luisteraars.add(laad);
    return () => { leeft = false; luisteraars.delete(laad); };
  }, []);

  return categorieen;
}
