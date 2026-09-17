import { Truck } from 'lucide-react';
import { StatusBadge } from '../bb-shared.jsx';
import { korteDatum, ploegOpDag, tijdenOpDag, werkbonDagen } from '../utils/werkbonDagen.js';
import { tijdVanVoertuig, voertuigVanPersoon, voertuigenOpDag } from '../utils/voertuigDagen.js';
import { usePlan } from '../hooks/usePlan.js';
import { useVoertuigenLijst } from './WerkbonVoertuigen.jsx';

// Wat er voor een klant in de agenda staat, als één lijst op datum: de geplande
// dagen van werkbonnen én de losse items (activiteiten die niet aan een werkbon
// hangen). De klantkaart toont beide, het werkbondetail alleen zijn eigen dagen.
// Eén component, zodat een geplande dag er op beide plekken hetzelfde uitziet.
//
// Onder een werkbondag staan de bussen van die dag, met bustijd, wie erin zit en
// de bezetting. Alleen met de voertuigenmodule; zonder die module is er ook
// niets om te tonen.

const tijd = t => (t ? String(t).slice(0, 5) : '');

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
        sleutel: `${w.id}-${dag.datum}`, soort: 'werkbon',
        werkbon: w, dag, naamVan, datum: dag.datum,
        starttijd: t.starttijd, eindtijd: t.eindtijd,
        wie: ploegOpDag(w, dag).map(naamVan).filter(Boolean),
      };
    }))
    .filter(r => r.datum)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Losse items → planregels. Een activiteit zonder datum staat nergens ingepland. */
export function losseRegels(activiteiten = []) {
  return activiteiten
    .filter(a => a?.date)
    .map(a => ({
      sleutel: `los-${a.id}`, soort: 'los',
      activiteit: a, datum: a.date,
      starttijd: tijd(a.time), eindtijd: tijd(a.endTime),
      titel: a.title || 'Activiteit',
      wie: a.assigneeName ? [a.assigneeName] : [],
    }));
}

/**
 * Werkbondagen en losse items door elkaar, op datum en dan op tijd.
 * Heet bewust niet `opDatum`: zo'n naam bestaat elders al als vergelijkfunctie
 * voor sort(), en die zou deze ongemerkt schaduwen — de aanroep gaat dan als
 * (a, b) die comparator in en levert een getal in plaats van een lijst.
 */
export const samenOpDatum = (...lijsten) =>
  lijsten.flat().sort((a, b) =>
    a.datum.localeCompare(b.datum) || (a.starttijd || '').localeCompare(b.starttijd || ''));

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
 *   onOpen    maakt een regel klikbaar (klantkaart: door naar werkbon of item)
 *   vandaag   zet dagen die al geweest zijn doffer
 *   toonTitel zet de werkbontitel voor de namen — nodig zodra er meerdere
 *             werkbonnen door elkaar staan, overbodig op de werkbon zelf
 */
export function PlanningRegels({ regels, onOpen, vandaag, toonTitel = false, variant = 'kk' }) {
  const plan = usePlan();
  const bussenAan = plan.has('voertuigen');
  const voertuigen = useVoertuigenLijst(bussenAan);
  // 'lrow' geeft dezelfde rij-opmaak als het tabblad Projecten (losse kaartjes
  // met rand). Alleen het planning-tabblad van de klantkaart vraagt erom; het
  // overzichtsblok en de werkbonpagina houden de compacte 'kk'-regels.
  const alsRij = variant === 'lrow';

  return (
    <>
      {regels.map(r => {
        const los = r.soort === 'los';
        const bussen = !los && bussenAan && voertuigen ? busRegels(r, voertuigen) : [];
        // Een los item draagt zijn eigen titel; bij een werkbon staat de titel er
        // alleen bij als er meer werkbonnen door elkaar staan.
        const omschrijving = los ? r.titel : (toonTitel ? r.werkbon.titel : null);
        const tijd = r.starttijd ? `${r.starttijd}${r.eindtijd ? `–${r.eindtijd}` : ''}` : 'geen tijd';
        const wie = r.wie.length ? r.wie.join(', ') : (los ? null : 'niemand toegewezen');
        const badge = (
          <StatusBadge
            status={los ? r.activiteit.status : r.werkbon.status}
            domain={los ? 'activiteit' : 'werkbon'}
          />
        );
        return (
          <div key={r.sleutel} className={alsRij ? 'lrow-plan-blok' : 'kk-planblok'} style={{ opacity: vandaag && r.datum < vandaag ? .6 : 1 }}>
            {alsRij ? (
              <div
                className="lrow"
                style={{ cursor: onOpen ? 'pointer' : 'default' }}
                onClick={onOpen ? () => onOpen(r) : undefined}
              >
                <div className="lrow-main">
                  <div className="lrow-title">
                    {los && <span className="kk-plan-los">Los item</span>}
                    {[omschrijving, wie].filter(Boolean).join(' · ') || 'Ingepland'}
                  </div>
                  <div className="lrow-sub">{tijd}</div>
                </div>
                {badge}
                <span className="lrow-date lrow-plan-datum">{korteDatum(r.datum)}</span>
              </div>
            ) : (
            <div
              className="kk-planregel"
              style={{ cursor: onOpen ? 'pointer' : 'default' }}
              onClick={onOpen ? () => onOpen(r) : undefined}
            >
              <span className="kk-plan-datum">{korteDatum(r.datum)}</span>
              <span className="kk-plan-tijd">{tijd}</span>
              <span className="kk-plan-wie">
                {los && <span className="kk-plan-los">Los item</span>}
                {[omschrijving, wie].filter(Boolean).join(' · ')}
              </span>
              {badge}
            </div>
            )}
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
