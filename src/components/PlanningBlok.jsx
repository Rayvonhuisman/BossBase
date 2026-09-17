import { Truck } from 'lucide-react';
import { StatusBadge } from '../bb-shared.jsx';
import { korteDatum, ploegOpDag, tijdenOpDag, werkbonDagen } from '../utils/werkbonDagen.js';
import { tijdVanVoertuig, voertuigVanPersoon, voertuigenOpDag } from '../utils/voertuigDagen.js';
import { usePlan } from '../hooks/usePlan.js';
import { useVoertuigenLijst } from './WerkbonVoertuigen.jsx';

// De geplande dagen van werkbonnen als één lijst regels: datum, tijd, wie erop
// staat en de status. De klantkaart zet hier alle werkbonnen van een klant in,
// het werkbondetail alleen zijn eigen dagen. Eén component, zodat een geplande
// dag er op beide plekken hetzelfde uitziet.
//
// Onder een dag staan de bussen van die dag, met bustijd, wie erin zit en de
// bezetting. Alleen met de voertuigenmodule; zonder die module is er ook niets
// om te tonen.

/**
 * Werkbonnen → planregels, op datum gesorteerd. Dagen zonder datum vallen af.
 * `dag` en `naamVan` gaan mee in de regel omdat de busregels ze nodig hebben:
 * die worden pas getekend zodra de voertuigen geladen zijn.
 */
export function planRegels(werkbonnen, naamVan) {
  return werkbonnen
    .flatMap(w => werkbonDagen(w).map(dag => {
      const t = tijdenOpDag(w, dag);
      return {
        sleutel: `${w.id}-${dag.datum}`, werkbon: w, dag, naamVan, datum: dag.datum,
        starttijd: t.starttijd, eindtijd: t.eindtijd,
        wie: ploegOpDag(w, dag).map(naamVan).filter(Boolean),
      };
    }))
    .filter(r => r.datum)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** De bussen op één dag: "Bus 1 · 08:00–16:30 · Jan, Piet · 2/5". */
function busRegels(r, voertuigen) {
  const { werkbon: w, dag, naamVan } = r;
  const ploeg = ploegOpDag(w, dag);
  return voertuigenOpDag(w, dag).flatMap(vid => {
    const v = voertuigen.find(x => x.id === vid);
    if (!v) return [];
    const t = tijdVanVoertuig(w, dag, vid);
    // Wie erin zit: alleen koppelingen die op die dag ook echt gelden.
    const inzittenden = ploeg.filter(pid => voertuigVanPersoon(w, dag, pid) === vid);
    const namen = inzittenden.map(naamVan).filter(Boolean);
    return [{
      vid,
      tekst: [
        v.naam,
        t.starttijd ? `${t.starttijd}–${t.eindtijd || '?'}` : null,
        namen.length ? namen.join(', ') : 'niemand erin',
        v.zitplaatsen ? `${inzittenden.length}/${v.zitplaatsen}` : null,
      ].filter(Boolean).join(' · '),
    }];
  });
}

/**
 * De regels zelf.
 *   onOpen    maakt een regel klikbaar (klantkaart: door naar de werkbon)
 *   vandaag   zet dagen die al geweest zijn doffer
 *   toonTitel zet de werkbontitel voor de namen — nodig zodra er meerdere
 *             werkbonnen door elkaar staan, overbodig op de werkbon zelf
 */
export function PlanningRegels({ regels, onOpen, vandaag, toonTitel = false }) {
  const plan = usePlan();
  const bussenAan = plan.has('voertuigen');
  const voertuigen = useVoertuigenLijst(bussenAan);

  return (
    <>
      {regels.map(r => {
        const bussen = bussenAan && voertuigen ? busRegels(r, voertuigen) : [];
        return (
          <div key={r.sleutel} className="kk-planblok" style={{ opacity: vandaag && r.datum < vandaag ? .6 : 1 }}>
            <div
              className="kk-planregel"
              style={{ cursor: onOpen ? 'pointer' : 'default' }}
              onClick={onOpen ? () => onOpen(r) : undefined}
            >
              <span className="kk-plan-datum">{korteDatum(r.datum)}</span>
              <span className="kk-plan-tijd">{r.starttijd ? `${r.starttijd}–${r.eindtijd || '?'}` : 'geen tijd'}</span>
              <span className="kk-plan-wie">
                {[toonTitel ? r.werkbon.titel : null, r.wie.length ? r.wie.join(', ') : 'niemand toegewezen']
                  .filter(Boolean).join(' · ')}
              </span>
              <StatusBadge status={r.werkbon.status} domain="werkbon" />
            </div>
            {bussen.map(b => (
              <div key={b.vid} className="kk-plan-bus">
                <Truck size={12} />
                <span>{b.tekst}</span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
