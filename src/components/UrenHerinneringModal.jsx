import { useState, useEffect, useRef, useCallback } from 'react';
import { ModalX } from '../bb-shared.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { getBedrijfsinstellingen } from '../services/instellingenService.js';
import { getWerkbonnen } from '../services/werkbonService.js';
import { listActivities } from '../services/activityService.js';
import { getUrenregistratie } from '../services/urenService.js';

// ── Uren-herinnering-pop-up ───────────────────────────────────────────────────
// Herinnert MEDEWERKERS (niet admin/planner) eraan hun uren in te vullen voor een
// reeds verstreken dag waarop ze op de planning stonden (toegewezen werkbon of
// activiteit) maar nog geen uren hebben geboekt. Het herhaalinterval is een
// bedrijfsinstelling (uren_herinnering_interval_min; 0 = uit). De pop-up kan
// worden weggeklikt en keert na het interval terug tot de uren zijn ingevuld.
//
// "Gepland maar geen uren" leunt op de bestaande bronnen:
//   • gepland  = werkbonnen (gepland_op + assigned_to_ids) ∪ activiteiten (due_at → lokale datum + assigned_to_ids)
//   • geboekt  = urenregistratie (profile_id + datum)
// Geen parallel systeem — dezelfde list-functies die de agenda/uren-pagina ook gebruiken.

// Hoe ver terug we kijken. Voorkomt eindeloos zeuren over lang vervlogen dagen.
const LOOKBACK_DAYS = 14;

const pad = n => String(n).padStart(2, '0');
const toIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function computeMissingDays(uid, werkbonnen, activities, urenRows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIso(today);
  const min = new Date(today);
  min.setDate(min.getDate() - LOOKBACK_DAYS);
  const minIso = toIso(min);
  // Alleen reeds verstreken dagen (< vandaag) binnen het terugkijk-venster.
  const inWindow = d => !!d && d >= minIso && d < todayIso;

  const planned = new Set();
  for (const w of (werkbonnen || [])) {
    if (inWindow(w.geplandOp) && Array.isArray(w.assignedToIds) && w.assignedToIds.includes(uid)) {
      planned.add(w.geplandOp);
    }
  }
  for (const a of (activities || [])) {
    // a.date = lokale datum van due_at (splitDueAt), zodat de tijdzone al klopt.
    if (inWindow(a.date) && Array.isArray(a.assignedToIds) && a.assignedToIds.includes(uid)) {
      planned.add(a.date);
    }
  }

  const booked = new Set();
  for (const r of (urenRows || [])) {
    if (r.profileId === uid && Number(r.uren) > 0 && r.datum) booked.add(r.datum);
  }

  return [...planned].filter(d => !booked.has(d)).sort();
}

const fmtDag = d => {
  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
};

export function UrenHerinneringModal({ navigatePage }) {
  const { profile, refreshKey } = useProfile();
  const uid = profile?.id;
  const isMedewerker = !!profile && profile.role !== 'admin' && profile.role !== 'planner';

  const [intervalMin, setIntervalMin] = useState(0);
  const [missing, setMissing] = useState([]);
  const [snoozed, setSnoozed] = useState(false);
  const timerRef = useRef(null);

  const snoozeKey = uid ? `bb_uren_herinnering_snooze_${uid}` : null;

  const load = useCallback(async () => {
    if (!isMedewerker || !uid) { setMissing([]); setIntervalMin(0); return; }
    try {
      const [inst, wbs, acts, uren] = await Promise.all([
        getBedrijfsinstellingen().catch(() => null),
        getWerkbonnen().catch(() => []),
        listActivities().catch(() => []),
        getUrenregistratie({ profileId: uid }).catch(() => []),
      ]);
      const iv = Number(inst?.urenHerinneringIntervalMin ?? 0);
      setIntervalMin(iv);
      setMissing(iv > 0 ? computeMissingDays(uid, wbs, acts, uren) : []);
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

  const goToUren = () => { snooze(); navigatePage?.('uren'); };

  const visible = isMedewerker && intervalMin > 0 && missing.length > 0 && !snoozed;
  if (!visible) return null;

  const meer = missing.length > 1;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && snooze()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Vul je uren in</div>
            <div className="modal-sub">
              Je stond {meer ? 'op deze dagen' : 'op deze dag'} gepland, maar er
              {meer ? ' zijn' : ' is'} nog geen uren geboekt.
            </div>
          </div>
          <ModalX onClose={snooze} />
        </div>

        <div className="fg">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {missing.map(d => (
              <span
                key={d}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 999,
                  background: 'var(--pll)', color: 'var(--pd)',
                  fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                }}
              >
                {fmtDag(d)}
              </span>
            ))}
          </div>
        </div>

        <div className="fa" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-s" onClick={snooze}>Later</button>
          <button className="btn btn-p" onClick={goToUren}>Uren invullen</button>
        </div>
      </div>
    </div>
  );
}
