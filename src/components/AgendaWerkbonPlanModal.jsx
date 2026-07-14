import { useState, useEffect } from 'react';
import { ModalX, NotifyMailToggle } from '../bb-shared.jsx';
import { AssigneeResponsibleSelect } from './AssigneeResponsibleSelect.jsx';
import { getWerkbonnen, updateWerkbon } from '../services/werkbonService.js';
import { upsertWerkbonEvent } from '../services/calendarService.js';
import { getActiveTeamMembers, notifyNewAssignees } from '../services/notificatieService.js';
import { useToast } from '../lib/toast.jsx';

// Werkbon inplannen vanuit de agenda — voor Starter/Groei (die geen planning-
// pagina hebben). Hergebruikt EXACT dezelfde inplanlogica als de planning-modals
// (QuickPlanModal): updateWerkbon zet gepland_op/starttijd/eindtijd + toewijzing,
// upsertWerkbonEvent maakt/werkt het gekoppelde agenda-item (herkomst 'planning').
// Geen nieuw/parallel systeem — dezelfde service-aanroepen.
//
// - Starter: solo → geen persoon-keuze, alles op de ingelogde gebruiker.
// - Groei: persoon-keuze (zichzelf / de ander / beiden) + verantwoordelijke via
//   de bestaande AssigneeResponsibleSelect.

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function AgendaWerkbonPlanModal({ tier, currentUserId, currentUserName, defaultDate, onClose, onScheduled }) {
  const toast = useToast();
  const isGroei = tier === 'groei';
  const selfIds = currentUserId ? [currentUserId] : [];

  const [werkbonnen, setWerkbonnen] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [werkbonId, setWerkbonId] = useState('');
  const [date, setDate] = useState(defaultDate || todayISO());
  const [starttijd, setStarttijd] = useState('09:00');
  const [eindtijd, setEindtijd] = useState('11:00');
  // Groei start leeg (gebruiker kiest); Starter staat vast op zichzelf.
  const [assignedToIds, setAssignedToIds] = useState(isGroei ? [] : selfIds);
  const [verantwoordelijkeIds, setVerantwoordelijkeIds] = useState(isGroei ? [] : selfIds);
  const [notifyMail, setNotifyMail] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getWerkbonnen().catch(() => []),
      isGroei ? getActiveTeamMembers({ includeSelf: true }).catch(() => []) : Promise.resolve([]),
    ]).then(([wbs, members]) => {
      if (!alive) return;
      // Alleen nog niet ingeplande werkbonnen — zelfde definitie als de Planning:
      // een werkbon telt als ingepland zodra hij een datum én starttijd heeft.
      const unplanned = (wbs || []).filter(w => (!w.geplandOp || !w.starttijd) && w.status !== 'afgerond');
      setWerkbonnen(unplanned);
      setTeamMembers(members || []);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isGroei]);

  const selected = werkbonnen.find(w => w.id === werkbonId) || null;

  const submit = async () => {
    if (!werkbonId) { toast.error('Kies een werkbon'); return; }
    // Starter = solo: alles op de ingelogde gebruiker. Groei: keuze uit de select
    // (val terug op zichzelf als er niets gekozen is).
    const assignIds = isGroei ? (assignedToIds.length ? assignedToIds : selfIds) : selfIds;
    const respIds = isGroei ? (verantwoordelijkeIds.length ? verantwoordelijkeIds : assignIds) : assignIds;
    setSaving(true);
    try {
      const prevIds = (selected?.assignedToIds && selected.assignedToIds.length)
        ? selected.assignedToIds
        : (selected?.assignedTo ? [selected.assignedTo] : []);
      // 1) Werkbon-row is de bron van waarheid: zet planning + toewijzing.
      const updated = await updateWerkbon(werkbonId, {
        gepland_op: date,
        starttijd: starttijd || null,
        eindtijd: eindtijd || null,
        assigned_to_ids: assignIds,
        verantwoordelijke_ids: respIds,
      });
      // 2) Notificeer nieuw toegewezen collega's (alleen zinvol bij Groei).
      if (isGroei) {
        notifyNewAssignees({
          userIds: assignIds, prevUserIds: prevIds, members: teamMembers, sendMail: notifyMail,
          type: 'toewijzing_werkbon', title: `Je bent toegewezen aan ${selected?.titel || 'een werkbon'}`,
          body: `Datum: ${date}${starttijd ? ` om ${starttijd}` : ''}`,
          link: 'calendar', relatedType: 'werkbon', relatedId: werkbonId,
          creatorId: currentUserId, creatorName: currentUserName,
        }).catch(() => {});
      }
      // 3) Upsert het gekoppelde agenda-item (één per werkbon, herkomst 'planning').
      if (date && starttijd) {
        upsertWerkbonEvent({
          werkbonId,
          title: selected?.titel,
          date,
          time: starttijd,
          end: eindtijd || '',
          customerId: selected?.customerId || null,
          description: selected?.omschrijving || '',
        }).catch(() => {});
      }
      toast.success('Werkbon ingepland');
      onScheduled?.(updated);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Inplannen mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Werkbon inplannen</div>
            <div className="modal-sub">Zet een bestaande werkbon op een datum en tijd.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="f">
            <label>Werkbon</label>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--dl)' }}>Laden…</div>
            ) : werkbonnen.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--dl)' }}>Geen nog in te plannen werkbonnen.</div>
            ) : (
              <select value={werkbonId} onChange={e => setWerkbonId(e.target.value)}>
                <option value="">Kies een werkbon…</option>
                {werkbonnen.map(w => (
                  <option key={w.id} value={w.id}>{w.titel || 'Werkbon'}{w.customerName ? ` — ${w.customerName}` : ''}</option>
                ))}
              </select>
            )}
          </div>
          <div className="f">
            <label>Datum</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="f">
              <label>Starttijd</label>
              <input type="time" value={starttijd} onChange={e => setStarttijd(e.target.value)} />
            </div>
            <div className="f">
              <label>Eindtijd</label>
              <input type="time" value={eindtijd} onChange={e => setEindtijd(e.target.value)} />
            </div>
          </div>
          {isGroei && (
            <AssigneeResponsibleSelect
              members={teamMembers}
              assignedIds={assignedToIds}
              verantwoordelijkeIds={verantwoordelijkeIds}
              assignedLabel="Voor wie"
              onChange={({ assignedIds, verantwoordelijkeIds: v }) => { setAssignedToIds(assignedIds); setVerantwoordelijkeIds(v); }}
            >
              <NotifyMailToggle checked={notifyMail} onChange={setNotifyMail} style={{ marginTop: 8 }} />
            </AssigneeResponsibleSelect>
          )}
        </div>
        <div className="fa" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving || loading || !werkbonId}>{saving ? 'Inplannen…' : 'Inplannen'}</button>
        </div>
      </div>
    </div>
  );
}
