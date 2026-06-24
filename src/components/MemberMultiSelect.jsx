// Multi-select voor het toewijzen van één of meerdere medewerkers aan een
// planning-item (werkbon of activiteit). `value` is een array van profile-ids;
// een lege selectie betekent "niet toegewezen".
export function MemberMultiSelect({ members = [], value = [], onChange, disabled = false }) {
  const toggle = (id) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, border: '1px solid var(--bstrong)', borderRadius: 8, background: disabled ? 'var(--bgs)' : '#fff', maxHeight: 132, overflowY: 'auto', opacity: disabled ? 0.7 : 1 }}>
      {members.length === 0 && <span style={{ fontSize: 12, color: 'var(--dl)' }}>Geen teamleden</span>}
      {members.map(m => {
        const sel = value.includes(m.id);
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => toggle(m.id)}
            disabled={disabled}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
              fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
              border: sel ? '1px solid var(--p)' : '1px solid var(--bstrong)',
              background: sel ? 'var(--pll)' : '#fff', color: sel ? 'var(--pd)' : 'var(--dm)',
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: '#fff', background: sel ? 'var(--p)' : '#fff', border: sel ? 'none' : '1px solid var(--bstrong)' }}>{sel ? '✓' : ''}</span>
            {m.fullName || m.email || 'Teamlid'}
          </button>
        );
      })}
    </div>
  );
}
