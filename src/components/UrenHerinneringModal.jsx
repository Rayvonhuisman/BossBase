import { useState, useEffect, useRef, useCallback } from 'react';
import { ModalX } from '../bb-shared.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { useToast } from '../lib/toast.jsx';
import { getBedrijfsinstellingen } from '../services/instellingenService.js';
import { getWerkbonnen } from '../services/werkbonService.js';
import { listActivities } from '../services/activityService.js';
import { getUrenregistratie, createUrenregel, berekenUren } from '../services/urenService.js';
import { PauzeKnoppen, rondAfOpVijf } from './UrenVelden.jsx';

// ── Uren-herinnering-pop-up ───────────────────────────────────────────────────
// Herinnert MEDEWERKERS (niet admin/planner) eraan hun uren in te vullen voor een
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
//   • gepland  = werkbonnen (gepland_op + assigned_to_ids) ∪ activiteiten (due_at → lokale datum + assigned_to_ids)
//   • geboekt  = urenregistratie (profile_id + datum)
// Geen parallel systeem — dezelfde list-functies die de agenda/uren-pagina ook gebruiken.

// Hoe ver terug we kijken. Voorkomt eindeloos zeuren over lang vervlogen dagen.
const LOOKBACK_DAYS = 14;

const pad = n => String(n).padStart(2, '0');
const toIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Bouwt per verstreken geplande dag (zonder geboekte uren) een invulregel met
// context (werkbon/activiteit) en een voorgevulde start/eindtijd waar bekend.
function computeMissingEntries(uid, werkbonnen, activities, urenRows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIso(today);
  const min = new Date(today);
  min.setDate(min.getDate() - LOOKBACK_DAYS);
  const minIso = toIso(min);
  // Alleen reeds verstreken dagen (< vandaag) binnen het terugkijk-venster.
  const inWindow = d => !!d && d >= minIso && d < todayIso;

  const planned = new Map();
  for (const w of (werkbonnen || [])) {
    if (inWindow(w.geplandOp) && Array.isArray(w.assignedToIds) && w.assignedToIds.includes(uid)) {
      // Eerste werkbon van die dag levert de context + tijd-voorvulling.
      if (!planned.has(w.geplandOp)) {
        planned.set(w.geplandOp, {
          date: w.geplandOp,
          werkbonId: w.id,
          contextLabel: [w.titel, w.customerName].filter(Boolean).join(' · '),
          start: w.starttijd || '',
          eind: w.eindtijd || '',
        });
      }
    }
  }
  for (const a of (activities || [])) {
    // a.date = lokale datum van due_at (splitDueAt), zodat de tijdzone al klopt.
    if (inWindow(a.date) && Array.isArray(a.assignedToIds) && a.assignedToIds.includes(uid) && !planned.has(a.date)) {
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

  return [...planned.values()]
    .filter(e => !booked.has(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const fmtDag = d => {
  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
};

export function UrenHerinneringModal({ navigatePage }) {
  const { profile, refreshKey } = useProfile();
  const toast = useToast();
  const uid = profile?.id;
  const isMedewerker = !!profile && profile.role !== 'admin' && profile.role !== 'planner';

  const [intervalMin, setIntervalMin] = useState(0);
  const [entries, setEntries] = useState([]);
  const [snoozed, setSnoozed] = useState(false);
  const timerRef = useRef(null);

  const snoozeKey = uid ? `bb_uren_herinnering_snooze_${uid}` : null;

  const load = useCallback(async () => {
    if (!isMedewerker || !uid) { setEntries([]); setIntervalMin(0); return; }
    try {
      const [inst, wbs, acts, uren] = await Promise.all([
        getBedrijfsinstellingen().catch(() => null),
        getWerkbonnen().catch(() => []),
        listActivities().catch(() => []),
        getUrenregistratie({ profileId: uid }).catch(() => []),
      ]);
      const iv = Number(inst?.urenHerinneringIntervalMin ?? 0);
      setIntervalMin(iv);
      const found = iv > 0 ? computeMissingEntries(uid, wbs, acts, uren) : [];
      // Elke regel krijgt lokale, bewerkbare velden voor de inline invoer.
      setEntries(found.map(e => ({ ...e, saving: false })));
    } catch {
      // Stil falen — een herinnering mag nooit de app blokkeren.
    }
  }, [isMedewerker, uid]);

  // (Her)laad bij mount, rolwissel en globale refresh (o.a. ná uren boeken).
  useEffect(() => { load(); }, [load, refreshKey]);

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
      // Dag wegstrepen; laatste dag → visible wordt false en de pop-up sluit.
      setEntries(es => es.filter(e => e.date !== entry.date));
    } catch (err) {
      toast.error(err.message || 'Uren boeken is mislukt');
      updateEntry(entry.date, { saving: false });
    }
  };

  const goToUren = () => { snooze(); navigatePage?.('uren'); };

  const visible = isMedewerker && intervalMin > 0 && entries.length > 0 && !snoozed;
  if (!visible) return null;

  const meer = entries.length > 1;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && snooze()}>
      <div className="modal" style={{ maxWidth: 560, width: '100%' }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Vul je uren in</div>
            <div className="modal-sub">
              Je stond {meer ? 'op deze dagen' : 'op deze dag'} gepland, maar er
              {meer ? ' zijn' : ' is'} nog geen uren geboekt. Vul ze hier direct in.
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
                  <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{fmtDag(e.date)}</div>
                  {uren > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pd)' }}>{uren} uur</div>
                  )}
                </div>
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
