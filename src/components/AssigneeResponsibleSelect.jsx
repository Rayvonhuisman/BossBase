import { MemberMultiSelect } from './MemberMultiSelect.jsx';

// Gedeelde keuze "gekoppelde medewerkers + verantwoordelijke(n)" voor het
// inplannen/bewerken van een werkbon. Verantwoordelijken zijn altijd een subset
// van de gekoppelde medewerkers — dit sluit aan op de DB CHECK
// verantwoordelijke_ids <@ assigned_to_ids. Eén bron voor zowel het werkbon-
// modal als de Planning-schermen (QuickPlan/Plan/Detail), zodat er geen
// parallel systeem ontstaat.
//
// onChange geeft ALTIJD beide lijsten terug ({ assignedIds, verantwoordelijkeIds })
// zodat de ouder ze in één keer consistent kan opslaan. Bij het wijzigen van de
// koppeling worden verantwoordelijken die niet meer gekoppeld zijn automatisch
// weggefilterd; de rest van de keuze van de gebruiker blijft leidend.
export function AssigneeResponsibleSelect({
  members = [],
  assignedIds = [],
  verantwoordelijkeIds = [],
  onChange,
  disabled = false,
  fieldClassName = 'f',
  fieldStyle,
  assignedLabel = 'Gekoppelde medewerkers',
  children, // extra inhoud onder de koppel-select (bv. NotifyMailToggle)
}) {
  const gekoppelde = members.filter(m => assignedIds.includes(m.id));

  const handleAssigned = (ids) => onChange({
    assignedIds: ids,
    verantwoordelijkeIds: verantwoordelijkeIds.filter(id => ids.includes(id)),
  });
  const handleVerantwoordelijke = (ids) => onChange({ assignedIds, verantwoordelijkeIds: ids });

  return (
    <>
      <div className={fieldClassName} style={fieldStyle}>
        <label>{assignedLabel} <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(meerdere mogelijk)</span></label>
        <MemberMultiSelect members={members} value={assignedIds} onChange={handleAssigned} disabled={disabled} />
        {children}
      </div>
      {assignedIds.length > 0 && (
        <div className={fieldClassName} style={fieldStyle}>
          <label>Verantwoordelijke(n) <span style={{ fontSize: 11, color: 'var(--dl)', fontWeight: 400 }}>(mogen de werkbon bewerken · minimaal één)</span></label>
          <MemberMultiSelect members={gekoppelde} value={verantwoordelijkeIds} onChange={handleVerantwoordelijke} disabled={disabled} />
          <div style={{ fontSize: 11.5, color: 'var(--dl)', marginTop: 6, lineHeight: 1.5 }}>
            Niet-verantwoordelijke medewerkers zien de werkbon wel, maar kunnen niets bewerken.
          </div>
        </div>
      )}
    </>
  );
}
