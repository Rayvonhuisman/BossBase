// Gedeeld wachtwoordvalidatie component
import { Check, X, Circle } from 'lucide-react';

export const RULES = [
  { key: 'len',     label: 'Minimaal 8 tekens',          test: p => p.length >= 8 },
  { key: 'upper',   label: 'Minimaal 1 hoofdletter',      test: p => /[A-Z]/.test(p) },
  { key: 'digit',   label: 'Minimaal 1 cijfer',           test: p => /[0-9]/.test(p) },
  { key: 'special', label: 'Minimaal 1 speciaal teken',   test: p => /[^A-Za-z0-9]/.test(p) },
];

export function passwordValid(password) {
  return RULES.every(r => r.test(password));
}

export function PasswordRequirements({ password }) {
  if (!password) return null;
  return (
    <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
      {RULES.map(r => {
        const ok = r.test(password);
        return (
          <li key={r.key} style={{
            fontSize: '.75rem', fontWeight: 600, lineHeight: 1.8,
            color: ok ? '#15A34A' : '#9ca3af',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ width: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {ok ? <Check size={12} strokeWidth={3} /> : <Circle size={9} />}
            </span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}

export function PasswordMatch({ password, password2 }) {
  if (!password2) return null;
  const match = password === password2;
  return (
    <div style={{
      fontSize: '.75rem', fontWeight: 600, marginTop: 5,
      color: match ? '#15A34A' : '#dc2626',
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{match ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}</span>
      {match ? 'Wachtwoorden komen overeen' : 'Wachtwoorden komen niet overeen'}
    </div>
  );
}
