import { useState, useEffect, useRef, useCallback } from 'react';
import { logFout } from '../lib/stilleFouten.js';
import { ModalX } from '../bb-shared.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { useData } from '../lib/dataContext.jsx';
import { useToast } from '../lib/toast.jsx';
import { getBedrijfsinstellingen } from '../services/instellingenService.js';
import { getUrenregistratie, createUrenregel, berekenUren } from '../services/urenService.js';
import { getTeamMembers } from '../services/notificatieService.js';
import { PauzeKnoppen, rondAfOpVijf } from './UrenVelden.jsx';
import { werkbonDagen, ploegOpDag, tijdenVoorPersoon } from '../utils/werkbonDagen.js';

// ── Uren-herinnering-pop-up ───────────────────────────────────────────────────
// Herinnert personeel eraan hun WERKDAG in te vullen — het getal waar de
// loonadministratie op draait. Werkbonuren tellen hier niet: die staan sinds
// migratie 20260831140000 in een eigen tabel en zeggen niets over de lengte van
// iemands werkdag. Een monteur die zes uur op klussen boekt maar geen werkdag,
// krijgt dus nog steeds een herinnering.
//
// Herinnert personeel eraan hun uren in te vullen voor een
// reeds verstreken dag waarop ze op de planning stonden (toegewezen werkbon of
// activiteit) maar nog geen uren hebben geboekt. Het herhaalinterval is een
// bedrijfsinstelling (uren_herinnering_interval_min; 0 = uit). De pop-up kan
// worden weggeklikt en keert na het interval terug tot de uren zijn ingevuld.
//
// De medewerker vult de uren HIER direct in (start/eindtijd per dag) — er hoeft
// niet naar de urenpagina genavigeerd te worden. Een geboekte dag valt meteen weg;
// als er niets meer openstaat sluit de pop-up.
//
// "Gepland maar geen uren" leunt op de bestaande bronnen:
//   • gepland  = werkbonnen (elke geplande dag + de ploeg van die dag) ∪ activiteiten (due_at → lokale datum + assigned_to_ids)
//   • geboekt  = werkdaguren in urenregistratie (profile_id + datum)
// Geen parallel systeem — dezelfde list-functies die de agenda/uren-pagina ook gebruiken.
//
// Wat de admin in Instellingen kan zetten: aan/uit en het herhaalinterval, voor
// wie (uitsluitlijst), wanneer (moment), op welke weekdagen, en of er ook een
// mail gaat. De mail komt van de cron (edge function uren-herinnering); de
// regels daar staan in bb_uren_herinnering_kandidaten en moeten gelijk blijven
// aan wat hier gebeurt.

// Hoe ver terug we kijken. Voorkomt eindeloos zeuren over lang vervlogen dagen.
const LOOKBACK_DAYS = 14;

// "Einde van de dag", en de terugval voor "na afloop van de werkdag" als er
// geen eindtijd gepland staat. Zelfde tijd als in bb_uren_herinnering_kandidaten.
const EINDE_DAG = '17:00';

