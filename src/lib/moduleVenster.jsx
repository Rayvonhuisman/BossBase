import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { ModalX } from '../bb-shared.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { useProfile } from './profileContext.jsx';
import { useToast } from './toast.jsx';
import { getModule, moduleLabel, modulePrice } from './features.js';
import { tierLabel, tierPrice, EXTRA_USER_PRICE } from './tiers.js';
import { gaNaarAbonnement } from './abonnementNav.js';
import { startProefModule, wisselProefPakket } from '../services/proefService.js';

// ── MODULE OP SLOT ───────────────────────────────────────────────────────────
// Eén venster voor de hele app (ModuleVenster, gemount in App), net als
// bevestig(). Openen kan overal:
//
//   toonModule('planning')                                  menu, knop
//   toonModule('planning', { onderwerp: 'werkbon-dagen' })   op het juiste moment
//   toonProefTeam({ onderwerp: 'derde-collega' })            proef naar Team
//
// Met een onderwerp verschijnt het venster hooguit één keer: na "Niet nu" niet
// opnieuw (per bedrijf, in deze browser). Geeft een belofte terug met wat de
// gebruiker koos: 'gestart', 'team', 'toevoegen', 'later' of 'overgeslagen'.

let toon = null;

// Eén zin per module: wat je eraan hebt.
const WAT = {
  planning:          'Een weekplanning waarin je klussen over meerdere dagen op je mensen zet.',
  voertuigen:        'Je bussen en aanhangers inplannen bij een klus, zodat je ziet wat waar staat.',
  stripe_betaallink: 'Een betaalknop op je factuur. Je klant betaalt met iDEAL en jij ziet het meteen.',
};

const sleutel = (companyId, onderwerp) => `bb.aanbod.${companyId || 'x'}.${onderwerp}`;
let huidigBedrijf = null;

function alGezien(onderwerp) {
  if (!onderwerp) return false;
  try { return localStorage.getItem(sleutel(huidigBedrijf, onderwerp)) === '1'; } catch { return false; }
}
function onthoud(onderwerp) {
  if (!onderwerp) return;
  try { localStorage.setItem(sleutel(huidigBedrijf, onderwerp), '1'); } catch { /* geen opslag */ }
}

export function toonModule(moduleKey, o = {}) {
  if (!toon || !getModule(moduleKey) || alGezien(o.onderwerp)) return Promise.resolve('overgeslagen');
  return new Promise(resolve => toon({ soort: 'module', moduleKey, ...o, resolve }));
}

export function toonProefTeam(o = {}) {
  if (!toon || alGezien(o.onderwerp)) return Promise.resolve('overgeslagen');
  return new Promise(resolve => toon({ soort: 'team', ...o, resolve }));
}

export function ModuleVenster({ setPage, bumpRefresh }) {
  const [v, setV] = useState(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const plan = usePlan();
  const { company } = useProfile();
  const toast = useToast();
  huidigBedrijf = company?.id || null;

  useEffect(() => {
    toon = o => { setFout(null); setV(o); };
    return () => { toon = null; };
  }, []);
  if (!v) return null;

  const klaar = uitkomst => {
    if (uitkomst === 'later') onthoud(v.onderwerp);
    v.resolve(uitkomst);
    setV(null);
  };

  const inProef = plan.trial;
  const mag = plan.magBeheren;

  // ── Proef naar Team ────────────────────────────────────────────────────────
  if (v.soort === 'team') {
    const wissel = async () => {
      setBezig(true); setFout(null);
      try {
        await wisselProefPakket('team');
        bumpRefresh?.();
        toast.success(`Je proef staat op ${tierLabel('team')}. Terug kan altijd onder Instellingen, Abonnement.`);
        klaar('team');
      } catch (e) { setFout(e.message); } finally { setBezig(false); }
    };
    return (
      <Venster titel={`Meer collega's? Dat past in ${tierLabel('team')}.`} onSluit={() => klaar('later')}>
        <p className="mv-tekst">
          {tierLabel('groei')} is voor één of twee personen. In {tierLabel('team')} nodig je zoveel collega's uit als je wilt,
          met rollen en rechten, planning en de betaallink.
        </p>
        {inProef
          ? <p className="mv-klein">In je proef wissel je met één klik. Terug naar {tierLabel('groei')} kan altijd.</p>
          : <p className="mv-klein">{tierLabel('team')} kost € {tierPrice('team')} per maand plus € {EXTRA_USER_PRICE} per gebruiker.</p>}
        {fout && <p className="mv-fout" role="alert">{fout}</p>}
        <Knoppen
          later={() => klaar('later')}
          hoofd={!mag ? null : inProef
            ? { tekst: bezig ? 'Bezig…' : `Proef naar ${tierLabel('team')} zetten`, actie: wissel, bezig }
            : { tekst: `Bekijk ${tierLabel('team')}`, actie: () => { klaar('toevoegen'); gaNaarAbonnement(setPage, { soort: 'gebruikers' }); } }}
          geenRecht={!mag}
        />
      </Venster>
    );
  }

  // ── Een module ─────────────────────────────────────────────────────────────
  const m = getModule(v.moduleKey);
  const vereist = m.vereist && !plan.has(getModule(m.vereist)?.feature) ? getModule(m.vereist) : null;

  const probeer = async () => {
    setBezig(true); setFout(null);
    try {
      await startProefModule(m.key);
      bumpRefresh?.();
      toast.success(`${moduleLabel(m.key)}${vereist ? ` en ${moduleLabel(vereist.key)}` : ''} staat aan tot het einde van je proef.`);
      klaar('gestart');
    } catch (e) { setFout(e.message); } finally { setBezig(false); }
  };
  const voegToe = () => {
    klaar('toevoegen');
    gaNaarAbonnement(setPage, { soort: 'feature', key: m.feature });
  };

  return (
    <Venster titel={moduleLabel(m.key)} slot onSluit={() => klaar('later')}>
      <div className="mv-prijs">€ {modulePrice(m.key)} <span>per maand</span></div>
      <p className="mv-tekst">{WAT[m.key] || m.uitleg}</p>
      {vereist && (
        <p className="mv-klein">Werkt samen met {moduleLabel(vereist.key)} (€ {modulePrice(vereist.key)} per maand). Die gaat er ook bij aan.</p>
      )}
      {fout && <p className="mv-fout" role="alert">{fout}</p>}
      <Knoppen
        later={() => klaar('later')}
        hoofd={!mag ? null : inProef
          ? { tekst: bezig ? 'Bezig…' : 'Gratis proberen tot het einde van je proef', actie: probeer, bezig }
          : { tekst: 'Toevoegen', actie: voegToe }}
        geenRecht={!mag}
      />
    </Venster>
  );
}

function Venster({ titel, slot, onSluit, children }) {
  return (
    <div className="overlay" style={{ zIndex: 9000 }} onClick={e => e.target === e.currentTarget && onSluit()}>
      <div className="modal mv" role="dialog" aria-modal="true" aria-labelledby="mv-titel">
        <div className="modal-hd">
          <div className="modal-title mv-titel" id="mv-titel">{slot && <Lock size={15} />} {titel}</div>
          <ModalX onClose={onSluit} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Knoppen({ hoofd, later, geenRecht }) {
  return (
    <>
      {geenRecht && <p className="mv-klein">Dit zet de eigenaar van je bedrijf aan.</p>}
      <div className="fa">
        <button className="btn btn-ghost" onClick={later}>Niet nu</button>
        {hoofd && <button className="btn btn-p" autoFocus disabled={hoofd.bezig} onClick={hoofd.actie}>{hoofd.tekst}</button>}
      </div>
    </>
  );
}
