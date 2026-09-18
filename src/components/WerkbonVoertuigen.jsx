import { useEffect, useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import { getVoertuigen } from '../services/voertuigService.js';
import { databaseKentVoertuigen } from '../services/werkbonService.js';
import { usePlan } from '../hooks/usePlan.js';
import { useProfile } from '../lib/profileContext.jsx';
import { vandaagIso } from '../lib/datumTijd.js';
import { korteDatum, ploegOpDag, plusDagen, tijdenVoorPersoon, werkbonDagen } from '../utils/werkbonDagen.js';
import { WerkbonVoertuigenBlok } from './WerkbonVoertuigenBlok.jsx';
import {
  controleerVoertuigen, metVoertuigen, voertuigPlanningUitWerkbon, voertuigenVoorPersoon,
} from '../utils/voertuigDagen.js';

// Voertuigen op een werkbon. Het model en de regels staan in
// utils/voertuigDagen.js; hier zit alleen wat een werkbonformulier en de
// werkbonpagina nodig hebben, zodat die er maar een paar regels voor hoeven.
//
// Alles alleen met plan.has('voertuigen') — en met de planningsmodule, want
// voertuigen per dag hangen aan de dagen. De database dwingt hetzelfde af.

export function useVoertuigenLijst(actief) {
  const [lijst, setLijst] = useState(null);
  useEffect(() => {
    if (!actief) return undefined;
    let bezig = true;
    getVoertuigen({ inclusiefInactief: true })
      .then(l => { if (bezig) setLijst(l); })
      .catch(() => { if (bezig) setLijst([]); });
    return () => { bezig = false; };
  }, [actief]);
  return lijst;
}

/**
 * Voor een werkbonformulier:
 *   const voertuig = useWerkbonVoertuigen({ werkbon, meerdaags });
 *   {voertuig.blok({ planning, onChange, ploeg, standaard, werkbonId, disabled })}
 *   voertuig.controleer(...) / voertuig.dagen(...) / voertuig.payload bij opslaan
 *
 * Eén blok onder de medewerkers: bus kiezen, per dag inplannen, wie er meerijdt
 * en de meldingen. Eerder stonden de bussen als chips tussen de dagen en
 * koppelde je iemand via zijn avatar — dat was te veel op één rij.
 *
 * Zolang de voertuigen nog niet geladen zijn, doet het formulier alsof er geen
 * voertuigen zijn en stuurt het ook niets mee — anders zou opslaan in die
 * tussentijd de voertuigen van de werkbon wissen.
 */
export function useWerkbonVoertuigen({ werkbon = null, meerdaags = true }) {
  const plan = usePlan();
  // Zonder de database-update geen voertuigen in het formulier: er valt dan
  // niets op te slaan.
  const aan = meerdaags && plan.has('voertuigen') && databaseKentVoertuigen();
  const alle = useVoertuigenLijst(aan);
  const klaar = aan && Array.isArray(alle);
  const [ids, setIds] = useState(() => werkbon?.voertuigIds || []);
  const origineel = useMemo(() => (werkbon ? voertuigPlanningUitWerkbon(werkbon).koppeling : {}), [werkbon]);
  const gekozen = klaar ? ids.map(id => alle.find(v => v.id === id)).filter(Boolean) : [];

  const ctx = (planning, ploegIds, naamVan, standaard) => ({
    p: planning, standaard, ploegIds, voertuigen: gekozen, naamVan: id => naamVan(id) || 'Medewerker',
  });

  return {
    payload: klaar ? { voertuig_ids: gekozen.map(v => v.id) } : {},
    dagen: (dagen, planning, ploegIds, naamVan, standaard) =>
      (klaar ? metVoertuigen(dagen, ctx(planning, ploegIds, naamVan, standaard)) : dagen),
    controleer: (planning, ploegIds, naamVan, standaard) =>
      (klaar ? controleerVoertuigen(ctx(planning, ploegIds, naamVan, standaard), origineel) : ''),
    blok: ({ planning, onChange, ploeg = [], standaard, werkbonId = null, disabled = false, style, className = '' }) =>
      (klaar ? (
        <WerkbonVoertuigenBlok
          planning={planning}
          onChange={onChange}
          alle={alle.filter(v => v.actief || ids.includes(v.id))}
          ids={ids}
          onIds={setIds}
          ploeg={ploeg}
          standaard={standaard}
          werkbonId={werkbonId}
          disabled={disabled}
          style={style}
          className={className}
        />
      ) : null),
  };
}

const tijdTekst = r => (r.starttijd && r.eindtijd ? ` · ${r.starttijd}–${r.eindtijd}` : '');

/**
 * De eerstvolgende dag waarop JIJ op deze werkbon staat: vandaag, anders morgen
 * of later. Dagen die geweest zijn tellen niet mee. Null als je er niet op staat.
 * Eén plek, want zowel de melding als MijnVoertuig hangt ervan af.
 */
function mijnEerstvolgendeDag(werkbon, mij) {
  if (!mij) return null;
  const vandaag = vandaagIso();
  return werkbonDagen(werkbon)
    .filter(d => d.datum && d.datum >= vandaag && ploegOpDag(werkbon, d).includes(mij))
    .sort((a, b) => a.datum.localeCompare(b.datum))[0] || null;
}

/**
 * "Jij bent vandaag ingepland van 08:00 tot 16:30, met Bus 2, samen met Tim."
 *
 * Staat bovenaan de werkbon, boven Bel klant / Route / Start klus: wie de bon
 * opent wil eerst weten of híj vandaag moet komen, en pas daarna de rest.
 *
 * Alleen zichtbaar als je zelf in de ploeg van die dag staat. Een planner die
 * meekijkt ziet niets extra's — die leest de planning al in het blok eronder,
 * en een melding die niet over jou gaat is ruis.
 *
 * Getoond wordt de EERSTVOLGENDE dag waarop je staat: vandaag als het vandaag
 * is, anders morgen of later. Zo zie je 's avonds dat je morgen om 07:00 wordt
 * verwacht. Dagen die geweest zijn tellen niet mee.
 *
 * De tijd is jóuw tijd: je eigen tijd op die dag, anders de tijd van de dag,
 * anders die van de werkbon (tijdenVoorPersoon). Dezelfde volgorde als overal.
 */
export function MijnPlanningMelding({ werkbon }) {
  const plan = usePlan();
  const { profile } = useProfile();
  const voertuigenAan = plan.has('voertuigen') && (werkbon?.voertuigIds?.length || 0) > 0;
  const alle = useVoertuigenLijst(voertuigenAan);

  const mij = profile?.id;
  const dag = mijnEerstvolgendeDag(werkbon, mij);
  if (!dag) return null;
  const vandaag = vandaagIso();

  const { starttijd, eindtijd } = tijdenVoorPersoon(werkbon, dag, mij);
  const wanneer = dag.datum === vandaag
    ? 'vandaag'
    : dag.datum === plusDagen(vandaag, 1) ? 'morgen' : `op ${korteDatum(dag.datum)}`;

  // Jouw voertuig op díé dag. Zit je nergens in, dan noemen we geen bus: dat is
  // aan de planner, niet iets om hier te verzinnen.
  const eigenVoertuig = (voertuigenVoorPersoon(werkbon, mij) || []).find(r => r.datum === dag.datum);
  const voertuigNaam = eigenVoertuig && Array.isArray(alle)
    ? (() => {
        const v = alle.find(x => x.id === eigenVoertuig.vid);
        return v ? `${v.naam}${v.kenteken ? ` (${v.kenteken})` : ''}` : null;
      })()
    : null;

  // Met wie je die dag bent ingepland; jezelf niet meegeteld.
  const collegas = ploegOpDag(werkbon, dag).filter(id => id !== mij).length;

  return (
    <div className="wb2-mijn-planning" role="status">
      <span className="wb2-mijn-planning-ic"><Truck size={15} /></span>
      <span>
        <strong>Jij bent {wanneer} ingepland</strong>
        {starttijd ? ` van ${starttijd}${eindtijd ? ` tot ${eindtijd}` : ''}` : ''}
        {voertuigNaam ? ` · ${voertuigNaam}` : ''}
        {collegas > 0 ? ` · samen met ${collegas} ${collegas === 1 ? 'collega' : 'collega’s'}` : ''}
      </span>
    </div>
  );
}

/**
 * Op de werkbon: in welk voertuig zit ik? Wie niet gekoppeld is (of kantoor),
 * ziet welke voertuigen er op de werkbon staan.
 */
export function MijnVoertuig({ werkbon, style }) {
  const plan = usePlan();
  const { profile } = useProfile();
  const aan = plan.has('voertuigen') && (werkbon?.voertuigIds?.length || 0) > 0;
  const alle = useVoertuigenLijst(aan);
  if (!aan || !alle?.length) return null;
  // Staat de planningsmelding er al ("Jij bent vandaag ingepland · Bus 2"), dan
  // zegt deze regel hetzelfde nog een keer. Alleen tonen als die er niet is.
  if (mijnEerstvolgendeDag(werkbon, profile?.id)) return null;

  const naam = vid => {
    const v = alle.find(x => x.id === vid);
    return v ? `${v.naam}${v.kenteken ? ` (${v.kenteken})` : ''}` : 'Voertuig';
  };
  const regel = { fontSize: 13, color: 'var(--dl)', display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 5, ...style };

  const eigen = voertuigenVoorPersoon(werkbon, profile?.id);
  if (eigen.length) {
    const vandaag = vandaagIso();
    const komend = eigen.filter(r => r.datum >= vandaag);
    const rijen = komend.length ? komend : eigen;
    const zelfde = rijen.every(r => r.vid === rijen[0].vid && r.starttijd === rijen[0].starttijd && r.eindtijd === rijen[0].eindtijd);
    return (
      <div style={regel}>
        <Truck size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        {zelfde ? (
          <span>Jouw voertuig: <strong style={{ color: 'var(--dk)' }}>{naam(rijen[0].vid)}</strong>{tijdTekst(rijen[0])}</span>
        ) : (
          <span>
            Jouw voertuig:
            {rijen.map(r => (
              <span key={r.datum} style={{ display: 'block' }}>
                {korteDatum(r.datum)} · <strong style={{ color: 'var(--dk)' }}>{naam(r.vid)}</strong>{tijdTekst(r)}
              </span>
            ))}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={regel}>
      <Truck size={14} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>Voertuigen: {werkbon.voertuigIds.map(naam).join(', ')}</span>
    </div>
  );
}