const pad = n => String(n).padStart(2, '0');
const toIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Bouwt per verstreken geplande dag (zonder geboekte uren) een invulregel met
// context (werkbon/activiteit) en een voorgevulde start/eindtijd waar bekend.
//
// `moment` bepaalt vanaf wanneer een dag meetelt:
//   volgende_ochtend → pas de dag erna (het gedrag van vóór de instelling);
//   einde_dag        → vandaag al, vanaf EINDE_DAG;
//   na_werkdag       → vandaag al, vanaf het laatste geplande eind van die dag.
function computeMissingEntries(uid, werkbonnen, activities, urenRows, moment = 'volgende_ochtend') {
  const nu = new Date();
  const nuTijd = `${pad(nu.getHours())}:${pad(nu.getMinutes())}`;
  const today = new Date(nu);
  today.setHours(0, 0, 0, 0);
  const todayIso = toIso(today);
  const min = new Date(today);
  min.setDate(min.getDate() - LOOKBACK_DAYS);
  const minIso = toIso(min);
  // Verstreken dagen binnen het terugkijk-venster, plus vandaag: of vandaag al
  // meetelt hangt van het moment af en wordt onderaan beslist.
  const inWindow = d => !!d && d >= minIso && d <= todayIso;

  const planned = new Map();
  // Laatste geplande eindtijd per dag, over álle klussen en afspraken van die dag.
  const eindPerDag = new Map();
  const telEind = (datum, t) => {
    const eind = t ? String(t).slice(0, 5) : '';
    if (eind && eind > (eindPerDag.get(datum) || '')) eindPerDag.set(datum, eind);
  };
  for (const w of (werkbonnen || [])) {
    // Élke geplande dag van de werkbon telt, niet alleen de eerste — maar alleen
    // de dagen waarop deze medewerker in de (dag)ploeg staat. Wie op woensdag is
    // weggetikt, krijgt voor woensdag geen herinnering.
    for (const dag of werkbonDagen(w)) {
      const { datum } = dag;
      if (!ploegOpDag(w, dag).includes(uid)) continue;
      if (!inWindow(datum)) continue;
      telEind(datum, tijdenVoorPersoon(w, dag, uid).eindtijd);
      // Eerste werkbon van die dag levert de context.
      if (planned.has(datum)) continue;
      planned.set(datum, {
        date: datum,
        werkbonId: w.id,
        contextLabel: [w.titel, w.customerName].filter(Boolean).join(' · '),
        // Bewust NIET de tijden van de werkbon voorvullen: dit gaat over de
        // hele werkdag, en die begint eerder en eindigt later dan de klus.
        start: '',
        eind: '',
      });
    }
  }
  for (const a of (activities || [])) {
    // a.date = lokale datum van due_at (splitDueAt), zodat de tijdzone al klopt.
    if (!inWindow(a.date) || !Array.isArray(a.assignedToIds) || !a.assignedToIds.includes(uid)) continue;
    telEind(a.date, a.endTime);
    if (!planned.has(a.date)) {
      planned.set(a.date, {
        date: a.date,
        werkbonId: null,
        contextLabel: a.title || 'Activiteit',
        start: a.time || '',
        eind: a.endTime || '',
      });
    }
  }

  const booked = new Set();
  for (const r of (urenRows || [])) {
    if (r.profileId === uid && Number(r.uren) > 0 && r.datum) booked.add(r.datum);
  }

  const isAanDeBeurt = datum => {
    if (datum < todayIso) return true;
    if (moment === 'einde_dag') return nuTijd >= EINDE_DAG;
    if (moment === 'na_werkdag') return nuTijd >= (eindPerDag.get(datum) || EINDE_DAG);
    return false;
  };

  return [...planned.values()]
    .filter(e => !booked.has(e.date) && isAanDeBeurt(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const fmtDag = d => {
  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  // Alleen de eerste letter groot: "Vrijdag 18 september", niet "Vrijdag 18 September".
  const t = date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function UrenHerinneringModal({ navigatePage }) {
  const { profile, refreshKey } = useProfile();
  // Werkbonnen en activiteiten uit de gedeelde dataset: deze modal hangt altijd
  // in de app, dus een eigen fetch zou op elke pagina meelopen.
  const { werkbonnen = [], activities = [] } = useData();
  const toast = useToast();
  const uid = profile?.id;
  // Werkdaguren zijn er voor wie ze aan iemand anders verantwoordt. Dus:
  //   * niet de admin/eigenaar — die hoeft zichzelf niet te herinneren;
  //   * planners wél — een voorman staat gewoon op het dak en zijn uren tellen
  //     net zo goed mee voor het loon;
  //   * en alleen als er écht personeel is. Dat leiden we af uit het aantal
  //     actieve leden en niet uit het abonnement: een Groei-klant met twee
  //     gebruikersplekken kan in zijn eentje werken.
  const [heeftPersoneel, setHeeftPersoneel] = useState(false);
  const isPersoneel = !!profile && profile.role !== 'admin';
  const toonHerinnering = isPersoneel && heeftPersoneel;

  const [intervalMin, setIntervalMin] = useState(0);
  const [moment, setMoment] = useState('volgende_ochtend');
  const [entries, setEntries] = useState([]);
  // Wat de laatste load ophaalde. Bij "einde van de dag" en "na afloop van de
  // werkdag" komt vandaag er in de loop van de dag bij; dat rekenen we elke
  // minuut opnieuw uit op deze gegevens, zonder opnieuw op te halen.
  const bronRef = useRef(null);
  const [snoozed, setSnoozed] = useState(false);
  const timerRef = useRef(null);

  const snoozeKey = uid ? `bb_uren_herinnering_snooze_${uid}` : null;

  // Meer dan één actief lid = er is personeel. Een ZZP'er valt hierdoor vanzelf
  // buiten de herinnering, ook als hij zichzelf ooit als medewerker heeft
  // ingericht.
  useEffect(() => {
    if (!isPersoneel) { setHeeftPersoneel(false); return; }
    let alive = true;
    getTeamMembers()
      .then(ms => { if (alive) setHeeftPersoneel((ms || []).filter(m => m.profileId).length > 1); })
      .catch(logFout('teamleden laden'));
    return () => { alive = false; };
  }, [isPersoneel, refreshKey]);

  // Rekent de open dagen opnieuw uit. Een dag die al in beeld staat houdt zijn
  // ingetypte tijden.
  const herbereken = useCallback(() => {
    const bron = bronRef.current;
    if (!bron) return;
    const found = bron.actief
      ? computeMissingEntries(uid, werkbonnen, activities, bron.uren, bron.moment)
      : [];
    setEntries(es => found.map(e => es.find(x => x.date === e.date) || { ...e, saving: false }));
  }, [uid, werkbonnen, activities]);

  const load = useCallback(async () => {
    if (!toonHerinnering || !uid) { bronRef.current = null; setEntries([]); setIntervalMin(0); return; }
    try {
      // Werkbonnen en activiteiten komen uit de gedeelde dataset. Deze modal
      // staat altijd gemount (App.jsx), dus hij haalde die twee lijsten op ÉLKE
      // pagina opnieuw op voor iedereen die geen admin is.
      const [inst, uren] = await Promise.all([
        getBedrijfsinstellingen().catch(() => null),
        getUrenregistratie({ profileId: uid }).catch(() => []),
      ]);
      const iv = Number(inst?.urenHerinneringIntervalMin ?? 0);
      setIntervalMin(iv);
      const mom = inst?.urenHerinneringMoment || 'volgende_ochtend';
      setMoment(mom);
      // Staat de herinnering voor deze medewerker uit, of is vandaag geen dag
      // waarop herinnerd wordt, dan is er niets te tonen. (1 = maandag … 7 = zondag.)
      const weekdag = new Date().getDay() || 7;
      const actief = iv > 0
        && !(inst?.urenHerinneringUitgesloten || []).includes(uid)
        && (inst?.urenHerinneringDagen || [1, 2, 3, 4, 5, 6, 7]).includes(weekdag);
      bronRef.current = { uren, moment: mom, actief };
      herbereken();
    } catch {
      // Stil falen — een herinnering mag nooit de app blokkeren.
    }
  }, [toonHerinnering, uid, herbereken]);

  // (Her)laad bij mount, rolwissel en globale refresh (o.a. ná uren boeken).
  useEffect(() => { load(); }, [load, refreshKey]);

  // Vandaag kan er in de loop van de dag bij komen; bij "volgende ochtend" niet.
  useEffect(() => {
    if (!toonHerinnering || intervalMin <= 0 || moment === 'volgende_ochtend') return undefined;
    const t = setInterval(herbereken, 60 * 1000);
    return () => clearInterval(t);
  }, [toonHerinnering, intervalMin, moment, herbereken]);

  // Herstel een lopende snooze na een page-reload zodat we niet meteen weer poppen.
  useEffect(() => {
    if (!snoozeKey) return undefined;
    const until = Number(localStorage.getItem(snoozeKey) || 0);
    if (until > Date.now()) {
      setSnoozed(true);
      timerRef.current = setTimeout(() => { setSnoozed(false); load(); }, until - Date.now());
    }
    return () => clearTimeout(timerRef.current);
  }, [snoozeKey, load]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const snooze = useCallback(() => {
    if (snoozeKey && intervalMin > 0) {
      const ms = intervalMin * 60 * 1000;
      localStorage.setItem(snoozeKey, String(Date.now() + ms));
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { setSnoozed(false); load(); }, ms);
    }
    setSnoozed(true);
  }, [snoozeKey, intervalMin, load]);

  const updateEntry = (date, patch) =>
    setEntries(es => es.map(e => (e.date === date ? { ...e, ...patch } : e)));

  // Boekt één dag direct vanuit de pop-up. Werkbon-koppeling laat de urenservice
  // klant/project automatisch afleiden (project-nacalculatie blijft kloppen).
  const saveEntry = async (entry) => {
    const uren = berekenUren(entry.start, entry.eind, entry.pauze || 0);
    if (!uren || uren <= 0) {
      toast.error(entry.pauze
        ? 'Er blijft geen tijd over na aftrek van de pauze'
        : 'Vul een geldige start- en eindtijd in (eind na start)');
      return;
    }
    updateEntry(entry.date, { saving: true });
    try {
      await createUrenregel({
        profile_id: uid,
        datum: entry.date,
        start_tijd: entry.start,
        eind_tijd: entry.eind,
        pauze_minuten: entry.pauze || 0,
        werkbon_id: entry.werkbonId || null,
      });
      toast.success(`${uren} uur geboekt voor ${fmtDag(entry.date)}`);
      // Ook in de bron, anders zet de volgende herberekening de dag terug.
      bronRef.current?.uren.push({ profileId: uid, datum: entry.date, uren });
      // Dag wegstrepen; laatste dag → visible wordt false en de pop-up sluit.
      setEntries(es => es.filter(e => e.date !== entry.date));
    } catch (err) {
      toast.error(err.message || 'Uren boeken is mislukt');
      updateEntry(entry.date, { saving: false });
    }
  };

  const goToUren = () => { snooze(); navigatePage?.('uren'); };

  const visible = toonHerinnering && intervalMin > 0 && entries.length > 0 && !snoozed;
  if (!visible) return null;

  const meer = entries.length > 1;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && snooze()}>
      <div className="modal" style={{ maxWidth: 560, width: '100%' }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Vul je werkdag in</div>
            <div className="modal-sub">
              Je stond {meer ? 'op deze dagen' : 'op deze dag'} gepland, maar er
              {meer ? ' zijn nog geen werkdagen' : ' is nog geen werkdag'} ingevuld. Doe het hier direct.
            </div>
          </div>
          <ModalX onClose={snooze} />
        </div>

        <div
          className="fg"
          style={{ maxHeight: '58vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {entries.map(e => {
            const uren = berekenUren(e.start, e.eind, e.pauze || 0);
            return (
              <div
                key={e.date}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10,
                  padding: 12, background: 'var(--bgs)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: e.contextLabel ? 6 : 10 }}>
                  <div style={{ fontWeight: 700 }}>{fmtDag(e.date)}</div>
                  {uren > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pd)' }}>{uren} uur</div>
                  )}
                </div>
                {/* De werkbon is hier alleen de aanleiding — je vult je hele dag in,
                    niet de tijd die je op die klus stond. */}
                {e.contextLabel && (
                  <div style={{ fontSize: 12.5, color: 'var(--dmu)', marginBottom: 10 }}>{e.contextLabel}</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="f" style={{ flex: '1 1 110px', minWidth: 100 }}>
                    <label>Starttijd</label>
                    <input
                      type="time"
                      step="300"
                      value={e.start}
                      onChange={ev => updateEntry(e.date, { start: ev.target.value })}
                      onBlur={ev => updateEntry(e.date, { start: rondAfOpVijf(ev.target.value) })}
                    />
                  </div>
                  <div className="f" style={{ flex: '1 1 110px', minWidth: 100 }}>
                    <label>Eindtijd</label>
                    <input
                      type="time"
                      step="300"
                      value={e.eind}
                      onChange={ev => updateEntry(e.date, { eind: ev.target.value })}
                      onBlur={ev => updateEntry(e.date, { eind: rondAfOpVijf(ev.target.value) })}
                    />
                  </div>
                  {/* Ook hier de pauze: anders boekt de herinnering nog steeds
                      een halfuur te veel per dag. */}
                  <div className="f" style={{ flex: '1 1 100%' }}>
                    <label>Pauze (minuten)</label>
                    <PauzeKnoppen
                      waarde={e.pauze || 0}
                      onChange={v => updateEntry(e.date, { pauze: v })}
                      disabled={e.saving}
                    />
                  </div>
                  <button
                    className="btn btn-p"
                    style={{ flex: '0 0 auto' }}
                    disabled={e.saving || !(uren > 0)}
                    onClick={() => saveEntry(e)}
                  >
                    {e.saving ? 'Opslaan…' : 'Opslaan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="fa" style={{ justifyContent: 'space-between', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-ghost" onClick={goToUren}>Naar urenpagina</button>
          <button className="btn btn-s" onClick={snooze}>Later</button>
        </div>
      </div>
    </div>
  );
}
